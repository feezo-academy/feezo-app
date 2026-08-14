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

// Staff can create a first-time entry and edit it freely while it's still unpaid.
// Once it's marked paid, only admin can revert it to unpaid or change the amount.
function canEditFee(fee, isAdmin) {
  if (isAdmin) return true;
  if (!fee) return true;
  return fee.status !== 'paid';
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

  const batchesForSport = useMemo(() =>
    visibleBatches.filter(b => !sportFilter || b.sport === sportFilter),
    [visibleBatches, sportFilter]);

  const sportScopedStudents = useMemo(() =>
    visibleStudents.filter(s => (!sportFilter || s.sport === sportFilter) && (!batchFilter || s.batch === batchFilter)),
    [visibleStudents, sportFilter, batchFilter]);

  const searchedStudents = useMemo(() => {
    if (!search.trim()) return sportScopedStudents;
    const q = search.trim().toLowerCase();
    return sportScopedStudents.filter(s => (s.name || '').toLowerCase().includes(q) || (s.roll_no || '').toLowerCase().includes(q));
  }, [sportScopedStudents, search]);

  // Builds the display rows for one month: eligible students (enrolled + attended),
  // each paired with their fee entry (or null if not yet recorded). Students with
  // zero attendance that month are tracked separately and only mixed into `rows`
  // when includeNoAttendance is checked.
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
    const toRow = (s) => {
      const fee = feeMap[`${s.id}|${s.sport}|${monthKey}`] || null;
      return { student: s, fee, monthKey, paid: isPaidEntry(fee) };
    };
    const rows = eligible.map(toRow).concat(includeNoAttendance ? noAttendance.map(toRow) : []);
    return { monthKey, rows, noAttendance };
  }

  const periods = useMemo(() => {
    if (viewMode === 'month') return [buildMonthRows(year, month)];
    return Array.from({ length: 12 }, (_, i) => buildMonthRows(year, i + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, year, month, searchedStudents, attendanceByStudentByMonth, feeMap, includeNoAttendance]);

  const allRows = useMemo(() => periods.flatMap(p => p.rows), [periods]);
  const paidRows = useMemo(() => allRows.filter(r => r.paid), [allRows]);
  const unpaidRows = useMemo(() => allRows.filter(r => !r.paid), [allRows]);
  const totalNoAttendance = useMemo(() => periods.reduce((s, p) => s + p.noAttendance.length, 0), [periods]);

  const activeRows = statusFilter === 'all' ? allRows : statusFilter === 'paid' ? paidRows : unpaidRows;

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
    setEntryModal({ student: row.student, monthKey: row.monthKey, monthLabel: monthLabelFor(row.monthKey), sport: row.student.sport, fee: row.fee });
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
      sport: row.student.sport,
      month: row.monthKey,
      status: existing?.status || 'unpaid',
      amount: existing?.amount ?? null,
      method: existing?.method ?? null,
      paid_date: existing?.paid_date ?? null,
      collected_by: existing?.collected_by ?? null,
      msg_sent: msgSent,
    };
    const { data, error } = await supabase
      .from('fees')
      .upsert(payload, { onConflict: 'student_id,sport,month' })
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

      {/* Filters dropdown: view mode, month, year, sport, batch */}
      <div className="card" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
        <button
          onClick={() => setFiltersOpen(v => !v)}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
        >
          <span>Filters — {viewMode === 'year' ? `Full Year ${year}` : `${MONTHS[month - 1]} ${year}`}{sportFilter ? ` · ${sportFilter}` : ''}{batchFilter ? ` · ${batchesForSport.find(b => b.name === batchFilter)?.batchLabel || ''}` : ''}</span>
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
                {batchesForSport.map(b => <option key={b.id} value={b.name}>{b.batchLabel}</option>)}
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
            {statusFilter === 'paid' ? 'No paid students yet.' : statusFilter === 'unpaid' ? 'No unpaid students 🎉' : 'No students to show.'}
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
  // A fee row can exist purely because a reminder was logged against it (see
  // recordMsgSent) — that shouldn't flip the button to "Edit". Only treat it
  // as a real entry once someone has actually saved payment info.
  const hasEntry = !!fee?.collected_by;
  const btnLabel = paid && !editable ? '🔒 Paid' : (hasEntry ? '✏️ Edit' : '💳 Pay');
  const reminderCount = (fee?.msg_sent || []).filter(m => m.kind === 'reminder').length;

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 10px', marginBottom: 8, flexWrap: 'nowrap', overflow: 'hidden' }}>
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{student.name}</div>
        <div style={{ fontSize: 10, color: 'var(--gray)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {student.batchLabel || student.sport}
          {fee?.method && <span> · {fee.method}</span>}
          {fee?.collected_by && <span style={{ color: 'var(--gold)' }}> · 👤 {fee.collected_by}</span>}
        </div>
      </div>
      <span className={'badge ' + (paid ? 'badge-green' : 'badge-red')} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
        {paid ? 'paid' : 'unpaid'}
      </span>
      {paid ? (
        <button className="btn btn-outline" title="Send thank-you" style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => onThankYou(row)}>🎉</button>
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
