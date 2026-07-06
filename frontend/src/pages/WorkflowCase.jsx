import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CheckCircle, ChevronDown, ChevronUp, Plus, Package, MapPin, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import WorkflowStepper, { RECEPTION_STEP_COUNT } from '../components/workflow/WorkflowStepper';
import CustomerSearch from '../components/customers/CustomerSearch';
import Modal from '../components/ui/Modal';
import BarcodeLabel from '../components/barcode/BarcodeLabel';
import BarcodeLabelErrorBoundary from '../components/barcode/BarcodeLabelErrorBoundary';
import { printSampleLabel, autoPrintSampleLabels } from '../utils/printLabel';
import { expandSampleLabelJobs, totalLabelCountForSample, totalLabelCountForSamples } from '../utils/labelCopies';
import { useAuth } from '../context/AuthContext';
import { isReception } from '../utils/roles';
import { fmtCatalog, fmtNet, VAT_RATE } from '../utils/vat';
import DiscountField from '../components/billing/DiscountField';
import { DISCOUNT_TYPES, calcSplitTotals, buildSplitDiscountPayload } from '../utils/discount';
import {
  customersAPI, animalsAPI, testsAPI, billingAPI, samplesAPI,
} from '../services/api';
import { WORKFLOW_STEPS } from '../utils/workflow';
import { getCategoryEmoji } from '../utils/testCategoryIcons';
import { getResultsEntryTargets } from '../utils/parasitologyTests';
import {
  isTestCoveredByPackages,
  animalHasServices,
  packageLabel,
  packageTestIds,
} from '../utils/packageSelection';
import {
  FIELD_VISIT_CODE,
  DEFAULT_FIELD_VISIT,
  buildFieldVisitInvoiceItem,
} from '../utils/fieldVisitService';
import FieldVisitDistanceField from '../components/billing/FieldVisitDistanceField';
import { useAnimalSpecies } from '../hooks/useAnimalSpecies';
import printThermalInvoice from '../utils/thermalInvoicePrint';


const EMPTY_ANIMAL = {
  animal_type: 'camel',
  gender: 'male',
  age: '',
  name_tag: '',
  breed: '',
  color: '',
};

