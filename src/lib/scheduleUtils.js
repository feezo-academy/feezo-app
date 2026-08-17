// Shared logic for turning a program's frequency (daily/weekly/monthly) plus
// its last points entry into a due date — used by StudentHistoryModal to
// gate the Add Points button, and by useOverdueEntries for the bell dot.

export const FREQ_DAYS = { daily: 1, weekly: 7, monthly: 30 };

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}

// baseDate: the last points entry date for this program, or (if none yet)
// the program's created_at — a brand-new program is due from day one.
export function getDueDate(program, lastEntryDate) {
  const freqDays = FREQ_DAYS[program.frequency] || 7;
  const base = lastEntryDate || program.created_at || new Date().toISOString();
  return addDays(base, freqDays);
}

export function isDue(program, lastEntryDate) {
  const due = getDueDate(program, lastEntryDate);
  return new Date() >= due;
}

// overdue = still not entered a full day past the due date — this is the
// threshold that should trigger the notification bell's red dot
export function isOverdue(program, lastEntryDate) {
  const due = getDueDate(program, lastEntryDate);
  const overdueSince = addDays(due, 1);
  return new Date() >= overdueSince;
}
