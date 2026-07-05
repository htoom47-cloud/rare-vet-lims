const express = require('express');
const service = require('../services/samples.service');
const testMgmt = require('../services/sample-test-management.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sampleSchema, sampleReassignAnimalSchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');
const { auditLog } = require('../middleware/audit');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.SAMPLES_VIEW, PERMISSIONS.RESULTS_UPLOAD_IMAGES), async (req, res, next) => {
  try {
    if (req.query.status === 'completed') {
      await service.reconcileSampleStatuses();
    }
    const data = await service.list(req.query);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/queue/parasitology', authorize(PERMISSIONS.SAMPLES_VIEW), async (req, res, next) => {
  try {
    const data = await service.getParasitologyQueue();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/queue', authorize(PERMISSIONS.SAMPLES_VIEW), async (req, res, next) => {
  try {
    const data = await service.getQueue(req.user.role_name === 'lab_technician' ? req.user.id : null);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/scan/:barcode', authorize(PERMISSIONS.SAMPLES_VIEW, PERMISSIONS.RESULTS_UPLOAD_IMAGES), async (req, res, next) => {
  try {
    const data = await service.getByBarcode(req.params.barcode);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/workflow', authorize(PERMISSIONS.SAMPLES_VIEW, PERMISSIONS.RESULTS_UPLOAD_IMAGES), async (req, res, next) => {
  try {
    const data = await service.getWorkflowSummary(req.params.id);
    res.json({ success: true, data, enabled: data.enabled !== false });
  } catch (err) { next(err); }
});

router.post('/:id/workflow/action', authorize(PERMISSIONS.SAMPLES_UPDATE, PERMISSIONS.RESULTS_VALIDATE, PERMISSIONS.RESULTS_ENTER), async (req, res, next) => {
  try {
    const data = await service.advanceWorkflow(req.params.id, req.body.action, {
      userId: req.user.id,
      userRole: req.user.role_name,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      notes: req.body.notes,
      device: req.body.device,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', authorize(PERMISSIONS.SAMPLES_VIEW, PERMISSIONS.RESULTS_UPLOAD_IMAGES), async (req, res, next) => {
  try {
    const data = await service.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/barcode', authorize(PERMISSIONS.SAMPLES_VIEW), async (req, res, next) => {
  try {
    const data = await service.getBarcode(req.params.id, req.query.format);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', authorize(PERMISSIONS.SAMPLES_CREATE), validate(sampleSchema), auditLog('create', 'samples'), async (req, res, next) => {
  try {
    const data = await service.create(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/:id/status', authorize(PERMISSIONS.SAMPLES_UPDATE), auditLog('update_status', 'samples'), async (req, res, next) => {
  try {
    const data = await service.updateStatus(req.params.id, req.body.status, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/:id/animal', authorize(PERMISSIONS.SAMPLES_UPDATE), validate(sampleReassignAnimalSchema), auditLog('reassign_animal', 'samples'), async (req, res, next) => {
  try {
    const data = await service.reassignAnimal(
      req.params.id,
      req.body.animal_id,
      req.user.id,
      req.user.role_name,
      { ip: req.ip, userAgent: req.get('user-agent') }
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/lab-handover', authorize(PERMISSIONS.SAMPLES_UPDATE), auditLog('lab_handover', 'samples'), async (req, res, next) => {
  try {
    const data = await service.recordLabHandover(
      req.params.id,
      req.user.id,
      { ip: req.ip, userAgent: req.get('user-agent') }
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// --- Sample Test Management ---

router.delete('/:id/tests/:testId', authorize(PERMISSIONS.SAMPLE_TESTS_REMOVE), async (req, res, next) => {
  try {
    const data = await testMgmt.removeTest(req.params.id, req.params.testId, req.user.id, { role: req.user.role_name });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/:id/tests/:testId/cancel', authorize(PERMISSIONS.SAMPLE_TESTS_CANCEL), async (req, res, next) => {
  try {
    const data = await testMgmt.cancelTest(req.params.id, req.params.testId, req.user.id, { reason: req.body.reason });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/:id/tests/:testId/reactivate', authorize(PERMISSIONS.SAMPLE_TESTS_REACTIVATE), async (req, res, next) => {
  try {
    const data = await testMgmt.reactivateTest(req.params.id, req.params.testId, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/tests/:testId/history', authorize(PERMISSIONS.SAMPLES_VIEW), async (req, res, next) => {
  try {
    const data = await testMgmt.getTestHistory(req.params.testId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/duplicate-tests', authorize(PERMISSIONS.SAMPLES_VIEW), async (req, res, next) => {
  try {
    const data = await testMgmt.checkDuplicateTests(req.params.id);
    res.json({ success: true, data, hasDuplicates: data.length > 0 });
  } catch (err) { next(err); }
});

module.exports = router;
