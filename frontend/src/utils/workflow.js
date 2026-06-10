export const WORKFLOW_STEPS = [
  { key: 'customer', labelKey: 'workflow.steps.customer' },
  { key: 'animal', labelKey: 'workflow.steps.animal' },
  { key: 'invoice', labelKey: 'workflow.steps.invoice' },
  { key: 'barcode', labelKey: 'workflow.steps.barcode' },
  { key: 'deliver', labelKey: 'workflow.steps.deliver' },
  { key: 'approve', labelKey: 'workflow.steps.approve' },
  { key: 'results', labelKey: 'workflow.steps.results' },
  { key: 'send', labelKey: 'workflow.steps.send' },
];

export function getWorkflowProgress(ctx = {}) {
  const {
    customerId,
    animalId,
    invoiceId,
    sample,
    workflow,
  } = ctx;

  const wf = workflow || {};
  const sampleStatus = sample?.status;

  const checks = {
    customer: !!customerId || !!sample?.customer_id,
    animal: !!animalId || !!sample?.animal_id,
    invoice: !!invoiceId || wf.has_invoice,
    barcode: !!sample?.barcode || wf.has_barcode,
    deliver: sampleStatus ? sampleStatus !== 'pending' : wf.delivered,
    approve: !!wf.all_validated,
    results: !!wf.has_report,
    send: !!wf.sent_to_customer,
  };

  const steps = WORKFLOW_STEPS.map((step, index) => ({
    ...step,
    number: index + 1,
    done: !!checks[step.key],
    current: false,
  }));

  const firstIncomplete = steps.findIndex((s) => !s.done);
  if (firstIncomplete >= 0) steps[firstIncomplete].current = true;

  const completedCount = steps.filter((s) => s.done).length;

  return { steps, completedCount, total: steps.length, percent: Math.round((completedCount / steps.length) * 100) };
}
