import { useEffect, useMemo, useState } from 'react';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AttendanceTab() {
  const { visibleStudents, visibleSports, visibleBatches } = useAcademyData();
  const { isAdmin, academyId } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [sportFilter, setSportFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [records, setRecords] = useState({}); // student_id -> status
  const [saving, setSaving] = useState(false);

  const students = useMemo(() => visibleStudents.filter(s =>
    (!sportFilter || s.sport === sportFilter) && (!batchFilter || s.batch === batchFilter)
  ), [visibleStudents, sportFilter, batchFilter]);

  useEffect(() => {
    (async () => {
      if (!academyId) return;
      const { data } = await supabase.from('attendance').select('*')
        .eq('academy_id', academyId).eq('date', date);
      const map = {};
      (data || []).forEach(r => { map[r.student_id] = r.status; });
      setRecords(map);
    })();
  }, [academyId, date]);

  const setStatus = (studentId, status) => {
    setRecords(prev => ({ ...prev, [studentId]: status }));
  };

  const saveAll = async () => {
    setSaving(true);
    const rows = students.map(s => ({
      academy_id: academyId, student_id: s.id, date, status: records[s.id] || 'absent', sport: s.sport,
    }));
    await supabase.from('attendance').upsert(rows, { onConflict: 'academy_id,student_id,date' });
    setSaving(false);
  };

  const presentCount = students.filter(s => records[s.id] === 'present').length;

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="section-title" style={{ marginBottom: 10 }}>🗓️ Attendance</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <input type="date" className="form-input" style={{ flex: 1, minWidth: 130, fontSize: 12 }}
          value={date} onChange={e => setDate(e.target.value)} />
        <select className="form-select" style={{ flex: 1, minWidth: 110, fontSize: 12 }}
          value={sportFilter} onChange={e => { setSportFilter(e.target.value); setBatchFilter(''); }}>
          <option value="">All Sports</option>
          {visibleSports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select className="form-select" style={{ flex: 1, minWidth: 110, fontSize: 12 }}
          value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
          <option value="">All Batches</option>
          {visibleBatches.filter(b => !sportFilter || b.sport === sportFilter).map(b => (
            <option key={b.id} value={b.name}>{b.batchLabel}</option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 8 }}>
        {presentCount} / {students.length} present
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
        {students.map(s => {
          const status = records[s.id] || 'absent';
          return (
            <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>#{s.roll_no} · {s.batchLabel}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['present', 'absent', 'leave'].map(opt => (
                  <button key={opt}
                    className={'btn btn-xs ' + (status === opt ? 'btn-primary' : 'btn-outline')}
                    style={{ fontSize: 11, textTransform: 'capitalize' }}
                    onClick={() => setStatus(s.id, opt)}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <button className="btn btn-primary" style={{ position: 'fixed', bottom: 90, right: 16, zIndex: 50 }}
          onClick={saveAll} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save Attendance'}
        </button>
      )}
    </div>
  );
}
