import { useEffect, useMemo, useState } from 'react';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { exportGenericPdf, exportGenericXlsx } from '../lib/exporters';
import SendMessageModal from '../components/SendMessageModal';
import { DEFAULT_MSG, DEFAULT_THANK } from '../components/FeeMsgModal';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m is 1-indexed

function buildMsg(tpl, ctx) {
  return tpl
    .replace(/{name}/g, ctx.name || '')
    .replace(/{month}/g, ctx.month || '')
    .replace(/{academy}/g, ctx.academy || '')
    .replace(/{amount}/g, ctx.amount != null ? String(ctx.amount) : '')
    .replace(/{method}/g, ctx.method || '');
}

// A fee entry only counts as "paid" if status is paid AND it has a positive amount —
// matches isPaid() in the HTML app.
function isPaidEntry(fee) {
  if (!fee || fee.status !== 'paid') return false;
  const amt = parseInt(fee.amount, 10);
  return !isNaN(amt) && amt > 0;
}

// A student owes fees for a given month only if they were enrolled on/before
// that month AND they have at least one Present attendance record in it —
// matches isEnrolledOnDate() + studentAttendedMonth() in the HTML app.
function isEligible(student, year, month, attendanceByStudent) {
  if (student.join_date) {
    const checkEnd = toIso(new Date(year, month, 0)); // last day of month
    if (student.join_date > checkEnd) return false;
  }
  const rows = attendanceByStudent[student.id];
  return !!(rows && rows.some(r => r.status === 'P'));
}

// Admin-only capability check: staff can create a first-time fee entry, but
// once someone has recorded a payment (collected_by is set), only admin can edit it.
function canEditFee(fee, isAdmin) {
  if (isAdmin) return true;
  return !fee || !fee.collected_by;
}

