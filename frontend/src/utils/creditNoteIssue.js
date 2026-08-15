export const tryAcquireIssueLock = (lock) => {
  if (!lock || lock.current) return false;
  lock.current = true;
  return true;
};

export const releaseIssueLock = (lock) => {
  if (lock) lock.current = false;
};

const unwrapIssuedNote = (result) => result?.data?.data ?? result?.data ?? result;

/**
 * Issue a credit note at most once per lock.
 * The lock is taken synchronously before the API call and released only if POST fails.
 * A successful POST is final even when invoice refresh fails.
 */
export const issueCreditNoteOnce = async ({
  lock,
  createCreditNote,
  body,
  onIssued,
  onStart,
}) => {
  if (!tryAcquireIssueLock(lock)) {
    return { ok: false, skipped: true, code: 'ISSUE_IN_PROGRESS' };
  }
  if (typeof onStart === 'function') onStart();

  let note;
  try {
    note = unwrapIssuedNote(await createCreditNote(body));
  } catch (error) {
    releaseIssueLock(lock);
    return { ok: false, error };
  }

  let refreshFailed = false;
  if (typeof onIssued === 'function') {
    try {
      await onIssued(note);
    } catch {
      refreshFailed = true;
    }
  }

  return { ok: true, note, refreshFailed };
};
