import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import StatDrilldownModal from '../components/StatDrilldownModal';

function CustomTooltip({ active, payload, label, mode }) {
  if (!active || !payload || !payload.length) return null;
  const primary = mode === 'attendance' ? payload.find(p => p.dataKey === 'present') : payload.find(p => p.dataKey === 'strength');
  if (!primary) return null;
  const dotColor = primary.color;
  const primaryLabel = mode === 'attendance' ? 'Present' : 'Active';
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', fontSize: 12, boxShadow: 'var(--shadow)' }}>
      <span style={{ color: dotColor }}>●</span> <strong>{primaryLabel}: {primary.value}</strong> (Day {label})
    </div>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function HomeTab() {
  const { visibleStudents, visibleSports, visibleBatches } = useAcademyData();
  const { academyId } = useAuth();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [sportFilter, setSportFilter] = useState('ALL');
  const [batchFilter, setBatchFilter] = useState('ALL');
  const [fees, setFees] = useState([]);
  const [attRows, setAttRows] = useState([]);
  const [chartMode, setChartMode] = useState('attendance'); // 'attendance' | 'strength'
  const [drilldown, setDrilldown] = useState(null);

  // Date range for the selected month: 1st -> today (if current month) or end of month (past months)
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const isFutureMonth = new Date(year, month, 1) > today;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const endDay = isFutureMonth ? 0 : isCurrentMonth ? today.getDate() : daysInMonth;
  const dateRange = Array.from({ length: endDay }, (_, i) => {
    const d = new Date(year, month, i + 1);
    return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    (async () => {
      if (!academyId) return;
      const { data: feeData } = await supabase.from('fees').select('*').eq('academy_id', academyId);
      setFees(feeData || []);
    })();
  }, [academyId]);

  useEffect(() => {
    (async () => {
      if (!academyId || dateRange.length === 0) { setAttRows([]); return; }
      const { data } = await supabase.from('attendance').select('date,status,student_id')
        .eq('academy_id', academyId)
        .gte('date', dateRange[0]).lte('date', dateRange[dateRange.length - 1]);
      setAttRows(data || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academyId, month, year]);

  const students = useMemo(() => visibleStudents.filter(s =>
    (sportFilter === 'ALL' || s.sport === sportFilter) && (batchFilter === 'ALL' || s.batch === batchFilter)
  ), [visibleStudents, sportFilter, batchFilter]);

  const studentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);
  const studentsById = useMemo(() => {
    const m = {}; students.forEach(s => { m[s.id] = s; }); return m;
  }, [students]);

  // Chart series: attendance (present/absent per day) and strength (active/dropped headcount per day)
  const chartData = useMemo(() => dateRange.map(dateStr => {
    const day = parseInt(dateStr.slice(-2), 10);
    const dayRows = attRows.filter(a => a.date === dateStr && studentIds.has(a.student_id));
    const present = dayRows.filter(a => a.status === 'present').length;
    const absent = dayRows.filter(a => a.status === 'absent').length;
    const strength = students.filter(s => {
      if (s.join_date && s.join_date > dateStr) return false; // only exclude if they join in the future
      if (s.banned && (!s.banned_on || s.banned_on.slice(0, 10) <= dateStr)) return false;
      return true;
    }).length;
    const dropped = students.filter(s => {
      return s.banned && s.banned_on && s.banned_on.slice(0, 10) <= dateStr;
    }).length;
    return { day, dateStr, present, absent, strength, dropped };
  }), [dateRange, attRows, studentIds, students]);

  // Tiles scoped to the same month/sport/batch filters
  const currentStrength = chartData.length ? chartData[chartData.length - 1].strength : students.length;

  const joinedStudents = students.filter(s => {
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
  const scopedFeesAll = fees.filter(f => studentIds.has(f.student_id));
  const scopedFeesMonth = scopedFeesAll.filter(feeMatchesMonth);
  const scopedFees = scopedFeesMonth.length > 0 ? scopedFeesMonth : scopedFeesAll; // fall back if month text doesn't match anything

  const collectedFees = scopedFees.filter(f => f.status === 'paid');
  const pendingFees = scopedFees.filter(f => f.status !== 'paid');
  const collected = collectedFees.reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const pending = pendingFees.length;

  const feeStudentList = (feeRows) => {
    const seen = new Map();
    feeRows.forEach(f => {
      const s = studentsById[f.student_id];
      if (!s) return;
      if (!seen.has(s.id)) seen.set(s.id, { ...s, extra: `₹${f.amount}${f.month ? ' · ' + f.month : ''}` });
    });
    return Array.from(seen.values());
  };

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
        <div className="section-title" style={{ marginBottom: 10 }}>📈 Dashboard</div>
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
              <option key={b.id} value={b.name}>{b.batchLabel}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="stats-grid" style={{ flexShrink: 0 }}>
        <div className="stat-card grad stat-blue" style={{ cursor: 'pointer' }}
          onClick={() => setDrilldown({ title: 'Active Students', icon: '👥', students })}>
          <div className="stat-icon">👥</div>
          <div className="stat-label">Total Students</div>
          <div className="stat-val">{currentStrength}</div>
        </div>
        <div className="stat-card grad stat-orange" style={{ cursor: 'pointer' }}
          onClick={() => setDrilldown({ title: 'Joined This Month', icon: '🆕', students: joinedStudents })}>
          <div className="stat-icon">🆕</div>
          <div className="stat-label">Joined</div>
          <div className="stat-val">{joinedStudents.length}</div>
        </div>
        <div className="stat-card grad stat-green" style={{ cursor: 'pointer' }}
          onClick={() => setDrilldown({ title: 'Fees Collected', icon: '✅', students: feeStudentList(collectedFees) })}>
          <div className="stat-icon">✅</div>
          <div className="stat-label">Fees Collected</div>
          <div className="stat-val" style={{ fontSize: 16 }}>₹{collected.toLocaleString()}</div>
        </div>
        <div className="stat-card grad stat-red" style={{ cursor: 'pointer' }}
          onClick={() => setDrilldown({ title: 'Fee Pending', icon: '⚠️', students: feeStudentList(pendingFees) })}>
          <div className="stat-icon">⚠️</div>
          <div className="stat-label">Fee Pending</div>
          <div className="stat-val">{pending}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 10, padding: '12px 12px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>
            {chartMode === 'attendance' ? '📊 Attendance' : '📈 Strength'} · <span style={{ color: 'var(--gray)', fontWeight: 600 }}>{monthLabel}</span>
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
          students={drilldown.students}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
