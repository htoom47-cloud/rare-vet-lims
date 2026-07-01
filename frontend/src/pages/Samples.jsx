import { useEffect, useState } from 'react';

import { useTranslation } from 'react-i18next';

import { Plus, Search, Scan, Printer, Route, Package } from 'lucide-react';

import toast from 'react-hot-toast';

import DataTable from '../components/ui/DataTable';

import StatusBadge from '../components/ui/StatusBadge';

import Modal from '../components/ui/Modal';

import BarcodeScanner from '../components/barcode/BarcodeScanner';

import BarcodeLabel from '../components/barcode/BarcodeLabel';
import { printSampleLabel } from '../utils/printLabel';
import { expandSampleLabelJobs, totalLabelCountForSample } from '../utils/labelCopies';

import WorkflowStepper from '../components/workflow/WorkflowStepper';
import CustomerSearch from '../components/customers/CustomerSearch';

import { samplesAPI, animalsAPI, testsAPI, billingAPI, notificationsAPI, resultsAPI } from '../services/api';
import { getResultsEntryTargets } from '../utils/parasitologyTests';
import { fmtCatalog } from '../utils/vat';
import { packageLabel, packageTestIds } from '../utils/packageSelection';
import { useAuth } from '../context/AuthContext';

import { useNavigate, Link } from 'react-router-dom';



