import { useEffect, useMemo, useRef, useState } from 'react';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { exportAttendancePdf, exportAttendanceXlsx } from '../lib/exporters';
import ImportAttendanceModal from '../components/ImportAttendanceModal';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// IMPORTANT: build the YYYY-MM-DD string from local date parts, never via
// toISOString() — that converts to UTC first, which silently shifts the
// date by a day for any timezone ahead of UTC (e.g. IST) and is what made
// the ‹ › navigation arrows appear broken.
const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => toIso(new Date());
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
  // NOTE: `user` is read defensively below (user?.id / user?.role) for the audit
  // log — adjust the field names here if your AuthContext shapes it differently.
  const { isAdmin, academyId, user } = useAuth();

  const [date, setDate] = useState(todayStr());
  const [viewMode, setViewMode] = useState('day'); // 'day' | 'month' | 'year'
  const [panelOpen, setPanelOpen] = useState(false); // date picker sub-panel: collapsed by default
  const [filtersVisible, setFiltersVisible] = useState(true); // whole filter/date block: hides on scroll-down
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'present' | 'absent' — day view only
  const [sortBy, setSortBy] = useState('roll_asc');
  const [records, setRecords] = useState({}); // student_id -> 'P' | 'A'  (day mode only, matches db status codes)
  const [lateMap, setLateMap] = useState({}); // student_id -> bool, marked Present after that sport's register closed
  const [periodRows, setPeriodRows] = useState({}); // student_id -> { present, absent }  (month mode)
  const [yearSummary, setYearSummary] = useState({}); // monthIndex(0-11) -> { days:Set<string>, p, a }  (year mode)
  const [dayStatusMap, setDayStatusMap] = useState({}); // sport -> completed bool, for the selected date
  const [completing, setCompleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const lastScrollTop = useRef(0);
  const listScrollRef = useRef(null);

  const dateObj = new Date(date + 'T00:00:00');
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();
  const day = dateObj.getDate();
  const isFutureDate = date > todayStr();

  const setDay = (d) => setDate(toIso(new Date(year, month, d)));
  const setMonth = (m) => setDate(toIso(new Date(year, m, Math.min(day, daysInMonth(year, m)))));
  const setYear = (y) => setDate(toIso(new Date(y, month, Math.min(day, daysInMonth(y, month)))));
  const shiftDay = (delta) => setDate(toIso(new Date(year, month, day + delta)));
  const shiftMonth = (delta) => setDate(toIso(new Date(year, month + delta, Math.min(day, daysInMonth(year, month + delta)))));
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

  // "Mark All" and the P/A summary counts intentionally ignore the search box —
  // they operate on the full sport+batch scoped roster, matching the HTML app.
  const bulkTargets = useMemo(() => {
    return visibleStudents.filter(s => {
      if (sportFilter && s.sport !== sportFilter) return false;
      if (batchFilter && s.batch !== batchFilter) return false;
      return true;
    });
  }, [visibleStudents, sportFilter, batchFilter]);

  // Day-view-only re-sort (present/absent first) and status filter — applied on
  // top of `students` since both depend on the fetched records for the date.
  const dayStudents = useMemo(() => {
    if (viewMode !== 'day') return students;
    let list = students;
    if (sortBy === 'present_first' || sortBy === 'absent_first') {
      const rank = (s) => {
        const v = records[s.id];
        if (sortBy === 'present_first') return v === 'P' ? 0 : v === 'A' ? 2 : 1;
        return v === 'A' ? 0 : v === 'P' ? 2 : 1;
      };
      list = [...list].sort((a, b) => rank(a) - rank(b) || (a.roll_no || '').localeCompare(b.roll_no || ''));
    }
    if (statusFilter !== 'all') {
      list = list.filter(s => (statusFilter === 'present' ? records[s.id] === 'P' : records[s.id] === 'A'));
    }
    return list;
  }, [viewMode, students, sortBy, statusFilter, records]);

  const batchesForSport = visibleBatches.filter(b => !sportFilter || b.sport === sportFilter);

  // A day only counts as a "class day" if someone was actually marked. Shown as
  // a 🏖️ holiday badge otherwise (mirrors the HTML app's isClassDay check).
  const classDay = useMemo(() => {
    const ids = new Set((sportFilter ? visibleStudents.filter(s => s.sport === sportFilter) : visibleStudents).map(s => s.id));
    return Object.keys(records).some(sid => ids.has(sid) && (records[sid] === 'P' || records[sid] === 'A'));
  }, [records, visibleStudents, sportFilter]);

  // Best-effort activity log — mirrors the HTML app's addLog()/audit_log table.
  // Never blocks the UI if the table/columns don't exist or the insert fails.
  const logAttendance = async (action, detail) => {
    try {
      await supabase.from('audit_log').insert({
        academy_id: academyId,
        user_id: user?.id || '',
        role: user?.role || (isAdmin ? 'admin' : 'staff'),
        action,
        detail,
      });
    } catch { /* audit log is best-effort */ }
  };

  // ---- Fetch attendance for the current view ----
  useEffect(() => {
    (async () => {
      if (!academyId) return;
      setLoading(true);
      if (viewMode === 'day') {
        const { data } = await supabase.from('attendance').select('*')
          .eq('academy_id', academyId).eq('date', date);
        const map = {};
        const late = {};
        (data || []).forEach(r => { map[r.student_id] = r.status; late[r.student_id] = !!r.is_latecomer; });
        setRecords(map);
        setLateMap(late);

        // Optional table, scoped per (academy, date, sport) — requires a `sport`
        // text column and a unique constraint on (academy_id, date, sport). Fails
        // quietly if that hasn't been migrated yet.
        try {
          const { data: statusRows } = await supabase.from('attendance_day_status')
            .select('sport,completed').eq('academy_id', academyId).eq('date', date);
          const dmap = {};
          (statusRows || []).forEach(r => { dmap[r.sport] = !!r.completed; });
          setDayStatusMap(dmap);
        } catch {
          setDayStatusMap({});
        }
      } else if (viewMode === 'month') {
        const from = toIso(new Date(year, month, 1));
        const to = toIso(new Date(year, month + 1, 0));
        const { data } = await supabase.from('attendance').select('student_id,status')
          .eq('academy_id', academyId).gte('date', from).lte('date', to);
        const agg = {};
        (data || []).forEach(r => {
          if (!agg[r.student_id]) agg[r.student_id] = { present: 0, absent: 0 };
          if (r.status === 'P') agg[r.student_id].present++;
          else if (r.status === 'A') agg[r.student_id].absent++;
        });
        setPeriodRows(agg);
      } else {
        // Year view — monthly breakdown (class days + P/A totals), scoped to the
        // currently filtered roster, matching the HTML app's year view.
        const from = toIso(new Date(year, 0, 1));
        const to = toIso(new Date(year, 11, 31));
        const { data } = await supabase.from('attendance').select('date,student_id,status')
          .eq('academy_id', academyId).gte('date', from).lte('date', to);
        const idSet = new Set(students.map(s => s.id));
        const byMonth = {};
        for (let i = 0; i < 12; i++) byMonth[i] = { days: new Set(), p: 0, a: 0 };
        (data || []).forEach(r => {
          if (!idSet.has(r.student_id)) return;
          const mo = parseInt(r.date.slice(5, 7), 10) - 1;
          if (!byMonth[mo]) return;
          byMonth[mo].days.add(r.date);
          if (r.status === 'P') byMonth[mo].p++;
          else if (r.status === 'A') byMonth[mo].a++;
        });
        setYearSummary(byMonth);
      }
      setLoading(false);
    })();
  }, [academyId, date, viewMode, year, month, reloadKey, students]);

  // Tapping P/A. Behavior depends on whether that student's sport register is
  // closed for the day (dayStatusMap[sport]):
  //  - Open register: normal mark / change (with confirm) / clear (tap again).
  //  - Closed register: existing marks are locked, EXCEPT a latecomer Present
  //    mark can still be flipped to Absent. Unmarked students can still be
  //    marked — Absent normally, or Present as a flagged "latecomer".
  const setStatus = (student, status) => {
    if (isFutureDate) { window.alert('Cannot mark attendance for future dates.'); return; }
    const sp = student.sport;
    const done = !!dayStatusMap[sp];
    const existing = records[student.id];
    const isLate = !!lateMap[student.id];

    if (done) {
      if (existing === 'A') { window.alert('Register is closed for this day — already marked, cannot change.'); return; }
      if (existing === 'P' && !isLate) { window.alert('Register is closed for this day — already marked, cannot change.'); return; }
      if (existing === 'P' && isLate && status === 'A') {
        const ok = window.confirm(`Change ${student.name} from Latecomer → Absent (${sp}) on ${date}?`);
        if (!ok) return;
        applyStatus(student, 'A', false);
        logAttendance('attendance', `${student.name} → Absent from latecomer (${sp}) on ${date}`);
        return;
      }
      if (existing === 'P' && isLate && status === 'P') return; // already marked, no-op
      // unmarked student, register closed
      if (status === 'A') {
        const ok = window.confirm(`Mark ${student.name} as Absent (${sp}) on ${date}?`);
        if (!ok) return;
        applyStatus(student, 'A', false);
        logAttendance('attendance', `${student.name} → Absent (${sp}) on ${date} [register closed]`);
        return;
      }
      const ok = window.confirm(`Register is closed. Mark ${student.name} as a latecomer (Present)?`);
      if (!ok) return;
      applyStatus(student, 'P', true);
      logAttendance('attendance', `${student.name} → latecomer Present (${sp}) on ${date}`);
      return;
    }

    // Register still open — normal flow
    if (existing === status) return; // tapping the same mark again is a no-op, not a clear
    if (existing) {
      const label = (v) => (v === 'P' ? 'Present' : 'Absent');
      const ok = window.confirm(`Change ${student.name}'s attendance from ${label(existing)} to ${label(status)}?`);
      if (!ok) return;
    }
    applyStatus(student, status, false);
    logAttendance('attendance', `${student.name} → ${status === 'P' ? 'Present' : 'Absent'} (${sp}) on ${date}`);
  };

  const applyStatus = (student, status, isLate) => {
    setRecords(p => ({ ...p, [student.id]: status }));
    setLateMap(p => ({ ...p, [student.id]: !!isLate }));
    persistStatus(student, status, isLate);
  };

  // Writes a single student's mark straight to Supabase so nothing depends on
  // a separate "Save" step. Requires an `is_latecomer` boolean column on
  // `attendance` (defaults to false) to track the latecomer flag.
  const persistStatus = async (student, status, isLate) => {
    try {
      const { error } = await supabase.from('attendance').upsert(
        { academy_id: academyId, student_id: student.id, date, status, sport: student.sport, is_latecomer: !!isLate },
        { onConflict: 'academy_id,student_id,date' }
      );
      if (error) throw error;
    } catch (err) {
      window.alert(`Couldn't save ${student.name}'s attendance: ${err.message}`);
    }
  };

  const allPChecked = bulkTargets.length > 0 && bulkTargets.every(s => records[s.id] === 'P');
  const allAChecked = bulkTargets.length > 0 && bulkTargets.every(s => records[s.id] === 'A');

  const markAll = async (status) => {
    if (isFutureDate) { window.alert('Cannot mark attendance for future dates.'); return; }
    if (!sportFilter) { window.alert('Pick a specific sport above to use Mark All.'); return; }
    const targets = bulkTargets;
    if (!targets.length) return;
    const label = status === 'P' ? 'Present' : 'Absent';
    const alreadyAll = targets.every(s => records[s.id] === status);

    if (!alreadyAll) {
      const ok = window.confirm(`Mark all ${targets.length} ${sportFilter} student(s) as ${label} on ${date}?`);
      if (!ok) return;
      setRecords(prev => { const next = { ...prev }; targets.forEach(s => { next[s.id] = status; }); return next; });
      setLateMap(prev => { const next = { ...prev }; targets.forEach(s => { next[s.id] = false; }); return next; });
      const rows = targets.map(s => ({ academy_id: academyId, student_id: s.id, date, status, sport: s.sport, is_latecomer: false }));
      const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'academy_id,student_id,date' });
      if (error) { window.alert(`Couldn't save attendance: ${error.message}`); return; }
      logAttendance('attendance', `All ${sportFilter} students → ${label} on ${date}`);
    } else {
      const ok = window.confirm(`Remove ${label} mark for all ${sportFilter} students on ${date}?`);
      if (!ok) return;
      const clearedIds = targets.map(s => s.id);
      setRecords(prev => { const next = { ...prev }; clearedIds.forEach(id => { delete next[id]; }); return next; });
      const { error } = await supabase.from('attendance').delete()
        .eq('academy_id', academyId).eq('date', date).in('student_id', clearedIds);
      if (error) { window.alert(`Couldn't clear attendance: ${error.message}`); return; }
      logAttendance('attendance', `All ${label} cleared for ${sportFilter} on ${date}`);
    }
  };

  const dayCompleted = sportFilter ? !!dayStatusMap[sportFilter] : false;

  const markAllDone = async () => {
    if (!sportFilter) { window.alert('Pick a specific sport above to close its register.'); return; }
    if (!students.length || dayCompleted || isFutureDate) return;
    const ok = window.confirm(
      `Close the ${sportFilter} attendance register for ${date}?\n\nMarked students will be locked. Anyone marked Present afterward will be flagged as a latecomer. This cannot be undone.`
    );
    if (!ok) return;
    setCompleting(true);
    try {
      const { error } = await supabase.from('attendance_day_status').upsert(
        { academy_id: academyId, date, sport: sportFilter, completed: true, completed_at: new Date().toISOString() },
        { onConflict: 'academy_id,date,sport' }
      );
      if (error) throw error;
    } catch (err) {
      window.alert(`Couldn't close the register — you may need a "sport" column and a unique constraint on (academy_id, date, sport) in attendance_day_status. (${err.message})`);
      setCompleting(false);
      return;
    }
    setDayStatusMap(m => ({ ...m, [sportFilter]: true }));
    setCompleting(false);
    logAttendance('attendance', `Register closed (${sportFilter}) for ${date}`);
    setReloadKey(k => k + 1);
  };

  const presentCount = students.filter(s => records[s.id] === 'P').length;
  const absentCount = students.filter(s => records[s.id] === 'A').length;
  const notMarkedCount = students.length - presentCount - absentCount;

  const dateLabel = `${day} ${WEEKDAYS[dateObj.getDay()]}, ${MONTHS[month]} ${year}`;

  // ---- Export ----
  const doExport = (kind) => {
    if (viewMode === 'day') {
      const columns = ['Roll No', 'Name', 'Sport', 'Batch', 'Status'];
      const rows = students.map(s => [s.roll_no, s.name, s.sport, s.batchLabel,
        records[s.id] === 'P' ? (lateMap[s.id] ? 'Present (Late)' : 'Present') : records[s.id] === 'A' ? 'Absent' : 'Not Marked']);
      const title = `Attendance — ${dateLabel}`;
      const fname = `attendance_${date}`;
      if (kind === 'pdf') exportAttendancePdf(title, columns, rows, `${fname}.pdf`); else exportAttendanceXlsx(columns, rows, `${fname}.xlsx`);
    } else if (viewMode === 'month') {
      const columns = ['Roll No', 'Name', 'Sport', 'Batch', 'Present', 'Absent', '%'];
      const rows = students.map(s => {
        const agg = periodRows[s.id] || { present: 0, absent: 0 };
        const total = agg.present + agg.absent;
        const pct = total ? Math.round((agg.present / total) * 100) : 0;
        return [s.roll_no, s.name, s.sport, s.batchLabel, agg.present, agg.absent, `${pct}%`];
      });
      const title = `Attendance Summary — ${MONTHS[month]} ${year}`;
      const fname = `attendance_${year}-${String(month + 1).padStart(2, '0')}`;
      if (kind === 'pdf') exportAttendancePdf(title, columns, rows, `${fname}.pdf`); else exportAttendanceXlsx(columns, rows, `${fname}.xlsx`);
    } else {
      const columns = ['Month', 'Class Days', 'Present', 'Absent'];
      const rows = MONTHS
        .map((mLabel, i) => {
          const row = yearSummary[i] || { days: new Set(), p: 0, a: 0 };
          return [mLabel, row.days.size, row.p, row.a];
        })
        .filter((r) => r[1] > 0);
      const title = `Attendance Summary — ${year}`;
      const fname = `attendance_${year}`;
      if (kind === 'pdf') exportAttendancePdf(title, columns, rows, `${fname}.pdf`); else exportAttendanceXlsx(columns, rows, `${fname}.xlsx`);
    }
  };

  // ---- Scroll-driven show/hide of the filters + date block ----
  const handleScroll = (e) => {
    const top = e.currentTarget.scrollTop;
    const diff = top - lastScrollTop.current;
    if (Math.abs(diff) < 4) return;
    if (diff > 0 && top > 40) setFiltersVisible(false);
    else if (diff < 0) setFiltersVisible(true);
    lastScrollTop.current = top;
  };

  const scrollToBottom = () => {
    const el = listScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const DateArrowGroup = ({ onPrev, onNext, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '1 1 30%', minWidth: 92 }}>
      <button className="arrow-btn" style={{ width: 24, height: 24, fontSize: 12 }} onClick={onPrev}>‹</button>
      {children}
      <button className="arrow-btn" style={{ width: 24, height: 24, fontSize: 12 }} onClick={onNext}>›</button>
    </div>
  );

  const yearHasData = Object.values(yearSummary).some(r => (r?.days?.size || 0) > 0);

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>🗓️ Attendance</div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-gold btn-sm" onClick={() => doExport('pdf')}>PDF</button>
          <button className="btn btn-success btn-sm" onClick={() => doExport('xlsx')}>XL</button>
          {isAdmin && <button className="btn btn-outline btn-sm" onClick={() => setShowImport(true)}>⬆️ Import</button>}
        </div>
      </div>

      <div style={{
        maxHeight: filtersVisible ? 700 : 0,
        opacity: filtersVisible ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height .35s ease, opacity .25s ease',
      }}>
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
          {viewMode === 'day' && (
            <select className="form-select" style={{ flex: 1, minWidth: 110, fontSize: 12, padding: '7px 9px' }}
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
            </select>
          )}
          <select className="form-select" style={{ flex: 1, minWidth: 110, fontSize: 12, padding: '7px 9px' }}
            value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="roll_asc">Roll No ↑</option>
            <option value="roll_desc">Roll No ↓</option>
            <option value="name_az">Name A→Z</option>
            <option value="name_za">Name Z→A</option>
            <option value="present_first">✅ Present First</option>
            <option value="absent_first">❌ Absent First</option>
          </select>
        </div>

        <div className="card" style={{ padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setPanelOpen(p => !p)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>🗓️ {viewMode === 'year' ? year : viewMode === 'month' ? `${MONTHS[month]} ${year}` : dateLabel}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'var(--accent2)', color: '#fff', textTransform: 'capitalize' }}>{viewMode}</span>
            </div>
            <button className="arrow-btn" style={{ width: 24, height: 24, fontSize: 11 }}
              onClick={(e) => { e.stopPropagation(); setPanelOpen(p => !p); }}>
              {panelOpen ? '▲' : '▼'}
            </button>
          </div>

          {panelOpen && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <DateArrowGroup onPrev={() => shiftDay(-1)} onNext={() => shiftDay(1)}>
                  <select className="form-select" style={{ flex: 1, fontSize: 11, padding: '5px 4px' }}
                    value={day} onChange={e => setDay(Number(e.target.value))}>
                    {Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d} {WEEKDAYS[new Date(year, month, d).getDay()]}</option>
                    ))}
                  </select>
                </DateArrowGroup>
                <DateArrowGroup onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)}>
                  <select className="form-select" style={{ flex: 1, fontSize: 11, padding: '5px 4px' }}
                    value={month} onChange={e => setMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                </DateArrowGroup>
                <DateArrowGroup onPrev={() => shiftYear(-1)} onNext={() => shiftYear(1)}>
                  <select className="form-select" style={{ flex: 1, fontSize: 11, padding: '5px 4px' }}
                    value={year} onChange={e => setYear(Number(e.target.value))}>
                    {Array.from({ length: 8 }, (_, i) => year - 4 + i).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </DateArrowGroup>
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
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ color: '#4ade80', fontWeight: 700 }}>✅ {presentCount}</span>
              <span style={{ color: '#f87171', fontWeight: 700 }}>❌ {absentCount}</span>
              <span style={{ color: 'var(--gray)', fontWeight: 700 }}>⏳ {notMarkedCount}</span>
              {!classDay && <span style={{ color: 'var(--gold)' }} title="No one marked yet — likely a holiday">🏖️</span>}
            </div>
            {!isFutureDate && (
              <div style={{ display: 'flex', gap: 12, fontWeight: 600 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                  title={!sportFilter ? 'Pick a specific sport to use Mark All' : undefined}>
                  <input type="checkbox" checked={allPChecked} onChange={() => markAll('P')} /> All P
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                  title={!sportFilter ? 'Pick a specific sport to use Mark All' : undefined}>
                  <input type="checkbox" checked={allAChecked} onChange={() => markAll('A')} /> All A
                </label>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 8 }}>
            {students.length} student(s) · showing {viewMode === 'month' ? `${MONTHS[month]} ${year}` : `${year}`} summary
          </div>
        )}
      </div>

      <div ref={listScrollRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }} onScroll={handleScroll}>
        {loading && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 20 }}>Loading…</div>}

        {!loading && viewMode === 'day' && isFutureDate && (
          <div style={{ background: '#f59e0b18', border: '1px solid #f59e0b55', borderRadius: 10, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600 }}>Future date — attendance cannot be marked yet.</div>
          </div>
        )}

        {!loading && viewMode === 'day' && !isFutureDate && dayStudents.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No students found.</div>
        )}
        {!loading && viewMode !== 'day' && students.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No students found.</div>
        )}

        {!loading && viewMode === 'day' && !isFutureDate && dayStudents.map(s => {
          const status = records[s.id];
          const isLate = status === 'P' && !!lateMap[s.id];
          const rowDone = !!dayStatusMap[s.sport];
          const locked = rowDone && (status === 'A' || (status === 'P' && !isLate));
          const pClass = 'att-btn ' + (status === 'P' ? (isLate ? 'present late' : 'present') : 'inactive');
          const aClass = 'att-btn ' + (status === 'A' ? 'absent' : 'inactive');
          const pTitle = locked ? 'Locked — register closed' : (status === 'P' ? 'Click to clear' : (rowDone ? 'Mark as latecomer (Present)' : 'Mark Present'));
          const aTitle = locked ? 'Locked — register closed' : (status === 'A' ? 'Click to clear' : 'Mark Absent');
          return (
            <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8 }}>
              <RollBadge rollNo={s.roll_no} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                  {s.name}
                  {isLate && (
                    <span style={{ background: '#f9731622', color: '#fb923c', border: '1px solid #f9731655', borderRadius: 5, fontSize: 9, fontWeight: 800, padding: '1px 5px', marginLeft: 5 }}>LATE</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                  {sportFilter ? s.batchLabel : `${s.sport} · ${s.batchLabel}`}
                </div>
              </div>
              <div className="att-btns">
                <button className={pClass} title={pTitle} onClick={() => setStatus(s, 'P')}>P</button>
                <button className={aClass} title={aTitle} onClick={() => setStatus(s, 'A')}>A</button>
              </div>
            </div>
          );
        })}

        {!loading && viewMode === 'month' && students.map(s => {
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

        {!loading && viewMode === 'year' && !yearHasData && (
          <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No attendance records for {year}.</div>
        )}
        {!loading && viewMode === 'year' && MONTHS.map((mLabel, i) => {
          const row = yearSummary[i];
          if (!row || row.days.size === 0) return null;
          return (
            <div key={mLabel} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ width: 46, fontWeight: 800, color: 'var(--gold)', fontSize: 13, flexShrink: 0 }}>{mLabel}</div>
              <div style={{ flex: 1, fontSize: 12, color: 'var(--gray)' }}>{row.days.size} class day{row.days.size === 1 ? '' : 's'}</div>
              <div style={{ display: 'flex', gap: 10, fontSize: 12, fontWeight: 700 }}>
                <span style={{ color: '#4ade80' }}>✅ {row.p}</span>
                <span style={{ color: '#f87171' }}>❌ {row.a}</span>
              </div>
            </div>
          );
        })}

        {!loading && isAdmin && viewMode === 'day' && !isFutureDate && students.length > 0 && (
          sportFilter === '' ? (
            <div style={{ fontSize: 11, color: 'var(--graydk)', marginTop: 10, padding: '8px 10px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8 }}>
              👉 You're viewing <b>All Sports</b>. Pick a specific sport above to close its register (Done) and flag latecomers.
            </div>
          ) : dayCompleted ? (
            <>
              <button className="btn" disabled style={{ width: '100%', marginTop: 10, padding: 12, background: 'var(--card2)', color: 'var(--gray)', border: '1px solid var(--border)', cursor: 'not-allowed', fontWeight: 800 }}>
                🔒 Register Closed
              </button>
              <div style={{ fontSize: 11, color: 'var(--graydk)', marginTop: 5, padding: '0 4px' }}>
                Closed for {sportFilter}. Marked students are locked; new Present marks show as latecomers.
              </div>
            </>
          ) : (
            <>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 10, padding: 12, fontWeight: 800 }} onClick={markAllDone} disabled={completing}>
                {completing ? 'Marking…' : '✅ Done — Close Register'}
              </button>
              <div style={{ fontSize: 11, color: 'var(--graydk)', marginTop: 5, padding: '0 4px' }}>
                Tap P/A again to clear a mark. Closing locks in {sportFilter}'s attendance for the day.
              </div>
            </>
          )
        )}
      </div>

      {viewMode === 'day' && dayStudents.length > 6 && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          title="Scroll to bottom"
          style={{
            position: 'absolute', right: 14, bottom: 14, zIndex: 20,
            width: 40, height: 40, borderRadius: '50%', border: 'none',
            background: 'var(--accent2)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, boxShadow: '0 4px 12px rgba(0,0,0,.25)', cursor: 'pointer',
          }}
        >▼</button>
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
    </div>
  );
}
