import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function HomeTab() {
  const { visibleStudents, visibleSports, visibleBatches } = useAcademyData();
  const { academyId } = useAuth();
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [sportFilter, setSportFilter] = useState('ALL');
  const [batchFilter, setBatchFilter] = useState('ALL');
  const [fees, setFees] = useState([]);
  const [attWeek, setAttWeek] = useState([]);

  useEffect(() => {
    (async () => {
      if (!academyId) return;
      const { data: feeData } = await supabase.from('fees').select('*').eq('academy_id', academyId);
      setFees(feeData || []);

      // last 7 days attendance counts, for the bar chart
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        return d.toISOString().slice(0, 10);
      });
      const { data: attData } = await supabase.from('attendance').select('date,status')
        .eq('academy_id', academyId).in('date', days);
      const chart = days.map(d => ({
        day: d.slice(5),
        present: (attData || []).filter(a => a.date === d && a.status === 'present').length,
        absent: (attData || []).filter(a => a.date === d && a.status === 'absent').length,
      }));
      setAttWeek(chart);
    })();
  }, [academyId]);

  const students = useMemo(() => visibleStudents.filter(s =>
    (sportFilter === 'ALL' || s.sport === sportFilter) && (batchFilter === 'ALL' || s.batch === batchFilter)
  ), [visibleStudents, sportFilter, batchFilter]);

  const studentIds = new Set(students.map(s => s.id));
  const scopedFees = fees.filter(f => studentIds.has(f.student_id));
  const collected = scopedFees.filter(f => f.status === 'paid').reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const pending = scopedFees.filter(f => f.status !== 'paid').length;

  const monthLabel = new Date(year, month, 1).toLocaleDateString([], { month: 'short', year: 'numeric' });
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
      <div style={{ marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 8 }}>📈 Dashboard</div>
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
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="stats-grid" style={{ flexShrink: 0 }}>
        <div className="stat-card grad stat-blue">
          <div className="stat-icon">👥</div>
          <div className="stat-label">Total Students</div>
          <div className="stat-val">{students.length}</div>
        </div>
        <div className="stat-card grad stat-orange">
          <div className="stat-icon">🆕</div>
          <div className="stat-label">Joined</div>
          <div className="stat-val">{students.filter(s => {
            const j = s.joined_date ? new Date(s.joined_date) : null;
            return j && j.getMonth() === month && j.getFullYear() === year;
          }).length}</div>
        </div>
        <div className="stat-card grad stat-green">
          <div className="stat-icon">✅</div>
          <div className="stat-label">Fees Collected</div>
          <div className="stat-val" style={{ fontSize: 16 }}>₹{collected.toLocaleString()}</div>
        </div>
        <div className="stat-card grad stat-red">
          <div className="stat-icon">⚠️</div>
          <div className="stat-label">Fee Pending</div>
          <div className="stat-val">{pending}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 10, padding: '10px 10px 8px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>📊 Attendance (last 7 days)</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={attWeek}>
            <XAxis dataKey="day" fontSize={10} />
            <YAxis fontSize={10} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="present" fill="#4caf8e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="absent" fill="#e06b6b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
