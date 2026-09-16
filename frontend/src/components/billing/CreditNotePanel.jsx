import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileMinus } from 'lucide-react';
import toast from 'react-hot-toast';
import StatusBadge from '../ui/StatusBadge';
import { billingAPI } from '../../services/api';
import {
  canIssueCreditNote,
  invoiceCreditAvailable,
  previewCreditNote,
  validateCreditNoteForm,
  buildCreditNoteRequest,
  formErrorKey,
} from '../../utils/creditNotePreview';
import { issueCreditNoteOnce } from '../../utils/creditNoteIssue';

const fmt = (n) => `SAR ${parseFloat(n || 0).toFixed(2)}`;

export default function CreditNotePanel({ invoice, canCreate, onIssued }) {
  const { t } = useTranslation();
  const issueLock = useRef(false);
  const [step, setStep] = useState('idle');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [issuedNote, setIssuedNote] = useState(null);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const notes = invoice?.credit_notes || [];
  const available = invoiceCreditAvailable(invoice);
  const noteAlreadyListed = Boolean(
    issuedNote && notes.some((note) => note.id && issuedNote.id && note.id === issuedNote.id)
  );
  const allowCreate = Boolean(canCreate) && canIssueCreditNote(invoice) && !refreshFailed
    && !(issuedNote && !noteAlreadyListed);

  const preview = useMemo(() => previewCreditNote({
    invoiceTotal: invoice?.total,
    invoiceTax: invoice?.tax_amount,
    priorCredits: invoice?.credit_notes_total,
    requestedTotal: amount,
  }), [invoice?.total, invoice?.tax_amount, invoice?.credit_notes_total, amount]);

  const validation = useMemo(
    () => validateCreditNoteForm({ reason, amount, available }),
    [reason, amount, available]
  );

  const resetForm = () => {
    setStep('idle');
    setReason('');
    setAmount('');
    setSubmitting(false);
  };

  const openForm = () => {
    setIssuedNote(null);
    setRefreshFailed(false);
    setReason('');
    setAmount(available > 0 ? available.toFixed(2) : '');
    setStep('form');
  };

  const goConfirm = () => {
    if (!validation.ok) {
      toast.error(t(formErrorKey(validation.code)));
      return;
    }
    setStep('confirm');
  };

  const issueNote = async () => {
    const request = buildCreditNoteRequest({
      invoiceId: invoice.id,
      reason,
      amount,
      available,
    });
    if (!request.ok) {
      toast.error(t(formErrorKey(request.code)));
      setStep('form');
      return;
    }

    const result = await issueCreditNoteOnce({
      lock: issueLock,
      createCreditNote: (body) => billingAPI.createCreditNote(body),
      body: request.body,
      onIssued,
      onStart: () => setSubmitting(true),
    });

    if (result.skipped) return;

    if (!result.ok) {
      setSubmitting(false);
      const code = result.error?.response?.data?.error?.code;
      const message = result.error?.response?.data?.error?.message;
      if (code === 'CREDIT_NOTES_UNAVAILABLE') {
        toast.error(t('billing.creditNoteUnavailable'));
      } else {
        toast.error(message || t('common.error'));
      }
      return;
    }

    setIssuedNote(result.note);
    setRefreshFailed(Boolean(result.refreshFailed));
    setReason('');
    setAmount('');
    setStep('idle');
    setSubmitting(false);
    toast.success(t('billing.creditNoteIssued'));
    if (result.refreshFailed) {
      toast(t('billing.creditNoteRefreshFailed'));
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg text-sm space-y-1">
        <div className="flex justify-between">
          <span>{t('billing.originalTotal')}</span>
          <span>{fmt(invoice?.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('billing.priorCreditNotes')}</span>
          <span>{fmt(invoice?.credit_notes_total)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>{t('billing.netInvoice')}</span>
          <span>{fmt(invoice?.net_total)}</span>
        </div>
        <div className="flex justify-between text-primary-700 font-bold border-t pt-1 mt-1">
          <span>{t('billing.creditAvailable')}</span>
          <span>{fmt(invoice?.credit_available ?? available)}</span>
        </div>
        <div className="flex justify-between text-amber-700">
          <span>{t('billing.balanceDue')}</span>
          <span>{fmt(invoice?.balance_due)}</span>
        </div>
        <div className="flex justify-between text-purple-700">
          <span>{t('billing.refundDue')}</span>
          <span>{fmt(invoice?.refund_due)}</span>
        </div>
      </div>

      <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 p-2 rounded">
        {t('billing.creditNoteZatcaWarning')}
      </p>

      <div>
        <h4 className="font-semibold mb-2">{t('billing.creditNotes')}</h4>
        {notes.length === 0 ? (
          <p className="text-sm text-gray-500">{t('billing.noCreditNotes')}</p>
        ) : (
          <div className="border rounded-lg overflow-hidden text-sm">
            <div className="grid grid-cols-4 gap-2 bg-primary-50 dark:bg-primary-900/30 px-3 py-2 font-medium text-xs">
              <span>{t('billing.creditNoteNumber')}</span>
              <span>{t('common.status')}</span>
              <span>{t('common.date')}</span>
              <span>{t('billing.total')}</span>
            </div>
            {notes.map((note) => (
              <div key={note.id} className="grid grid-cols-4 gap-2 px-3 py-2 border-t">
                <span className="font-medium">{note.credit_note_number}</span>
                <StatusBadge
                  status={note.status}
                  label={note.status === 'issued' ? t('billing.creditNoteStatusIssued') : note.status}
                />
                <span>{note.created_at ? new Date(note.created_at).toLocaleString() : '—'}</span>
                <span className="font-medium">{fmt(note.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {issuedNote && (
        <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-sm space-y-1">
          <p className="font-semibold text-green-800 dark:text-green-200">{t('billing.creditNoteIssued')}</p>
          <div className="flex justify-between"><span>{t('billing.creditNoteNumber')}</span><span>{issuedNote.credit_note_number}</span></div>
          <div className="flex justify-between">
            <span>{t('common.status')}</span>
            <StatusBadge
              status={issuedNote.status}
              label={issuedNote.status === 'issued' ? t('billing.creditNoteStatusIssued') : issuedNote.status}
            />
          </div>
          <div className="flex justify-between">
            <span>{t('common.date')}</span>
            <span>{issuedNote.created_at ? new Date(issuedNote.created_at).toLocaleString() : '—'}</span>
          </div>
          {refreshFailed && (
            <p className="text-amber-800 dark:text-amber-200 pt-1">{t('billing.creditNoteRefreshFailed')}</p>
          )}
        </div>
      )}

      {allowCreate && step === 'idle' && (
        <div className="flex justify-end">
          <button type="button" onClick={openForm} className="btn-primary flex items-center gap-2">
            <FileMinus size={16} /> {t('billing.createCreditNote')}
          </button>
        </div>
      )}

      {allowCreate && step === 'form' && (
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="font-semibold">{t('billing.createCreditNote')}</h4>
          <div>
            <label className="block text-sm font-medium mb-1">{t('billing.creditNoteReason')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field min-h-[80px]"
              maxLength={1000}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('billing.creditNoteAmount')} (SAR)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={available}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-field"
              required
            />
            <p className="text-xs text-gray-500 mt-1">{t('billing.creditAvailable')}: {fmt(available)}</p>
          </div>
          {preview.ok && (
            <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm space-y-1">
              <p className="font-medium">{t('billing.creditNotePreview')}</p>
              <div className="flex justify-between"><span>{t('billing.creditNoteNet')}</span><span>{fmt(preview.subtotal)}</span></div>
              <div className="flex justify-between"><span>{t('billing.creditNoteTax')}</span><span>{fmt(preview.tax_amount)}</span></div>
              <div className="flex justify-between font-bold"><span>{t('billing.total')}</span><span>{fmt(preview.total)}</span></div>
            </div>
          )}
          {!preview.ok && amount !== '' && (
            <p className="text-sm text-red-600">{t(formErrorKey(preview.code))}</p>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={resetForm} className="btn-secondary">{t('common.cancel')}</button>
            <button type="button" onClick={goConfirm} disabled={!validation.ok} className="btn-primary">
              {t('billing.creditNoteContinue')}
            </button>
          </div>
        </div>
      )}

      {allowCreate && step === 'confirm' && preview.ok && (
        <div className="border border-amber-300 dark:border-amber-700 rounded-lg p-4 space-y-3">
          <h4 className="font-semibold">{t('billing.creditNoteConfirmTitle')}</h4>
          <p className="text-sm text-amber-800 dark:text-amber-200">{t('billing.creditNoteConfirmBody')}</p>
          <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-sm space-y-1">
            <div className="flex justify-between"><span>{t('billing.creditNoteReason')}</span><span className="text-end max-w-[70%]">{reason.trim()}</span></div>
            <div className="flex justify-between"><span>{t('billing.creditNoteNet')}</span><span>{fmt(preview.subtotal)}</span></div>
            <div className="flex justify-between"><span>{t('billing.creditNoteTax')}</span><span>{fmt(preview.tax_amount)}</span></div>
            <div className="flex justify-between font-bold"><span>{t('billing.total')}</span><span>{fmt(preview.total)}</span></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setStep('form')} disabled={submitting} className="btn-secondary">
              {t('billing.creditNoteBack')}
            </button>
            <button type="button" onClick={issueNote} disabled={submitting} className="btn-primary">
              {submitting ? t('common.loading') : t('billing.creditNoteIssue')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
