/**
 * Counts schedule saves in flight (move, copy, resize) and marks
 * `<body data-schedule-saving>` while any is pending. The board updates
 * optimistically, so this is the signal that the change is actually stored.
 * Browser only.
 */
let pending = 0;

export async function trackSaving<T>(save: Promise<T>): Promise<T> {
  pending++;
  document.body.dataset.scheduleSaving = "1";
  try {
    return await save;
  } finally {
    pending--;
    if (pending === 0) delete document.body.dataset.scheduleSaving;
  }
}
