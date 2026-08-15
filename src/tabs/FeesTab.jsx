import { useEffect, useMemo, useState } from 'react';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { logActivity } from '../lib/auditLog';
import { exportGenericPdf, exportGenericXlsx } from '../lib/exporters';
import SendMessageModal from '../components/SendMessageModal';
import { DEFAULT_MSG, DEFAULT_THANK } from '../components/FeeMsgModal';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m is 1-indexed

// Trimmed + lowercased comparison so a stray space or casing difference
// between a sport/batch on a student's enrollment and the one used in a
// filter or on an attendance row doesn't cause a silent mismatch.
const norm = (v) => (v || '').toString().trim().toLowerCase();

// A composite key per enrollment (student + sport + batch) — matches the
// same pattern AttendanceTab uses, so a student with two enrollments (same
// or different sport) gets exactly one fee row per enrollment, never merged
// and never duplicated.
const keyFor = (studentId, sport, batchLabel) => `${studentId}::${norm(sport)}::${norm(batchLabel)}`;

function buildMsg(tpl, ctx) {
  return tpl
    .replace(/{name}/g, ctx.name || '')
    .replace(/{month}/g, ctx.month || '')
    .replace(/{academy}/g, ctx.academy || '')
    .replace(/{amount}/g, ctx.amount != null ? String(ctx.amount) : '')
    .replace(/{method}/g, ctx.method || '');
}

// Returns 'unpaid' | 'partial' | 'paid' by comparing what's been paid
// (fee.amount, a running total) against the total owed (fee.amount_due).
// This is the single source of truth for a fee's state — the stored
// `status` column is kept in sync with this on every save, so filters/
// exports can read it directly without recomputing.
// Legacy rows saved before partial-payment support have no amount_due;
// those fall back to their old stored status so existing paid/unpaid
// history isn't reinterpreted.
function feeStatus(fee) {
  if (!fee) return 'unpaid';
  const due = parseInt(fee.amount_due, 10);
  const paid = parseInt(fee.amount, 10) || 0;
  if (!due || isNaN(due)) return (fee.status === 'paid' && paid > 0) ? 'paid' : 'unpaid';
  if (paid <= 0) return 'unpaid';
  if (paid >= due) return 'paid';
  return 'partial';
}
const isPaidEntry = (fee) => feeStatus(fee) === 'paid';
const isPartialEntry = (fee) => feeStatus(fee) === 'partial';

// A student owes fees for a given *enrollment* (sport) for a given month only
// if they were enrolled on/before that month AND they have at least one
// Present attendance record for that specific sport in it — matches
// isEnrolledOnDate() + studentAttendedMonth() in the HTML app, extended to be
// per-sport so a student attending only Football doesn't get incorrectly
// flagged as fee-eligible for Swimming too.
function isEligible(student, year, month, attendanceByStudent, sport) {
  if (student.join_date) {
    const checkEnd = toIso(new Date(year, month, 0)); // last day of month
    if (student.join_date > checkEnd) return false;
  }
  const rows = attendanceByStudent[student.id];
  return !!(rows && rows.some(r => r.status === 'P' && (!sport || norm(r.sport) === norm(sport))));
}

// Staff can create a first-time entry and add further installments while
// the fee isn't yet fully paid. Once the full amount has been collected,
// only admin can reopen (reset) or otherwise touch it.
function canEditFee(fee, isAdmin) {
  if (isAdmin) return true;
  if (!fee) return true;
  return feeStatus(fee) !== 'paid';
}

