/**
 * Laboratory Workflow Engine — unit verification (no DB required for core logic).
 * Usage: node src/scripts/verify-laboratory-workflow.js
 */
const assert = require('assert');
const wf = require('../services/laboratory-workflow.service');
const { AppError } = require('../middleware/errorHandler');

let passed = 0;
let failed = 0;

const check = async (label, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
};

const { STATES } = wf;

const snap = (overrides = {}) => ({
  id: 'sample-1',
  sample_code: '2607030001',
  barcode: null,
  status: 'pending',
  customer_id: null,
  animal_id: null,
  test_count: 0,
  results_count: 0,
  pending_validation_count: 0,
  validated_test_count: 0,
  total_tests: 0,
  all_validated: false,
  invoice_id: null,
  device_import_count: 0,
  notifications_count: 0,
  portal_published: false,
  has_archive_event: false,
  created_at: new Date().toISOString(),
  ...overrides,
});

const completed = (...steps) => steps;

(async () => {
  console.log('\n=== Laboratory Workflow Engine — Phase 7 ===\n');

  await check('13 workflow states defined', () => {
    assert.strictEqual(wf.STATE_ORDER.length, 13);
    assert.ok(wf.STATE_ORDER.includes(STATES.ARCHIVED));
  });

  await check('CUSTOMER_REGISTERED inferred from customer_id', () => {
    const steps = wf.inferCompletedSteps(snap({ customer_id: 'c1' }));
    assert.ok(steps.includes(STATES.CUSTOMER_REGISTERED));
  });

  await check('ANIMAL_REGISTERED inferred from animal_id', () => {
    const steps = wf.inferCompletedSteps(snap({ customer_id: 'c1', animal_id: 'a1' }));
    assert.ok(steps.includes(STATES.ANIMAL_REGISTERED));
  });

  await check('ORDER_CREATED inferred from test_count', () => {
    const steps = wf.inferCompletedSteps(snap({ test_count: 2 }));
    assert.ok(steps.includes(STATES.ORDER_CREATED));
  });

  await check('SAMPLE_CREATED inferred when sample id exists', () => {
    const steps = wf.inferCompletedSteps(snap());
    assert.ok(steps.includes(STATES.SAMPLE_CREATED));
  });

  await check('BARCODE_PRINTED inferred from barcode field', () => {
    const steps = wf.inferCompletedSteps(snap({ barcode: '2607030001' }));
    assert.ok(steps.includes(STATES.BARCODE_PRINTED));
  });

  await check('INVOICED inferred from invoice_id', () => {
    const steps = wf.inferCompletedSteps(snap({ invoice_id: 'inv-1' }));
    assert.ok(steps.includes(STATES.INVOICED));
  });

  await check('DEVICE_SAMPLE_RECEIVED inferred from device import', () => {
    const steps = wf.inferCompletedSteps(snap({ device_import_count: 1 }));
    assert.ok(steps.includes(STATES.DEVICE_SAMPLE_RECEIVED));
  });

  await check('RESULTS_RECEIVED inferred from results_count', () => {
    const steps = wf.inferCompletedSteps(snap({ results_count: 3 }));
    assert.ok(steps.includes(STATES.RESULTS_RECEIVED));
  });

  await check('RESULTS_REVIEWED inferred when pending validation exists', () => {
    const steps = wf.inferCompletedSteps(snap({ results_count: 1, pending_validation_count: 1 }));
    assert.ok(steps.includes(STATES.RESULTS_REVIEWED));
  });

  await check('REPORT_APPROVED inferred from completed status', () => {
    const steps = wf.inferCompletedSteps(snap({ status: 'completed' }));
    assert.ok(steps.includes(STATES.REPORT_APPROVED));
  });

  await check('PORTAL_PUBLISHED inferred from portal_published flag', () => {
    const steps = wf.inferCompletedSteps(snap({ portal_published: true, all_validated: true }));
    assert.ok(steps.includes(STATES.PORTAL_PUBLISHED));
  });

  await check('CLIENT_NOTIFIED inferred from notifications_count', () => {
    const steps = wf.inferCompletedSteps(snap({ notifications_count: 1 }));
    assert.ok(steps.includes(STATES.CLIENT_NOTIFIED));
  });

  await check('ARCHIVED inferred from archive audit event', () => {
    const steps = wf.inferCompletedSteps(snap({
      has_archive_event: true,
      portal_published: true,
      all_validated: true,
    }));
    assert.ok(steps.includes(STATES.ARCHIVED));
  });

  await check('completed status maps to REPORT_APPROVED or PORTAL_PUBLISHED', () => {
    const s1 = wf.inferCurrentState(snap({ status: 'completed', all_validated: true }));
    assert.strictEqual(s1, STATES.REPORT_APPROVED);
    const s2 = wf.inferCurrentState(snap({
      status: 'completed',
      all_validated: true,
      portal_published: true,
    }));
    assert.strictEqual(s2, STATES.PORTAL_PUBLISHED);
  });

  await check('block barcode before sample exists', () => {
    const noSample = { ...snap(), id: null };
    const v = wf.validateWorkflowTransition(STATES.SAMPLE_CREATED, STATES.BARCODE_PRINTED, {
      snapshot: noSample,
      completedSteps: [],
    });
    assert.strictEqual(v.valid, false);
    assert.ok(v.errors.some((e) => /barcode/i.test(e)));
  });

  await check('block results before sample exists', () => {
    const v = wf.validateWorkflowTransition(STATES.ORDER_CREATED, STATES.RESULTS_RECEIVED, {
      snapshot: { ...snap(), id: null },
      completedSteps: [],
    });
    assert.strictEqual(v.valid, false);
  });

  await check('block approve before results received', () => {
    const v = wf.validateWorkflowTransition(STATES.RESULTS_REVIEWED, STATES.REPORT_APPROVED, {
      snapshot: snap({ results_count: 0 }),
      completedSteps: completed(STATES.SAMPLE_CREATED, STATES.RESULTS_REVIEWED),
    });
    assert.strictEqual(v.valid, false);
  });

  await check('block approve before results review when pending validation', () => {
    const v = wf.validateWorkflowTransition(STATES.RESULTS_RECEIVED, STATES.REPORT_APPROVED, {
      snapshot: snap({ results_count: 2, pending_validation_count: 1 }),
      completedSteps: completed(STATES.SAMPLE_CREATED, STATES.RESULTS_RECEIVED),
    });
    assert.strictEqual(v.valid, false);
  });

  await check('block publish portal before approve', () => {
    const v = wf.validateWorkflowTransition(STATES.RESULTS_REVIEWED, STATES.PORTAL_PUBLISHED, {
      snapshot: snap({ results_count: 1, pending_validation_count: 1 }),
      completedSteps: completed(
        STATES.SAMPLE_CREATED,
        STATES.RESULTS_RECEIVED,
        STATES.RESULTS_REVIEWED
      ),
    });
    assert.strictEqual(v.valid, false);
  });

  await check('block archive before publish or approval', () => {
    const v = wf.validateWorkflowTransition(STATES.RESULTS_RECEIVED, STATES.ARCHIVED, {
      snapshot: snap({ results_count: 1 }),
      completedSteps: completed(STATES.SAMPLE_CREATED, STATES.RESULTS_RECEIVED),
    });
    assert.strictEqual(v.valid, false);
  });

  await check('allow invoice after order (before sample barcode)', () => {
    const v = wf.validateWorkflowTransition(STATES.ORDER_CREATED, STATES.INVOICED, {
      snapshot: snap({ test_count: 2 }),
      completedSteps: completed(
        STATES.CUSTOMER_REGISTERED,
        STATES.ANIMAL_REGISTERED,
        STATES.ORDER_CREATED,
        STATES.SAMPLE_CREATED
      ),
    });
    assert.strictEqual(v.valid, true);
  });

  await check('manual + norma results both map to RESULTS_RECEIVED action', () => {
    assert.strictEqual(wf.ACTION_TO_STATE.manual_results, STATES.RESULTS_RECEIVED);
    assert.strictEqual(wf.ACTION_TO_STATE.norma_import, STATES.RESULTS_RECEIVED);
  });

  await check('Reception allowed actions include reception steps only', () => {
    const s = snap({ customer_id: 'c1', animal_id: 'a1', test_count: 1, barcode: null });
    const done = wf.inferCompletedSteps(s);
    const { actions } = wf.getAllowedActions('sample-1', 'reception', {
      snapshot: s,
      completedSteps: done,
      currentState: wf.inferCurrentState(s),
    });
    assert.ok(actions.includes('print_barcode'));
    assert.ok(!actions.includes('approve_report'));
    assert.ok(!actions.includes('norma_import'));
  });

  await check('Lab Technician allowed actions include results steps', () => {
    const s = snap({ customer_id: 'c1', test_count: 2, barcode: '2607030001', results_count: 0 });
    const done = wf.inferCompletedSteps(s);
    const { actions } = wf.getAllowedActions('sample-1', 'lab_technician', {
      snapshot: s,
      completedSteps: done,
      currentState: wf.inferCurrentState(s),
    });
    assert.ok(actions.includes('manual_results') || actions.includes('norma_import'));
    assert.ok(!actions.includes('create_sample'));
  });

  await check('Doctor (veterinarian) can approve when review complete', () => {
    const s = snap({
      customer_id: 'c1',
      test_count: 1,
      results_count: 2,
      pending_validation_count: 0,
    });
    const done = wf.inferCompletedSteps(s);
    const withReview = [...done, STATES.RESULTS_REVIEWED];
    const { actions } = wf.getAllowedActions('sample-1', 'veterinarian', {
      snapshot: s,
      completedSteps: withReview,
      currentState: STATES.RESULTS_REVIEWED,
    });
    assert.ok(actions.includes('approve_report') || actions.includes('validate_results'));
  });

  await check('Manager has wildcard actions', () => {
    assert.ok(wf.ROLE_ACTIONS.manager.includes('*'));
    const s = snap({ customer_id: 'c1', test_count: 1 });
    const { actions } = wf.getAllowedActions('sample-1', 'manager', {
      snapshot: s,
      completedSteps: wf.inferCompletedSteps(s),
      currentState: wf.inferCurrentState(s),
    });
    assert.ok(actions.length > 0);
  });

  await check('Customer portal role limited to view/download', () => {
    assert.deepStrictEqual(wf.ROLE_ACTIONS.customer_portal, ['view_published_report', 'download_pdf']);
  });

  await check('progress percent increases with completed steps', () => {
    const early = wf.inferCurrentState(snap({ customer_id: 'c1' }));
    const late = wf.inferCurrentState(snap({
      customer_id: 'c1',
      animal_id: 'a1',
      test_count: 2,
      barcode: 'x',
      invoice_id: 'i',
      results_count: 1,
      all_validated: true,
      portal_published: true,
    }));
    assert.ok(wf.STATE_ORDER.indexOf(late) > wf.STATE_ORDER.indexOf(early));
  });

  await check('estimated next step follows state order', () => {
    const done = wf.inferCompletedSteps(snap({ customer_id: 'c1' }));
    const pending = wf.STATE_ORDER.filter((s) => !done.includes(s));
    assert.strictEqual(pending[0], STATES.ANIMAL_REGISTERED);
  });

  await check('recordWorkflowEvent skips when engine disabled', async () => {
    const prev = process.env.WORKFLOW_ENGINE_ENABLED;
    delete process.env.WORKFLOW_ENGINE_ENABLED;
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../services/laboratory-workflow.service')];
    const wfOff = require('../services/laboratory-workflow.service');
    const result = await wfOff.recordWorkflowEvent('sample-1', 'test_event', { userId: 'u1' });
    assert.strictEqual(result.recorded, false);
    assert.strictEqual(result.skipped, true);
    if (prev !== undefined) process.env.WORKFLOW_ENGINE_ENABLED = prev;
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../services/laboratory-workflow.service')];
  });

  await check('moveToNextStep rejects forbidden role', async () => {
    try {
      await wf.moveToNextStep('sample-1', 'approve_report', {
        snapshot: snap({ customer_id: 'c1', test_count: 1, results_count: 2 }),
        userRole: 'reception',
        completedSteps: completed(
          STATES.SAMPLE_CREATED,
          STATES.RESULTS_RECEIVED,
          STATES.RESULTS_REVIEWED
        ),
      });
      assert.fail('Expected AppError');
    } catch (err) {
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.code, 'FORBIDDEN');
    }
  });

  await check('moveToNextStep rejects invalid transition (publish before approve)', async () => {
    try {
      await wf.moveToNextStep('sample-1', 'publish_portal', {
        snapshot: snap({ results_count: 1, pending_validation_count: 1 }),
        userRole: 'manager',
        completedSteps: completed(
          STATES.SAMPLE_CREATED,
          STATES.RESULTS_RECEIVED,
          STATES.RESULTS_REVIEWED
        ),
      });
      assert.fail('Expected AppError');
    } catch (err) {
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.code, 'INVALID_TRANSITION');
    }
  });

  await check('moveToNextStep no-ops when engine disabled', async () => {
    const prev = process.env.WORKFLOW_ENGINE_ENABLED;
    delete process.env.WORKFLOW_ENGINE_ENABLED;
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../services/laboratory-workflow.service')];
    const wfOff = require('../services/laboratory-workflow.service');
    const result = await wfOff.moveToNextStep('sample-1', 'print_barcode', {
      snapshot: snap(),
      userRole: 'reception',
    });
    assert.strictEqual(result.skipped, true);
    if (prev !== undefined) process.env.WORKFLOW_ENGINE_ENABLED = prev;
    delete require.cache[require.resolve('../config/env')];
    delete require.cache[require.resolve('../services/laboratory-workflow.service')];
  });

  await check('WORKFLOW_MODULE constant for audit_logs', () => {
    assert.strictEqual(wf.WORKFLOW_MODULE, 'laboratory_workflow');
  });

  await check('timeline merges inferred + audit structure', async () => {
    const s = snap({ customer_id: 'c1', test_count: 1 });
    const timeline = await wf.getWorkflowTimeline('sample-1', { snapshot: s });
    assert.ok(Array.isArray(timeline));
    assert.ok(timeline.some((e) => e.source === 'inferred'));
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
