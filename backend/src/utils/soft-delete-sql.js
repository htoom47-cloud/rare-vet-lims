/** SQL fragment: active rows only (deleted_at column nullable). */
const notDeleted = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `${p}deleted_at IS NULL`;
};

module.exports = { notDeleted };