export default function Samples() {

  const { t, i18n } = useTranslation();

  const navigate = useNavigate();
  const { hasPermission, hasAnyPermission } = useAuth();
  const canSendSmsToCustomer = hasPermission('notifications.send_report');
  const canGenerateReport = hasPermission('reports.generate');
  const canReviewResults = hasAnyPermission(
    'results.validate', 'results.edit', 'results.unvalidate', 'results.enter'
  );

  const [samples, setSamples] = useState([]);

  const [detailSample, setDetailSample] = useState(null);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');

  const [statusFilter, setStatusFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);

  const [scanOpen, setScanOpen] = useState(false);

  const [printSample, setPrintSample] = useState(null);

  const [animals, setAnimals] = useState([]);

  const [tests, setTests] = useState([]);

  const [packages, setPackages] = useState([]);

  const [form, setForm] = useState({
    customer_id: '', animal_id: '', test_ids: [], package_ids: [], priority: 'normal', notes: '',
  });

  const [sending, setSending] = useState(false);



  const load = () => {

    setLoading(true);

    samplesAPI.list({ search, status: statusFilter }).then(({ data }) => setSamples(data.data)).finally(() => setLoading(false));

  };



  useEffect(() => { load(); }, [search, statusFilter]);



  useEffect(() => {

    testsAPI.list({ limit: 100 }).then(({ data }) => setTests(data.data));

    testsAPI.listPackages().then(({ data }) => setPackages(data.data || [])).catch(() => {});

  }, []);



  useEffect(() => {

    if (form.customer_id) {

      animalsAPI.list({ owner_id: form.customer_id }).then(({ data }) => setAnimals(data.data));

    }

  }, [form.customer_id]);



  const handleSubmit = async (e) => {

    e.preventDefault();

    try {

      const { data } = await samplesAPI.create(form);

      toast.success(`${t('workflow.sampleCreated')}: ${data.data.sample_code}`);

      setModalOpen(false);

      setPrintSample(data.data);

      load();

    } catch (err) {

      toast.error(err.response?.data?.error?.message || 'Error');

    }

  };



  const openPrintLabel = async (row) => {
    try {
      const { data } = await samplesAPI.get(row.id);
      setPrintSample(data.data);
    } catch {
      setPrintSample(row);
    }
  };



  const handleScan = async (barcode) => {

    try {

      const { data } = await samplesAPI.scan(barcode);

      const sample = data.data;

      setScanOpen(false);

      if (sample.status === 'pending') {

        if (window.confirm(t('workflow.markReceivedPrompt'))) {

          await samplesAPI.updateStatus(sample.id, { status: 'received' });

          toast.success(t('workflow.sampleReceived'));

          load();

        }

      } else {

        toast.success(`${sample.sample_code} — ${t(`samples.statuses.${sample.status}`)}`);

      }

      viewDetail(sample);

    } catch {

      toast.error('Sample not found');

    }

  };



  const updateStatus = async (id, status) => {

    await samplesAPI.updateStatus(id, { status });

    toast.success('تم تحديث الحالة');

    load();

    if (detailSample?.id === id) {

      const { data } = await samplesAPI.get(id);

      setDetailSample(data.data);

    }

  };



  const viewDetail = async (sample) => {

    const { data } = await samplesAPI.get(sample.id);

    setDetailSample(data.data);

  };



  const createInvoiceFromSample = async () => {

    if (!detailSample) return;

    try {

      const items = detailSample.tests.map((t) => ({

        test_id: t.test_id,

        description: t.test_name,

        quantity: 1,

        unit_price: parseFloat(t.price) || 0,

      }));

      await billingAPI.createInvoice({

        customer_id: detailSample.customer_id,

        sample_id: detailSample.id,

        items,

        discount_amount: 0,

      });

      toast.success(t('workflow.invoiceCreated'));

      viewDetail(detailSample);

    } catch (err) {

      toast.error(err.response?.data?.error?.message || 'خطأ');

    }

  };



  const generateReportOnly = () => {
    if (!detailSample) return;
    setDetailSample(null);
    navigate(`/reports?generate=${detailSample.id}`);
  };

  const sendReportToCustomer = async (sample) => {
    const target = sample || detailSample;
    if (!target?.id) return;
    setSending(true);
    try {
      await notificationsAPI.sendReport(target.id, 'sms', target.customer_mobile);
      toast.success(t('workflow.sentToCustomer'));
      if (detailSample?.id === target.id) {
        viewDetail(target);
      } else {
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setSending(false);
    }
  };

  const canSendForSample = (sample) => {
    if (!canSendSmsToCustomer || !sample) return false;
    const hasReport = sample.workflow?.has_report ?? parseInt(sample.reports_count, 10) > 0;
    const sent = sample.workflow?.sent_to_customer ?? parseInt(sample.notifications_count, 10) > 0;
    return hasReport && !sent;
  };



  const columns = [

    { key: 'sample_code', label: 'Sample ID' },

    { key: 'barcode', label: t('samples.barcode') },

    { key: 'customer_name', label: t('customers.fullName') },

    { key: 'animal_code', label: t('animals.animalId') },

    { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`samples.statuses.${r.status}`)} /> },

    { key: 'test_count', label: 'Tests' },

    { key: 'actions', label: t('common.actions'), render: (r) => (

      <div className="flex gap-2 flex-wrap">

        <button onClick={(e) => { e.stopPropagation(); viewDetail(r); }} className="text-primary-600 text-xs">{t('common.view')}</button>

        {r.status === 'pending' && <button onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'received'); }} className="text-blue-600 text-xs">{t('workflow.steps.deliver')}</button>}

        {r.status === 'received' && <button onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'running'); }} className="text-purple-600 text-xs">{t('samples.statuses.running')}</button>}

        <button onClick={(e) => { e.stopPropagation(); openPrintLabel(r); }} className="text-gray-600 text-xs flex items-center gap-1"><Printer size={12} /> {t('common.print')}</button>

        {canSendForSample(r) && (
          <button
            onClick={(e) => { e.stopPropagation(); sendReportToCustomer(r); }}
            disabled={sending}
            className="text-green-700 text-xs font-medium"
          >
            {t('workflow.sendToCustomer')}
          </button>
        )}

      </div>

    )},

  ];



  return (

    <div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">

        <h1 className="text-2xl font-bold">{t('samples.title')}</h1>

        <div className="flex flex-wrap gap-2">

          <div className="relative">

            <Search size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />

            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="input-field ps-10 w-48" />

          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-auto">

            <option value="">All Status</option>

            {['pending', 'received', 'running', 'completed', 'rejected'].map((s) => (

              <option key={s} value={s}>{t(`samples.statuses.${s}`)}</option>

            ))}

          </select>

          <button onClick={() => setScanOpen(true)} className="btn-secondary flex items-center gap-2"><Scan size={18} /> {t('samples.scan')}</button>

          <Link to="/workflow" className="btn-secondary flex items-center gap-2"><Route size={18} /> {t('nav.workflow')}</Link>

          <button onClick={() => { setForm({ customer_id: '', animal_id: '', test_ids: [], package_ids: [], priority: 'normal', notes: '' }); setModalOpen(true); }} className="btn-primary flex items-center gap-2"><Plus size={18} /> {t('samples.register')}</button>

        </div>

      </div>



      <DataTable columns={columns} data={samples} loading={loading} onRowClick={viewDetail} />



      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={t('samples.register')} size="lg">

        <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">

          {t('workflow.caseSubtitle')} — <Link to="/workflow" className="underline font-medium">{t('nav.workflow')}</Link>

        </p>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">

            <div>

              <label className="block text-sm font-medium mb-1">{t('customers.fullName')}</label>

              <CustomerSearch

                value={form.customer_id}

                onChange={(id) => setForm({ ...form, customer_id: id, animal_id: '' })}

              />

            </div>

            <div>

              <label className="block text-sm font-medium mb-1">{t('animals.animalId')}</label>

              <select value={form.animal_id} onChange={(e) => setForm({ ...form, animal_id: e.target.value })} className="input-field" required>

                <option value="">Select</option>

                {animals.map((a) => <option key={a.id} value={a.id}>{a.animal_code} - {a.name_tag}</option>)}

              </select>

            </div>

          </div>

          {packages.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
                <Package size={16} />
                {t('samples.selectPackages')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded-lg p-2 mb-3">
                {packages.map((pkg) => (
                  <label key={pkg.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.package_ids.includes(pkg.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...form.package_ids, pkg.id]
                          : form.package_ids.filter((id) => id !== pkg.id);
                        setForm({ ...form, package_ids: ids });
                      }}
                    />
                    <span className="flex-1">
                      {packageLabel(pkg, i18n)}
                      <span className="text-xs text-gray-500 ms-1">
                        ({t('samples.packageTestCount', { count: packageTestIds(pkg).length })})
                      </span>
                    </span>
                    <span className="text-primary-600">{fmtCatalog(pkg.price)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>

            <label className="block text-sm font-medium mb-1">{t('samples.selectTests')}</label>

            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-lg p-2">

              {tests.map((test) => (

                <label key={test.id} className="flex items-center gap-2 text-sm">

                  <input

                    type="checkbox"

                    checked={form.test_ids.includes(test.id)}

                    onChange={(e) => {

                      const ids = e.target.checked

                        ? [...form.test_ids, test.id]

                        : form.test_ids.filter((id) => id !== test.id);

                      setForm({ ...form, test_ids: ids });

                    }}

                  />

                  {test.name} ({fmtCatalog(test.price)})

                </label>

              ))}

            </div>

          </div>

          <div className="flex gap-2 justify-end">

            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>

            <button type="submit" className="btn-primary" disabled={!form.test_ids.length && !form.package_ids.length}>{t('common.save')}</button>

          </div>

        </form>

      </Modal>



      <Modal isOpen={scanOpen} onClose={() => setScanOpen(false)} title={t('samples.scan')}>

        <BarcodeScanner onScan={handleScan} onClose={() => setScanOpen(false)} />

      </Modal>



      <Modal isOpen={!!detailSample} onClose={() => setDetailSample(null)} title={detailSample?.sample_code} size="xl">

        {detailSample && (

          <div className="space-y-4">

            <WorkflowStepper context={{ sample: detailSample, workflow: detailSample.workflow }} compact />



            <div className="grid grid-cols-2 gap-3 text-sm">

              <div><span className="text-gray-500">{t('customers.fullName')}:</span> {detailSample.customer_name}</div>

              <div><span className="text-gray-500">{t('animals.animalId')}:</span> {detailSample.animal_code}</div>

              <div><span className="text-gray-500">{t('samples.barcode')}:</span> {detailSample.barcode}</div>

              <div><span className="text-gray-500">{t('common.status')}:</span> <StatusBadge status={detailSample.status} label={t(`samples.statuses.${detailSample.status}`)} /></div>

              {detailSample.invoice_number && (

                <div className="col-span-2"><span className="text-gray-500">{t('workflow.steps.invoice')}:</span> {detailSample.invoice_number} ({detailSample.invoice_status})</div>

              )}

            </div>



            <div>

              <h4 className="font-medium mb-2">{t('samples.selectTests')}</h4>

              {detailSample.tests?.map((test) => (

                <div key={test.id} className="flex justify-between items-center gap-2 text-sm py-1 border-b">

                  <span>{test.test_name}</span>

                  <div className="flex items-center gap-2 shrink-0">
                    <span>{fmtCatalog(test.price)} — <StatusBadge status={test.status} /></span>
                    {test.is_validated && hasPermission('results.unvalidate') && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(t('resultValidation.unvalidateConfirm'))) return;
                          try {
                            await resultsAPI.unvalidate(test.id);
                            toast.success(t('resultValidation.unvalidated'));
                            const { data } = await samplesAPI.get(detailSample.id);
                            setDetailSample(data.data);
                          } catch (err) {
                            toast.error(err.response?.data?.error?.message || 'خطأ');
                          }
                        }}
                        className="text-xs text-amber-700 hover:underline"
                      >
                        {t('resultValidation.unvalidate')}
                      </button>
                    )}
                    {test.is_validated && hasPermission('results.edit') && (
                      <button
                        type="button"
                        onClick={() => {
                          setDetailSample(null);
                          navigate(`/vet-review?sample=${detailSample.id}`);
                        }}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        {t('resultValidation.editResults')}
                      </button>
                    )}
                  </div>

                </div>

              ))}

            </div>



            <div className="flex gap-2 flex-wrap">

              {!detailSample.workflow?.has_invoice && (

                <button onClick={createInvoiceFromSample} className="btn-primary text-sm">{t('workflow.issueInvoice')}</button>

              )}

              <button onClick={() => openPrintLabel(detailSample)} className="btn-secondary text-sm">{t('samples.printLabel')}</button>

              {detailSample.status === 'pending' && (

                <button onClick={() => updateStatus(detailSample.id, 'received')} className="btn-secondary text-sm">{t('workflow.markDelivered')}</button>

              )}

              {['received', 'running'].includes(detailSample.status) && !detailSample.workflow?.all_validated && (() => {
                const entry = getResultsEntryTargets(detailSample.id, detailSample.tests);
                return (
                  <>
                    {entry.workbench && (
                      <button onClick={() => { setDetailSample(null); navigate(entry.workbench); }} className="btn-secondary text-sm">{t('workflow.goEnterResults')}</button>
                    )}
                    {entry.parasitology && (
                      <button onClick={() => { setDetailSample(null); navigate(entry.parasitology); }} className="btn-secondary text-sm">{t('nav.parasitology')}</button>
                    )}
                  </>
                );
              })()}

              {detailSample.workflow?.has_results && !detailSample.workflow?.all_validated && canReviewResults && (

                <button onClick={() => { setDetailSample(null); navigate(`/vet-review?sample=${detailSample.id}`); }} className="btn-secondary text-sm">{t('workflow.goApprove')}</button>

              )}

              {detailSample.workflow?.all_validated && (hasPermission('results.edit') || hasPermission('results.unvalidate')) && (

                <button onClick={() => { setDetailSample(null); navigate(`/vet-review?sample=${detailSample.id}`); }} className="btn-secondary text-sm">{t('resultValidation.editResults')}</button>

              )}

              {detailSample.workflow?.all_validated && !detailSample.workflow?.has_report && canGenerateReport && (

                <button onClick={generateReportOnly} disabled={sending} className="btn-primary text-sm">{t('workflow.goExtract')}</button>

              )}

              {canSendForSample(detailSample) && (

                <button onClick={() => sendReportToCustomer(detailSample)} disabled={sending} className="btn-primary text-sm">{t('workflow.sendToCustomer')}</button>

              )}

            </div>

          </div>

        )}

      </Modal>



      {printSample && (

        <Modal isOpen={!!printSample} onClose={() => setPrintSample(null)} title={t('samples.printLabel')}>

          {totalLabelCountForSample(printSample) > 1 && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {t('samples.labelCopiesHint', { count: totalLabelCountForSample(printSample) })}
            </p>
          )}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {expandSampleLabelJobs(printSample).map((job, idx) => (
              <BarcodeLabel
                key={job.panelKey || idx}
                sample={job}
              />
            ))}
          </div>

          <button type="button" onClick={() => printSampleLabel(printSample)} className="btn-primary w-full mt-4 no-print">{t('common.print')}</button>

        </Modal>

      )}

    </div>

  );

}