// Modal for creating/editing a single student's fee entry for a given
// month + sport + batch. Supports partial payments: the first save records
// the Total Amount Due plus whatever's being paid right now. If that's
// less than the total, the fee stays "Partially Paid" until enough
// installments bring it to the full amount — staff can only ADD a new
// installment (auto-totalled), never edit or overwrite what's already
// been collected. Once fully paid it locks; only admin can reset it.
function FeeEntryModal({ student, monthKey, monthLabel, sport, batchLabel, fee, onClose, onSaved }) {
  const { academyId, appUser, user, isAdmin } = useAuth();
  const status = feeStatus(fee);
  const due = fee?.amount_due ? parseInt(fee.amount_due, 10) : null;
  const paidSoFar = fee?.amount ? parseInt(fee.amount, 10) : 0;
  const remaining = due != null ? Math.max(due - paidSoFar, 0) : null;
  const payments = fee?.payments || [];
  const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null;
  const isFirstEntry = status === 'unpaid' && !due;
  const locked = status === 'paid' && !isAdmin;

  const [totalDue, setTotalDue] = useState(due ?? '');
  const [payNow, setPayNow] = useState('');
  const [method, setMethod] = useState(fee?.method || 'cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const save = async () => {
    setError('');
    const nowAmt = parseInt(payNow, 10) || 0;
    let payload;

    if (isFirstEntry) {
      const dueAmt = parseInt(totalDue, 10);
      if (!dueAmt || dueAmt < 1) { setError('Enter the total amount due'); return; }
      if (nowAmt < 0) { setError('Invalid amount'); return; }
      const newPayments = nowAmt > 0
        ? [...payments, { amount: nowAmt, method, by: appUser?.name || user?.email || '', at: new Date().toISOString() }]
        : payments;
      const newStatus = nowAmt >= dueAmt ? 'paid' : (nowAmt > 0 ? 'partial' : 'unpaid');
      payload = {
        academy_id: academyId, student_id: student.id, sport, batch_label: batchLabel, month: monthKey,
        status: newStatus, amount_due: dueAmt, amount: nowAmt,
        method: nowAmt > 0 ? method : null,
        paid_date: newStatus === 'paid' ? toIso(new Date()) : null,
        collected_by: appUser?.name || user?.email || '',
        payments: newPayments, msg_sent: fee?.msg_sent || [],
      };
    } else {
      if (!nowAmt || nowAmt < 1) { setError('Enter the amount being paid now'); return; }
      const dueAmt = parseInt(fee.amount_due, 10);
      const newPaid = paidSoFar + nowAmt;
      const newPayments = [...payments, { amount: nowAmt, method, by: appUser?.name || user?.email || '', at: new Date().toISOString() }];
      const newStatus = newPaid >= dueAmt ? 'paid' : 'partial';
      payload = {
        academy_id: academyId, student_id: student.id, sport, batch_label: batchLabel, month: monthKey,
        status: newStatus, amount_due: dueAmt, amount: newPaid, method,
        paid_date: newStatus === 'paid' ? toIso(new Date()) : (fee.paid_date || null),
        collected_by: appUser?.name || user?.email || '',
        payments: newPayments, msg_sent: fee.msg_sent || [],
      };
    }

    setSaving(true);
    try {
      const { data, error: err } = await supabase
        .from('fees')
        .upsert(payload, { onConflict: 'student_id,sport,batch_label,month' })
        .select()
        .single();
      if (err) throw err;
      logActivity({
        academyId, actorId: appUser?.id, actorName: appUser?.name || user?.email,
        message: payload.status === 'paid'
          ? `Marked ${sport}${batchLabel ? ' (' + batchLabel + ')' : ''} fee fully paid for ${student.name} (${monthLabel}, ₹${payload.amount})`
          : `Recorded ₹${nowAmt} payment for ${student.name} — ${sport}${batchLabel ? ' (' + batchLabel + ')' : ''} (${monthLabel}), ₹${payload.amount}/₹${payload.amount_due} so far`,
      });
      onSaved(data);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const resetToUnpaid = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        academy_id: academyId, student_id: student.id, sport, batch_label: batchLabel, month: monthKey,
        status: 'unpaid', amount_due: fee?.amount_due || null, amount: null, method: null,
        paid_date: null, collected_by: appUser?.name || user?.email || '',
        payments: [], msg_sent: fee?.msg_sent || [],
      };
      const { data, error: err } = await supabase
        .from('fees')
        .upsert(payload, { onConflict: 'student_id,sport,batch_label,month' })
        .select()
        .single();
      if (err) throw err;
      logActivity({
        academyId, actorId: appUser?.id, actorName: appUser?.name || user?.email,
        message: `Reset ${sport}${batchLabel ? ' (' + batchLabel + ')' : ''} fee to unpaid for ${student.name} (${monthLabel})`,
      });
      onSaved(data);
    } catch (err) {
      setError(err.message || 'Failed to reset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">
          <span>💰 {student.name}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>
          {monthLabel} · {sport}{batchLabel ? ` · ${batchLabel}` : ''}
        </div>

        {!isFirstEntry && (
          <div style={{ background: 'var(--card2)', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--gray)' }}>Total Due</span><span>₹{due}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--gray)' }}>Paid So Far</span><span>₹{paidSoFar}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Remaining</span><span style={{ color: remaining > 0 ? 'var(--red)' : 'var(--green)' }}>₹{remaining}</span>
            </div>
            {lastPayment && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', color: 'var(--gray)' }}>
                Last payment: ₹{lastPayment.amount} · {lastPayment.method} · {lastPayment.by}
                {lastPayment.at && <> · {new Date(lastPayment.at).toLocaleDateString()}</>}
              </div>
            )}
          </div>
        )}

        {locked ? (
          <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>
            🔒 This fee is fully paid. Only an admin can reopen it.
          </div>
        ) : (
          <>
            {isFirstEntry && (
              <div className="form-group">
                <label className="form-label">Total Amount Due ₹</label>
                <input type="number" min="1" className="form-input" value={totalDue} onChange={e => setTotalDue(e.target.value)} placeholder="e.g. 300" />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                {isFirstEntry ? 'Amount Paying Now ₹ (leave blank if none yet)' : `Amount Paying Now ₹ (remaining ₹${remaining})`}
              </label>
              <input type="number" min={isFirstEntry ? '0' : '1'} className="form-input" value={payNow} onChange={e => setPayNow(e.target.value)} placeholder="Enter amount" />
            </div>

            {(isFirstEntry ? parseInt(payNow, 10) > 0 : true) && (
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select className="form-select" value={method} onChange={e => setMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
            )}
          </>
        )}

        {fee?.collected_by && (
          <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 8 }}>Last saved by: {fee.collected_by}</div>
        )}

        {isAdmin && status !== 'unpaid' && !confirmReset && (
          <button className="btn" style={{ width: '100%', fontSize: 11, color: 'var(--red)', background: 'transparent', border: '1px solid var(--red)', marginBottom: 8 }} onClick={() => setConfirmReset(true)}>
            🔓 Admin: Reset to Unpaid
          </button>
        )}
        {confirmReset && (
          <div style={{ fontSize: 11, marginBottom: 8, color: 'var(--red)' }}>
            This clears all recorded payments for this entry. Are you sure?
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmReset(false)}>Cancel</button>
              <button className="btn" style={{ flex: 1, background: 'var(--red)', color: '#fff' }} onClick={resetToUnpaid} disabled={saving}>Confirm Reset</button>
            </div>
          </div>
        )}

        {!locked && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn" style={{ flex: 1, background: 'var(--card2)' }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : '💾 Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FeesTab() {
  const { visibleStudents, visibleSports, visibleBatches, academy } = useAcademyData();
  const { isAdmin, academyId, appUser, user } = useAuth();

  const today = new Date();
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'year'
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [year, setYear] = useState(today.getFullYear());
  const [sportFilter, setSportFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('unpaid'); // 'all' | 'paid' | 'unpaid'
  const [search, setSearch] = useState('');
  const [includeNoAttendance, setIncludeNoAttendance] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [fees, setFees] = useState([]);
  const [attendance, setAttendance] = useState([]); // {student_id, status, date}
  const [loading, setLoading] = useState(false);

  const [sendModal, setSendModal] = useState(null);
  const [entryModal, setEntryModal] = useState(null); // { student, monthKey, monthLabel, sport, fee }

  // Fee rows are loaded once per academy and kept in sync locally after each save.
  useEffect(() => {
    (async () => {
      if (!academyId) return;
      const { data } = await supabase.from('fees').select('*').eq('academy_id', academyId);
      setFees(data || []);
    })();
  }, [academyId]);

  // Attendance is fetched fresh for whichever period is being viewed (month or full year),
  // since that determines who's "eligible" to owe fees.
  useEffect(() => {
    (async () => {
      if (!academyId) return;
      setLoading(true);
      const from = viewMode === 'year' ? `${year}-01-01` : `${year}-${pad(month)}-01`;
      const to = viewMode === 'year' ? `${year}-12-31` : `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
      const { data } = await supabase.from('attendance').select('student_id,status,date,sport')
        .eq('academy_id', academyId).gte('date', from).lte('date', to);
      setAttendance(data || []);
      setLoading(false);
    })();
  }, [academyId, viewMode, month, year]);

  const attendanceByStudentByMonth = useMemo(() => {
    // { 'YYYY-MM': { studentId: [rows] } }
    const out = {};
    attendance.forEach(r => {
      const mk = r.date.slice(0, 7);
      if (!out[mk]) out[mk] = {};
      if (!out[mk][r.student_id]) out[mk][r.student_id] = [];
      out[mk][r.student_id].push(r);
    });
    return out;
  }, [attendance]);

  const feeMap = useMemo(() => {
    const m = {};
    fees.forEach(f => { m[`${f.student_id}|${norm(f.sport)}|${norm(f.batch_label)}|${f.month}`] = f; });
    return m;
  }, [fees]);

  const batchesForSport = useMemo(() =>
    visibleBatches.filter(b => !sportFilter || b.sport === sportFilter),
    [visibleBatches, sportFilter]);

  // Flatten each student's enrollments into one row per sport+batch — same
  // pattern as AttendanceTab — so a student in two sports gets two separate,
  // independently trackable fee rows instead of being collapsed into one
  // (which was silently dropping the second sport's fee entirely).
  const enrollmentRows = useMemo(() => {
    const rows = [];
    visibleStudents.forEach(s => {
      const enrollments = (s.enrollments && s.enrollments.length > 0)
        ? s.enrollments : [{ sport: s.sport, batchLabel: s.batchLabel }];
      enrollments.forEach(en => {
        if (!en.sport) return;
        rows.push({ student: s, sport: en.sport, batchLabel: en.batchLabel, key: keyFor(s.id, en.sport, en.batchLabel) });
      });
    });
    return rows;
  }, [visibleStudents]);

  const sportScopedRows = useMemo(() =>
    enrollmentRows.filter(r =>
      (!sportFilter || norm(r.sport) === norm(sportFilter)) &&
      (!batchFilter || norm(r.batchLabel) === norm(batchFilter))
    ),
    [enrollmentRows, sportFilter, batchFilter]);

  const searchedRows = useMemo(() => {
    if (!search.trim()) return sportScopedRows;
    const q = search.trim().toLowerCase();
    return sportScopedRows.filter(r => (r.student.name || '').toLowerCase().includes(q) || (r.student.roll_no || '').toLowerCase().includes(q));
  }, [sportScopedRows, search]);

  // Builds the display rows for one month: eligible enrollments (enrolled +
  // attended that specific sport), each paired with their fee entry (or null
  // if not yet recorded). Enrollments with zero attendance that month are
  // tracked separately and only mixed into `rows` when includeNoAttendance
  // is checked.
  function buildMonthRows(y, m) {
    const monthKey = `${y}-${pad(m)}`;
    const attByStudent = attendanceByStudentByMonth[monthKey] || {};
    const eligible = [];
    const noAttendance = [];
    searchedRows.forEach(r => {
      const s = r.student;
      const enrolledBy = !s.join_date || s.join_date <= toIso(new Date(y, m, 0));
      if (!enrolledBy) return;
      if (isEligible(s, y, m, attByStudent, r.sport)) {
        eligible.push(r);
      } else {
        noAttendance.push(r);
      }
    });
    const toRow = (r) => {
      const fee = feeMap[`${r.student.id}|${norm(r.sport)}|${norm(r.batchLabel)}|${monthKey}`] || null;
      const st = feeStatus(fee);
      return { student: r.student, sport: r.sport, batchLabel: r.batchLabel, fee, monthKey, status: st, paid: st === 'paid', key: r.key };
    };
    const rows = eligible.map(toRow).concat(includeNoAttendance ? noAttendance.map(toRow) : []);
    return { monthKey, rows, noAttendance };
  }

  const periods = useMemo(() => {
    if (viewMode === 'month') return [buildMonthRows(year, month)];
    return Array.from({ length: 12 }, (_, i) => buildMonthRows(year, i + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, year, month, searchedRows, attendanceByStudentByMonth, feeMap, includeNoAttendance]);

  const allRows = useMemo(() => periods.flatMap(p => p.rows), [periods]);
  const paidRows = useMemo(() => allRows.filter(r => r.status === 'paid'), [allRows]);
  const partialRows = useMemo(() => allRows.filter(r => r.status === 'partial'), [allRows]);
  const unpaidRows = useMemo(() => allRows.filter(r => r.status === 'unpaid'), [allRows]);
  const totalNoAttendance = useMemo(() => periods.reduce((s, p) => s + p.noAttendance.length, 0), [periods]);

  const activeRows = statusFilter === 'all' ? allRows
    : statusFilter === 'paid' ? paidRows
    : statusFilter === 'partial' ? partialRows
    : unpaidRows;

  const monthLabelFor = (mk) => {
    const [y, m] = mk.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  };

  const openReminder = (row) => {
    const monthLabel = monthLabelFor(row.monthKey);
    const text = buildMsg(academy?.msg_template || DEFAULT_MSG, { name: row.student.name, month: monthLabel, academy: academy?.name });
    setSendModal({ row, student: row.student, month: monthLabel, kind: 'reminder', text });
  };
  const openThankYou = (row) => {
    const monthLabel = monthLabelFor(row.monthKey);
    const text = buildMsg(academy?.thank_template || DEFAULT_THANK, { name: row.student.name, month: monthLabel, academy: academy?.name, amount: row.fee?.amount, method: row.fee?.method || 'Cash' });
    setSendModal({ row, student: row.student, month: monthLabel, kind: 'paid', text });
  };
  const openEntry = (row) => {
    setEntryModal({ student: row.student, monthKey: row.monthKey, monthLabel: monthLabelFor(row.monthKey), sport: row.sport, batchLabel: row.batchLabel, fee: row.fee });
  };

  // Logs a sent reminder/thank-you against the fee row (creating a bare unpaid
  // row if one doesn't exist yet), so the Remind button can show a running count.
  const recordMsgSent = async (row, kind, type) => {
    if (!row) return;
    const existing = row.fee;
    const entry = { kind, type, by: appUser?.name || user?.email || '', at: new Date().toISOString() };
    const msgSent = [...(existing?.msg_sent || []), entry];
    const payload = {
      academy_id: academyId,
      student_id: row.student.id,
      sport: row.sport,
      batch_label: row.batchLabel,
      month: row.monthKey,
      status: existing?.status || 'unpaid',
      amount_due: existing?.amount_due ?? null,
      amount: existing?.amount ?? null,
      method: existing?.method ?? null,
      paid_date: existing?.paid_date ?? null,
      collected_by: existing?.collected_by ?? null,
      payments: existing?.payments || [],
      msg_sent: msgSent,
    };
    const { data, error } = await supabase
      .from('fees')
      .upsert(payload, { onConflict: 'student_id,sport,batch_label,month' })
      .select()
      .single();
    if (!error && data) {
      setFees(prev => {
        const idx = prev.findIndex(f => f.id === data.id);
        if (idx === -1) return [...prev, data];
        const next = [...prev];
        next[idx] = data;
        return next;
      });
    }
  };

  const goPrevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); } else { setMonth(m => m - 1); }
  };
  const goNextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); } else { setMonth(m => m + 1); }
  };

  const exportRows = activeRows.map(r => ({
    Student: r.student.name, Roll: r.student.roll_no, Sport: r.sport, Batch: r.batchLabel,
    Month: monthLabelFor(r.monthKey),
    'Amount Due': r.fee?.amount_due || 0,
    'Amount Paid': r.fee?.amount || 0,
    Status: r.status === 'paid' ? 'Paid' : r.status === 'partial' ? 'Partially Paid' : 'Unpaid',
  }));

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>💰 Fees</div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button className="btn btn-gold btn-sm" onClick={() => exportGenericPdf('Fees Report', ['Student', 'Roll', 'Sport', 'Batch', 'Month', 'Amount Due', 'Amount Paid', 'Status'], exportRows.map(Object.values), 'fees.pdf')}>PDF</button>
          <button className="btn btn-success btn-sm" onClick={() => exportGenericXlsx(exportRows, 'fees.xlsx', 'Fees')}>XL</button>
        </div>
      </div>

      {/* Filters dropdown: view mode, month, year, sport, batch */}
      <div className="card" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
        <button
          onClick={() => setFiltersOpen(v => !v)}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
        >
          <span>Filters — {viewMode === 'year' ? `Full Year ${year}` : `${MONTHS[month - 1]} ${year}`}{sportFilter ? ` · ${sportFilter}` : ''}{batchFilter ? ` · ${batchFilter}` : ''}</span>
          <span>{filtersOpen ? '▲' : '▼'}</span>
        </button>

        {filtersOpen && (
          <div style={{ padding: '0 12px 12px' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button
                style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: viewMode === 'month' ? 'var(--accent2)' : 'var(--card2)', color: viewMode === 'month' ? '#fff' : 'var(--gray)' }}
                onClick={() => setViewMode('month')}
              >📅 Month</button>
              <button
                style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: viewMode === 'year' ? 'var(--accent2)' : 'var(--card2)', color: viewMode === 'year' ? '#fff' : 'var(--gray)' }}
                onClick={() => setViewMode('year')}
              >🗓️ Full Year</button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              {viewMode === 'month' && (
                <>
                  <button
                    className="btn btn-xs"
                    style={{ padding: '6px 10px' }}
                    onClick={goPrevMonth}
                  >◀</button>
                  <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={month} onChange={e => setMonth(Number(e.target.value))}>
                    {MONTHS.map((mLabel, i) => <option key={i} value={i + 1}>{mLabel}</option>)}
                  </select>
                  <button
                    className="btn btn-xs"
                    style={{ padding: '6px 10px' }}
                    onClick={goNextMonth}
                  >▶</button>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <button className="btn btn-xs" style={{ padding: '6px 10px' }} onClick={() => setYear(y => y - 1)}>◀</button>
              <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={year} onChange={e => setYear(Number(e.target.value))}>
                {Array.from({ length: 6 }, (_, i) => today.getFullYear() - 3 + i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button className="btn btn-xs" style={{ padding: '6px 10px' }} onClick={() => setYear(y => y + 1)}>▶</button>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={sportFilter} onChange={e => { setSportFilter(e.target.value); setBatchFilter(''); }}>
                <option value="">All Sports</option>
                {visibleSports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
                <option value="">All Batches</option>
                {batchesForSport.map(b => <option key={b.id} value={b.batchLabel}>{b.batchLabel}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="🔍 Search name or roll no." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Paid / Unpaid dropdown */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="paid">Paid ({paidRows.length})</option>
          <option value="partial">Partially Paid ({partialRows.length})</option>
          <option value="unpaid">Unpaid ({unpaidRows.length})</option>
        </select>
      </div>

      {totalNoAttendance > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeNoAttendance} onChange={e => setIncludeNoAttendance(e.target.checked)} />
          <span style={{ fontSize: 11, color: 'var(--gray)' }}>Include {totalNoAttendance} student{totalNoAttendance > 1 ? 's' : ''} with no attendance this period</span>
        </label>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--gray)' }}>Loading…</div>}

        {!loading && activeRows.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--gray)' }}>
            {statusFilter === 'paid' ? 'No paid students yet.' : statusFilter === 'partial' ? 'No partially paid students.' : statusFilter === 'unpaid' ? 'No unpaid students 🎉' : 'No students to show.'}
          </div>
        )}

        {!loading && viewMode === 'year' ? (
          periods.map(p => {
            const pRows = p.rows.filter(r => statusFilter === 'all' || r.paid === (statusFilter === 'paid'));
            if (pRows.length === 0) return null;
            return (
              <div key={p.monthKey}>
                <div style={{ padding: '6px 4px', fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{monthLabelFor(p.monthKey)}</div>
                {pRows.map(r => (
                  <FeeRow key={r.key + r.monthKey} row={r} isAdmin={isAdmin} onReminder={openReminder} onThankYou={openThankYou} onEdit={openEntry} />
                ))}
              </div>
            );
          })
        ) : (
          !loading && activeRows.map(r => (
            <FeeRow key={r.key + r.monthKey} row={r} isAdmin={isAdmin} onReminder={openReminder} onThankYou={openThankYou} onEdit={openEntry} />
          ))
        )}

      </div>

      {sendModal && (
        <SendMessageModal
          student={sendModal.student}
          month={sendModal.month}
          kind={sendModal.kind}
          initialText={sendModal.text}
          onClose={() => setSendModal(null)}
          onSent={(type) => recordMsgSent(sendModal.row, sendModal.kind, type)}
        />
      )}

      {entryModal && (
        <FeeEntryModal
          student={entryModal.student}
          monthKey={entryModal.monthKey}
          monthLabel={entryModal.monthLabel}
          sport={entryModal.sport}
          batchLabel={entryModal.batchLabel}
          fee={entryModal.fee}
          onClose={() => setEntryModal(null)}
          onSaved={(updated) => {
            const wasFullyPaid = feeStatus(entryModal.fee) === 'paid';
            setFees(prev => {
              const idx = prev.findIndex(f => f.id === updated.id);
              if (idx === -1) return [...prev, updated];
              const next = [...prev];
              next[idx] = updated;
              return next;
            });
            setEntryModal(null);
            // Payment just crossed from partial/unpaid to fully paid — prompt
            // to send the thank-you message right away instead of making
            // staff hunt the row down in the Paid tab afterward. If they
            // close the popup without sending, recordMsgSent never runs, so
            // it's never counted.
            if (!wasFullyPaid && feeStatus(updated) === 'paid') {
              openThankYou({
                student: entryModal.student,
                sport: entryModal.sport,
                batchLabel: entryModal.batchLabel,
                monthKey: entryModal.monthKey,
                fee: updated,
              });
            }
          }}
        />
      )}
    </div>
  );
}

function FeeRow({ row, isAdmin, onReminder, onThankYou, onEdit }) {
  const { student, sport, batchLabel, fee, status, paid } = row;
  const editable = canEditFee(fee, isAdmin);
  // A fee row can exist purely because a reminder was logged against it (see
  // recordMsgSent) — that shouldn't flip the button to "Edit". Only treat it
  // as a real entry once someone has actually saved payment info.
  const hasEntry = !!fee?.collected_by;
  const partial = status === 'partial';
  const due = fee?.amount_due ? parseInt(fee.amount_due, 10) : null;
  const amountPaid = fee?.amount ? parseInt(fee.amount, 10) : 0;
  const remaining = due != null ? Math.max(due - amountPaid, 0) : null;
  const btnLabel = paid && !editable ? '🔒 Paid' : (partial ? '➕ Add Payment' : (hasEntry ? '✏️ Edit' : '💳 Pay'));
  const badgeLabel = paid ? 'paid' : partial ? 'partially paid' : 'unpaid';
  const reminderCount = (fee?.msg_sent || []).filter(m => m.kind === 'reminder').length;
  const thankYouCount = (fee?.msg_sent || []).filter(m => m.kind === 'paid').length;

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 10px', marginBottom: 8, flexWrap: 'nowrap', overflow: 'hidden' }}>
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{student.name}</div>
        <div style={{ fontSize: 10, color: 'var(--gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sport}{batchLabel ? ` · ${batchLabel}` : ''}
          {partial && due != null && <span style={{ color: 'var(--gold)' }}> · ₹{amountPaid}/₹{due} (₹{remaining} left)</span>}
          {fee?.method && <span> · {fee.method}</span>}
          {fee?.collected_by && <span style={{ color: 'var(--gold)' }}> · 👤 {fee.collected_by}</span>}
        </div>
      </div>
      <span
        className={'badge ' + (paid ? 'badge-green' : partial ? 'badge-orange' : 'badge-red')}
        style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, flexShrink: 0, whiteSpace: 'nowrap', ...(partial ? { background: 'rgba(230,160,20,0.18)', color: '#e0a020' } : {}) }}
      >
        {badgeLabel}
      </span>
      {paid ? (
        <button className="btn btn-outline" title="Send thank-you" style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => onThankYou(row)}>🎉{thankYouCount > 0 ? ` ${thankYouCount}` : ''}</button>
      ) : (
        <button className="btn btn-outline" title="Send reminder" style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => onReminder(row)}>💬{reminderCount > 0 ? ` ${reminderCount}` : ''}</button>
      )}
      <button
        className="btn btn-primary"
        title={btnLabel}
        style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, flexShrink: 0, whiteSpace: 'nowrap', opacity: paid && !editable ? 0.5 : 1 }}
        disabled={paid && !editable}
        onClick={() => editable && onEdit(row)}
      >
        {btnLabel}
      </button>
    </div>
  );
}
