/**
 * Laboratory Workflow Engine — read/infer layer over existing LIMS data.
 *
 * Does NOT replace sample status, results, or reports flow.
 * When WORKFLOW_ENGINE_ENABLED=false, helpers no-op / infer-only for tests.
 *
 * Timeline events → audit_logs (module: laboratory_workflow) — no new tables required.
 */
const { query } = require('../config/database');
const env = require('../config/env');
const { AppError } = require('../middleware/errorHandler');
const { uuidv4 } = require('../utils/uuid');
const { ROLE_PERMISSIONS } = require('../utils/permissions');

const WORKFLOW_MODULE = 'laboratory_workflow';

const STATES = {
  CUSTOMER_REGISTERED: 'CUSTOMER_REGISTERED',
  ANIMAL_REGISTERED: 'ANIMAL_REGISTERED',
  ORDER_CREATED: 'ORDER_CREATED',
  SAMPLE_CREATED: 'SAMPLE_CREATED',
  BARCODE_PRINTED: 'BARCODE_PRINTED',
  INVOICED: 'INVOICED',
  DEVICE_SAMPLE_RECEIVED: 'DEVICE_SAMPLE_RECEIVED',
  RESULTS_RECEIVED: 'RESULTS_RECEIVED',
  RESULTS_REVIEWED: 'RESULTS_REVIEWED',
  REPORT_APPROVED: 'REPORT_APPROVED',
  CLIENT_NOTIFIED: 'CLIENT_NOTIFIED',
  PORTAL_PUBLISHED: 'PORTAL_PUBLISHED',
  ARCHIVED: 'ARCHIVED',
};

const STATE_ORDER = Object.values(STATES);

const ACTION_TO_STATE = {
  register_customer: STATES.CUSTOMER_REGISTERED,
  register_animal: STATES.ANIMAL_REGISTERED,
  create_order: STATES.ORDER_CREATED,
  create_sample: STATES.SAMPLE_CREATED,
  print_barcode: STATES.BARCODE_PRINTED,
  create_invoice: STATES.INVOICED,
  device_receive: STATES.DEVICE_SAMPLE_RECEIVED,
  receive_results: STATES.RESULTS_RECEIVED,
  manual_results: STATES.RESULTS_RECEIVED,
  norma_import: STATES.RESULTS_RECEIVED,
  upload_parasite_images: STATES.RESULTS_RECEIVED,
  review_results: STATES.RESULTS_REVIEWED,
  approve_report: STATES.REPORT_APPROVED,
  validate_results: STATES.REPORT_APPROVED,
  return_for_edit: STATES.RESULTS_REVIEWED,
  notify_client: STATES.CLIENT_NOTIFIED,
  publish_portal: STATES.PORTAL_PUBLISHED,
  archive: STATES.ARCHIVED,
  add_comment: null,
};

const ROLE_ACTIONS = {
  reception: [
    'register_customer',
    'register_animal',
    'create_order',
    'create_sample',
    'print_barcode',
    'create_invoice',
    'notify_client',
  ],
  lab_technician: [
    'device_receive',
    'receive_results',
    'manual_results',
    'norma_import',
    'upload_parasite_images',
    'review_results',
  ],
  lab_specialist: [
    'review_results',
    'approve_report',
    'validate_results',
    'return_for_edit',
    'add_comment',
    'publish_portal',
  ],
  veterinarian: [
    'approve_report',
    'validate_results',
    'return_for_edit',
    'add_comment',
    'publish_portal',
  ],
  manager: ['*'],
  admin: ['*'],
  customer_portal: ['view_published_report', 'download_pdf'],
};

const isEnabled = () => env.workflow?.enabled === true;

const stateIndex = (state) => {
  const idx = STATE_ORDER.indexOf(state);
  return idx >= 0 ? idx : -1;
};

const highestState = (steps = []) => {
  let best = null;
  let bestIdx = -1;
  for (const step of steps) {
    const idx = stateIndex(step);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = step;
    }
  }
  return best;
};

