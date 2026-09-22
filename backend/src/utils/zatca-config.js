const SETTINGS_KEY = 'zatca_link';

const ENVIRONMENTS = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
};

const defaults = () => ({
  environment: 'sandbox',
  vat_number: '',
  organization: '',
  organization_unit: '',
  common_name: 'RareVet-LIMS',
  address: '',
  invoice_types: '1100',
  serial: '1-RareVet|2-LIMS|3-1.0',
  status: 'not_linked',
  linked_at: null,
  compliance_request_id: null,
  last_error: null,
});

const publicView = (stored, { sendLiveInvoices = false } = {}) => {
  const merged = { ...defaults(), ...(stored && typeof stored === 'object' ? stored : {}) };
  return {
    environment: ENVIRONMENTS[merged.environment] ? merged.environment : 'sandbox',
    vat_number: String(merged.vat_number || ''),
    organization: String(merged.organization || ''),
    organization_unit: String(merged.organization_unit || ''),
    common_name: String(merged.common_name || 'RareVet-LIMS'),
    address: String(merged.address || ''),
    invoice_types: merged.invoice_types === '0100' || merged.invoice_types === '1000'
      ? merged.invoice_types
      : '1100',
    serial: String(merged.serial || '1-RareVet|2-LIMS|3-1.0'),
    status: merged.status === 'sandbox_linked' ? 'sandbox_linked' : (merged.status === 'error' ? 'error' : 'not_linked'),
    linked_at: merged.linked_at || null,
    compliance_request_id: merged.compliance_request_id || null,
    last_error: merged.last_error || null,
    has_certificate: Boolean(merged.binary_security_token && merged.secret && merged.private_key_pem),
    send_live_invoices: sendLiveInvoices === true,
  };
};

const mergePublicFields = (stored, payload = {}) => {
  const current = { ...(stored && typeof stored === 'object' ? stored : {}) };
  const next = publicView({ ...current, ...payload });
  return {
    ...current,
    environment: next.environment,
    vat_number: next.vat_number.replace(/\D/g, '').slice(0, 15),
    organization: next.organization.slice(0, 200),
    organization_unit: next.organization_unit.slice(0, 200),
    common_name: next.common_name.slice(0, 120),
    address: next.address.slice(0, 200),
    invoice_types: next.invoice_types,
    serial: next.serial.slice(0, 120),
  };
};

const baseUrl = (environment) => ENVIRONMENTS[environment] || ENVIRONMENTS.sandbox;

module.exports = {
  SETTINGS_KEY,
  ENVIRONMENTS,
  defaults,
  publicView,
  mergePublicFields,
  baseUrl,
};
