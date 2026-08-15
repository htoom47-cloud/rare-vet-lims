/** Lab accounting calendar: Asia/Riyadh (UTC+3). Independent of the browser timezone. */
export const ACCOUNTING_TIMEZONE = 'Asia/Riyadh';
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');

export const labDay = (instant = new Date()) => {
  const ms = new Date(instant).getTime() + RIYADH_OFFSET_MS;
  const riyadh = new Date(ms);
  return `${riyadh.getUTCFullYear()}-${pad2(riyadh.getUTCMonth() + 1)}-${pad2(riyadh.getUTCDate())}`;
};