const loadSampleSnapshot = async (sampleId) => {
  const result = await query(
    `SELECT s.id, s.sample_code, s.barcode, s.status, s.customer_id, s.animal_id,
            s.created_at, s.completed_date,
            inv.id AS invoice_id, inv.invoice_number,
            (SELECT COUNT(DISTINCT st.test_id)::int FROM sample_tests st WHERE st.sample_id = s.id) AS test_count,
            (SELECT COUNT(DISTINCT st.test_id)::int FROM results r
             JOIN sample_tests st ON st.id = r.sample_test_id WHERE st.sample_id = s.id) AS results_count,
            (SELECT COUNT(DISTINCT st.test_id)::int FROM results r
             JOIN sample_tests st ON st.id = r.sample_test_id
             WHERE st.sample_id = s.id AND r.is_validated = false
               AND EXISTS (SELECT 1 FROM result_values rv WHERE rv.result_id = r.id)) AS pending_validation_count,
            (SELECT COUNT(DISTINCT st.test_id)::int FROM sample_tests st
             JOIN results r ON r.sample_test_id = st.id
             WHERE st.sample_id = s.id AND r.is_validated = true) AS validated_test_count,
            (SELECT COUNT(DISTINCT st.test_id)::int FROM sample_tests st WHERE st.sample_id = s.id) AS total_tests,
            (SELECT COUNT(*)::int FROM reports rep WHERE rep.sample_id = s.id) AS reports_count,
            (SELECT COUNT(*)::int FROM notification_queue nq
             WHERE nq.metadata::jsonb->>'sample_id' = s.id::text
               AND nq.status IN ('sent', 'pending')) AS notifications_count,
            (SELECT COUNT(*)::int FROM device_messages dm
             WHERE dm.sample_id = s.id AND dm.status = 'imported') AS device_import_count,
            EXISTS (
              SELECT 1 FROM reports rep
              WHERE rep.sample_id = s.id
                AND rep.is_final IS NOT FALSE
                AND rep.pdf_url IS NOT NULL
                AND (rep.lab_specialist_approved_by IS NOT NULL OR rep.vet_approved_by IS NOT NULL)
            ) AS portal_published,
            EXISTS (
              SELECT 1 FROM audit_logs al
              WHERE al.module = $2
                AND al.entity_type = 'sample'
                AND al.entity_id = s.id::text
                AND al.action = 'archive'
            ) AS has_archive_event
     FROM samples s
     LEFT JOIN invoices inv ON inv.sample_id = s.id
     WHERE s.id = $1`,
    [sampleId, WORKFLOW_MODULE]
  );

  if (!result.rows[0]) throw new AppError('Sample not found', 404, 'NOT_FOUND');

  const row = result.rows[0];
  const allValidated = row.total_tests > 0 && row.validated_test_count >= row.total_tests;

  return {
    ...row,
    all_validated: allValidated,
    order_id: row.invoice_id || null,
  };
};

/** Infer completed steps from legacy DB fields (backward compatible). */
const inferCompletedSteps = (snapshot = {}) => {
  const steps = [];

  if (snapshot.customer_id) steps.push(STATES.CUSTOMER_REGISTERED);
  if (snapshot.animal_id) steps.push(STATES.ANIMAL_REGISTERED);
  if ((snapshot.test_count || 0) > 0) steps.push(STATES.ORDER_CREATED);
  if (snapshot.id) steps.push(STATES.SAMPLE_CREATED);
  if (snapshot.barcode) steps.push(STATES.BARCODE_PRINTED);
  if (snapshot.invoice_id) steps.push(STATES.INVOICED);
  if ((snapshot.device_import_count || 0) > 0) steps.push(STATES.DEVICE_SAMPLE_RECEIVED);
  if ((snapshot.results_count || 0) > 0) steps.push(STATES.RESULTS_RECEIVED);
  if ((snapshot.pending_validation_count || 0) > 0) steps.push(STATES.RESULTS_REVIEWED);
  if (snapshot.all_validated || snapshot.status === 'completed') steps.push(STATES.REPORT_APPROVED);
  if ((snapshot.notifications_count || 0) > 0) steps.push(STATES.CLIENT_NOTIFIED);
  if (snapshot.portal_published) steps.push(STATES.PORTAL_PUBLISHED);
  if (snapshot.has_archive_event) steps.push(STATES.ARCHIVED);

  return [...new Set(steps)];
};

const inferCurrentState = (snapshot = {}) => highestState(inferCompletedSteps(snapshot))
  || STATES.SAMPLE_CREATED;

const pendingSteps = (completed = []) => {
  const completedSet = new Set(completed);
  return STATE_ORDER.filter((s) => !completedSet.has(s));
};

const progressPercent = (completed = []) => {
  if (!STATE_ORDER.length) return 0;
  const maxIdx = completed.reduce((m, s) => Math.max(m, stateIndex(s)), -1);
  return Math.round(((maxIdx + 1) / STATE_ORDER.length) * 100);
};