export default function WorkflowCase() {
  const { t, i18n } = useTranslation();
  const { user, hasPermission } = useAuth();
  const features = user?.features || {};
  const receptionMode = isReception(user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillCustomer = searchParams.get('customer');

  const [step, setStep] = useState(0);
  const [animals, setAnimals] = useState([]);
  const [tests, setTests] = useState([]);
  const [packages, setPackages] = useState([]);

  const [customerId, setCustomerId] = useState(prefillCustomer || '');
  const [selectedAnimalIds, setSelectedAnimalIds] = useState([]);
  const [animalTests, setAnimalTests] = useState({});
  const [animalPackages, setAnimalPackages] = useState({});
  const [includeFieldVisit, setIncludeFieldVisit] = useState(false);
  const [fieldVisitKm, setFieldVisitKm] = useState('');
  const [fieldVisit, setFieldVisit] = useState(DEFAULT_FIELD_VISIT);
  const [discountType, setDiscountType] = useState(DISCOUNT_TYPES.NONE);
  const [discountValue, setDiscountValue] = useState('');
  const [fieldVisitDiscountType, setFieldVisitDiscountType] = useState(DISCOUNT_TYPES.NONE);
  const [fieldVisitDiscountValue, setFieldVisitDiscountValue] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [samples, setSamples] = useState([]);
  const [printSample, setPrintSample] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);

  const [newCustomer, setNewCustomer] = useState({ full_name: '', mobile: '', city: '', farm_company: '' });
  const [newAnimal, setNewAnimal] = useState(EMPTY_ANIMAL);
  const [creating, setCreating] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showNewAnimal, setShowNewAnimal] = useState(false);
  const [testSearch, setTestSearch] = useState('');
  const { codes: speciesCodes, label: speciesLabel } = useAnimalSpecies();

  useEffect(() => {
    testsAPI.list({ limit: 200 }).then(({ data }) => setTests(data.data));
    testsAPI.listPackages().then(({ data }) => setPackages(data.data || [])).catch(() => {});
    billingAPI.extraServices()
      .then(({ data }) => {
        const svc = (data.data || []).find((s) => s.code === FIELD_VISIT_CODE);
        if (svc) setFieldVisit(svc);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (customerId) {
      animalsAPI.list({ owner_id: customerId }).then(({ data }) => setAnimals(data.data));
    } else {
      setAnimals([]);
      setSelectedAnimalIds([]);
      setAnimalTests({});
      setAnimalPackages({});
    }
  }, [customerId]);

  const context = {
    customerId,
    animalId: selectedAnimalIds[0] || '',
    invoiceId,
    sample: samples[0] || null,
  };

  const animalLabel = (a) => (a ? `${a.animal_code} — ${a.name_tag} (${speciesLabel(a.animal_type, i18n.language === 'ar')})` : '');
  const testLabel = (test) => (i18n.language === 'ar' && test.name_ar ? test.name_ar : test.name);
  const categoryGroupLabel = (group) => {
    const { category } = group;
    if (i18n.language === 'ar' && category?.name_ar) return category.name_ar;
    return category?.name || category?.code || t('tests.allCategories');
  };

  const filteredTests = tests.filter((test) => {
    if (!testSearch.trim()) return true;
    const q = testSearch.toLowerCase();
    return test.code?.toLowerCase().includes(q)
      || test.name?.toLowerCase().includes(q)
      || test.name_ar?.includes(testSearch);
  });

  const testsByCategory = useMemo(() => {
    const groups = new Map();
    for (const test of filteredTests) {
      const key = test.category_code || test.category_name || 'other';
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          category: {
            code: test.category_code,
            name: test.category_name,
            name_ar: test.category_name_ar,
            department: test.category_department,
          },
          tests: [],
        });
      }
      groups.get(key).tests.push(test);
    }
    return [...groups.values()];
  }, [filteredTests]);

  const toggleAnimal = (id) => {
    setSelectedAnimalIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        setAnimalTests((at) => {
          const copy = { ...at };
          delete copy[id];
          return copy;
        });
        setAnimalPackages((ap) => {
          const copy = { ...ap };
          delete copy[id];
          return copy;
        });
        return next;
      }
      setAnimalTests((at) => ({ ...at, [id]: at[id] || [] }));
      setAnimalPackages((ap) => ({ ...ap, [id]: ap[id] || [] }));
      return [...prev, id];
    });
  };

  const toggleAnimalPackage = (animalId, packageId, checked) => {
    setAnimalPackages((prev) => {
      const current = prev[animalId] || [];
      return {
        ...prev,
        [animalId]: checked
          ? [...current, packageId]
          : current.filter((id) => id !== packageId),
      };
    });
  };

  const toggleAnimalTest = (animalId, testId, checked) => {
    setAnimalTests((prev) => {
      const current = prev[animalId] || [];
      return {
        ...prev,
        [animalId]: checked ? [...current, testId] : current.filter((id) => id !== testId),
      };
    });
  };

  const workflowInvoiceItems = useMemo(() => {
    const items = [];
    for (const animalId of selectedAnimalIds) {
      const animal = animals.find((a) => a.id === animalId);
      for (const packageId of animalPackages[animalId] || []) {
        const pkg = packages.find((p) => p.id === packageId);
        if (!pkg) continue;
        items.push({
          package_id: packageId,
          description: `${animal?.name_tag || animal?.animal_code} — ${packageLabel(pkg, i18n)}`,
          quantity: 1,
          unit_price: parseFloat(pkg.price) || 0,
        });
      }
      for (const testId of animalTests[animalId] || []) {
        if (isTestCoveredByPackages(testId, animalPackages[animalId], packages)) continue;
        const test = tests.find((x) => x.id === testId);
        items.push({
          test_id: testId,
          description: `${animal?.name_tag || animal?.animal_code} — ${testLabel(test)}`,
          quantity: 1,
          unit_price: parseFloat(test?.price) || 0,
        });
      }
    }
    if (includeFieldVisit && fieldVisitKm !== '') {
      const km = parseFloat(fieldVisitKm);
      if (Number.isFinite(km) && km >= 0) {
        items.push(buildFieldVisitInvoiceItem(fieldVisit, i18n, km));
      }
    }
    return items;
  }, [
    selectedAnimalIds, animals, animalPackages, animalTests, packages, tests, i18n,
    includeFieldVisit, fieldVisitKm, fieldVisit,
  ]);

  const invoiceTotalsPreview = useMemo(
    () => calcSplitTotals(
      workflowInvoiceItems,
      discountType,
      discountValue,
      fieldVisitDiscountType,
      fieldVisitDiscountValue,
      VAT_RATE,
      { catalogPrices: true },
    ),
    [workflowInvoiceItems, discountType, discountValue, fieldVisitDiscountType, fieldVisitDiscountValue],
  );

  const invoiceTotal = () => invoiceTotalsPreview.total;

  const canNext = () => {
    if (step === 0) return !!customerId;
    if (step === 1) return selectedAnimalIds.length > 0;
    if (step === 2) return !!invoiceId;
    if (step === 3) return samples.length === selectedAnimalIds.length && samples.length > 0;
    if (step === 4) return samples.every((s) => s.status !== 'pending');
    return true;
  };

  const createCustomer = async () => {
    setCreating(true);
    try {
      const { data } = await customersAPI.create(newCustomer);
      setCustomerId(data.data.id);
      setShowNewCustomer(false);
      setStep(1);
      toast.success(t('workflow.customerCreated'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setCreating(false);
    }
  };

  const createAnimal = async () => {
    setCreating(true);
    try {
      const { data } = await animalsAPI.create({ ...newAnimal, owner_id: customerId });
      setAnimals((prev) => [data.data, ...prev]);
      setSelectedAnimalIds((prev) => [...prev, data.data.id]);
      setAnimalTests((prev) => ({ ...prev, [data.data.id]: [] }));
      setAnimalPackages((prev) => ({ ...prev, [data.data.id]: [] }));
      setShowNewAnimal(false);
      setNewAnimal(EMPTY_ANIMAL);
      toast.success(t('workflow.animalCreated'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setCreating(false);
    }
  };

  const createInvoice = async () => {
    const missing = selectedAnimalIds.filter((id) => !animalHasServices(id, animalTests, animalPackages));
    if (missing.length) return toast.error(t('workflow.eachAnimalNeedsTest'));

    setCreating(true);
    try {
      const items = [];
      for (const animalId of selectedAnimalIds) {
        const animal = animals.find((a) => a.id === animalId);
        for (const packageId of animalPackages[animalId] || []) {
          const pkg = packages.find((p) => p.id === packageId);
          if (!pkg) continue;
          items.push({
            package_id: packageId,
            animal_id: animalId,
            description: `${animal?.name_tag || animal?.animal_code} — ${packageLabel(pkg, i18n)}`,
            quantity: 1,
            unit_price: parseFloat(pkg.price) || 0,
          });
        }
        for (const testId of animalTests[animalId] || []) {
          if (isTestCoveredByPackages(testId, animalPackages[animalId], packages)) continue;
          const test = tests.find((x) => x.id === testId);
          items.push({
            test_id: testId,
            animal_id: animalId,
            description: `${animal?.name_tag || animal?.animal_code} — ${testLabel(test)}`,
            quantity: 1,
            unit_price: parseFloat(test?.price) || 0,
          });
        }
      }

      if (includeFieldVisit) {
        const km = parseFloat(fieldVisitKm);
        if (!Number.isFinite(km) || km < 0) {
          toast.error(t('priceList.invalidDistance'));
          setCreating(false);
          return;
        }
        items.push(buildFieldVisitInvoiceItem(fieldVisit, i18n, km));
      }

      const discountFields = buildSplitDiscountPayload(
        items, discountType, discountValue, fieldVisitDiscountType, fieldVisitDiscountValue,
        { catalogPrices: true },
      );
      const { data } = await billingAPI.createInvoice({
        customer_id: customerId,
        items,
        ...discountFields,
      });
      setInvoiceId(data.data.id);
      setInvoiceNumber(data.data.invoice_number);
      setStep(3);
      toast.success(`${t('workflow.invoiceCreated')}: ${data.data.invoice_number}`);
    } catch (err) {
      const msg = err.response?.data?.error?.message;
      toast.error(msg === 'Insufficient permissions' ? t('auth.insufficientPermissions') : (msg || 'خطأ'));
    } finally {
      setCreating(false);
    }
  };

  const registerAllSamples = async () => {
    setCreating(true);
    try {
      const created = [];
      for (const animalId of selectedAnimalIds) {
        const { data } = await samplesAPI.create({
          customer_id: customerId,
          animal_id: animalId,
          test_ids: animalTests[animalId] || [],
          package_ids: animalPackages[animalId] || [],
          invoice_id: invoiceId,
          priority: 'normal',
        });
        created.push(data.data);
      }
      setSamples(created);
      toast.success(t('workflow.samplesCreated', { count: created.length }));

      const expected = totalLabelCountForSamples(created);
      const { printed, reason } = await autoPrintSampleLabels(created);
      if (printed >= expected) {
        toast.success(t('samples.autoPrintOk', { count: printed }));
        return;
      }
      if (reason === 'invalid_barcode') {
        toast.error(t('samples.barcodeLabelBuildFailed'));
      } else if (printed === 0) {
        toast.error(t('samples.autoPrintFailed'));
      }
      if (printed > 0) {
        toast.success(t('samples.zebraPrintPartial', { printed, total: expected, printer: 'Zebra' }));
      }
      if (printed < expected && created[0]) {
        setPrintSample(created[0]);
        setPrintOpen(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setCreating(false);
    }
  };

  const markAllReceived = async () => {
    try {
      const updated = [];
      for (const s of samples) {
        if (s.status === 'pending') {
          await samplesAPI.updateStatus(s.id, { status: 'received' });
          updated.push({ ...s, status: 'received' });
        } else {
          updated.push(s);
        }
      }
      setSamples(updated);
      if (receptionMode) setStep(RECEPTION_STEP_COUNT);
      toast.success(t('workflow.allSamplesReceived'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const handlePrintLabel = async (sample) => {
    try {
      await printSampleLabel(sample, { showDialog: true });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[WorkflowCase] handlePrintLabel', error);
      toast.error(t('samples.barcodeLabelBuildFailed'));
    }
  };

  const openPrintLabel = async (row) => {
    try {
      if (features.requireInvoiceBeforeBarcode) {
        await samplesAPI.getBarcode(row.id);
      }
      const { data } = await samplesAPI.get(row.id);
      setPrintSample(data.data);
      setPrintOpen(true);
    } catch (err) {
      if (err.response?.data?.error?.code === 'INVOICE_REQUIRED') {
        toast.error(t('workflow.invoiceRequiredForBarcode'));
        return;
      }
      setPrintSample(row);
      setPrintOpen(true);
    }
  };

  const printThermalReceipt = async () => {
    if (!invoiceId) return;
    try {
      const { data } = await billingAPI.getInvoice(invoiceId);
      await printThermalInvoice(
        data.data,
        {
          name: 'AL NAWADER VETERINARY CARE CENTER',
          nameAr: 'مركز رعاية النوادر البيطري',
          phone: '0115007257',
          vatNumber: '311042487300003',
        },
        { isArabic: i18n.language === 'ar' },
      );
    } catch (err) {
      if (err.message === 'POPUP_BLOCKED') {
        toast.error(t('workflow.popupBlocked'));
      } else {
        toast.error(t('workflow.thermalPrintFailed'));
      }
    }
  };

  const handoverSample = async (sampleId) => {
    try {
      const { data } = await samplesAPI.labHandover(sampleId);
      setSamples((prev) => prev.map((s) => (s.id === sampleId ? { ...s, ...data.data } : s)));
      toast.success(t('workflow.labHandoverDone'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || t('common.error'));
    }
  };

  const resetCase = () => {
    setStep(0);
    setCustomerId('');
    setSelectedAnimalIds([]);
    setAnimalTests({});
    setAnimalPackages({});
    setIncludeFieldVisit(false);
    setFieldVisitKm('');
    setInvoiceId('');
    setInvoiceNumber('');
    setSamples([]);
    setPrintSample(null);
    setTestSearch('');
    setShowNewCustomer(false);
    setShowNewAnimal(false);
  };

  const stepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <p className="text-base text-primary-700 dark:text-primary-300 font-medium">{t('workflow.step1Desc')}</p>
            <p className="text-sm text-primary-500">{t('customers.searchMobileHint')}</p>
            <CustomerSearch
              value={customerId}
              onChange={(id) => {
                setCustomerId(id);
                setSelectedAnimalIds([]);
                setAnimalTests({});
                setAnimalPackages({});
                if (!id) setFieldVisitKm('');
                if (id && receptionMode) setStep(1);
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowNewCustomer(!showNewCustomer)}
              className="flex items-center gap-2 text-sm text-primary-600 font-medium"
            >
              {showNewCustomer ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {t('workflow.orCreateCustomer')}
            </button>
            {showNewCustomer && (
              <div className="border rounded-lg p-4 bg-primary-50/50 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {['full_name', 'mobile', 'city', 'farm_company'].map((f) => (
                    <input key={f} value={newCustomer[f]} onChange={(e) => setNewCustomer({ ...newCustomer, [f]: e.target.value })}
                      placeholder={t(`customers.${f === 'farm_company' ? 'farm' : f === 'full_name' ? 'fullName' : f}`)}
                      className="input-field" />
                  ))}
                </div>
                <button onClick={createCustomer} disabled={creating || !newCustomer.full_name || !newCustomer.mobile} className="btn-primary w-full py-3">
                  {t('workflow.createCustomer')}
                </button>
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <p className="text-base text-primary-700 dark:text-primary-300 font-medium">{t('workflow.step2MultiDesc')}</p>
            {animals.length === 0 ? (
              <p className="text-sm text-primary-500">{t('workflow.noAnimalsYet')}</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto border rounded-lg p-3">
                {animals.map((a) => (
                  <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-primary-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedAnimalIds.includes(a.id)}
                      onChange={() => toggleAnimal(a.id)}
                      className="w-5 h-5"
                    />
                    <span className="text-sm font-medium">{animalLabel(a)}</span>
                  </label>
                ))}
              </div>
            )}
            {selectedAnimalIds.length > 0 && (
              <p className="text-sm text-green-700 font-medium">
                {t('workflow.animalsSelected', { count: selectedAnimalIds.length })}
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowNewAnimal(!showNewAnimal)}
              className="flex items-center gap-2 text-sm text-primary-600 font-medium"
            >
              {showNewAnimal ? <ChevronUp size={16} /> : <Plus size={16} />}
              {t('workflow.orCreateAnimal')}
            </button>
            {showNewAnimal && (
              <div className="border rounded-lg p-4 bg-primary-50/50 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-primary-700">{t('animals.type')}</label>
                    <select value={newAnimal.animal_type} onChange={(e) => setNewAnimal({ ...newAnimal, animal_type: e.target.value })} className="input-field">
                      {speciesCodes.map((type) => <option key={type} value={type}>{speciesLabel(type, i18n.language === 'ar')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-primary-700">{t('animals.gender')}</label>
                    <select value={newAnimal.gender} onChange={(e) => setNewAnimal({ ...newAnimal, gender: e.target.value })} className="input-field">
                      <option value="male">{t('workflow.male')}</option>
                      <option value="female">{t('workflow.female')}</option>
                      <option value="unknown">{t('animals.genders.unknown')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-primary-700">{t('animals.age')}</label>
                    <input value={newAnimal.age} onChange={(e) => setNewAnimal({ ...newAnimal, age: e.target.value })} placeholder={t('animals.agePlaceholder')} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-primary-700">{t('animals.name')}</label>
                    <input value={newAnimal.name_tag} onChange={(e) => setNewAnimal({ ...newAnimal, name_tag: e.target.value })} placeholder={t('animals.name')} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-primary-700">{t('animals.breed')}</label>
                    <input value={newAnimal.breed} onChange={(e) => setNewAnimal({ ...newAnimal, breed: e.target.value })} placeholder={t('animals.breed')} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-primary-700">{t('animals.color')}</label>
                    <input value={newAnimal.color} onChange={(e) => setNewAnimal({ ...newAnimal, color: e.target.value })} placeholder={t('animals.color')} className="input-field" />
                  </div>
                </div>
                <button onClick={createAnimal} disabled={creating || !customerId} className="btn-primary w-full py-3">
                  {t('workflow.createAnimal')}
                </button>
              </div>
            )}
            {receptionMode && selectedAnimalIds.length > 0 && (
              <button onClick={() => setStep(2)} className="btn-primary w-full py-3">
                {t('workflow.continueToInvoice')} ({selectedAnimalIds.length})
              </button>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <p className="text-base text-primary-700 dark:text-primary-300 font-medium">{t('workflow.step3MultiDesc')}</p>
            {invoiceId ? (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-green-600" size={20} />
                  <span>{t('workflow.invoiceReady')}: <strong>{invoiceNumber}</strong></span>
                </div>
                <p className="text-sm text-primary-600">
                  {t('workflow.invoiceAnimals', { count: selectedAnimalIds.length })} — {invoiceTotal().toFixed(0)} {t('reception.sar')}
                </p>
                <button
                  type="button"
                  onClick={printThermalReceipt}
                  className="btn-secondary w-full mt-3 py-2 flex items-center justify-center gap-2"
                >
                  <Printer size={16} /> {t('workflow.printThermalInvoice')}
                </button>
              </div>
            ) : (
              <>
                <input
                  value={testSearch}
                  onChange={(e) => setTestSearch(e.target.value)}
                  placeholder={t('tests.searchPlaceholder')}
                  className="input-field"
                />
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {selectedAnimalIds.map((animalId) => {
                    const animal = animals.find((a) => a.id === animalId);
                    return (
                      <div key={animalId} className="border rounded-lg p-3 bg-primary-50/30">
                        <p className="font-semibold text-sm mb-2 text-primary-800">{animalLabel(animal)}</p>
                        {packages.length > 0 && (
                          <div className="mb-3 pb-3 border-b border-primary-200/80">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 dark:text-primary-300 mb-2 px-1">
                              <Package size={14} />
                              {t('samples.selectPackages')}
                            </p>
                            <div className="space-y-1">
                              {packages.map((pkg) => (
                                <label key={pkg.id} className="flex items-center gap-3 text-sm p-1.5 rounded hover:bg-white cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={(animalPackages[animalId] || []).includes(pkg.id)}
                                    onChange={(e) => toggleAnimalPackage(animalId, pkg.id, e.target.checked)}
                                    className="w-4 h-4"
                                  />
                                  <span className="flex-1">
                                    {packageLabel(pkg, i18n)}
                                    <span className="text-xs text-gray-500 ms-1">
                                      ({t('samples.packageTestCount', { count: packageTestIds(pkg).length })})
                                    </span>
                                  </span>
                                  <span className="text-primary-600 font-medium">{fmtCatalog(pkg.price)}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          {testsByCategory.map((group) => (
                            <div key={group.key}>
                              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 dark:text-primary-300 mb-1 px-1">
                                <span className="text-sm leading-none" aria-hidden="true">{getCategoryEmoji(group.category)}</span>
                                {categoryGroupLabel(group)}
                              </p>
                              <div className="space-y-1">
                                {group.tests.map((test) => (
                                  <label key={test.id} className="flex items-center gap-3 text-sm p-1.5 rounded hover:bg-white cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={(animalTests[animalId] || []).includes(test.id)}
                                      onChange={(e) => toggleAnimalTest(animalId, test.id, e.target.checked)}
                                      className="w-4 h-4"
                                    />
                                    <span className="flex-1">
                                      {testLabel(test)}
                                      {(test.label_copies ?? 1) > 1 && (
                                        <span className="text-xs text-gray-500 ms-1">
                                          ({t('tests.labelCopiesShort', { count: test.label_copies })})
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-primary-600 font-medium">{fmtCatalog(test.price)}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="p-3 rounded-lg border border-primary-200 bg-white dark:bg-primary-900/10 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeFieldVisit}
                      onChange={(e) => {
                        setIncludeFieldVisit(e.target.checked);
                        if (!e.target.checked) setFieldVisitKm('');
                      }}
                      className="w-4 h-4"
                    />
                    <MapPin size={18} className="text-primary-600 shrink-0" />
                    <span className="flex-1 text-sm font-medium">{t('priceList.includeFieldVisit')}</span>
                  </label>
                  {includeFieldVisit && (
                    <div className="ps-9">
                      <FieldVisitDistanceField
                        fieldVisit={fieldVisit}
                        km={fieldVisitKm}
                        onKmChange={setFieldVisitKm}
                        fmt={fmtCatalog}
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 rounded-lg border border-primary-100 bg-white dark:bg-primary-900/10">
                  <DiscountField
                    subtotal={invoiceTotalsPreview.serviceSubtotal}
                    type={discountType}
                    value={discountValue}
                    onTypeChange={setDiscountType}
                    onValueChange={setDiscountValue}
                    labelKey="billing.servicesDiscount"
                  />
                  <DiscountField
                    subtotal={invoiceTotalsPreview.fieldVisitSubtotal}
                    type={fieldVisitDiscountType}
                    value={fieldVisitDiscountValue}
                    onTypeChange={setFieldVisitDiscountType}
                    onValueChange={setFieldVisitDiscountValue}
                    labelKey="billing.fieldVisitDiscount"
                  />
                </div>
                <div className="bg-primary-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span>{t('priceList.subtotal')}</span><span>{fmtNet(invoiceTotalsPreview.subtotal)}</span></div>
                  {invoiceTotalsPreview.discountAmount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>{t('priceList.servicesDiscount')}</span><span>- {fmtNet(invoiceTotalsPreview.discountAmount)}</span>
                    </div>
                  )}
                  {invoiceTotalsPreview.fieldVisitDiscountAmount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>{t('priceList.fieldVisitDiscount')}</span><span>- {fmtNet(invoiceTotalsPreview.fieldVisitDiscountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t pt-1 mt-1">
                    <span>{t('workflow.total')}</span>
                    <span>{invoiceTotal().toFixed(2)} {t('reception.sar')}</span>
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t">
                  <button
                    onClick={createInvoice}
                    disabled={creating || invoiceTotal() === 0 || !hasPermission('billing.create')}
                    className="btn-primary py-3 px-6"
                    title={!hasPermission('billing.create') ? t('auth.insufficientPermissions') : undefined}
                  >
                    {t('workflow.issueInvoice')}
                  </button>
                </div>
              </>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <p className="text-base text-primary-700 dark:text-primary-300 font-medium">{t('workflow.step4MultiDesc')}</p>
            {samples.length === selectedAnimalIds.length ? (
              <div className="space-y-2">
                {samples.map((s) => {
                  const animal = animals.find((a) => a.id === s.animal_id);
                  return (
                    <div key={s.id} className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg flex justify-between items-center gap-2">
                      <div>
                        <p className="font-medium">{s.sample_code}</p>
                        <p className="text-xs text-primary-500">{animalLabel(animal)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => openPrintLabel(s)}
                          className="btn-secondary text-xs py-1 px-2"
                        >
                          {t('samples.printLabel')}
                        </button>
                        {features.requireLabHandover && !s.lab_handover_at && (
                          <button
                            type="button"
                            onClick={() => handoverSample(s.id)}
                            className="btn-primary text-xs py-1 px-2"
                          >
                            {t('workflow.labHandover')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <button onClick={registerAllSamples} disabled={creating || !invoiceId} className="btn-primary w-full py-3 text-base">
                {t('workflow.registerAllSamples', { count: selectedAnimalIds.length })}
              </button>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <p className="text-base text-primary-700 dark:text-primary-300 font-medium">{t('workflow.step5Desc')}</p>
            {samples.some((s) => s.status === 'pending') ? (
              <button onClick={markAllReceived} className="btn-primary w-full py-3 text-base">
                {t('workflow.markAllDelivered', { count: samples.length })}
              </button>
            ) : (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center gap-2">
                <CheckCircle className="text-green-600" size={20} />
                <span>{t('workflow.allDeliveredConfirmed')}</span>
              </div>
            )}
          </div>
        );

      default:
        return (
          <div className="space-y-4 text-center py-6">
            <CheckCircle size={56} className="mx-auto text-green-600" />
            <h3 className="text-xl font-bold">{t('workflow.receptionComplete')}</h3>
            <p className="text-sm text-primary-600 font-medium">{invoiceNumber}</p>
            <div className="text-sm text-primary-500 space-y-1">
              {samples.map((s) => (
                <p key={s.id}>{s.sample_code}</p>
              ))}
            </div>
            <p className="text-sm text-primary-500">{t('reception.handoffNote')}</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 mt-4">
              <button onClick={resetCase} className="btn-primary py-3 px-6">{t('reception.anotherCase')}</button>
              <button onClick={() => navigate('/samples')} className="btn-secondary py-3 px-6">{t('reception.viewSamples')}</button>
            </div>
            {!receptionMode && samples[0] && (() => {
              const entry = getResultsEntryTargets(samples[0].id, samples[0].tests);
              return (
              <div className="flex flex-wrap justify-center gap-2 mt-4 pt-4 border-t">
                <p className="w-full text-sm text-primary-500 mb-1">{t('workflow.labStepsNote')}</p>
                {entry.workbench && (
                  <button onClick={() => navigate(entry.workbench)} className="btn-secondary text-sm">{t('workflow.goEnterResults')}</button>
                )}
                {entry.parasitology && (
                  <button onClick={() => navigate(entry.parasitology)} className="btn-secondary text-sm">{t('nav.parasitology')}</button>
                )}
                <button onClick={() => navigate(`/vet-review?sample=${samples[0].id}`)} className="btn-secondary text-sm">{t('workflow.goApprove')}</button>
                <button onClick={() => navigate('/reports')} className="btn-secondary text-sm">{t('workflow.goExtract')}</button>
              </div>
              );
            })()}
          </div>
        );
    }
  };

  const maxSteps = receptionMode ? RECEPTION_STEP_COUNT : WORKFLOW_STEPS.length;

  return (
    <div className={receptionMode ? 'max-w-2xl mx-auto' : ''}>
      <h1 className="text-2xl font-bold mb-2">
        {receptionMode ? t('reception.caseTitle') : t('workflow.caseTitle')}
      </h1>
      <p className="text-sm text-primary-500 mb-6">
        {receptionMode ? t('reception.caseSubtitle') : t('workflow.caseSubtitle')}
      </p>

      <WorkflowStepper context={context} receptionOnly={receptionMode} />

      <div className="card p-6">
        {!receptionMode && (
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-sm">
              {step < maxSteps ? step + 1 : '✓'}
            </span>
            <h2 className="font-semibold">
              {step < maxSteps ? t(WORKFLOW_STEPS[step].labelKey) : t('workflow.done')}
            </h2>
          </div>
        )}

        {stepContent()}

        {step < maxSteps && !receptionMode && (
          <div className="flex justify-between mt-6 pt-4 border-t gap-3">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="btn-secondary flex items-center gap-1 py-3 px-4"
            >
              <ChevronLeft size={18} /> {t('workflow.prev')}
            </button>
            {step < maxSteps - 1 && (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className="btn-primary flex items-center gap-1 py-3 px-4"
              >
                {t('workflow.next')} <ChevronRight size={18} />
              </button>
            )}
            {step === maxSteps - 1 && (
              <button onClick={() => setStep(maxSteps)} disabled={!canNext()} className="btn-primary flex items-center gap-1 py-3 px-4">
                {t('workflow.finish')} <ChevronRight size={18} />
              </button>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={printOpen} onClose={() => setPrintOpen(false)} title={t('samples.printLabel')}>
        {printSample && (
          <>
            {totalLabelCountForSample(printSample) > 1 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('samples.labelCopiesHint', { count: totalLabelCountForSample(printSample) })}
              </p>
            )}
            <div className="label-print-area space-y-3 max-h-96 overflow-y-auto">
              {expandSampleLabelJobs(printSample).map((job, idx) => (
                <BarcodeLabelErrorBoundary key={`${job.panelKey}-${idx}`}>
                  <BarcodeLabel
                    sample={job}
                  />
                </BarcodeLabelErrorBoundary>
              ))}
            </div>
          </>
        )}
        <button type="button" onClick={() => handlePrintLabel(printSample)} className="btn-primary w-full mt-4 no-print">{t('common.print')}</button>
      </Modal>
    </div>
  );
}
