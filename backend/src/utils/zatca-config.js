const { sellerAddress, sellerAddressReady } = require('./zatca-invoice-map');

const SETTINGS_KEY = 'zatca_link';

const ENVIRONMENTS = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  core: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

const defaults = () => ({
  environment: 'sandbox',
  vat_number: '',
  organization: '',
  organization_unit: '',
  common_name: 'RareVet-LIMS',
  address: '',
  street: '',
  building_number: '',
  city_subdivision: '',
  city: '',
  postal_code: '',
  country_subentity: 'Riyadh',
  invoice_types: '1100',
  serial: '1-RareVet|2-LIMS|3-1.0',
  status: 'not_linked',
  linked_at: null,
  compliance_request_id: null,
  last_error: null,
});

const productionNeedsRefresh = (stored) => {
  const merged = { ...(stored && typeof stored === 'object' ? stored : {}) };
  if (!merged.production_binary_security_token || !merged.production_secret) return true;
  if (
    merged.production_compliance_request_id != null
    && String(merged.production_compliance_request_id) !== String(merged.compliance_request_id || '')
  ) {
    return true;
  }
  const complianceAt = Date.parse(merged.compliance_ran_at || '');
  const productionAt = Date.parse(merged.production_linked_at || '');
  if (Number.isFinite(complianceAt) && Number.isFinite(productionAt) && complianceAt > productionAt) {
    return true;
  }
  const lastReason = String(merged.last_live_submit?.reason || '');
  return /sign_failed|private key|certificate|binarySecurityToken/i.test(lastReason);
};

const publicView = (stored, { sendLiveInvoices = false } = {}) => {
  const merged = { ...defaults(), ...(stored && typeof stored === 'object' ? stored : {}) };
  return {
    environment: ENVIRONMENTS[merged.environment] ? merged.environment : 'sandbox',
    vat_number: String(merged.vat_number || ''),
    organization: String(merged.organization || ''),
    organization_unit: String(merged.organization_unit || ''),
    common_name: String(merged.common_name || 'RareVet-LIMS'),
    address: String(merged.address || ''),
    street: String(merged.street || merged.address || ''),
    building_number: String(merged.building_number || '').replace(/\D/g, '').slice(0, 4),
    city_subdivision: String(merged.city_subdivision || merged.organization_unit || ''),
    city: String(merged.city || merged.address || ''),
    postal_code: String(merged.postal_code || '').replace(/\D/g, '').slice(0, 5),
    country_subentity: String(merged.country_subentity || 'Riyadh'),
    invoice_types: merged.invoice_types === '0100' || merged.invoice_types === '1000'
      ? merged.invoice_types
      : '1100',
    serial: String(merged.serial || '1-RareVet|2-LIMS|3-1.0'),
    status: merged.status === 'sandbox_linked' ? 'sandbox_linked' : (merged.status === 'error' ? 'error' : 'not_linked'),
    linked_at: merged.linked_at || null,
    compliance_request_id: merged.compliance_request_id || null,
    last_error: merged.last_error || null,
    last_live_submit: merged.last_live_submit && typeof merged.last_live_submit === 'object'
      ? {
        invoice_number: String(merged.last_live_submit.invoice_number || ''),
        status: String(merged.last_live_submit.status || ''),
        reason: String(merged.last_live_submit.reason || '').slice(0, 400),
        at: merged.last_live_submit.at || null,
      }
      : null,
    address_ready: sellerAddressReady(sellerAddress(merged)),
    has_certificate: Boolean(merged.binary_security_token && merged.secret && merged.private_key_pem),
    has_production_certificate: Boolean(merged.production_binary_security_token && merged.production_secret && merged.private_key_pem),
    production_needs_refresh: productionNeedsRefresh(merged),
    production_status: merged.production_status === 'issued' || merged.production_status === 'error'
      ? merged.production_status
      : 'not_issued',
    production_linked_at: merged.production_linked_at || null,
    send_live_invoices: sendLiveInvoices === true,
    compliance_status: merged.compliance_status === 'passed' || merged.compliance_status === 'failed'
      ? merged.compliance_status
      : 'not_run',
    compliance_ran_at: merged.compliance_ran_at || null,
    compliance_results: Array.isArray(merged.compliance_results)
      ? merged.compliance_results.map((row) => ({
        key: String(row.key || ''),
        label: String(row.label || ''),
        status: String(row.status || ''),
        message: String(row.message || '').slice(0, 400),
      }))
      : [],
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
    street: next.street.slice(0, 80),
    building_number: next.building_number,
    city_subdivision: next.city_subdivision.slice(0, 80),
    city: next.city.slice(0, 80),
    postal_code: next.postal_code,
    country_subentity: next.country_subentity.slice(0, 80),
    invoice_types: next.invoice_types,
    serial: next.serial.slice(0, 120),
  };
};

const baseUrl = (environment) => ENVIRONMENTS[environment] || ENVIRONMENTS.sandbox;

const sdkEnvironment = (environment) => {
  if (environment === 'simulation') return 'simulation';
  if (environment === 'core') return 'production';
  return 'sandbox';
};

module.exports = {
  SETTINGS_KEY,
  ENVIRONMENTS,
  defaults,
  publicView,
  mergePublicFields,
  productionNeedsRefresh,
  baseUrl,
  sdkEnvironment,
};
