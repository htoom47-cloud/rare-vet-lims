const { labDay, labMonthRange } = require('./accounting-time');
const { AppError } = require('../middleware/errorHandler');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

const isIsoDate = (value) => typeof value === 'string' && ISO_DATE.test(value);

const dayCountInclusive = (fromDate, toDate) => {
  const fromMs = Date.parse(`${fromDate}T00:00:00+03:00`);
  const toMs = Date.parse(`${toDate}T00:00:00+03:00`);
  return Math.floor((toMs - fromMs) / 86400000) + 1;
};

/** Lab-calendar from/to. Default: current Riyadh month through today. Max 366 days. */
const resolveOperationsRange = (from, to) => {
  const month = labMonthRange();
  let fromDate = isIsoDate(from) ? from : month.fromDate;
  let toDate = isIsoDate(to) ? to : labDay();
  if (fromDate > toDate) {
    const swap = fromDate;
    fromDate = toDate;
    toDate = swap;
  }
  const days = dayCountInclusive(fromDate, toDate);
  if (days > MAX_RANGE_DAYS) {
    throw new AppError('Date range cannot exceed 366 days', 400, 'VALIDATION_ERROR');
  }
  return { fromDate, toDate, days };
};

module.exports = { resolveOperationsRange, MAX_RANGE_DAYS, isIsoDate };
