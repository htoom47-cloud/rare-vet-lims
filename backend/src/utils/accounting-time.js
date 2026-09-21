/**
 * Lab accounting calendar: Asia/Riyadh (UTC+3, no DST).
 * Stored timestamps stay TIMESTAMPTZ. Only the business day is derived here.
 * Does not use the OS timezone or the PostgreSQL session TimeZone.
 */
const ACCOUNTING_TIMEZONE = 'Asia/Riyadh';
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');

const toInstantMs = (instant) => {
  if (instant === undefined || instant === null) return Date.now();
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  if (!Number.isFinite(ms)) {
    throw new Error('Invalid instant for lab accounting day');
  }
  return ms;
};

/** YYYY-MM-DD in Asia/Riyadh for an absolute instant. */
const labDay = (instant) => {
  const riyadh = new Date(toInstantMs(instant) + RIYADH_OFFSET_MS);
  return `${riyadh.getUTCFullYear()}-${pad2(riyadh.getUTCMonth() + 1)}-${pad2(riyadh.getUTCDate())}`;
};

/** SQL: convert a TIMESTAMPTZ column to the lab calendar date. */
const labDateSql = (columnSql) => `(${columnSql} AT TIME ZONE '${ACCOUNTING_TIMEZONE}')::date`;

const defaultLabRange = (from, to, daysBack = 30) => ({
  fromDate: from || labDay(Date.now() - daysBack * 86400000),
  toDate: to || labDay(),
});

/** First and last lab calendar dates of a month (1 → last day). Invalid input → current lab month. */
const labMonthRange = (year, month) => {
  const today = labDay();
  let y = parseInt(year, 10);
  let m = parseInt(month, 10);
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
    y = parseInt(today.slice(0, 4), 10);
    m = parseInt(today.slice(5, 7), 10);
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    year: y,
    month: m,
    fromDate: `${y}-${pad2(m)}-01`,
    toDate: `${y}-${pad2(m)}-${pad2(lastDay)}`,
  };
};

module.exports = {
  ACCOUNTING_TIMEZONE,
  RIYADH_OFFSET_MS,
  labDay,
  labDateSql,
  defaultLabRange,
  labMonthRange,
};
