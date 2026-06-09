import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import WorkflowStepper from '../components/workflow/WorkflowStepper';
import CustomerSearch from '../components/customers/CustomerSearch';
import Modal from '../components/ui/Modal';
import BarcodeLabel from '../components/barcode/BarcodeLabel';
import {
  customersAPI, animalsAPI, testsAPI, billingAPI, samplesAPI,
} from '../services/api';
import { WORKFLOW_STEPS } from '../utils/workflow';

const RECEPTION_STEPS = 5;
const ANIMAL_TYPES = ['camel', 'horse', 'sheep', 'goat', 'bird', 'cat', 'dog'];

export default function WorkflowCase() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillCustomer = searchParams.get('customer');

  const [step, setStep] = useState(0);
  const [animals, setAnimals] = useState([]);
  const [tests, setTests] = useState([]);

  const [customerId, setCustomerId] = useState(prefillCustomer || '');
  const [animalId, setAnimalId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedTests, setSelectedTests] = useState([]);
  const [sample, setSample] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);

  const [newCustomer, setNewCustomer] = useState({ full_name: '', mobile: '', city: '', farm_company: '' });
  const [newAnimal, setNewAnimal] = useState({ animal_type: 'camel', name_tag: '', gender: 'male' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    testsAPI.list({ limit: 200 }).then(({ data }) => setTests(data.data));
  }, []);

  useEffect(() => {
    if (customerId) {
      animalsAPI.list({ owner_id: customerId }).then(({ data }) => setAnimals(data.data));
    } else {
      setAnimals([]);
    }
  }, [customerId]);

  const context = { customerId, animalId, invoiceId, sample };

  const canNext = () => {
    if (step === 0) return !!customerId;
    if (step === 1) return !!animalId;
    if (step === 2) return !!invoiceId;
    if (step === 3) return !!sample;
    if (step === 4) return sample?.status !== 'pending';
    return true;
  };

  const createCustomer = async () => {
    setCreating(true);
    try {
      const { data } = await customersAPI.create(newCustomer);
      setCustomerId(data.data.id);
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
      setAnimalId(data.data.id);
      toast.success(t('workflow.animalCreated'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setCreating(false);
    }
  };

  const createInvoice = async () => {
    if (!selectedTests.length) return toast.error(t('workflow.selectTestsFirst'));
    setCreating(true);
    try {
      const items = selectedTests.map((testId) => {
        const test = tests.find((x) => x.id === testId);
        return { test_id: testId, description: test?.name, quantity: 1, unit_price: parseFloat(test?.price) || 0 };
      });
      const { data } = await billingAPI.createInvoice({
        customer_id: customerId,
        items,
        discount_amount: 0,
      });
      setInvoiceId(data.data.id);
      setInvoiceNumber(data.data.invoice_number);
      toast.success(`${t('workflow.invoiceCreated')}: ${data.data.invoice_number}`);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setCreating(false);
    }
  };

  const registerSample = async () => {
    setCreating(true);
    try {
      const { data } = await samplesAPI.create({
        customer_id: customerId,
        animal_id: animalId,
        test_ids: selectedTests,
        invoice_id: invoiceId,
        priority: 'normal',
      });
      setSample(data.data);
      setPrintOpen(true);
      toast.success(`${t('workflow.sampleCreated')}: ${data.data.sample_code}`);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setCreating(false);
    }
  };

  const markReceived = async () => {
    if (!sample) return;
    try {
      await samplesAPI.updateStatus(sample.id, { status: 'received' });
      setSample({ ...sample, status: 'received' });
      toast.success(t('workflow.sampleReceived'));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const stepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{t('workflow.step1Desc')}</p>
            <p className="text-xs text-primary-600 mb-1">{t('customers.searchMobileHint')}</p>
            <CustomerSearch
              value={customerId}
              onChange={(id) => { setCustomerId(id); setAnimalId(''); }}
              autoFocus
            />
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">{t('workflow.orCreateCustomer')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {['full_name', 'mobile', 'city', 'farm_company'].map((f) => (
                  <input key={f} value={newCustomer[f]} onChange={(e) => setNewCustomer({ ...newCustomer, [f]: e.target.value })}
                    placeholder={t(`customers.${f === 'farm_company' ? 'farm' : f === 'full_name' ? 'fullName' : f}`)}
                    className="input-field" />
                ))}
              </div>
              <button onClick={createCustomer} disabled={creating || !newCustomer.full_name || !newCustomer.mobile} className="btn-secondary mt-3">
                {t('workflow.createCustomer')}
              </button>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{t('workflow.step2Desc')}</p>
            <select value={animalId} onChange={(e) => setAnimalId(e.target.value)} className="input-field">
              <option value="">{t('workflow.selectAnimal')}</option>
              {animals.map((a) => <option key={a.id} value={a.id}>{a.animal_code} — {a.name_tag} ({t(`animals.types.${a.animal_type}`)})</option>)}
            </select>
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">{t('workflow.orCreateAnimal')}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select value={newAnimal.animal_type} onChange={(e) => setNewAnimal({ ...newAnimal, animal_type: e.target.value })} className="input-field">
                  {ANIMAL_TYPES.map((type) => <option key={type} value={type}>{t(`animals.types.${type}`)}</option>)}
                </select>
                <input value={newAnimal.name_tag} onChange={(e) => setNewAnimal({ ...newAnimal, name_tag: e.target.value })} placeholder={t('animals.tag')} className="input-field" />
                <select value={newAnimal.gender} onChange={(e) => setNewAnimal({ ...newAnimal, gender: e.target.value })} className="input-field">
                  <option value="male">{t('workflow.male')}</option>
                  <option value="female">{t('workflow.female')}</option>
                </select>
              </div>
              <button onClick={createAnimal} disabled={creating || !customerId} className="btn-secondary mt-3">
                {t('workflow.createAnimal')}
              </button>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{t('workflow.step3Desc')}</p>
            {invoiceId ? (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center gap-2">
                <CheckCircle className="text-green-600" size={20} />
                <span>{t('workflow.invoiceReady')}: <strong>{invoiceNumber}</strong></span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                  {tests.map((test) => (
                    <label key={test.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedTests.includes(test.id)}
                        onChange={(e) => {
                          setSelectedTests(e.target.checked
                            ? [...selectedTests, test.id]
                            : selectedTests.filter((id) => id !== test.id));
                        }}
                      />
                      {test.name} — {Number(test.price).toFixed(2)} SAR
                    </label>
                  ))}
                </div>
                <button onClick={createInvoice} disabled={creating || !selectedTests.length} className="btn-primary">
                  {t('workflow.issueInvoice')}
                </button>
              </>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{t('workflow.step4Desc')}</p>
            {sample ? (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg space-y-2">
                <p><strong>{sample.sample_code}</strong> — {t('samples.barcode')}: {sample.barcode}</p>
                <button onClick={() => setPrintOpen(true)} className="btn-secondary text-sm">{t('samples.printLabel')}</button>
              </div>
            ) : (
              <button onClick={registerSample} disabled={creating || !invoiceId} className="btn-primary">
                {t('workflow.registerSampleBarcode')}
              </button>
            )}
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{t('workflow.step5Desc')}</p>
            {sample?.status === 'pending' ? (
              <button onClick={markReceived} className="btn-primary">{t('workflow.markDelivered')}</button>
            ) : (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center gap-2">
                <CheckCircle className="text-green-600" size={20} />
                <span>{t('workflow.deliveredConfirmed')}</span>
              </div>
            )}
          </div>
        );
      default:
        return (
          <div className="space-y-4 text-center py-4">
            <CheckCircle size={48} className="mx-auto text-green-600" />
            <h3 className="text-lg font-bold">{t('workflow.receptionComplete')}</h3>
            <p className="text-sm text-gray-500">{t('workflow.labStepsNote')}</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <button onClick={() => navigate(`/workbench?sample=${sample?.id}`)} className="btn-primary text-sm">{t('workflow.goResults')}</button>
              <button onClick={() => navigate(`/vet-review?sample=${sample?.id}`)} className="btn-secondary text-sm">{t('workflow.goApprove')}</button>
              <button onClick={() => navigate('/reports')} className="btn-secondary text-sm">{t('workflow.goReports')}</button>
              <button onClick={() => navigate('/samples')} className="btn-secondary text-sm">{t('workflow.goSamples')}</button>
            </div>
          </div>
        );
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">{t('workflow.caseTitle')}</h1>
      <p className="text-sm text-gray-500 mb-6">{t('workflow.caseSubtitle')}</p>

      <WorkflowStepper context={context} />

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-sm">
            {step < RECEPTION_STEPS ? step + 1 : '✓'}
          </span>
          <h2 className="font-semibold">
            {step < RECEPTION_STEPS ? t(WORKFLOW_STEPS[step].labelKey) : t('workflow.done')}
          </h2>
        </div>

        {stepContent()}

        {step < RECEPTION_STEPS && (
          <div className="flex justify-between mt-6 pt-4 border-t">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="btn-secondary flex items-center gap-1"
            >
              <ChevronLeft size={18} /> {t('workflow.prev')}
            </button>
            {step < RECEPTION_STEPS - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className="btn-primary flex items-center gap-1"
              >
                {t('workflow.next')} <ChevronRight size={18} />
              </button>
            ) : (
              <button onClick={() => setStep(RECEPTION_STEPS)} disabled={!canNext()} className="btn-primary flex items-center gap-1">
                {t('workflow.finish')} <ChevronRight size={18} />
              </button>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={printOpen} onClose={() => setPrintOpen(false)} title={t('samples.printLabel')}>
        {sample && <BarcodeLabel sample={sample} />}
        <button onClick={() => window.print()} className="btn-primary w-full mt-4 no-print">{t('common.print')}</button>
      </Modal>
    </div>
  );
}
