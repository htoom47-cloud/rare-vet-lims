const express = require('express');
const service = require('../services/results.service');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { resultEntrySchema } = require('../validators/schemas');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(authenticate);

router.get('/critical', authorize(PERMISSIONS.RESULTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getCriticalAlerts();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/sample-test/:id', authorize(PERMISSIONS.RESULTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getBySampleTest(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/previous/:animalId/:parameterId', authorize(PERMISSIONS.RESULTS_VIEW), async (req, res, next) => {
  try {
    const data = await service.getPreviousResults(req.params.animalId, req.params.parameterId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/enter', authorize(PERMISSIONS.RESULTS_ENTER), validate(resultEntrySchema), async (req, res, next) => {
  try {
    const data = await service.enterResults(req.body, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/validate/:sampleTestId', authorize(PERMISSIONS.RESULTS_VALIDATE), async (req, res, next) => {
  try {
    const data = await service.validateResults(req.params.sampleTestId, req.user.id, req.body.doctor_notes);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
