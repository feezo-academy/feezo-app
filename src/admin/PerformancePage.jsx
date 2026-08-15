import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { supabase } from '../lib/supabaseClient';
import ProgramManagerModal from './ProgramManagerModal';
import AwardPointsModal from './AwardPointsModal';

const PRESENT_STATUS = 'P'; // adjust here if attendance uses a different code for "present"

function todayIso() { return new Date().toISOString().slice(0, 10); }
function monthStartIso() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

export default function PerformancePage() {
  const { academyId, isAdmin, user, appUser } = useAuth();
  const { visibleStudents, visibleSports, visibleBatches } = useAcademyData();

  const [attendance, setAttendance] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [points, setPoints] = useState([]);
  const [settings, setSettings] = useState({ attendance_weight: 50 });
  const [loading, setLoading] = useState(false);

  const [dateFrom, setDateFrom] = useState(monthStartIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [search, setSearch] = useState('');
  const [selectedSports, setSelectedSports] = useState(new Set());
  const [selectedBatches, setSelectedBatches] = useState(new Set());
  const [sortDir, setSortDir] = useState('desc'); // 'desc' = high to low
  const [openFilter, setOpenFilter] = useState(null); // 'sport' | 'batch' | null

  const [showProgramManager, setShowProgramManager] = useState(false);
  const [awardFor, setAwardFor] = useState(null); // row currently awarding points for

  // default: all sports/batches selected once loaded
  useEffect(() => {
    if (visibleSports.length && selectedSports.size === 0) {
      setSelectedSports(new Set(visibleSports.map(s => s.name)));
    }
  }, [visibleSports]); // eslint-disable-line
  useEffect(() => {
    if (visibleBatches.length && selectedBatches.size === 0) {
      setSelectedBatches(new Set(visibleBatches.map(b => b.name)));
    }
  }, [visibleBatches]); // eslint-disable-line

  const load = async () => {
    if (!academyId) return;
    setLoading(true);
    const [att, prog, chal, pts, set] = await Promise.all([
      supabase.from('attendance').select('student_id, sport, status, date').eq('academy_id', academyId).gte('date', dateFrom).lte('date', dateTo),
      supabase.from('programs').select('*').eq('academy_id', academyId),
      supabase.from('program_challenges').select('*').eq('academy_id', academyId),
      supabase.from('student_challenge_points').select('*').eq('academy_id', academyId),
      supabase.from('performance_settings').select('*').eq('academy_id', academyId).maybeSingle(),
    ]);
    setAttendance(att.data || []);
    setPrograms(prog.data || []);
    setChallenges(chal.data || []);
    setPoints(pts.data || []);
    setSettings(set.data || { attendance_weight: 50 });
    setLoading(false);
  };
  useEffect(() => { load(); }, [academyId, dateFrom, dateTo]); // eslint-disable-line

  const attendanceWeight = settings?.attendance_weight ?? 50;
  const courseWeight = 100 - attendanceWeight;

  const saveWeight = async (val) => {
    setSettings(s => ({ ...s, attendance_weight: val }));
    const { error } = await supabase.from('performance_settings')
      .upsert({ academy_id: academyId, attendance_weight: val, updated_by_id: user?.id, updated_at: new Date().toISOString() }, { onConflict: 'academy_id' });
    if (error) alert('Failed to save split: ' + error.message);
  };

  // attendance % per student+sport
  const attendancePct = useMemo(() => {
    const buckets = {};
    attendance.forEach(a => {
      const key = `${a.student_id}|${a.sport}`;
      buckets[key] = buckets[key] || { present: 0, total: 0 };
      buckets[key].total += 1;
      if ((a.status || '').toUpperCase() === PRESENT_STATUS) buckets[key].present += 1;
    });
    const out = {};
    Object.entries(buckets).forEach(([k, v]) => { out[k] = v.total ? (v.present / v.total) * 100 : 0; });
    return out;
  }, [attendance]);

  // total possible points per sport (sum of challenge totals under that sport's programs)
  const totalPointsBySport = useMemo(() => {
    const out = {};
    challenges.forEach(c => { out[c.sport] = (out[c.sport] || 0) + (c.total_points || 0); });
    return out;
  }, [challenges]);

  // points earned per student+sport
  const earnedPointsByStudentSport = useMemo(() => {
    const challengeById = {};
    challenges.forEach(c => { challengeById[c.id] = c; });
    const out = {};
    points.forEach(p => {
      const c = challengeById[p.challenge_id];
      if (!c) return;
      const key = `${p.student_id}|${c.sport}`;
      out[key] = (out[key] || 0) + Number(p.points_awarded || 0);
    });
    return out;
  }, [points, challenges]);

  // build one row per student enrollment
  const rows = useMemo(() => {
    const out = [];
    visibleStudents.forEach(s => {
      (s.enrollments || []).forEach(en => {
        const attKey = `${s.id}|${en.sport}`;
        const attPct = attendancePct[attKey] ?? 0;
        const totalPts = totalPointsBySport[en.sport] || 0;
        const earnedPts = earnedPointsByStudentSport[attKey] || 0;
        const coursePct = totalPts ? (earnedPts / totalPts) * 100 : 0;
        const finalScore = attPct * (attendanceWeight / 100) + coursePct * (courseWeight / 100);
        out.push({
          key: `${s.id}::${en.batch}`,
          student: s,
          sport: en.sport,
          batchLabel: en.batchLabel,
          batchKey: en.batch,
          attendancePct: attPct,
          coursePct,
          finalScore,
        });
      });
    });
    return out;
  }, [visibleStudents, attendancePct, totalPointsBySport, earnedPointsByStudentSport, attendanceWeight, courseWeight]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r => (r.student.name || '').toLowerCase().includes(q));
    }
    if (selectedSports.size > 0 && selectedSports.size < visibleSports.length) {
      list = list.filter(r => selectedSports.has(r.sport));
    }
    if (selectedBatches.size > 0 && selectedBatches.size < visibleBatches.length) {
      list = list.filter(r => selectedBatches.has(r.batchKey));
    }
    list = [...list].sort((a, b) => sortDir === 'desc' ? b.finalScore - a.finalScore : a.finalScore - b.finalScore);
    return list;
  }, [rows, search, selectedSports, selectedBatches, sortDir, visibleSports, visibleBatches]);

  const toggleSport = (name) => {
    setSelectedSports(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };
  const toggleBatch = (key) => {
    setSelectedBatches(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Link to="/profile" style={{ fontSize: 12, color: 'var(--accent2)' }}>← Back to Profile</Link>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowProgramManager(true)}>+ Add Program</button>
        )}
      </div>

      <div className="section-title" style={{ marginBottom: 4 }}>🏆 Performance Leaderboard</div>
      <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 10 }}>Attendance × {attendanceWeight}% + Course × {courseWeight}%</div>

      {/* date range for attendance calculation */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <input type="date" className="form-input" style={{ flex: 1, fontSize: 11, padding: '7px 6px' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{ fontSize: 11, color: 'var(--gray)' }}>–</span>
        <input type="date" className="form-input" style={{ flex: 1, fontSize: 11, padding: '7px 6px' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
      </div>

      {/* search with clear button */}
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input
          className="form-input"
          style={{ width: '100%', fontSize: 13, padding: '9px 30px 9px 10px' }}
          placeholder="Search student…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--gray)', fontSize: 15, cursor: 'pointer', padding: 2 }}
          >✕</button>
        )}
      </div>

      {/* filters + sort — single row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', position: 'relative' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setOpenFilter(openFilter === 'sport' ? null : 'sport')}>
            🏅 Sport {selectedSports.size < visibleSports.length ? `(${selectedSports.size})` : ''}
          </button>
          {openFilter === 'sport' && (
            <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 20, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,.3)' }}>
              {visibleSports.map(s => (
                <label key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 2px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedSports.has(s.name)} onChange={() => toggleSport(s.name)} />
                  {s.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setOpenFilter(openFilter === 'batch' ? null : 'batch')}>
            🧩 Batch {selectedBatches.size < visibleBatches.length ? `(${selectedBatches.size})` : ''}
          </button>
          {openFilter === 'batch' && (
            <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 20, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, minWidth: 180, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,.3)' }}>
              {visibleBatches.map(b => (
                <label key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 2px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedBatches.has(b.name)} onChange={() => toggleBatch(b.name)} />
                  {b.sport} · {b.batchLabel}
                </label>
              ))}
            </div>
          )}
        </div>

        <button className="btn btn-outline btn-sm" style={{ flexShrink: 0 }} onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}>
          {sortDir === 'desc' ? '↓ High-Low' : '↑ Low-High'}
        </button>
      </div>

      {/* admin: attendance/course split control */}
      {isAdmin && (
        <div style={{ background: 'var(--card2)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', marginBottom: 6 }}>SCORE SPLIT — Attendance {attendanceWeight}% / Course {courseWeight}%</div>
          <input
            type="range" min={0} max={100} value={attendanceWeight}
            onChange={e => saveWeight(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 20 }}>Loading…</div>}

      {!loading && filteredRows.map((r, i) => (
        <div key={r.key} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => setAwardFor(r)}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? 'var(--gold)' : 'var(--card2)', color: i < 3 ? '#fff' : 'var(--gray)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
            {i + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{r.student.name}</div>
            <div style={{ fontSize: 11, color: 'var(--gray)' }}>{r.sport} · {r.batchLabel}</div>
            <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 2 }}>
              📆 {r.attendancePct.toFixed(0)}% · 🏆 {r.coursePct.toFixed(0)}%
            </div>
          </div>
          <div style={{ fontWeight: 800, color: 'var(--accent2)', fontSize: 15 }}>{r.finalScore.toFixed(0)}</div>
        </div>
      ))}
      {!loading && filteredRows.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No students match the current filters.</div>
      )}

      {showProgramManager && (
        <ProgramManagerModal
          academyId={academyId}
          userId={user?.id}
          userName={appUser?.name || user?.email}
          sports={visibleSports}
          programs={programs}
          challenges={challenges}
          onClose={() => setShowProgramManager(false)}
          onChanged={load}
        />
      )}

      {awardFor && (
        <AwardPointsModal
          row={awardFor}
          academyId={academyId}
          userId={user?.id}
          userName={appUser?.name || user?.email}
          programs={programs.filter(p => p.sport === awardFor.sport)}
          challenges={challenges.filter(c => c.sport === awardFor.sport)}
          existingPoints={points.filter(p => p.student_id === awardFor.student.id)}
          onClose={() => setAwardFor(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