// Modal for creating/editing a single student's fee entry for a given month+sport.
function FeeEntryModal({ student, monthKey, monthLabel, sport, fee, onClose, onSaved }) {
  const { academyId, appUser, user } = useAuth();
  const [status, setStatus] = useState(fee?.status === 'paid' ? 'paid' : 'unpaid');
  const [amount, setAmount] = useState(fee?.amount ?? '');
  const [method, setMethod] = useState(fee?.method || 'cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    const amt = parseInt(amount, 10) || 0;
    if (status === 'paid' && amt < 1) {
      setError('Please enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        academy_id: academyId,
        student_id: student.id,
        sport,
        month: monthKey,
        status,
        amount: amt || null,
        method: status === 'paid' ? method : null,
        paid_date: status === 'paid' ? (fee?.paid_date || toIso(new Date())) : null,
        collected_by: appUser?.name || user?.email || '',
        msg_sent: fee?.msg_sent || [],
      };
      const { data, error: err } = await supabase
        .from('fees')
        .upsert(payload, { onConflict: 'student_id,sport,month' })
        .select()
        .single();
      if (err) throw err;
      onSaved(data);
    } catch (err) {
      setError(err.message || 'Failed to save');
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

        <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>{monthLabel} · {sport}</div>

        <div className="form-group">
          <label className="form-label">Payment Status</label>
          <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="paid">✅ Paid</option>
            <option value="unpaid">❌ Not Paid</option>
          </select>
        </div>

        {status === 'paid' && (
          <>
            <div className="form-group">
              <label className="form-label">Amount Paid ₹</label>
              <input type="number" min="1" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount" />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <select className="form-select" value={method} onChange={e => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>
          </>
        )}

        {fee?.collected_by && (
          <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 8 }}>Last saved by: {fee.collected_by}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn" style={{ flex: 1, background: 'var(--card2)' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FeesTab() {
  const { visibleStudents, visibleSports, academy } = useAcademyData();
  const { isAdmin, academyId } = useAuth();

  const today = new Date();
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'year'
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [year, setYear] = useState(today.getFullYear());
  const [sportFilter, setSportFilter] = useState('');
  const [statusTab, setStatusTab] = useState('unpaid'); // 'unpaid' | 'paid'
  const [search, setSearch] = useState('');
  const [showNoAttendance, setShowNoAttendance] = useState(false);

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
      const { data } = await supabase.from('attendance').select('student_id,status,date')
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
    fees.forEach(f => { m[`${f.student_id}|${f.sport}|${f.month}`] = f; });
    return m;
  }, [fees]);

  const sportScopedStudents = useMemo(() =>
    visibleStudents.filter(s => !sportFilter || s.sport === sportFilter),
    [visibleStudents, sportFilter]);

  const searchedStudents = useMemo(() => {
    if (!search.trim()) return sportScopedStudents;
    const q = search.trim().toLowerCase();
    return sportScopedStudents.filter(s => (s.name || '').toLowerCase().includes(q) || (s.roll_no || '').toLowerCase().includes(q));
  }, [sportScopedStudents, search]);

  // Builds the display rows for one month: eligible students (enrolled + attended),
  // each paired with their fee entry (or null if not yet recorded).
  function buildMonthRows(y, m) {
    const monthKey = `${y}-${pad(m)}`;
    const attByStudent = attendanceByStudentByMonth[monthKey] || {};
    const eligible = [];
    const noAttendance = [];
    searchedStudents.forEach(s => {
      const enrolledBy = !s.join_date || s.join_date <= toIso(new Date(y, m, 0));
      if (!enrolledBy) return;
      if (isEligible(s, y, m, attByStudent)) {
        eligible.push(s);
      } else {
        noAttendance.push(s);
      }
    });
    const rows = eligible.map(s => {
      const fee = feeMap[`${s.id}|${s.sport}|${monthKey}`] || null;
      return { student: s, fee, monthKey, paid: isPaidEntry(fee) };
    });
    return { monthKey, rows, noAttendance };
  }

  const periods = useMemo(() => {
    if (viewMode === 'month') return [buildMonthRows(year, month)];
    return Array.from({ length: 12 }, (_, i) => buildMonthRows(year, i + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, year, month, searchedStudents, attendanceByStudentByMonth, feeMap]);

  const allRows = useMemo(() => periods.flatMap(p => p.rows), [periods]);
  const paidRows = useMemo(() => allRows.filter(r => r.paid), [allRows]);
  const unpaidRows = useMemo(() => allRows.filter(r => !r.paid), [allRows]);
  const totalNoAttendance = useMemo(() => periods.reduce((s, p) => s + p.noAttendance.length, 0), [periods]);

  const totalCollected = useMemo(() => paidRows.reduce((s, r) => s + (Number(r.fee?.amount) || 0), 0), [paidRows]);
  const totalDue = unpaidRows.length; // count, not amount, since unpaid entries often have no set amount yet

  const activeRows = statusTab === 'paid' ? paidRows : unpaidRows;

  const monthLabelFor = (mk) => {
    const [y, m] = mk.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  };

  const openReminder = (row) => {
    const monthLabel = monthLabelFor(row.monthKey);
    const text = buildMsg(academy?.msg_template || DEFAULT_MSG, { name: row.student.name, month: monthLabel, academy: academy?.name });
    setSendModal({ student: row.student, month: monthLabel, kind: 'reminder', text });
  };
  const openThankYou = (row) => {
    const monthLabel = monthLabelFor(row.monthKey);
    const text = buildMsg(academy?.thank_template || DEFAULT_THANK, { name: row.student.name, month: monthLabel, academy: academy?.name, amount: row.fee?.amount, method: row.fee?.method || 'Cash' });
    setSendModal({ student: row.student, month: monthLabel, kind: 'paid', text });
  };
  const openEntry = (row) => {
    setEntryModal({ student: row.student, monthKey: row.monthKey, monthLabel: monthLabelFor(row.monthKey), sport: row.student.sport, fee: row.fee });
  };

  const exportRows = activeRows.map(r => ({
    Student: r.student.name, Roll: r.student.roll_no, Month: monthLabelFor(r.monthKey),
    Amount: r.fee?.amount || 0, Status: r.paid ? 'paid' : 'unpaid',
  }));

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>💰 Fees</div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button className="btn btn-gold btn-sm" onClick={() => exportGenericPdf('Fees Report', ['Student', 'Roll', 'Month', 'Amount', 'Status'], exportRows.map(Object.values), 'fees.pdf')}>PDF</button>
          <button className="btn btn-success btn-sm" onClick={() => exportGenericXlsx(exportRows, 'fees.xlsx', 'Fees')}>XL</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--gray)' }}>Collected</div>
          <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: 16 }}>₹{totalCollected.toLocaleString()}</div>
        </div>
        <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--gray)' }}>Unpaid</div>
          <div style={{ fontWeight: 800, color: 'var(--red)', fontSize: 16 }}>{totalDue}</div>
        </div>
      </div>

      {/* Period navigation: Month or Full Year */}
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

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {viewMode === 'month' && (
          <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((mLabel, i) => <option key={i} value={i + 1}>{mLabel}</option>)}
          </select>
        )}
        <select className="form-select" style={{ flex: viewMode === 'month' ? 1 : 2, fontSize: 12 }} value={year} onChange={e => setYear(Number(e.target.value))}>
          {Array.from({ length: 6 }, (_, i) => today.getFullYear() - 3 + i).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="🔍 Search name or roll no." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={sportFilter} onChange={e => setSportFilter(e.target.value)}>
          <option value="">All Sports</option>
          {visibleSports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </div>

      {/* Paid / Unpaid tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: statusTab === 'unpaid' ? 'var(--red)' : 'var(--card2)', color: statusTab === 'unpaid' ? '#fff' : 'var(--gray)' }}
          onClick={() => setStatusTab('unpaid')}
        >❌ Unpaid ({unpaidRows.length})</button>
        <button
          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: statusTab === 'paid' ? 'var(--green)' : 'var(--card2)', color: statusTab === 'paid' ? '#fff' : 'var(--gray)' }}
          onClick={() => setStatusTab('paid')}
        >✅ Paid ({paidRows.length})</button>
      </div>

      {totalNoAttendance > 0 && (
        <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 8, cursor: 'pointer' }} onClick={() => setShowNoAttendance(v => !v)}>
          ℹ️ {totalNoAttendance} student{totalNoAttendance > 1 ? 's' : ''} without attendance this period {showNoAttendance ? '(hide)' : '(show)'}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--gray)' }}>Loading…</div>}

        {!loading && activeRows.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--gray)' }}>
            {statusTab === 'paid' ? 'No paid students yet.' : 'No unpaid students 🎉'}
          </div>
        )}

        {!loading && viewMode === 'year' ? (
          periods.map(p => {
            const pRows = p.rows.filter(r => r.paid === (statusTab === 'paid'));
            if (pRows.length === 0) return null;
            return (
              <div key={p.monthKey}>
                <div style={{ padding: '6px 4px', fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{monthLabelFor(p.monthKey)}</div>
                {pRows.map(r => (
                  <FeeRow key={r.student.id + r.monthKey} row={r} isAdmin={isAdmin} onReminder={openReminder} onThankYou={openThankYou} onEdit={openEntry} />
                ))}
              </div>
            );
          })
        ) : (
          !loading && activeRows.map(r => (
            <FeeRow key={r.student.id + r.monthKey} row={r} isAdmin={isAdmin} onReminder={openReminder} onThankYou={openThankYou} onEdit={openEntry} />
          ))
        )}

        {!loading && showNoAttendance && totalNoAttendance > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ padding: '6px 4px', fontSize: 12, fontWeight: 700, color: 'var(--gray)' }}>No attendance this period</div>
            {periods.flatMap(p => p.noAttendance.map(s => (
              <div key={s.id + p.monthKey} className="card" style={{ padding: 10, marginBottom: 6, fontSize: 12, color: 'var(--gray)' }}>
                {s.name} — no attendance in {monthLabelFor(p.monthKey)}, not counted for fees
              </div>
            )))}
          </div>
        )}
      </div>

      {sendModal && (
        <SendMessageModal
          student={sendModal.student}
          month={sendModal.month}
          kind={sendModal.kind}
          initialText={sendModal.text}
          onClose={() => setSendModal(null)}
        />
      )}

      {entryModal && (
        <FeeEntryModal
          student={entryModal.student}
          monthKey={entryModal.monthKey}
          monthLabel={entryModal.monthLabel}
          sport={entryModal.sport}
          fee={entryModal.fee}
          onClose={() => setEntryModal(null)}
          onSaved={(updated) => {
            setFees(prev => {
              const idx = prev.findIndex(f => f.id === updated.id);
              if (idx === -1) return [...prev, updated];
              const next = [...prev];
              next[idx] = updated;
              return next;
            });
            setEntryModal(null);
          }}
        />
      )}
    </div>
  );
}

function FeeRow({ row, isAdmin, onReminder, onThankYou, onEdit }) {
  const { student, fee, paid } = row;
  const editable = canEditFee(fee, isAdmin);
  const btnLabel = paid && !editable ? '🔒 Paid' : (fee ? '✏️ Edit' : '💳 Pay');

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{student.name}</div>
        <div style={{ fontSize: 12, color: 'var(--gray)' }}>
          {fee?.amount ? `₹${fee.amount}` : '—'} · {student.batchLabel || student.sport}
          {fee?.method && <span> · {fee.method}</span>}
          {fee?.collected_by && <span style={{ color: 'var(--gold)' }}> · 👤 {fee.collected_by}</span>}
        </div>
      </div>
      <span className={'badge ' + (paid ? 'badge-green' : 'badge-red')} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10 }}>
        {paid ? 'paid' : 'unpaid'}
      </span>
      {paid ? (
        <button className="btn btn-xs btn-outline" onClick={() => onThankYou(row)}>🎉 Thank You</button>
      ) : (
        <button className="btn btn-xs btn-outline" onClick={() => onReminder(row)}>💬 Remind</button>
      )}
      <button className="btn btn-xs btn-primary" disabled={paid && !editable} style={{ opacity: paid && !editable ? 0.5 : 1 }} onClick={() => editable && onEdit(row)}>
        {btnLabel}
      </button>
    </div>
  );
}
