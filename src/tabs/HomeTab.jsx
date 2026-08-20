import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import StatDrilldownModal from '../components/StatDrilldownModal';
import { useLoading } from '../components/LoadingContext';

function CustomTooltip({ active, payload, label, mode }) {
  if (!active || !payload || !payload.length) return null;
  const key1 = mode === 'attendance' ? 'present' : 'strength';
  const key2 = mode === 'attendance' ? 'absent' : 'dropped';
  const label1 = mode === 'attendance' ? 'Present' : 'Active';
  const label2 = mode === 'attendance' ? 'Absent' : 'Dropped';
  const p1 = payload.find(p => p.dataKey === key1);
  const p2 = payload.find(p => p.dataKey === key2);
  if (!p1 && !p2) return null;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', fontSize: 12, boxShadow: 'var(--shadow)' }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>Day {label}</div>
      {p1 && <div><span style={{ color: p1.color }}>●</span> {label1}: {p1.value}</div>}
      {p2 && <div><span style={{ color: p2.color }}>●</span> {label2}: {p2.value}</div>}
    </div>
  );
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const pad2 = (n) => String(n).padStart(2, '0');
const toIsoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Trimmed + lowercased comparison so a stray space or casing difference
// between a sport/batch on a student's enrollment and the one stored on an
// attendance/fee row doesn't cause a silent mismatch — matches norm() in
// AttendanceTab.jsx and FeesTab.jsx exactly, kept in sync deliberately.
const norm = (v) => (v || '').toString().trim().toLowerCase();
// Composite key per enrollment (student + sport + batch) — same pattern as
// AttendanceTab/FeesTab, so a student with two enrollments (same or
// different sport) is tracked as two independent rows, never merged.
const keyFor = (studentId, sport, batchLabel) => `${studentId}::${norm(sport)}::${norm(batchLabel)}`;

// Returns 'unpaid' | 'partial' | 'paid' — identical logic to feeStatus() in
// FeesTab.jsx, kept in sync deliberately so Home's numbers always agree with
// the Fees tab. A scholarship row is always fully settled regardless of the
// amount fields.
function feeStatus(fee) {
  if (!fee) return 'unpaid';
  if (fee.is_scholarship) return 'paid';
  const due = parseInt(fee.amount_due, 10);
  const paid = parseInt(fee.amount, 10) || 0;
  if (!due || isNaN(due)) return (fee.status === 'paid' && paid > 0) ? 'paid' : 'unpaid';
  if (paid <= 0) return 'unpaid';
  if (paid >= due) return 'paid';
  return 'partial';
}

// A student owes fees for a given *enrollment* (sport + batch) for a given
// month only if they were enrolled on/before that month AND have at least
// one Present attendance record for that specific sport+batch in it —
// matches isEligible() in FeesTab.jsx exactly (sport/batch scoped, not just
// "any Present record anywhere").
function isEligible(student, year, month, attendanceByStudent, sport, batchLabel) {
  if (student.join_date) {
    const checkEnd = toIsoDate(new Date(year, month, 0)); // last day of month
    if (student.join_date > checkEnd) return false;
  }
  const rows = attendanceByStudent[student.id];
  return !!(rows && rows.some(r =>
    r.status === 'P' &&
    (!sport || norm(r.sport) === norm(sport)) &&
    (!batchLabel || norm(r.batch) === norm(batchLabel))
  ));
}

