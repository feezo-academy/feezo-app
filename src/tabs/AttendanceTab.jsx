import { useEffect, useMemo, useState } from 'react';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { exportAttendancePdf, exportAttendanceXlsx } from '../lib/exporters';
import ImportAttendanceModal from '../components/ImportAttendanceModal';
import StatDrilldownModal from '../components/StatDrilldownModal';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const todayStr = () => new Date().toISOString().slice(0, 10);
const toIso = (d) => d.toISOString().slice(0, 10);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

function RollBadge({ rollNo }) {
  return (
    <div style={{
      minWidth: 30, height: 30, padding: '0 4px', borderRadius: '50%',
      background: 'var(--accent2, #4a6cf7)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: rollNo && String(rollNo).length > 2 ? 10 : 12, fontWeight: 800, flexShrink: 0,
    }}>
      {rollNo || '—'}
    </div>
  );
}

export default function AttendanceTab() {
  const { visibleStudents, visibleSports, visibleBatches, refresh } = useAcademyData();
  const { isAdmin, academyId } = useAuth();

  const [date, setDate] = useState(todayStr());
  const [viewMode, setViewMode] = useState('day'); // 'day' | 'month' | 'year'
  const [panelOpen, setPanelOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [sortBy, setSortBy] = useState('roll_asc');
  const [records, setRecords] = useState({}); // student_id -> 'present' | 'absent'  (day mode only)
  const [periodRows, setPeriodRows] = useState({}); // student_id -> { present, absent }  (month/year mode)
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [drilldown, setDrilldown] = useState(null); // { title, icon, students }
  const [reloadKey, setReloadKey] = useState(0);

  const dateObj = new Date(date + 'T00:00:00');
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();
  const day = dateObj.getDate();

  const setDay = (d) => { const nd = new Date(year, month, d); setDate(toIso(nd)); };
  const setMonth = (m) => { const nd = new Date(year, m, Math.min(day, daysInMonth(year, m))); setDate(toIso(nd)); };
  const setYear = (y) => { const nd = new Date(y, month, Math.min(day, daysInMonth(y, month))); setDate(toIso(nd)); };
  const shiftDay = (delta) => { const nd = new Date(year, month, day + delta); setDate(toIso(nd)); };
  const shiftMonth = (delta) => { const nd = new Date(year, month + delta, 1); setDate(toIso(nd)); };
  const shiftYear = (delta) => setYear(year + delta);

  const students = useMemo(() => {
    let list = visibleStudents.filter(s => {
      if (sportFilter && s.sport !== sportFilter) return false;
      if (batchFilter && s.batch !== batchFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(s.name?.toLowerCase().includes(q) || s.roll_no?.toLowerCase?.().includes(q))) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'roll_desc': return (b.roll_no || '').localeCompare(a.roll_no || '');
        case 'name_az': return (a.name || '').localeCompare(b.name || '');
        case 'name_za': return (b.name || '').localeCompare(a.name || '');
        default: return (a.roll_no || '').localeCompare(b.roll_no || '');
      }
    });
    return list;
  }, [visibleStudents, sportFilter, batchFilter, search, sortBy]);

  const batchesForSport = visibleBatches.filter(b => !sportFilter || b.sport === sportFilter);

  // ---- Fetch attendance for the current view ----
  useEffect(() => {
    (async () => {
      if (!academyId) return;
      setLoading(true);
      if (viewMode === 'day') {
        const { data } = await supabase.from('attendance').select('*')
          .eq('academy_id', academyId).eq('date', date);
        const map = {};
        (data || []).forEach(r => { map[r.student_id] = r.status; });
        setRecords(map);
      } else {
        const from = viewMode === 'month' ? toIso(new Date(year, month, 1)) : toIso(new Date(year, 0, 1));
        const to = viewMode === 'month' ? toIso(new Date(year, month + 1, 0)) : toIso(new Date(year, 11, 31));
        const { data } = await supabase.from('attendance').select('student_id,status')
          .eq('academy_id', academyId).gte('date', from).lte('date', to);
        const agg = {};
        (data || []).forEach(r => {
          if (!agg[r.student_id]) agg[r.student_id] = { present: 0, absent: 0 };
          if (r.status === 'present') agg[r.student_id].present++;
          else if (r.status === 'absent') agg[r.student_id].absent++;
        });
        setPeriodRows(agg);
      }
      setLoading(false);
    })();
  }, [academyId, date, viewMode, year, month, reloadKey]);

  const setStatus = (studentId, status) => {
    setRecords(prev => ({ ...prev, [studentId]: prev[studentId] === status ? undefined : status }));
  };

  const allPChecked = students.length > 0 && students.every(s => records[s.id] === 'present');
  const allAChecked = students.length > 0 && students.every(s => records[s.id] === 'absent');
  const markAll = (status) => {
    setRecords(prev => {
      const next = { ...prev };
      const alreadyAll = students.every(s => prev[s.id] === status);
      students.forEach(s => { next[s.id] = alreadyAll ? undefined : status; });
      return next;
    });
  };

  const saveAll = async () => {
    setSaving(true);
    const rows = students
      .filter(s => records[s.id] === 'present' || records[s.id] === 'absent')
      .map(s => ({ academy_id: academyId, student_id: s.id, date, status: records[s.id], sport: s.sport }));
    if (rows.length) await supabase.from('attendance').upsert(rows, { onConflict: 'academy_id,student_id,date' });
    setSaving(false);
    setReloadKey(k => k + 1);
  };

  const presentCount = students.filter(s => records[s.id] === 'present').length;
  const absentCount = students.filter(s => records[s.id] === 'absent').length;
  const notMarkedCount = students.length - presentCount - absentCount;

  const dateLabel = `${day} ${WEEKDAYS[dateObj.getDay()]}, ${MONTHS[month]} ${year}`;

  // ---- Export ----
  const doExport = (kind) => {
    if (viewMode === 'day') {
      const columns = ['Roll No', 'Name', 'Sport', 'Batch', 'Status'];
      const rows = students.map(s => [s.roll_no, s.name, s.sport, s.batchLabel,
        records[s.id] ? records[s.id][0].toUpperCase() + records[s.id].slice(1) : 'Not Marked']);
      const title = `Attendance — ${dateLabel}`;
      const fname = `attendance_${date}`;
      if (kind === 'pdf') exportAttendancePdf(title, columns, rows, `${fname}.pdf`); else exportAttendanceXlsx(columns, rows, `${fname}.xlsx`);
    } else {
      const columns = ['Roll No', 'Name', 'Sport', 'Batch', 'Present', 'Absent', '%'];
      const rows = students.map(s => {
        const agg = periodRows[s.id] || { present: 0, absent: 0 };
        const total = agg.present + agg.absent;
        const pct = total ? Math.round((agg.present / total) * 100) : 0;
        return [s.roll_no, s.name, s.sport, s.batchLabel, agg.present, agg.absent, `${pct}%`];
      });
      const label = viewMode === 'month' ? `${MONTHS[month]} ${year}` : `${year}`;
      const title = `Attendance Summary — ${label}`;
      const fname = viewMode === 'month' ? `attendance_${year}-${String(month + 1).padStart(2, '0')}` : `attendance_${year}`;
      if (kind === 'pdf') exportAttendancePdf(title, columns, rows, `${fname}.pdf`); else exportAttendanceXlsx(columns, rows, `${fname}.xlsx`);
    }
  };

  const openNotMarked = () => {
    const list = students.filter(s => !records[s.id]).map(s => ({ ...s, extra: 'Not marked' }));
    setDrilldown({ title: 'Not Marked', icon: '🥧', students: list });
  };

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>🗓️ Attendance</div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-gold btn-sm" onClick={() => doExport('pdf')}>PDF</button>
          <button className="btn btn-success btn-sm" onClick={() => doExport('xlsx')}>XL</button>
          {isAdmin && <button className="btn btn-outline btn-sm" onClick={() => setShowImport(true)}>⬆️ Import</button>}
          <button className="btn btn-primary btn-sm" onClick={openNotMarked} title="Not marked">🥧</button>
        </div>
      </div>

      <div className="search-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input type="text" className="search-input" placeholder="Search by name or roll number…"
          value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button type="button" className="search-clear-btn" onClick={() => setSearch('')} aria-label="Clear search">✕</button>}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        <select className="form-select" style={{ flex: 1, minWidth: 110, fontSize: 12, padding: '7px 9px' }}
          value={sportFilter} onChange={e => { setSportFilter(e.target.value); setBatchFilter(''); }}>
          <option value="">All Sports</option>
          {visibleSports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select className="form-select" style={{ flex: 1, minWidth: 110, fontSize: 12, padding: '7px 9px' }}
          value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
          <option value="">All Batches</option>
          {batchesForSport.map(b => <option key={b.id} value={b.name}>{b.batchLabel}</option>)}
        </select>
        <select className="form-select" style={{ flex: 1, minWidth: 110, fontSize: 12, padding: '7px 9px' }}
          value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="roll_asc">Roll No ↑</option>
          <option value="roll_desc">Roll No ↓</option>
          <option value="name_az">Name A→Z</option>
          <option value="name_za">Name Z→A</option>
        </select>
      </div>

      <div className="card" style={{ padding: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setPanelOpen(p => !p)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>🗓️ {viewMode === 'year' ? year : viewMode === 'month' ? `${MONTHS[month]} ${year}` : dateLabel}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'var(--accent2)', color: '#fff', textTransform: 'capitalize' }}>{viewMode}</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--gray)' }}>{panelOpen ? '▲' : '▼'}</span>
        </div>

        {panelOpen && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {viewMode === 'day' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="arrow-btn" onClick={() => shiftDay(-1)}>‹</button>
                <select className="form-select" style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
                  value={day} onChange={e => setDay(Number(e.target.value))}>
                  {Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d} {WEEKDAYS[new Date(year, month, d).getDay()]}</option>
                  ))}
                </select>
                <button className="arrow-btn" onClick={() => shiftDay(1)}>›</button>
              </div>
            )}
            {(viewMode === 'day' || viewMode === 'month') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="arrow-btn" onClick={() => shiftMonth(-1)}>‹</button>
                <select className="form-select" style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
                  value={month} onChange={e => setMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <button className="arrow-btn" onClick={() => shiftMonth(1)}>›</button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="arrow-btn" onClick={() => shiftYear(-1)}>‹</button>
              <select className="form-select" style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
                value={year} onChange={e => setYear(Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, i) => year - 4 + i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button className="arrow-btn" onClick={() => shiftYear(1)}>›</button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              {['day', 'month', 'year'].map(m => (
                <button key={m} className={'freq-day-btn' + (viewMode === m ? ' active' : '')}
                  style={{ flex: 1 }} onClick={() => setViewMode(m)}>
                  🗓️ {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {viewMode === 'day' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8, fontSize: 12.5 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <span>✅ <strong>{presentCount}</strong></span>
            <span>❌ <strong>{absentCount}</strong></span>
            <span style={{ color: 'var(--gray)' }}>⏳ <strong>{notMarkedCount}</strong></span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontWeight: 600 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={allPChecked} onChange={() => markAll('present')} /> All P
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={allAChecked} onChange={() => markAll('absent')} /> All A
            </label>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 8 }}>
          {students.length} student(s) · showing {viewMode === 'month' ? `${MONTHS[month]} ${year}` : year} summary
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
        {loading && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 20 }}>Loading…</div>}
        {!loading && students.length === 0 && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No students found.</div>}

        {!loading && viewMode === 'day' && students.map(s => {
          const status = records[s.id];
          return (
            <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8 }}>
              <RollBadge rollNo={s.roll_no} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                  {sportFilter ? s.batchLabel : `${s.sport} · ${s.batchLabel}`}
                </div>
              </div>
              <div className="att-btns">
                <button className={'att-btn ' + (status === 'present' ? 'present' : 'inactive')} onClick={() => setStatus(s.id, 'present')}>P</button>
                <button className={'att-btn ' + (status === 'absent' ? 'absent' : 'inactive')} onClick={() => setStatus(s.id, 'absent')}>A</button>
              </div>
            </div>
          );
        })}

        {!loading && viewMode !== 'day' && students.map(s => {
          const agg = periodRows[s.id] || { present: 0, absent: 0 };
          const total = agg.present + agg.absent;
          const pct = total ? Math.round((agg.present / total) * 100) : 0;
          return (
            <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8 }}>
              <RollBadge rollNo={s.roll_no} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                  {sportFilter ? s.batchLabel : `${s.sport} · ${s.batchLabel}`}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <div><span style={{ color: '#16a34a', fontWeight: 700 }}>{agg.present}P</span> · <span style={{ color: '#dc2626', fontWeight: 700 }}>{agg.absent}A</span></div>
                <div style={{ color: 'var(--gray)' }}>{pct}%</div>
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && viewMode === 'day' && (
        <button className="btn btn-primary" style={{ position: 'fixed', bottom: 90, right: 16, zIndex: 50 }}
          onClick={saveAll} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save Attendance'}
        </button>
      )}

      {showImport && (
        <ImportAttendanceModal
          academyId={academyId}
          existingStudents={visibleStudents}
          sportFilter={sportFilter}
          batchFilter={batchFilter}
          onClose={() => setShowImport(false)}
          onImported={() => { refresh(); setReloadKey(k => k + 1); }}
        />
      )}

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
