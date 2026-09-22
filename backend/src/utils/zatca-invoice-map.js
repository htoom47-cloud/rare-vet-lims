/**
 * Maps a LIMS invoice to a simplified ZATCA document.
 * Always B2C simplified — customers have no stored buyer VAT.
 */
const { roundMoney } = require('./vat');

const sellerAddress = (cfg) => ({
  street: String(cfg.street || cfg.address || '').trim().slice(0, 80),
  buildingNumber: String(cfg.building_number || '').replace(/\D/g, '').slice(0, 4),
  citySubdivision: String(cfg.city_subdivision || cfg.organization_unit || '').trim().slice(0, 80),
  city: String(cfg.city || cfg.address || '').trim().slice(0, 80),
  postalCode: String(cfg.postal_code || '').replace(/\D/g, '').slice(0, 5),
  countrySubentity: String(cfg.country_subentity || 'Riyadh').trim().slice(0, 80),
  country: 'SA',
});

const sellerAddressReady = (addr) => Boolean(
  addr.street
  && /^\d{4}$/.test(addr.buildingNumber)
  && addr.citySubdivision
  && addr.city
  && /^\d{5}$/.test(addr.postalCode)
);

const sellerParty = (cfg) => ({
  registrationName: String(cfg.organization || 'Rare Vet Care').slice(0, 200),
  vatNumber: String(cfg.vat_number || ''),
  identification: { schemeId: 'OTH', value: 'RareVetLIMS' },
  address: sellerAddress(cfg),
});

const riyadhClock = (instant) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant ? new Date(instant) : new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || '00';
  return `${pick('hour')}:${pick('minute')}:${pick('second')}`;
};

const buildLiveInvoice = ({ invoice, items, cfg, customerName, invoiceCounterValue, previousInvoiceHash, issueDate }) => {
  const address = sellerAddress(cfg);
  if (!sellerAddressReady(address)) {
    return { ok: false, reason: 'seller_address_incomplete' };
  }
  if (!/^3\d{13}3$/.test(String(cfg.vat_number || ''))) {
    return { ok: false, reason: 'seller_vat_invalid' };
  }

  const lines = (items || []).map((item, index) => {
    const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
    const lineTotal = roundMoney(parseFloat(item.total_price) || 0);
    const vatAmount = roundMoney(lineTotal * 0.15);
    return {
      id: String(index + 1),
      name: String(item.description || item.test_name || 'Laboratory service').slice(0, 200),
      quantity,
      unitCode: 'PCE',
      unitPrice: roundMoney(lineTotal / quantity),
      lineTotal,
      vatCategory: 'S',
      vatPercent: 15,
      vatAmount,
    };
  }).filter((line) => line.lineTotal > 0);

  if (!lines.length) {
    return { ok: false, reason: 'no_lines' };
  }

  const lineExtensionAmount = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const serviceDiscount = roundMoney(parseFloat(invoice.discount_amount) || 0);
  const visitDiscount = roundMoney(parseFloat(invoice.field_visit_discount_amount) || 0);
  const allowanceTotal = roundMoney(serviceDiscount + visitDiscount);
  const taxExclusiveAmount = roundMoney(Math.max(0, lineExtensionAmount - allowanceTotal));
  const taxTotal = roundMoney(parseFloat(invoice.tax_amount) || 0);
  const taxInclusiveAmount = roundMoney(parseFloat(invoice.total) || 0);
  if (Math.abs(taxInclusiveAmount - (taxExclusiveAmount + taxTotal)) > 0.05) {
    return { ok: false, reason: 'totals_mismatch' };
  }

  const allowances = [];
  if (serviceDiscount > 0) {
    allowances.push({ amount: serviceDiscount, reason: 'Service discount', vatCategory: 'S', vatPercent: 15 });
  }
  if (visitDiscount > 0) {
    allowances.push({ amount: visitDiscount, reason: 'Field visit discount', vatCategory: 'S', vatPercent: 15 });
  }

  return {
    ok: true,
    invoice: {
      id: String(invoice.invoice_number),
      uuid: String(invoice.id),
      issueDate,
      issueTime: riyadhClock(invoice.created_at),
      invoiceTypeCode: '388',
      invoiceSubType: '0200000',
      documentCurrency: 'SAR',
      taxCurrency: 'SAR',
      invoiceCounterValue,
      previousInvoiceHash,
      seller: { ...sellerParty(cfg), address },
      paymentMeansCode: '10',
      allowances: allowances.length ? allowances : undefined,
      allowanceTotalAmount: allowanceTotal || undefined,
      lineExtensionAmount,
      taxExclusiveAmount,
      taxInclusiveAmount,
      payableAmount: taxInclusiveAmount,
      taxTotal,
      taxSubtotals: [{
        taxableAmount: taxExclusiveAmount,
        taxAmount: taxTotal,
        taxCategory: 'S',
        taxPercent: 15,
      }],
      lines,
      note: 'Rare Vet LIMS tax invoice',
    },
  };
};

module.exports = {
  sellerAddress,
  sellerAddressReady,
  sellerParty,
  buildLiveInvoice,
};
