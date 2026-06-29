const { query } = require('../config/database');

const listPublicCatalog = async () => {
  const [categories, tests, packages] = await Promise.all([
    query(
      `SELECT id, code, name, name_ar, department, sort_order
       FROM test_categories WHERE is_active = true ORDER BY sort_order, name`,
    ),
    query(
      `SELECT t.id, t.code, t.name, t.name_ar, t.description, t.price, t.turnaround_hours,
              t.unit, t.method, t.requires_specimen, t.category_id,
              tc.code AS category_code, tc.name AS category_name, tc.name_ar AS category_name_ar,
              tc.department AS category_department
       FROM tests t
       LEFT JOIN test_categories tc ON t.category_id = tc.id
       WHERE t.is_active = true
       ORDER BY tc.sort_order, t.name`,
    ),
    query(
      `SELECT id, name, name_ar, description, price, discount_percent
       FROM packages WHERE is_active = true ORDER BY name`,
    ),
  ]);

  return {
    categories: categories.rows,
    tests: tests.rows.map((t) => ({
      ...t,
      price: t.price != null ? Number(t.price) : null,
      turnaround_hours: t.turnaround_hours != null ? Number(t.turnaround_hours) : null,
    })),
    packages: packages.rows,
    stats: {
      test_count: tests.rows.length,
      category_count: categories.rows.length,
      package_count: packages.rows.length,
    },
  };
};

module.exports = { listPublicCatalog };