const estimatedNextStep = (completed = []) => {
  const pending = pendingSteps(completed);
  return pending[0] || null;
};

const hasStep = (completed, state) => completed.includes(state);

const validateWorkflowTransition = (currentState, nextState, context = {}) => {
  const errors = [];
  const snap = context.snapshot || {};
  const completed = context.completedSteps || inferCompletedSteps(snap);

  if (!nextState || !STATE_ORDER.includes(nextState)) {
    return { valid: false, errors: ['Invalid workflow state'] };
  }

  if (nextState === STATES.BARCODE_PRINTED && !snap.id) {
    errors.push('Cannot print barcode before sample exists');
  }
  if ([STATES.RESULTS_RECEIVED, STATES.DEVICE_SAMPLE_RECEIVED].includes(nextState) && !snap.id) {
    errors.push('Cannot receive device/results before sample exists');
  }
  if (nextState === STATES.REPORT_APPROVED && !hasStep(completed, STATES.RESULTS_RECEIVED)) {
    errors.push('Cannot approve report before results are received');
  }
  if (nextState === STATES.REPORT_APPROVED && !hasStep(completed, STATES.RESULTS_REVIEWED)
    && (snap.pending_validation_count || 0) > 0) {
    errors.push('Cannot approve report before results review');
  }
  if (nextState === STATES.PORTAL_PUBLISHED && !hasStep(completed, STATES.REPORT_APPROVED)
    && snap.status !== 'completed' && !snap.all_validated) {
    errors.push('Cannot publish to portal before report approval');
  }
  if (nextState === STATES.CLIENT_NOTIFIED && !hasStep(completed, STATES.REPORT_APPROVED)
    && snap.status !== 'completed' && !snap.all_validated) {
    errors.push('Cannot notify client before report approval');
  }
  if (nextState === STATES.ARCHIVED
    && !hasStep(completed, STATES.PORTAL_PUBLISHED)
    && !hasStep(completed, STATES.REPORT_APPROVED)) {
    errors.push('Cannot archive before publish or approval');
  }

  const curIdx = stateIndex(currentState);
  const nextIdx = stateIndex(nextState);
  if (curIdx >= 0 && nextIdx >= 0 && nextIdx < curIdx
    && nextState !== STATES.RESULTS_REVIEWED) {
    errors.push(`Cannot move backwards from ${currentState} to ${nextState}`);
  }

  return { valid: errors.length === 0, errors };
};

const roleAllowsAction = (userRole, action) => {
  const role = String(userRole || '').toLowerCase();
  const allowed = ROLE_ACTIONS[role] || [];
  if (allowed.includes('*')) return true;
  return allowed.includes(action);
};

const getAllowedActions = (sampleId, userRole, context = {}) => {
  const snapshot = context.snapshot;
  const completed = context.completedSteps
    || (snapshot ? inferCompletedSteps(snapshot) : []);
  const currentState = context.currentState
    || (snapshot ? inferCurrentState(snapshot) : STATES.SAMPLE_CREATED);

  const actions = [];
  for (const [action, targetState] of Object.entries(ACTION_TO_STATE)) {
    if (!targetState) continue;
    if (!roleAllowsAction(userRole, action)) continue;
    const validation = validateWorkflowTransition(currentState, targetState, {
      snapshot,
      completedSteps: completed,
    });
    if (validation.valid && !completed.includes(targetState)) {
      actions.push(action);
    }
  }

  return {
    role: userRole,
    currentState,
    actions: [...new Set(actions)],
  };
};