export default function HomeTab() {
  const { visibleStudents, visibleSports, visibleBatches } = useAcademyData();
  const { academyId, isAdmin } = useAuth();
  const { showLoader, hideLoader } = useLoading();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [sportFilter, setSportFilter] = useState('ALL');
  const [batchFilter, setBatchFilter] = useState('ALL');
  const [fees, setFees] = useState([]);
  const [allAttendance, setAllAttendance] = useState([]);
  const [chartMode, setChartMode] = useState('attendance'); // 'attendance' | 'strength'
  const [drilldown, setDrilldown] = useState(null);

  // Date range for the selected month: 1st -> today (if current month) or end of month (past months)
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const isFutureMonth = new Date(year, month, 1) > today;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const endDay = isFutureMonth ? 0 : isCurrentMonth ? today.getDate() : daysInMonth;
  const dateRange = Array.from({ length: endDay }, (_, i) => {
    const d = i + 1;
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });

  // Fees + attendance fetched together under one loader so the ring shows
  // once and hides once, instead of flickering twice for two separate calls.
  // Attendance is fetched per academy (not scoped to the browsed month) so
  // Fee Pending can look back across every past month, same as FeesTab.
  // IMPORTANT: sport + batch are fetched too — without them there's no way
  // to scope attendance/eligibility to a specific enrollment, which was
  // causing multi-sport students' records to bleed across sport filters.
  useEffect(() => {
    (async () => {
      if (!academyId) { setFees([]); setAllAttendance([]); return; }
      showLoader('Loading dashboard...');
      try {
        const [feesRes, attendanceRes] = await Promise.all([
          supabase.from('fees').select('*').eq('academy_id', academyId),
          supabase.from('attendance').select('date,status,student_id,sport,batch').eq('academy_id', academyId),
        ]);
        setFees(feesRes.data || []);
        setAllAttendance(attendanceRes.data || []);
      } finally {
        hideLoader();
      }
    })();
  }, [academyId]);

  // Flatten each student's enrollments into one row per sport+batch — same
  // pattern as AttendanceTab/FeesTab — so a student in two sports/batches is
  // tracked as two independent, filterable rows instead of being collapsed
  // into whichever single sport happens to sit on the student record.
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

  const filteredEnrollmentRows = useMemo(() => enrollmentRows.filter(r =>
    (sportFilter === 'ALL' || norm(r.sport) === norm(sportFilter)) &&
    (batchFilter === 'ALL' || norm(r.batchLabel) === norm(batchFilter))
  ), [enrollmentRows, sportFilter, batchFilter]);

  // The set of composite keys currently in view — used to scope attendance
  // rows and fee rows to exactly the enrollments matching the sport/batch
  // filters, instead of "any row belonging to this student_id".
  const enrollmentKeySet = useMemo(() =>
    new Set(filteredEnrollmentRows.map(r => r.key)),
    [filteredEnrollmentRows]);

  // Unique students behind the filtered enrollments — used for headcount
  // tiles (Total Students, Joined) which are per-person, not per-enrollment.
  const students = useMemo(() => {
    const seen = new Map();
    filteredEnrollmentRows.forEach(r => { if (!seen.has(r.student.id)) seen.set(r.student.id, r.student); });
    return Array.from(seen.values());
  }, [filteredEnrollmentRows]);

  const studentsById = useMemo(() => {
    const m = {}; students.forEach(s => { m[s.id] = s; }); return m;
  }, [students]);

  // Chart series: attendance (present/absent per day) and strength (active/dropped headcount per day).
  // Attendance rows are matched against enrollmentKeySet (student+sport+batch),
  // not just student_id, so a filtered sport only counts that sport's marks.
  const chartData = useMemo(() => dateRange.map(dateStr => {
    const day = parseInt(dateStr.slice(-2), 10);
    const dayRows = allAttendance.filter(a =>
      a.date === dateStr && enrollmentKeySet.has(keyFor(a.student_id, a.sport, a.batch)));
    const present = dayRows.filter(a => a.status === 'P').length;
    const absent = dayRows.filter(a => a.status === 'A').length;
    const strength = students.filter(s => {
      if (s.join_date && s.join_date > dateStr) return false; // only exclude if they join in the future
      if (s.banned && (!s.banned_on || s.banned_on.slice(0, 10) <= dateStr)) return false;
      return true;
    }).length;
    const dropped = students.filter(s => {
      return s.banned && s.banned_on && s.banned_on.slice(0, 10) <= dateStr;
    }).length;
    return { day, dateStr, present, absent, strength, dropped };
  }), [dateRange, allAttendance, enrollmentKeySet, students]);

  // Tiles scoped to the same month/sport/batch filters
  // Reference date for "active": today if viewing the current month, else the
  // last day of the selected month (so past months show that month's headcount).
  const refDateStr = isCurrentMonth
    ? todayIso()
    : `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const activeStudents = students.filter(s => {
    if (s.join_date && s.join_date > refDateStr) return false;
    if (s.banned && (!s.banned_on || s.banned_on.slice(0, 10) <= refDateStr)) return false;
    return true;
  });
  const currentStrength = activeStudents.length;

  const joinedStudents = activeStudents.filter(s => {
    const j = s.join_date ? new Date(s.join_date) : null;
    return j && j.getMonth() === month && j.getFullYear() === year;
  });

  // Fees scoped to the selected month where possible; f.month is free-text so
  // we match it loosely against a few common formats used when fees were logged.
  const monthLabelShort = new Date(year, month, 1).toLocaleDateString([], { month: 'short', year: 'numeric' });
  const monthLabelLong = new Date(year, month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const monthIso = `${year}-${String(month + 1).padStart(2, '0')}`;
  const feeMatchesMonth = (f) => {
    if (!f.month) return false;
    const m = String(f.month).toLowerCase();
    return m.includes(monthLabelShort.toLowerCase()) || m.includes(monthLabelLong.toLowerCase()) || m.includes(monthIso);
  };
  // Scoped to the enrollments currently in view (student+sport+batch), not
  // just student_id — so a fee for a sport you've filtered out doesn't leak in.
  const scopedFeesAll = fees.filter(f => enrollmentKeySet.has(keyFor(f.student_id, f.sport, f.batch_label)));
  const scopedFeesMonth = scopedFeesAll.filter(feeMatchesMonth);
  const scopedFees = scopedFeesMonth.length > 0 ? scopedFeesMonth : scopedFeesAll; // fall back if month text doesn't match anything

  // Fees Collected now counts any real money actually received — both fully
  // paid AND partially paid entries — not just entries at 'paid' status.
  // Scholarships are excluded here since no real payment was collected for
  // them (see feeStatus()), even though they count as "settled" elsewhere.
  const collectedFees = scopedFees.filter(f => !f.is_scholarship && (parseInt(f.amount, 10) || 0) > 0);
  const collected = collectedFees.reduce((s, f) => s + (parseInt(f.amount, 10) || 0), 0);

  // --- Fee Pending: active students only, dues strictly BEFORE the browsed
  // month (e.g. browsing July shows dues through June).
  //
  // Fee rows are only ever created once a payment is actually recorded — an
  // unpaid month has NO row in `fees` at all. So "pending" can't be read off
  // existing unpaid rows; it has to be derived the same way FeesTab.jsx
  // derives eligibility: enrolled by that month + at least one Present
  // attendance record that specific sport+batch that month, and no fully
  // paid fee row. A PARTIALLY paid entry still counts as pending — it stays
  // in this list until feeStatus() reports 'paid'. ---
  let cutM = month - 1, cutY = year;
  if (cutM < 0) { cutM = 11; cutY--; }
  const cutoffKey = `${cutY}-${String(cutM + 1).padStart(2, '0')}`;
  const cutoffLabel = new Date(cutY, cutM, 1).toLocaleDateString([], { month: 'short', year: 'numeric' });

  // { 'YYYY-MM': { studentId: [attendance rows] } } — scoped to the students
  // currently in view (sport/batch filters); each row still carries its own
  // sport/batch so isEligible() can match per-enrollment.
  const attendanceByStudentByMonth = useMemo(() => {
    const out = {};
    const studentIds = new Set(students.map(s => s.id));
    allAttendance.forEach(r => {
      if (!studentIds.has(r.student_id)) return;
      const mk = r.date.slice(0, 7);
      if (!out[mk]) out[mk] = {};
      if (!out[mk][r.student_id]) out[mk][r.student_id] = [];
      out[mk][r.student_id].push(r);
    });
    return out;
  }, [allAttendance, students]);

  // Keyed by student + sport + batch + month, matching FeesTab's onConflict
  // columns exactly (student_id,sport,batch_label,month) with norm()'d
  // sport/batch so casing/whitespace drift never breaks the lookup.
  const feeMap = useMemo(() => {
    const m = {};
    fees.forEach(f => { m[`${f.student_id}|${norm(f.sport)}|${norm(f.batch_label)}|${f.month}`] = f; });
    return m;
  }, [fees]);

  const pendingFeeRows = useMemo(() => {
    const rows = [];
    Object.keys(attendanceByStudentByMonth)
      .filter(mk => mk <= cutoffKey)
      .sort()
      .forEach(mk => {
        const [yy, mm] = mk.split('-').map(Number);
        const attByStudent = attendanceByStudentByMonth[mk];
        const monthShort = new Date(yy, mm - 1, 1).toLocaleDateString([], { month: 'short' });
        filteredEnrollmentRows.forEach(r => {
          const s = r.student;
          if (!activeStudents.some(a => a.id === s.id)) return;
          if (!isEligible(s, yy, mm, attByStudent, r.sport, r.batchLabel)) return;
          const fee = feeMap[`${s.id}|${norm(r.sport)}|${norm(r.batchLabel)}|${mk}`] || null;
          const st = feeStatus(fee);
          if (st === 'paid') return; // fully settled (incl. scholarship) — not pending
          const due = fee?.amount_due ? parseInt(fee.amount_due, 10) : null;
          const paidSoFar = fee?.amount ? parseInt(fee.amount, 10) : 0;
          const remaining = due != null ? Math.max(due - paidSoFar, 0) : null;
          rows.push({
            id: `${s.id}|${r.sport}|${r.batchLabel}|${mk}`,
            name: s.name, contact: s.contact || '',
            sport: r.sport, batchLabel: r.batchLabel,
            monthKey: mk, monthShort,
            partial: st === 'partial', due, paidSoFar, remaining,
          });
        });
      });
    return rows;
  }, [attendanceByStudentByMonth, filteredEnrollmentRows, activeStudents, feeMap, cutoffKey]);

  const pending = pendingFeeRows.length;

  const feeStudentList = (feeRows) => {
    const seen = new Map();
    feeRows.forEach(f => {
      const s = studentsById[f.student_id];
      if (!s) return;
      const st = feeStatus(f);
      const extraLabel = st === 'partial' ? `₹${f.amount}/₹${f.amount_due} (partial)` : `₹${f.amount}${f.month ? ' · ' + f.month : ''}`;
      const seenKey = `${s.id}|${f.sport}|${f.batch_label}|${f.month}`;
      if (!seen.has(seenKey)) {
        // Override sport/batchLabel with THIS entry's own values — s.sport/
        // s.batchLabel are just the student's primary enrollment and would
        // show the wrong sport for a student who paid across two sports.
        seen.set(seenKey, { ...s, id: seenKey, sport: f.sport, batchLabel: f.batch_label, extra: extraLabel });
      }
    });
    return Array.from(seen.values());
  };

  // Pending rows already carry a per-row amount summary — a `partial` flag
  // plus due/paidSoFar/remaining — so StatDrilldownModal's row renderer can
  // show "₹X/₹Y left ₹Z" for partially paid entries if it chooses to.

  const monthLabel = monthLabelShort;
  const nav = (unit, dir) => {
    if (unit === 'month') {
      let m = month + dir, y = year;
      if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
      setMonth(m); setYear(y);
    } else {
      setYear(y => y + dir);
    }
  };

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <div style={{ marginBottom: 14 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>Dashboard</div>
        <div className="my-nav">
          <button className="my-nav-btn yr" onClick={() => nav('year', -1)} title="Previous Year">&lt;&lt;</button>
          <button className="my-nav-btn" onClick={() => nav('month', -1)} title="Previous Month">&lt;</button>
          <div className="my-nav-label">{monthLabel}</div>
          <button className="my-nav-btn" onClick={() => nav('month', 1)} title="Next Month">&gt;</button>
          <button className="my-nav-btn yr" onClick={() => nav('year', 1)} title="Next Year">&gt;&gt;</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <select className="form-select" style={{ flex: 1, fontSize: 12, padding: '7px 9px' }}
            value={sportFilter} onChange={e => { setSportFilter(e.target.value); setBatchFilter('ALL'); }}>
            <option value="ALL">All Sports</option>
            {visibleSports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <select className="form-select" style={{ flex: 1, fontSize: 12, padding: '7px 9px' }}
            value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
            <option value="ALL">All Batches</option>
            {visibleBatches.filter(b => sportFilter === 'ALL' || b.sport === sportFilter).map(b => (
              <option key={b.id} value={b.batchLabel}>{b.batchLabel}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="stats-grid" style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {[
          { key: 'total', color: 'stat-blue', icon: '👥', label: 'Total Students', value: currentStrength, caption: '',
            onClick: () => setDrilldown({ title: 'Active Students', icon: '👥', students: activeStudents }) },
          { key: 'joined', color: 'stat-orange', icon: '🆕', label: 'Joined', value: joinedStudents.length, caption: '',
            onClick: () => setDrilldown({ title: 'Joined This Month', icon: '🆕', students: joinedStudents }) },
          // Fees Collected is admin-only — staff should not see money totals.
          ...(isAdmin ? [
            { key: 'collected', color: 'stat-green', icon: '✅', label: 'Fees Collected', value: `₹${collected.toLocaleString()}`, caption: 'Incl. partial payments',
              onClick: () => setDrilldown({ title: 'Fees Collected', icon: '✅', students: feeStudentList(collectedFees) }) },
          ] : []),
          { key: 'pending', color: 'stat-red', icon: '⚠️', label: 'Fee Pending', value: pending, caption: `Dues through ${cutoffLabel}`,
            onClick: () => setDrilldown({ title: `Fee Pending (through ${cutoffLabel})`, icon: '⚠️', rows: pendingFeeRows }) },
        ].map(tile => (
          <div
            key={tile.key}
            className={`stat-card grad ${tile.color}`}
            style={{
              cursor: 'pointer', height: 86, boxSizing: 'border-box', padding: '9px 11px',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden',
            }}
            onClick={tile.onClick}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, lineHeight: 1 }}>{tile.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tile.label}
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>
              {tile.value}
            </div>
            <div style={{ fontSize: 9, opacity: 0.85, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tile.caption || '\u00A0'}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 10, padding: '12px 12px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>
            {chartMode === 'attendance' ? 'Attendance' : 'Strength'} · <span style={{ color: 'var(--gray)', fontWeight: 600 }}>{monthLabel}</span>
          </div>
          <div style={{ display: 'flex', gap: 2, background: 'var(--royal)', borderRadius: 8, padding: 2 }}>
            {['attendance', 'strength'].map(m => (
              <button key={m} onClick={() => setChartMode(m)}
                style={{
                  border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11.5, fontWeight: 700,
                  cursor: 'pointer', textTransform: 'capitalize',
                  background: chartMode === m ? 'var(--accent2)' : 'transparent',
                  color: chartMode === m ? '#fff' : 'var(--gray)',
                  transition: 'all .15s ease',
                }}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--gray)', padding: '30px 0', fontSize: 13 }}>No data yet for this month.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" fontSize={10.5} stroke="var(--gray)" tickLine={false} axisLine={false}
                  interval={chartData.length > 15 ? 2 : 0} />
                <YAxis fontSize={10.5} stroke="var(--gray)" allowDecimals={false} tickLine={false} axisLine={false} width={26} />
                <Tooltip content={<CustomTooltip mode={chartMode} />} />
                {chartMode === 'attendance' ? (
                  <>
                    <Line type="monotone" dataKey="present" stroke="#4caf8e" strokeWidth={2.5} dot={{ r: 3, fill: '#4caf8e' }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="absent" stroke="#e06b6b" strokeWidth={2.5} dot={{ r: 3, fill: '#e06b6b' }} activeDot={{ r: 5 }} />
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey="strength" stroke="#5b7cc4" strokeWidth={2.5} dot={{ r: 3, fill: '#5b7cc4' }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="dropped" stroke="#e0a04a" strokeWidth={2.5} dot={{ r: 3, fill: '#e0a04a' }} activeDot={{ r: 5 }} />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 6, paddingBottom: 4 }}>
              {chartMode === 'attendance' ? (
                <>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray)' }}><span style={{ color: '#4caf8e' }}>●</span> Present</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray)' }}><span style={{ color: '#e06b6b' }}>●</span> Absent</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray)' }}><span style={{ color: '#5b7cc4' }}>●</span> Active</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray)' }}><span style={{ color: '#e0a04a' }}>●</span> Dropped</span>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {drilldown && (
        <StatDrilldownModal
          title={drilldown.title}
          icon={drilldown.icon}
          students={drilldown.students || []}
          rows={drilldown.rows}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
