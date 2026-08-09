import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { supabase } from '../lib/supabaseClient';

export default function PerformancePage() {
  const { academyId } = useAuth();
  const { visibleStudents } = useAcademyData();
  const [classLog, setClassLog] = useState([]);

  useEffect(() => {
    (async () => {
      if (!academyId) return;
      const { data } = await supabase.from('class_log').select('*').eq('academy_id', academyId);
      setClassLog(data || []);
    })();
  }, [academyId]);

  const leaderboard = useMemo(() => {
    const counts = {};
    classLog.forEach(l => { counts[l.student_id] = (counts[l.student_id] || 0) + 1; });
    return Object.entries(counts)
      .map(([id, count]) => ({ student: visibleStudents.find(s => s.id === id), count }))
      .filter(r => r.student)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [classLog, visibleStudents]);

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <Link to="/profile" style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 10, display: 'inline-block' }}>← Back to Profile</Link>
      <div className="section-title" style={{ marginBottom: 10 }}>🏆 Performance Leaderboard</div>
      <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>Ranked by classes logged</div>

      {leaderboard.map((r, i) => (
        <div key={r.student.id} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? 'var(--gold)' : 'var(--card2)', color: i < 3 ? '#fff' : 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
            {i + 1}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{r.student.name}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>{r.student.sport} · {r.student.batch}</div>
          </div>
          <div style={{ fontWeight: 700, color: 'var(--accent2)' }}>{r.count} classes</div>
        </div>
      ))}
      {leaderboard.length === 0 && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No class log data yet.</div>}
    </div>
  );
}
