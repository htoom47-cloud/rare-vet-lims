/**
 * Comprehensive accounting + billing + customer API smoke/E2E suite.
 * Usage: node src/scripts/e2e-accounting-suite.js [baseUrl] [username] [password]
 */
const BASE = (process.argv[2] || process.env.APP_URL || 'https://lims.rarevetcare.com').replace(/\/$/, '');
const USER = process.argv[3] || process.env.E2E_USER || 'admin';
const PASS = process.argv[4] || process.env.E2E_PASS || 'RareVet2026';
const API = `${BASE}/api`;
const today = new Date().toISOString().slice(0, 10);

const errors = [];
const log = (step, ok, detail = '') => {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`[${mark}] ${step}${detail ? ` — ${detail}` : ''}`);
  if (!ok) errors.push({ step, detail });
};

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  console.log(`\n=== E2E Accounting Suite @ ${BASE} ===\n`);

  const login = await req('POST', '/auth/login', { body: { username: USER, password: PASS } });
  log('Login', login.ok, login.data?.error?.message || USER);
  if (!login.ok) process.exit(1);
  const token = login.data.data.accessToken;

  const endpoints = [
    ['GET', '/billing/dashboard-summary'],
    ['GET', `/billing/daily-summary?date=${today}`],
    ['GET', `/billing/daily-closing?date=${today}`],
    ['GET', '/billing/daily-closing/history'],
    ['GET', '/billing/invoices?limit=5'],
    ['GET', '/billing/packages'],
    ['GET', '/billing/reports/collections'],
    ['GET', '/billing/reports/ar-aging'],
    ['GET', '/billing/reports/revenue'],
    ['GET', '/billing/reports/journal'],
    ['GET', '/billing/reports/unpaid'],
    ['GET', '/billing/reports/vat'],
    ['GET', '/billing/reports/cancelled-refunded'],
    ['GET', '/billing/reports/by-service'],
    ['GET', '/billing/reports/by-customer'],
    ['GET', '/billing/invoice-settings'],
    ['GET', '/customers?limit=5'],
  ];

  for (const [method, path] of endpoints) {
    const r = await req(method, path, { token });
    log(`${method} ${path}`, r.ok, r.data?.error?.message || `status ${r.status}`);
  }

  const stamp = Date.now();
  const mobile = `050${String(stamp).slice(-8)}`;
  const customer = await req('POST', '/customers', {
    token,
    body: {
      full_name: `Acct E2E ${stamp}`,
      full_name_ar: `محاسبة ${stamp}`,
      mobile,
      city: 'المزاحمية',
      credit_limit: 1000,
    },
  });
  log('Create customer for invoice', customer.ok, customer.data?.error?.message);
  const customerId = customer.data?.data?.id;

  const testsRes = await req('GET', '/tests?limit=5', { token });
  const test = testsRes.data?.data?.[0];
  log('Tests available', !!test, test?.name);

  const closingBefore = await req('GET', `/billing/daily-closing?date=${today}`, { token });
  let dayClosed = closingBefore.data?.data?.is_closed;
  if (dayClosed) {
    const reopenForPay = await req('POST', '/billing/daily-closing/reopen', { token, body: { date: today } });
    log('Reopen day for payments', reopenForPay.ok, reopenForPay.data?.error?.message);
    dayClosed = !reopenForPay.ok;
  }

  let invoiceId;
  if (customerId && test) {
    const inv = await req('POST', '/billing/invoices', {
      token,
      body: {
        customer_id: customerId,
        items: [{ test_id: test.id, description: test.name, quantity: 1, unit_price: parseFloat(test.price) || 100 }],
      },
    });
    log('Create invoice', inv.ok, inv.data?.error?.message || inv.data?.data?.invoice_number);
    invoiceId = inv.data?.data?.id;

    if (invoiceId) {
      const getInv = await req('GET', `/billing/invoices/${invoiceId}`, { token });
      log('Get invoice detail', getInv.ok);

      const pay = await req('POST', '/billing/payments', {
        token,
        body: { invoice_id: invoiceId, amount: 50, method: 'cash', notes: 'e2e partial' },
      });
      log('Record partial payment', pay.ok, pay.data?.error?.message);

      const getInv2 = await req('GET', `/billing/invoices/${invoiceId}`, { token });
      const pay2 = await req('POST', '/billing/payments', {
        token,
        body: {
          invoice_id: invoiceId,
          amount: parseFloat(getInv2.data?.data?.balance_due || 0),
          method: 'card',
        },
      });
      log('Record remaining payment', pay2.ok, pay2.data?.error?.message);

      const pdf = await fetch(`${API}/billing/invoices/${invoiceId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      log('Invoice PDF', pdf.ok && pdf.headers.get('content-type')?.includes('pdf'), `status ${pdf.status}`);

      const profile = await req('GET', `/customers/${customerId}`, { token });
      log('Customer profile has invoices', (profile.data?.data?.invoices?.length || 0) > 0);
    }
  }

  const csv = await fetch(`${API}/billing/invoices/export/csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const csvText = await csv.text();
  log('Export CSV', csv.ok && csvText.includes('Invoice'), `len ${csvText.length}`);

  const closingAfter = await req('GET', `/billing/daily-closing?date=${today}`, { token });
  const wasClosed = closingAfter.data?.data?.is_closed;

  if (!wasClosed) {
    const close = await req('POST', '/billing/daily-closing/close', { token, body: { date: today } });
    log('Close day', close.ok, close.data?.error?.message || close.data?.data?.closing_number);

    const closingId = close.data?.data?.id;
    if (closingId) {
      const closePdf = await fetch(`${API}/billing/daily-closing/${closingId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      log('Closing PDF', closePdf.ok && closePdf.headers.get('content-type')?.includes('pdf'));
    }

    const reopen = await req('POST', '/billing/daily-closing/reopen', { token, body: { date: today } });
    log('Reopen day', reopen.ok, reopen.data?.error?.message);
  } else {
    log('Close day (skipped — already closed)', true, 'reopen manually if needed');
  }

  if (customerId) {
    const del = await req('DELETE', `/customers/${customerId}`, { token });
    log('Cleanup test customer', del.ok);
  }

  console.log(`\n=== ${errors.length ? 'FAILED' : 'PASSED'} — ${errors.length} error(s) ===\n`);
  if (errors.length) {
    console.log(JSON.stringify(errors, null, 2));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