const recordWorkflowEvent = async (sampleId, event, context = {}) => {
  if (!isEnabled()) {
    return { recorded: false, skipped: true, reason: 'WORKFLOW_ENGINE_ENABLED=false' };
  }

  const payload = {
    event,
    sample_id: sampleId,
    sample_code: context.sampleCode || context.snapshot?.sample_code || null,
    order_id: context.orderId || context.snapshot?.order_id || null,
    user_id: context.userId || null,
    user_role: context.userRole || null,
    device: context.device || context.deviceName || null,
    notes: context.notes || null,
    action: context.action || event,
    from_state: context.fromState || null,
    to_state: context.toState || null,
    ip_address: context.ipAddress || null,
  };

  await query(
    `INSERT INTO audit_logs (id, user_id, action, module, entity_type, entity_id, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      uuidv4(),
      context.userId || null,
      event,
      WORKFLOW_MODULE,
      'sample',
      String(sampleId),
      JSON.stringify(payload),
      context.ipAddress || null,
      context.userAgent || null,
    ]
  );

  return { recorded: true, event, payload };
};

const getWorkflowTimeline = async (sampleId, context = {}) => {
  const snapshot = context.snapshot || await loadSampleSnapshot(sampleId);
  const completed = inferCompletedSteps(snapshot);

  let auditRows = [];
  try {
    const audit = await query(
      `SELECT al.*, u.full_name AS user_name, r.name AS user_role
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE al.module = $1 AND al.entity_type = 'sample' AND al.entity_id = $2
       ORDER BY al.created_at ASC`,
      [WORKFLOW_MODULE, String(sampleId)]
    );
    auditRows = audit.rows;
  } catch {
    auditRows = [];
  }

  const inferred = completed.map((state) => ({
    source: 'inferred',
    event: state,
    state,
    created_at: snapshot.created_at,
    user_name: null,
    user_role: null,
    notes: 'Inferred from existing LIMS data',
  }));

  const logged = auditRows.map((row) => {
    let meta = {};
    try { meta = typeof row.new_values === 'string' ? JSON.parse(row.new_values) : (row.new_values || {}); } catch { /* */ }
    return {
      source: 'audit',
      event: row.action,
      state: meta.to_state || meta.event || row.action,
      created_at: row.created_at,
      user_id: row.user_id,
      user_name: row.user_name,
      user_role: meta.user_role || row.user_role,
      ip_address: row.ip_address,
      device: meta.device || null,
      notes: meta.notes || null,
      order_id: meta.order_id || null,
      sample_code: meta.sample_code || null,
    };
  });

  return [...inferred, ...logged].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
};

const getWorkflowState = async (sampleId) => {
  const snapshot = await loadSampleSnapshot(sampleId);
  const completedSteps = inferCompletedSteps(snapshot);
  const currentState = inferCurrentState(snapshot);

  return {
    enabled: isEnabled(),
    sampleId,
    sampleCode: snapshot.sample_code,
    currentState,
    completedSteps,
    pendingSteps: pendingSteps(completedSteps),
    progressPercent: progressPercent(completedSteps),
    estimatedNextStep: estimatedNextStep(completedSteps),
    legacyStatus: snapshot.status,
  };
};

const getWorkflowSummary = async (sampleId, context = {}) => {
  const snapshot = context.snapshot || await loadSampleSnapshot(sampleId);
  const completedSteps = inferCompletedSteps(snapshot);
  const currentState = inferCurrentState(snapshot);
  const timeline = context.skipTimeline
    ? []
    : await getWorkflowTimeline(sampleId, { snapshot });

  return {
    enabled: isEnabled(),
    sampleId,
    sampleCode: snapshot.sample_code,
    orderId: snapshot.order_id,
    currentState,
    completedSteps,
    pendingSteps: pendingSteps(completedSteps),
    progressPercent: progressPercent(completedSteps),
    estimatedNextStep: estimatedNextStep(completedSteps),
    legacyStatus: snapshot.status,
    allowedActionsByRole: {
      reception: getAllowedActions(sampleId, 'reception', { snapshot, completedSteps, currentState }).actions,
      lab_technician: getAllowedActions(sampleId, 'lab_technician', { snapshot, completedSteps, currentState }).actions,
      veterinarian: getAllowedActions(sampleId, 'veterinarian', { snapshot, completedSteps, currentState }).actions,
      manager: getAllowedActions(sampleId, 'manager', { snapshot, completedSteps, currentState }).actions,
    },
    timeline,
    snapshot: {
      hasBarcode: Boolean(snapshot.barcode),
      hasInvoice: Boolean(snapshot.invoice_id),
      hasResults: (snapshot.results_count || 0) > 0,
      allValidated: snapshot.all_validated,
      portalPublished: snapshot.portal_published,
      notificationsSent: (snapshot.notifications_count || 0) > 0,
    },
  };
};

const moveToNextStep = async (sampleId, action, context = {}) => {
  const snapshot = context.snapshot || await loadSampleSnapshot(sampleId);
  const completedSteps = inferCompletedSteps(snapshot);
  const currentState = inferCurrentState(snapshot);
  const targetState = ACTION_TO_STATE[action];

  if (!targetState) {
    if (action === 'add_comment') {
      await recordWorkflowEvent(sampleId, 'add_comment', { ...context, snapshot, fromState: currentState });
      return { ok: true, currentState, action, recorded: isEnabled() };
    }
    throw new AppError(`Unknown workflow action: ${action}`, 400, 'INVALID_ACTION');
  }

  if (context.userRole && !roleAllowsAction(context.userRole, action)) {
    throw new AppError('Action not allowed for role', 403, 'FORBIDDEN');
  }

  const validation = validateWorkflowTransition(currentState, targetState, {
    snapshot,
    completedSteps,
  });
  if (!validation.valid) {
    throw new AppError(validation.errors.join('; '), 400, 'INVALID_TRANSITION');
  }

  if (!isEnabled()) {
    return {
      ok: true,
      skipped: true,
      reason: 'WORKFLOW_ENGINE_ENABLED=false',
      action,
      fromState: currentState,
      toState: targetState,
    };
  }

  await recordWorkflowEvent(sampleId, action, {
    ...context,
    snapshot,
    fromState: currentState,
    toState: targetState,
    sampleCode: snapshot.sample_code,
    orderId: snapshot.order_id,
  });

  const afterCompleted = [...new Set([...completedSteps, targetState])];
  return {
    ok: true,
    action,
    fromState: currentState,
    toState: targetState,
    currentState: highestState(afterCompleted),
    completedSteps: afterCompleted,
  };
};

const getWorkflowDashboardCounts = async () => {
  const [
    newSamples,
    inProgress,
    awaitingApproval,
    approved,
    published,
    archived,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS n FROM samples s
       WHERE s.status IN ('pending', 'received')
         AND NOT EXISTS (
           SELECT 1 FROM results r JOIN sample_tests st ON st.id = r.sample_test_id
           WHERE st.sample_id = s.id
         )`
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM samples s
       WHERE s.status = 'running'
         OR (
           EXISTS (SELECT 1 FROM results r JOIN sample_tests st ON st.id = r.sample_test_id WHERE st.sample_id = s.id)
           AND s.status NOT IN ('completed', 'rejected')
         )`
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM samples s
       WHERE EXISTS (
         SELECT 1 FROM results r
         JOIN sample_tests st ON st.id = r.sample_test_id
         JOIN result_values rv ON rv.result_id = r.id
         WHERE st.sample_id = s.id AND r.is_validated = false
       )`
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM samples s
       WHERE s.status = 'completed'
         OR (
           (SELECT COUNT(DISTINCT st.test_id) FROM sample_tests st WHERE st.sample_id = s.id) > 0
           AND (SELECT COUNT(DISTINCT st.test_id) FROM sample_tests st
                JOIN results r ON r.sample_test_id = st.id
                WHERE st.sample_id = s.id AND r.is_validated = true)
             = (SELECT COUNT(DISTINCT st.test_id) FROM sample_tests st WHERE st.sample_id = s.id)
         )`
    ),
    query(
      `SELECT COUNT(DISTINCT s.id)::int AS n FROM samples s
       JOIN reports r ON r.sample_id = s.id
       WHERE r.is_final IS NOT FALSE AND r.pdf_url IS NOT NULL
         AND (r.lab_specialist_approved_by IS NOT NULL OR r.vet_approved_by IS NOT NULL)`
    ),
    query(
      `SELECT COUNT(DISTINCT al.entity_id)::int AS n FROM audit_logs al
       WHERE al.module = $1 AND al.action = 'archive'`,
      [WORKFLOW_MODULE]
    ),
  ]);

  return {
    newSamples: newSamples.rows[0]?.n || 0,
    inProgress: inProgress.rows[0]?.n || 0,
    awaitingApproval: awaitingApproval.rows[0]?.n || 0,
    approved: approved.rows[0]?.n || 0,
    published: published.rows[0]?.n || 0,
    archived: archived.rows[0]?.n || 0,
  };
};

module.exports = {
  STATES,
  STATE_ORDER,
  ACTION_TO_STATE,
  ROLE_ACTIONS,
  WORKFLOW_MODULE,
  isEnabled,
  loadSampleSnapshot,
  inferCompletedSteps,
  inferCurrentState,
  validateWorkflowTransition,
  recordWorkflowEvent,
  getAllowedActions,
  getWorkflowTimeline,
  getWorkflowState,
  getWorkflowSummary,
  moveToNextStep,
  getWorkflowDashboardCounts,
};
