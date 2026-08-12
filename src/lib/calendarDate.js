// Date/time helpers for the Calendar (staff scheduling) feature.
// Same "build from local parts" rule as AttendanceTab — never use
// toISOString() for date-only values, it shifts the day in IST.

export const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayIso = () => toIso(new Date());

export const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return toIso(new Date(y, m - 1, d + n));
};

export const addMonths = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return toIso(new Date(y, m - 1 + n, d));
};

// Monday of the week containing iso (Mon-first grid, like the HTML app)
export const getMonday = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  return toIso(new Date(y, m - 1, d + diff));
};

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const dayName = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return DOW_SHORT[new Date(y, m - 1, d).getDay()];
};

export const shortDate = (iso) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${Number(d)} ${MON_SHORT[m - 1]}`;
};

export const isoToDisplay = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${Number(d)} ${MON_SHORT[m - 1]} ${y}`;
};

export const monthLabel = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return `${['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1]} ${y}`;
};

// "2026-06-28T09:34:00.000Z" -> "9:34 AM"
export const fmtTime12 = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
};

// "HH:MM" (24h) -> "9:00 AM"
export const fmt24to12 = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h % 12) || 12)}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const calcDuration = (startIso, endIso) => {
  const ms = new Date(endIso) - new Date(startIso);
  if (ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// Expand a date range by recurring weekdays (0=Sun..6=Sat). Empty days = every day.
export const expandDates = (from, to, days) => {
  const result = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let cur = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  while (cur <= end) {
    if (!days.length || days.includes(cur.getDay())) result.push(toIso(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return result;
};

export const SCHED_COLORS = { scheduled: '#3b82f6', pending: '#3b82f6', in_progress: '#f59e0b', done: '#22c55e', cancelled: '#ef4444' };
export const SCHED_LABELS = { scheduled: '📅 Scheduled', pending: '📅 Scheduled', in_progress: '▶️ In Progress', done: '✅ Done', cancelled: '❌ Cancelled' };
