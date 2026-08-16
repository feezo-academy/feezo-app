import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { supabase } from '../lib/supabaseClient';
import ProgramManagerModal from './ProgramManagerModal';
import AwardPointsModal from './AwardPointsModal';
import StudentChartsModal from './StudentChartsModal';
import StudentHistoryModal from './StudentHistoryModal';

const PRESENT_STATUS = 'P'; // adjust here if attendance uses a different code for "present"

function todayIso() { return new Date().toISOString().slice(0, 10); }
function monthStartIso() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

export default function PerformancePage() {
  const { academyId, isAdmin, user, appUser } = useAuth();
  const { visibleStudents, visibleSports } = useAcademyData();

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
  const [sortDir, setSortDir] = useState('desc'); // 'desc' = high to low
  const [filtersOpen, setFiltersOpen] = useState(false); // collapse bar
  const [popup, setPopup] = useState(null); // 'sport' | 'sort' | null

  const [showProgramManager, setShowProgramManager] = useState(false);
  const [awardFor, setAwardFor] = useState(null); // row currently awarding points for
  const [chartsFor, setChartsFor] = useState(null); // row currently viewing charts for
  const [historyFor, setHistoryFor] = useState(null); // row currently viewing history for

  // default: all sports/batches selected once loaded
  useEffect(() => {
    if (visibleSports.length && selectedSports.size === 0) {
      setSelectedSports(new Set(visibleSports.map(s => s.name)));
    }
  }, [visibleSports]); // eslint-disable-line

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
    const clamped = Math.max(0, Math.min(100, val));
    setSettings(s => ({ ...s, attendance_weight: clamped }));
    const { error } = await supabase.from('performance_settings')
      .upsert({ academy_id: academyId, attendance_weight: clamped, updated_by_id: user?.id, updated_at: new Date().toISOString() }, { onConflict: 'academy_id' });
    if (error) alert('Failed to save split: ' + error.message);
  };
  const saveCourseWeight = (val) => saveWeight(100 - Math.max(0, Math.min(100, val)));

  // local text state for the split inputs so an in-progress edit (e.g. clearing
  // the field to retype) never gets committed as 0 — only commits on blur
  const [attendanceInput, setAttendanceInput] = useState(String(attendanceWeight));
  const [programInput, setProgramInput] = useState(String(courseWeight));
  useEffect(() => { setAttendanceInput(String(attendanceWeight)); }, [attendanceWeight]);
  useEffect(() => { setProgramInput(String(courseWeight)); }, [courseWeight]);
  const commitAttendanceInput = () => {
    if (attendanceInput === '') { setAttendanceInput(String(attendanceWeight)); return; }
    saveWeight(Number(attendanceInput));
  };
  const commitProgramInput = () => {
    if (programInput === '') { setProgramInput(String(courseWeight)); return; }
    saveCourseWeight(Number(programInput));
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

  // build one row per student+sport — batches within the same sport are merged
  // into a single entry, but a student doing 2 different sports gets 2 rows
  const rows = useMemo(() => {
    const bySportStudent = new Map();
    visibleStudents.forEach(s => {
      (s.enrollments || []).forEach(en => {
        const key = `${s.id}|${en.sport}`;
        if (!bySportStudent.has(key)) {
          bySportStudent.set(key, { student: s, sport: en.sport, batchLabels: [], batchKeys: [] });
        }
        const entry = bySportStudent.get(key);
        if (!entry.batchKeys.includes(en.batch)) {
          entry.batchKeys.push(en.batch);
          entry.batchLabels.push(en.batchLabel);
        }
      });
    });
    const out = [];
    bySportStudent.forEach((entry, key) => {
      const attPct = attendancePct[key] ?? 0;
      const totalPts = totalPointsBySport[entry.sport] || 0;
      const earnedPts = earnedPointsByStudentSport[key] || 0;
      const coursePct = totalPts ? (earnedPts / totalPts) * 100 : 0;
      const finalScore = attPct * (attendanceWeight / 100) + coursePct * (courseWeight / 100);
      out.push({
        key,
        student: entry.student,
        sport: entry.sport,
        batchLabel: entry.batchLabels.join(', '),
        batchKey: entry.batchKeys.join(','),
        attendancePct: attPct,
        coursePct,
        finalScore,
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
    list = [...list].sort((a, b) => sortDir === 'desc' ? b.finalScore - a.finalScore : a.finalScore - b.finalScore);
    return list;
  }, [rows, search, selectedSports, sortDir, visibleSports]);

  const toggleSport = (name) => {
    setSelectedSports(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };
  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      {chartsFor ? (
        <StudentChartsModal
          row={chartsFor}
          academyId={academyId}
          userId={user?.id}
          userName={appUser?.name || user?.email}
          canEdit={isAdmin}
          totalPoints={totalPointsBySport[chartsFor.sport] || 0}
          earnedPoints={earnedPointsByStudentSport[`${chartsFor.student.id}|${chartsFor.sport}`] || 0}
          pointsRecords={points.filter(p => p.student_id === chartsFor.student.id)}
          challenges={challenges.filter(c => c.sport === chartsFor.sport)}
          attendanceRecords={attendance.filter(a => a.student_id === chartsFor.student.id && a.sport === chartsFor.sport)}
          onClose={() => setChartsFor(null)}
        />
      ) : historyFor ? (
        <StudentHistoryModal
          row={historyFor}
          academyId={academyId}
          userId={user?.id}
          userName={appUser?.name || user?.email}
          canEdit={isAdmin}
          pointsRecords={points.filter(p => p.student_id === historyFor.student.id)}
          challenges={challenges.filter(c => c.sport === historyFor.sport)}
          onClose={() => setHistoryFor(null)}
          onAddPoints={() => setAwardFor(historyFor)}
        />
      ) : (
      <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>🏆 Performance Leaderboard</div>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowProgramManager(true)}>+ Add Program</button>
        )}
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

      {/* collapse bar */}
      <button
        onClick={() => setFiltersOpen(o => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 700, color: 'var(--offwhite)', marginBottom: filtersOpen ? 8 : 12, cursor: 'pointer' }}
      >
        <span>Filters &amp; Sort</span>
        <span style={{ color: 'var(--gray)' }}>{filtersOpen ? '▲' : '▼'}</span>
      </button>

      {filtersOpen && (
        <div style={{ background: 'var(--card2)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          {/* date range for attendance calculation */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', marginBottom: 5 }}>DATE RANGE</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
            <input type="date" className="form-input" style={{ flex: 1, fontSize: 11, padding: '7px 6px' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span style={{ fontSize: 11, color: 'var(--gray)' }}>–</span>
            <input type="date" className="form-input" style={{ flex: 1, fontSize: 11, padding: '7px 6px' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>

          {/* sport / sort — single row, open popup on click */}
          <div style={{ display: 'flex', gap: 6, marginBottom: isAdmin ? 12 : 0 }}>
            <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => setPopup('sport')}>
              Sport {selectedSports.size < visibleSports.length ? `(${selectedSports.size})` : ''}
            </button>
            <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => setPopup('sort')}>
              Sort
            </button>
          </div>

          {/* admin: attendance/course split as numbers */}
          {isAdmin && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', marginBottom: 5 }}>SCORE SPLIT (%)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--gray)', marginBottom: 3 }}>Attendance</div>
                  <input type="number" min={0} max={100} className="form-input" style={{ width: '100%', fontSize: 12, padding: '7px 8px' }}
                    value={attendanceInput}
                    onChange={e => setAttendanceInput(e.target.value)}
                    onBlur={commitAttendanceInput} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--gray)', marginBottom: 3 }}>Program</div>
                  <input type="number" min={0} max={100} className="form-input" style={{ width: '100%', fontSize: 12, padding: '7px 8px' }}
                    value={programInput}
                    onChange={e => setProgramInput(e.target.value)}
                    onBlur={commitProgramInput} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* popups */}
      {popup && (
        <div
          onClick={() => setPopup(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 12, padding: 14, width: '85%', maxWidth: 320, maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>
                {popup === 'sport' ? 'Select Sport' : 'Sort By'}
              </div>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--gray)', cursor: 'pointer' }}>×</button>
            </div>

            {popup === 'sport' && visibleSports.map(s => (
              <label key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '7px 2px', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedSports.has(s.name)} onChange={() => toggleSport(s.name)} />
                {s.name}
              </label>
            ))}

            {popup === 'sort' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[{ v: 'desc', l: 'High to Low' }, { v: 'asc', l: 'Low to High' }].map(o => (
                  <label key={o.v} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '7px 2px', cursor: 'pointer' }}>
                    <input type="radio" name="sortdir" checked={sortDir === o.v} onChange={() => setSortDir(o.v)} />
                    {o.l}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 20 }}>Loading…</div>}

      {!loading && filteredRows.map((r, i) => (
        <div key={r.key} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => setHistoryFor(r)}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
            {i + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{r.student.name}</div>
            <div style={{ fontSize: 11, color: 'var(--gray)' }}>{r.sport} · {r.batchLabel}</div>
            <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 2 }}>
              📆 {r.attendancePct.toFixed(0)}% · 🏆 {r.coursePct.toFixed(0)}%
            </div>
          </div>
          {/* chart icon column — fixed width so it lines up in a straight column
              across every row, right next to the total-points column */}
          <div style={{ width: 30, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <span
              onClick={(e) => { e.stopPropagation(); setChartsFor(r); }}
              title="View charts"
              role="button"
              style={{
                display: 'inline-block', width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', position: 'relative', flexShrink: 0,
                background: 'conic-gradient(#f4695f 0deg 60deg, #f8c559 60deg 120deg, #1a9e4c 120deg 180deg, #5b9bd9 180deg 240deg, #1976d2 240deg 300deg, #b04a4a 300deg 360deg)',
              }}
            >
              <span style={{ position: 'absolute', inset: 4.5, borderRadius: '50%', background: 'var(--card)' }} />
            </span>
          </div>
          <div style={{ width: 44, textAlign: 'right', fontWeight: 800, color: 'var(--accent2)', fontSize: 15, flexShrink: 0 }}>{r.finalScore.toFixed(0)}</div>
        </div>
      ))}
      {!loading && filteredRows.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No students match the current filters.</div>
      )}

      </>
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
