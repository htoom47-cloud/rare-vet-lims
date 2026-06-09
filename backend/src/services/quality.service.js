const { query } = require('../config/database');
const { paginate, buildPagination } = require('../utils/helpers');

const listQC = async ({ page, limit }) => {
  const { offset, page: p, limit: l } = paginate(page, limit);
  const countResult = await query('SELECT COUNT(*) FROM qc_records');
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query(
    `SELECT qc.*, t.name as test_name, u.full_name as performed_by_name
     FROM qc_records qc
     LEFT JOIN tests t ON qc.test_id = t.id
     LEFT JOIN users u ON qc.performed_by = u.id
     ORDER BY qc.performed_at DESC LIMIT $1 OFFSET $2`,
    [l, offset]
  );

  return { data: result.rows, pagination: buildPagination(total, p, l) };
};

const createQC = async (data, userId) => {
  const result = await query(
    `INSERT INTO qc_records (test_id, parameter_id, expected_value, actual_value, lot_number, device_name, status, notes, performed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [data.test_id, data.parameter_id, data.expected_value, data.actual_value, data.lot_number, data.device_name, data.status || 'pass', data.notes, userId]
  );
  return result.rows[0];
};

const listMaintenance = async () => {
  const result = await query('SELECT * FROM device_maintenance ORDER BY created_at DESC LIMIT 50');
  return result.rows;
};

const createMaintenance = async (data) => {
  const result = await query(
    `INSERT INTO device_maintenance (device_name, device_model, maintenance_type, description, performed_by, next_due_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.device_name, data.device_model, data.maintenance_type, data.description, data.performed_by, data.next_due_date, data.status]
  );
  return result.rows[0];
};

const listCalibrations = async () => {
  const result = await query(
    `SELECT c.*, u.full_name as performed_by_name FROM calibration_logs c
     LEFT JOIN users u ON c.performed_by = u.id ORDER BY c.calibration_date DESC`
  );
  return result.rows;
};

const createCalibration = async (data, userId) => {
  const result = await query(
    `INSERT INTO calibration_logs (device_name, next_calibration, result, notes, performed_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [data.device_name, data.next_calibration, data.result, data.notes, userId]
  );
  return result.rows[0];
};

const listTemperatureLogs = async () => {
  const result = await query(
    `SELECT t.*, u.full_name as recorded_by_name FROM temperature_logs t
     LEFT JOIN users u ON t.recorded_by = u.id ORDER BY t.recorded_at DESC LIMIT 100`
  );
  return result.rows;
};

const createTemperatureLog = async (data, userId) => {
  const isAlert = data.temperature < 2 || data.temperature > 8;
  const result = await query(
    `INSERT INTO temperature_logs (location, temperature, humidity, recorded_by, is_alert)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [data.location, data.temperature, data.humidity, userId, isAlert]
  );
  return result.rows[0];
};

module.exports = {
  listQC, createQC, listMaintenance, createMaintenance,
  listCalibrations, createCalibration, listTemperatureLogs, createTemperatureLog,
};
