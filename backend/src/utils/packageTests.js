const { AppError } = require('../middleware/errorHandler');

const resolveSampleTestIds = async (client, { test_ids: testIds = [], package_ids: packageIds = [] } = {}) => {
  const set = new Set((testIds || []).filter(Boolean));

  if (packageIds?.length) {
    const res = await client.query(
      `SELECT DISTINCT pt.test_id
       FROM package_tests pt
       JOIN packages p ON p.id = pt.package_id
       WHERE pt.package_id = ANY($1::uuid[]) AND p.is_active = true`,
      [packageIds]
    );
    res.rows.forEach((row) => {
      if (row.test_id) set.add(row.test_id);
    });
  }

  const ids = [...set];
  if (!ids.length) {
    throw new AppError('Select at least one test or package', 400, 'VALIDATION_ERROR');
  }
  return ids;
};

module.exports = { resolveSampleTestIds };
