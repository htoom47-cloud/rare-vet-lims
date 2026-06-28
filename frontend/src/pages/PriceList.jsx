import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search, Printer, Package, FileText, Plus, Trash2, MessageCircle, Download,
} from 'lucide-react';
import { testsAPI, billingAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getCategoryEmoji } from '../utils/testCategoryIcons';
import CustomerSearch from '../components/customers/CustomerSearch';
import toast from 'react-hot-toast';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;

const defaultValidUntil = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
};

const calcTotals = (items, discount = 0) => {
  const subtotal = items.reduce((s, i) => s + parseFloat(i.unit_price || 0) * (i.quantity || 1), 0);
  const disc = parseFloat(discount) || 0;
  const taxable = Math.max(0, subtotal - disc);
  const taxAmount = taxable * 0.15;
  return { subtotal, taxAmount, total: taxable + taxAmount };
};

const newLineId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function PriceList() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuth();
  const canViewPackages = hasPermission('billing.view');
  const canCreateQuote = hasPermission('billing.create');

  const [activeTab, setActiveTab] = useState('prices');
  const [tests, setTests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Quote form
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerNameAr, setCustomerNameAr] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [lineItems, setLineItems] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [submitting, setSubmitting] = useState(false);
  const [lastQuote, setLastQuote] = useState(null);
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [quotesLoading, setQuotesLoading] = useState(false);

  const displayName = (item) => (i18n.language === 'ar' && item?.name_ar ? item.name_ar : item?.name);
  const catLabel = (cat) => (i18n.language === 'ar' && cat?.name_ar ? cat.name_ar : cat?.name);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      testsAPI.list({ limit: 500 }),
      testsAPI.categories(),
      canViewPackages ? billingAPI.packages().catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } }),
    ])
      .then(([testsRes, catsRes, pkgRes]) => {
        setTests(testsRes.data.data || []);
        setCategories(catsRes.data.data || []);
        setPackages(pkgRes.data.data || []);
      })
      .finally(() => setLoading(false));
  }, [canViewPackages]);

  const loadRecentQuotes = () => {
    if (!canCreateQuote) return;
    setQuotesLoading(true);
    billingAPI.quotes({ limit: 10 })
      .then(({ data }) => setRecentQuotes(data.data || []))
      .catch(() => setRecentQuotes([]))
      .finally(() => setQuotesLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'quote' && canCreateQuote) loadRecentQuotes();
  }, [activeTab, canCreateQuote]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tests.filter((test) => {
      if (categoryFilter && String(test.category_id) !== String(categoryFilter)) return false;
      if (!q) return true;
      return [test.name, test.name_ar, test.code].some((s) => String(s || '').toLowerCase().includes(q));
    });
  }, [tests, search, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const test of filtered) {
      const key = test.category_id || '__other__';
      if (!map.has(key)) {
        const cat = categories.find((c) => c.id === test.category_id);
        map.set(key, { cat, items: [] });
      }
      map.get(key).items.push(test);
    }
    return [...map.values()].sort((a, b) => {
      const na = catLabel(a.cat) || 'zzz';
      const nb = catLabel(b.cat) || 'zzz';
      return na.localeCompare(nb, i18n.language === 'ar' ? 'ar' : 'en');
    });
  }, [filtered, categories, i18n.language]);

  const totals = useMemo(() => calcTotals(lineItems, discount), [lineItems, discount]);
  const totalTests = filtered.length;

  const handleCustomerChange = (id, customer) => {
    setCustomerId(id || '');
    if (customer) {
      setCustomerName(customer.full_name || '');
      setCustomerNameAr(customer.full_name_ar || '');
      setCustomerMobile(customer.mobile || '');
    }
  };

  const addTest = () => {
    if (!selectedTestId) return;
    const test = tests.find((x) => x.id === selectedTestId);
    if (!test) return;
    const desc = i18n.language === 'ar' && test.name_ar ? test.name_ar : test.name;
    if (lineItems.some((i) => i.test_id === test.id)) {
      toast.error(t('priceList.alreadyAdded', { defaultValue: 'Already added' }));
      return;
    }
    setLineItems((prev) => [...prev, {
      _key: newLineId(), test_id: test.id, description: desc, quantity: 1, unit_price: parseFloat(test.price) || 0,
    }]);
    setSelectedTestId('');
  };

  const addPackage = () => {
    if (!selectedPackageId) return;
    const pkg = packages.find((x) => x.id === selectedPackageId);
    if (!pkg) return;
    if (lineItems.some((i) => i.package_id === pkg.id)) {
      toast.error(t('priceList.alreadyAdded', { defaultValue: 'Already added' }));
      return;
    }
    setLineItems((prev) => [...prev, {
      _key: newLineId(), package_id: pkg.id, description: pkg.name, quantity: 1, unit_price: parseFloat(pkg.price) || 0,
    }]);
    setSelectedPackageId('');
  };

  const updateItem = (key, field, value) => {
    setLineItems((prev) => prev.map((item) => (item._key === key ? { ...item, [field]: value } : item)));
  };

  const removeItem = (key) => setLineItems((prev) => prev.filter((i) => i._key !== key));

  const resetQuoteForm = () => {
    setCustomerId('');
    setCustomerName('');
    setCustomerNameAr('');
    setCustomerMobile('');
    setLineItems([]);
    setDiscount(0);
    setNotes('');
    setValidUntil(defaultValidUntil());
    setLastQuote(null);
  };

  const shareWhatsApp = (quote) => {
    const raw = (quote.customer_mobile || '').replace(/\D/g, '');
    const phone = raw ? (raw.startsWith('966') ? raw : `966${raw.replace(/^0/, '')}`) : '';
    const msg = i18n.language === 'ar'
      ? `مرحباً ${quote.customer_name}،\n\nعرض السعر رقم ${quote.quote_number}\nالإجمالي: ${parseFloat(quote.total).toFixed(2)} ر.س (شامل ضريبة 15%)\n\nيرجى التواصل معنا للتأكيد.`
      : `Hello ${quote.customer_name},\n\nQuotation ${quote.quote_number}\nTotal: SAR ${parseFloat(quote.total).toFixed(2)} (incl. 15% VAT)\n\nPlease contact us to confirm.`;
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleCreateQuote = async (e) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error(t('priceList.nameRequired'));
      return;
    }
    if (lineItems.length === 0) {
      toast.error(t('priceList.noItems'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        customer_id: customerId || null,
        customer_name: customerName.trim(),
        customer_name_ar: customerNameAr.trim() || null,
        customer_mobile: customerMobile.trim() || null,
        items: lineItems.map(({ test_id, package_id, description, quantity, unit_price }) => ({
          test_id: test_id || null,
          package_id: package_id || null,
          description,
          quantity: parseInt(quantity, 10) || 1,
          unit_price: parseFloat(unit_price) || 0,
        })),
        discount_amount: parseFloat(discount) || 0,
        notes: notes.trim() || null,
        valid_until: validUntil || null,
      };
      const { data } = await billingAPI.createQuote(payload);
      const quote = data.data;
      setLastQuote(quote);
      toast.success(t('priceList.quoteCreated'));
      await billingAPI.openQuotePdf(quote.id);
      loadRecentQuotes();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('priceList.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeTab === 'quote' ? t('priceList.quoteSubtitle') : t('priceList.subtitle')}
          </p>
        </div>
        {activeTab === 'prices' && (
          <button type="button" onClick={() => window.print()} className="btn-secondary flex items-center gap-2 text-sm no-print">
            <Printer size={16} /> {t('priceList.print')}
          </button>
        )}
      </div>

      {canCreateQuote && (
        <div className="flex gap-2 no-print border-b pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('prices')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === 'prices' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('priceList.tabPrices')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quote')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'quote' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText size={16} /> {t('priceList.tabQuote')}
          </button>
        </div>
      )}

      {activeTab === 'quote' && canCreateQuote ? (
        <div className="space-y-6 no-print">
          {lastQuote && (
            <div className="card p-4 bg-green-50 border-green-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-green-800 font-medium">
                {t('priceList.quoteCreated')} — {lastQuote.quote_number}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => billingAPI.openQuotePdf(lastQuote.id)} className="btn-secondary text-sm flex items-center gap-1">
                  <Download size={14} /> {t('priceList.openPdf')}
                </button>
                <button type="button" onClick={() => shareWhatsApp(lastQuote)} className="btn-primary text-sm flex items-center gap-1">
                  <MessageCircle size={14} /> {t('priceList.sendWhatsApp')}
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleCreateQuote} className="card p-5 space-y-5">
            <h2 className="font-semibold text-lg">{t('priceList.quoteTitle')}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">{t('priceList.selectCustomer')}</label>
                <CustomerSearch value={customerId} onChange={handleCustomerChange} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('priceList.customerName')} *</label>
                <input
                  type="text"
                  className="input-field"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('priceList.customerNameAr')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={customerNameAr}
                  onChange={(e) => setCustomerNameAr(e.target.value)}
                  dir="rtl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('priceList.customerMobile')}</label>
                <input
                  type="tel"
                  className="input-field"
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('priceList.validUntil')}</label>
                <input
                  type="date"
                  className="input-field"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t('priceList.addService')}</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  className="input-field flex-1"
                  value={selectedTestId}
                  onChange={(e) => setSelectedTestId(e.target.value)}
                >
                  <option value="">{t('priceList.selectTest')}</option>
                  {tests.map((test) => (
                    <option key={test.id} value={test.id}>
                      {test.code} — {displayName(test)} ({fmt(test.price)})
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addTest} disabled={!selectedTestId} className="btn-secondary flex items-center gap-1 whitespace-nowrap">
                  <Plus size={16} /> {t('priceList.addService')}
                </button>
              </div>
              {packages.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <select
                    className="input-field flex-1"
                    value={selectedPackageId}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                  >
                    <option value="">{t('priceList.selectPackage')}</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({fmt(pkg.price)})
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={addPackage} disabled={!selectedPackageId} className="btn-secondary flex items-center gap-1 whitespace-nowrap">
                    <Package size={16} /> {t('priceList.selectPackage')}
                  </button>
                </div>
              )}
            </div>

            {lineItems.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-sm font-medium mb-2">{t('priceList.lineItems')}</p>
                <table className="w-full text-sm border rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="p-2 text-start">{t('tests.nameEn')}</th>
                      <th className="p-2 w-20">{t('priceList.quantity')}</th>
                      <th className="p-2 w-28">{t('priceList.unitPrice')}</th>
                      <th className="p-2 w-28 text-end">{t('priceList.lineTotal')}</th>
                      <th className="p-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => (
                      <tr key={item._key} className="border-b last:border-0">
                        <td className="p-2">{item.description}</td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="1"
                            className="input-field py-1 text-center"
                            value={item.quantity}
                            onChange={(e) => updateItem(item._key, 'quantity', e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input-field py-1"
                            value={item.unit_price}
                            onChange={(e) => updateItem(item._key, 'unit_price', e.target.value)}
                          />
                        </td>
                        <td className="p-2 text-end font-medium">
                          {fmt((parseFloat(item.unit_price) || 0) * (parseInt(item.quantity, 10) || 1))}
                        </td>
                        <td className="p-2">
                          <button type="button" onClick={() => removeItem(item._key)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('priceList.discount')}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('priceList.notes')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-primary-50 rounded-lg p-4 space-y-1 text-sm max-w-xs ms-auto">
              <div className="flex justify-between"><span>{t('priceList.subtotal')}</span><span>{fmt(totals.subtotal)}</span></div>
              {parseFloat(discount) > 0 && (
                <div className="flex justify-between text-red-600"><span>{t('priceList.discount')}</span><span>- {fmt(discount)}</span></div>
              )}
              <div className="flex justify-between"><span>{t('priceList.vat')}</span><span>{fmt(totals.taxAmount)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1 mt-1"><span>{t('priceList.grandTotal')}</span><span>{fmt(totals.total)}</span></div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="btn-primary flex items-center gap-2">
                <FileText size={16} />
                {submitting ? t('priceList.creating') : t('priceList.createQuote')}
              </button>
              <button type="button" onClick={resetQuoteForm} className="btn-secondary">
                {t('common.reset', { defaultValue: 'Reset' })}
              </button>
            </div>
          </form>

          <div className="card p-5">
            <h3 className="font-semibold mb-3">{t('priceList.recentQuotes')}</h3>
            {quotesLoading ? (
              <p className="text-gray-500 text-sm">{t('common.loading')}</p>
            ) : recentQuotes.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('priceList.noQuotes')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-2 text-start">{t('priceList.quoteNumber')}</th>
                      <th className="p-2 text-start">{t('priceList.customerName')}</th>
                      <th className="p-2 text-end">{t('priceList.grandTotal')}</th>
                      <th className="p-2">{t('priceList.validUntil')}</th>
                      <th className="p-2 w-28" />
                    </tr>
                  </thead>
                  <tbody>
                    {recentQuotes.map((q) => (
                      <tr key={q.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="p-2 font-mono text-xs">{q.quote_number}</td>
                        <td className="p-2">{q.customer_name}</td>
                        <td className="p-2 text-end font-medium">{fmt(q.total)}</td>
                        <td className="p-2 text-center text-xs">{q.valid_until ? new Date(q.valid_until).toLocaleDateString() : '—'}</td>
                        <td className="p-2">
                          <div className="flex gap-1 justify-end">
                            <button type="button" onClick={() => billingAPI.openQuotePdf(q.id)} className="p-1.5 hover:bg-gray-100 rounded" title={t('priceList.openPdf')}>
                              <Download size={14} />
                            </button>
                            <button type="button" onClick={() => shareWhatsApp(q)} className="p-1.5 hover:bg-gray-100 rounded text-green-600" title={t('priceList.sendWhatsApp')}>
                              <MessageCircle size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-3 no-print">
            <div className="md:col-span-2 relative">
              <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                className="input-field ps-9"
                placeholder={t('priceList.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="input-field" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">{t('priceList.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{getCategoryEmoji(c)} {catLabel(c)}</option>
              ))}
            </select>
          </div>

          {canViewPackages && packages.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold flex items-center gap-2 text-primary-800">
                <Package size={18} /> {t('priceList.packages')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {packages.map((pkg) => (
                  <div key={pkg.id} className="card p-4 border-primary-100">
                    <p className="font-semibold">{pkg.name}</p>
                    {pkg.description && <p className="text-xs text-gray-500 mt-1">{pkg.description}</p>}
                    <p className="text-xl font-bold text-primary-600 mt-2">{fmt(pkg.price)}</p>
                    {pkg.test_names?.filter(Boolean).length > 0 && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">{pkg.test_names.join('، ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{t('priceList.testCount', { count: totalTests })}</span>
            <span>{t('priceList.vatNote')}</span>
          </div>

          {loading ? (
            <p className="text-center py-12 text-gray-500">{t('common.loading')}</p>
          ) : grouped.length === 0 ? (
            <p className="text-center py-12 text-gray-500">{t('priceList.noResults')}</p>
          ) : (
            <div className="space-y-6">
              {grouped.map(({ cat, items }) => (
                <div key={cat?.id || 'other'} className="card overflow-hidden">
                  <div className="bg-primary-50 dark:bg-primary-900/20 px-4 py-3 border-b flex items-center gap-2">
                    <span className="text-lg">{getCategoryEmoji(cat)}</span>
                    <h3 className="font-semibold">{catLabel(cat) || t('priceList.otherCategory')}</h3>
                    <span className="text-xs text-gray-500 ms-auto">{items.length}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-start">
                          <th className="p-3 font-semibold w-28">{t('tests.code')}</th>
                          <th className="p-3 font-semibold">{t('tests.nameEn')}</th>
                          <th className="p-3 font-semibold hidden sm:table-cell">{t('priceList.turnaround')}</th>
                          <th className="p-3 font-semibold text-end w-32">{t('priceList.price')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((test) => (
                          <tr key={test.id} className="border-b last:border-0 hover:bg-gray-50/80">
                            <td className="p-3 font-mono text-xs text-gray-600">{test.code}</td>
                            <td className="p-3">
                              <p className="font-medium">{displayName(test)}</p>
                              {i18n.language === 'ar' && test.name && test.name !== test.name_ar && (
                                <p className="text-xs text-gray-500">{test.name}</p>
                              )}
                            </td>
                            <td className="p-3 hidden sm:table-cell text-gray-600">
                              {test.turnaround_hours ? t('priceList.hours', { h: test.turnaround_hours }) : '—'}
                            </td>
                            <td className="p-3 text-end font-bold text-primary-700">{fmt(test.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
