/**
 * Synthetic ZATCA compliance documents only.
 * Never built from the invoices table.
 */
const { randomUUID } = require('crypto');
const { labDay } = require('./accounting-time');

const riyadhNow = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || '00';
  return `${pick('hour')}:${pick('minute')}:${pick('second')}`;
};

const money = (net) => {
  const lineTotal = Number(net.toFixed(2));
  const vatAmount = Number((lineTotal * 0.15).toFixed(2));
  const taxInclusive = Number((lineTotal + vatAmount).toFixed(2));
  return {
    lineTotal,
    vatAmount,
    taxExclusiveAmount: lineTotal,
    taxTotal: vatAmount,
    taxInclusiveAmount: taxInclusive,
    payableAmount: taxInclusive,
  };
};

const sellerAddress = (cfg) => ({
  street: String(cfg.address || cfg.organization_unit || 'Al Muzahimiyah').slice(0, 80),
  buildingNumber: '4371',
  citySubdivision: String(cfg.organization_unit || cfg.address || 'Al Muzahimiyah').slice(0, 80),
  city: String(cfg.address || cfg.organization_unit || 'Al Muzahimiyah').slice(0, 80),
  postalCode: '13771',
  countrySubentity: 'Riyadh',
  country: 'SA',
});

const sellerParty = (cfg) => ({
  registrationName: String(cfg.organization || 'Rare Vet Care').slice(0, 200),
  vatNumber: String(cfg.vat_number || ''),
  identification: { schemeId: 'OTH', value: 'RareVetLIMS' },
  address: sellerAddress(cfg),
});

const buyerParty = () => ({
  registrationName: 'ZATCA Compliance Buyer',
  vatNumber: '399999999900003',
  identification: { schemeId: 'OTH', value: 'ZATCA-TEST-BUYER' },
  address: {
    street: 'King Abdulaziz Road',
    buildingNumber: '1234',
    citySubdivision: 'Al Olaya',
    city: 'Riyadh',
    postalCode: '12211',
    countrySubentity: 'Riyadh',
    country: 'SA',
  },
});

const line = (totals) => ({
  id: '1',
  name: 'ZATCA compliance test item',
  quantity: 1,
  unitCode: 'PCE',
  unitPrice: totals.lineTotal,
  lineTotal: totals.lineTotal,
  vatCategory: 'S',
  vatPercent: 15,
  vatAmount: totals.vatAmount,
});

const baseInvoice = (cfg, { id, uuid, invoiceTypeCode, invoiceSubType, invoiceCounterValue, previousInvoiceHash, includeBuyer }) => {
  const totals = money(100);
  const issueDate = labDay();
  const invoice = {
    id,
    uuid,
    issueDate,
    issueTime: riyadhNow(),
    invoiceTypeCode,
    invoiceSubType,
    documentCurrency: 'SAR',
    taxCurrency: 'SAR',
    invoiceCounterValue,
    previousInvoiceHash,
    seller: sellerParty(cfg),
    paymentMeansCode: '10',
    lineExtensionAmount: totals.lineTotal,
    taxExclusiveAmount: totals.taxExclusiveAmount,
    taxInclusiveAmount: totals.taxInclusiveAmount,
    payableAmount: totals.payableAmount,
    taxTotal: totals.taxTotal,
    taxSubtotals: [{
      taxableAmount: totals.taxExclusiveAmount,
      taxAmount: totals.taxTotal,
      taxCategory: 'S',
      taxPercent: 15,
    }],
    lines: [line(totals)],
    note: 'Rare Vet LIMS synthetic ZATCA compliance document. Not a customer invoice.',
  };
  if (includeBuyer) {
    invoice.buyer = buyerParty();
    invoice.actualDeliveryDate = issueDate;
  }
  return invoice;
};

const buildComplianceSamples = (cfg) => {
  const stamp = Date.now();
  const simplifiedTaxId = `RVCT-${stamp}-S388`;
  const standardTaxId = `RVCT-${stamp}-T388`;
  const specs = [
    { key: 'simplified_invoice', label: 'فاتورة مبسطة', invoiceTypeCode: '388', invoiceSubType: '0200000', includeBuyer: false, id: simplifiedTaxId },
    { key: 'simplified_credit', label: 'إشعار دائن مبسط', invoiceTypeCode: '381', invoiceSubType: '0200000', includeBuyer: false, id: `RVCT-${stamp}-S381`, billingReference: simplifiedTaxId },
    { key: 'simplified_debit', label: 'إشعار مدين مبسط', invoiceTypeCode: '383', invoiceSubType: '0200000', includeBuyer: false, id: `RVCT-${stamp}-S383`, billingReference: simplifiedTaxId },
    { key: 'standard_invoice', label: 'فاتورة قياسية', invoiceTypeCode: '388', invoiceSubType: '0100000', includeBuyer: true, id: standardTaxId },
    { key: 'standard_credit', label: 'إشعار دائن قياسي', invoiceTypeCode: '381', invoiceSubType: '0100000', includeBuyer: true, id: `RVCT-${stamp}-T381`, billingReference: standardTaxId },
    { key: 'standard_debit', label: 'إشعار مدين قياسي', invoiceTypeCode: '383', invoiceSubType: '0100000', includeBuyer: true, id: `RVCT-${stamp}-T383`, billingReference: standardTaxId },
  ];

  return specs.map((spec, index) => {
    const invoice = baseInvoice(cfg, {
      id: spec.id,
      uuid: randomUUID(),
      invoiceTypeCode: spec.invoiceTypeCode,
      invoiceSubType: spec.invoiceSubType,
      invoiceCounterValue: index + 1,
      previousInvoiceHash: '',
      includeBuyer: spec.includeBuyer,
    });
    if (spec.billingReference) {
      invoice.billingReference = { invoiceId: spec.billingReference };
      invoice.creditDebitReason = 'ZATCA compliance test adjustment';
    }
    return { key: spec.key, label: spec.label, invoice };
  });
};

module.exports = { buildComplianceSamples };
