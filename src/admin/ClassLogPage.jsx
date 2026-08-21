import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { supabase } from '../lib/supabaseClient';
import { logActivity } from '../lib/auditLog';
import { parseBatchKey } from '../lib/batchKey';
import { exportGenericPdf, exportGenericXlsx } from '../lib/exporters';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const todayStr = () => new Date().toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${(h % 12) || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

function calcDuration(inTime, outTime) {
  if (!inTime || !outTime) return '';
  const [ih, im] = inTime.split(':').map(Number);
  const [oh, om] = outTime.split(':').map(Number);
  const mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const emptyForm = { date: todayStr(), sport: '', batch: '', inTime: '', outTime: '', note: '' };

// Converts a 24h "HH:MM" value into { h12, min, period } for the custom picker
function to12(t) {
  if (!t) return { h12: '', min: '', period: 'AM' };
  const [h, m] = t.split(':').map(Number);
  return { h12: String((h % 12) || 12), min: pad(m), period: h >= 12 ? 'PM' : 'AM' };
}
// Converts { h12, min, period } back into a 24h "HH:MM" string
function to24(h12, min, period) {
  if (!h12 || min === '') return '';
  let h = parseInt(h12, 10) % 12;
  if (period === 'PM') h += 12;
  return `${pad(h)}:${pad(parseInt(min, 10))}`;
}

const HOUR_OPTS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MIN_OPTS = Array.from({ length: 12 }, (_, i) => pad(i * 5));

// A 3-part 12-hour time picker (hour / minute / AM-PM) that stores its value
// as a plain 24h "HH:MM" string, so the rest of the app (duration calc,
// Supabase columns) doesn't need to change.
function TimePicker12({ value, onChange, accentColor }) {
  const { h12, min, period } = to12(value);
  const selStyle = { flex: 1, padding: '10px 6px', fontSize: 13, textAlign: 'center' };
  const set = (nh, nm, np) => onChange(to24(nh, nm, np));
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      <select className="form-select" style={selStyle} value={h12}
        onChange={(e) => set(e.target.value, min || '00', period)}>
        <option value="">--</option>
        {HOUR_OPTS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span style={{ color: accentColor || 'var(--gray)', fontWeight: 700 }}>:</span>
      <select className="form-select" style={selStyle} value={min}
        onChange={(e) => set(h12 || '12', e.target.value, period)}>
        <option value="">--</option>
        {MIN_OPTS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className="form-select" style={{ ...selStyle, flex: '0 0 62px' }} value={period}
        onChange={(e) => set(h12 || '12', min || '00', e.target.value)}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

export default function ClassLogPage() {
  const { academyId, isAdmin, appUser, assignedSports, assignedBatches, canExport } = useAuth();
  const { visibleSports, visibleBatches } = useAcademyData();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterSport, setFilterSport] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterStaff, setFilterStaff] = useState('');
  const [viewType, setViewType] = useState('month'); // day | month | year
  const [filterDate, setFilterDate] = useState(todayStr());
  const [filterMonth, setFilterMonth] = useState(todayStr().slice(0, 7));
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Edit modal (admin only)
  const [editEntry, setEditEntry] = useState(null);

  const staffName = appUser?.name || appUser?.id || 'Unknown';

  const fetchEntries = async () => {
    if (!academyId) return;
    setLoading(true);
    let query = supabase
      .from('class_log')
      .select('*')
      .eq('academy_id', academyId)
      .order('date', { ascending: false });
    // Staff only ever see their own logged entries — scope it at the query
    // level so their own data never even leaves the DB, not just hidden client-side.
    if (!isAdmin) query = query.eq('created_by', staffName);
    const { data } = await query;
    setEntries((data || []).map(c => ({
      id: c.id, date: c.date, sport: c.sport || '', batch: c.batch,
      inTime: c.in_time, outTime: c.out_time, duration: c.duration,
      note: c.note, by: c.created_by, at: c.created_at,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, [academyId, isAdmin, staffName]);

  // Realtime: keep the list in sync as admin/staff add, edit, or delete entries.
  useEffect(() => {
    if (!academyId) return;
    const channel = supabase
      .channel(`class_log-${academyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'class_log',
        filter: `academy_id=eq.${academyId}`,
      }, (payload) => {
        const toEntry = (c) => ({
          id: c.id, date: c.date, sport: c.sport || '', batch: c.batch,
          inTime: c.in_time, outTime: c.out_time, duration: c.duration,
          note: c.note, by: c.created_by, at: c.created_at,
        });
        if (payload.eventType === 'DELETE') {
          const oldRow = payload.old;
          if (!oldRow) return;
          setEntries(prev => prev.filter(e => e.id !== oldRow.id));
        } else {
          const row = payload.new;
          if (!row) return;
          // Staff channel receives every academy row (filter only supports
          // academy_id) — drop anything that isn't their own entry.
          if (!isAdmin && row.created_by !== staffName) return;
          const entry = toEntry(row);
          setEntries(prev => {
            const idx = prev.findIndex(e => e.id === entry.id);
            if (idx === -1) return [entry, ...prev];
            const next = prev.slice();
            next[idx] = entry;
            return next;
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [academyId, isAdmin, staffName]);

  // Sport options — staff limited to assigned sports
  const sportOptions = useMemo(() => {
    const names = visibleSports.map(s => s.name);
    return isAdmin ? names : names.filter(n => assignedSports.includes(n));
  }, [visibleSports, isAdmin, assignedSports]);

  // Batch options for the ADD form, cascading off form.sport
  const addBatchOptions = useMemo(() => {
    let list = visibleBatches.filter(b => b.sport === form.sport);
    if (!isAdmin && assignedBatches.length) list = list.filter(b => assignedBatches.includes(b.name));
    return list;
  }, [visibleBatches, form.sport, isAdmin, assignedBatches]);

  // Batch options for the FILTER row, cascading off filterSport
  const filterBatchOptions = useMemo(() => {
    let list = filterSport ? visibleBatches.filter(b => b.sport === filterSport) : visibleBatches;
    if (!isAdmin && assignedBatches.length) list = list.filter(b => assignedBatches.includes(b.name));
    return list;
  }, [visibleBatches, filterSport, isAdmin, assignedBatches]);

  const filteredList = useMemo(() => {
    let list = [...entries];
    if (filterSport) list = list.filter(e => (e.sport || '') === filterSport);
    if (filterBatch) list = list.filter(e => e.batch === filterBatch);
    if (isAdmin && filterStaff) list = list.filter(e => e.by === filterStaff);
    if (viewType === 'day' && filterDate) list = list.filter(e => e.date === filterDate);
    else if (viewType === 'year' && filterYear) list = list.filter(e => (e.date || '').startsWith(filterYear + '-'));
    else if (viewType === 'month' && filterMonth) list = list.filter(e => (e.date || '').startsWith(filterMonth));
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [entries, filterSport, filterBatch, filterStaff, isAdmin, viewType, filterDate, filterMonth, filterYear]);
  useEffect(() => {
    if (defaultsApplied) return;
    if (!sportOptions.length) return;
    const sp = sportOptions[0];
    const batchesForSp = visibleBatches.filter(b => b.sport === sp && (isAdmin || !assignedBatches.length || assignedBatches.includes(b.name)));
    setFilterSport(sp);
    setFilterBatch(batchesForSp[0]?.name || '');
    setDefaultsApplied(true);
  }, [sportOptions, visibleBatches, isAdmin, assignedBatches, defaultsApplied]);

  // Staff names available to filter by (admin only) — derived from logged entries
  const staffOptions = useMemo(() => {
    const names = Array.from(new Set(entries.map(e => e.by).filter(Boolean)));
    return names.sort();
  }, [entries]);

  // Batch options for the EDIT form, cascading off editEntry.sport
  const editBatchOptions = useMemo(() => {
    if (!editEntry) return [];
    let list = visibleBatches.filter(b => b.sport === editEntry.sport);
    if (!isAdmin && assignedBatches.length) list = list.filter(b => assignedBatches.includes(b.name));
    return list;
  }, [visibleBatches, editEntry?.sport, isAdmin, assignedBatches]);

  const resetForm = () => setForm({ ...emptyForm, date: todayStr() });

  const openAdd = () => {
    resetForm();
    setShowAdd(true);
  };

  const saveNewEntry = async () => {
    if (!form.date) { alert('Please select a date'); return; }
    if (!form.batch) { alert('Please select a batch'); return; }
    setSaving(true);
    const duration = calcDuration(form.inTime, form.outTime);
    const row = {
      academy_id: academyId,
      date: form.date, sport: form.sport || '', batch: form.batch,
      in_time: form.inTime || '', out_time: form.outTime || '',
      duration, note: form.note.trim(), created_by: staffName,
    };
    const { error } = await supabase.from('class_log').insert(row);
    setSaving(false);
    if (error) { alert('Save failed: ' + error.message); return; }
    logActivity({ academyId, actorId: appUser?.id, actorName: staffName, message: `Added class log entry for ${form.batch} on ${form.date}` });
    setShowAdd(false);
    resetForm();
    fetchEntries();
  };

  const openEdit = (entry) => {
    if (!isAdmin) return;
    setEditEntry({ ...entry });
  };

  const saveEdit = async () => {
    if (!editEntry.date) { alert('Please select a date'); return; }
    if (!editEntry.batch) { alert('Please select a batch'); return; }
    const duration = calcDuration(editEntry.inTime, editEntry.outTime);
    const { error } = await supabase.from('class_log').update({
      date: editEntry.date, batch: editEntry.batch, sport: editEntry.sport || '',
      in_time: editEntry.inTime || '', out_time: editEntry.outTime || '',
      duration, note: (editEntry.note || '').trim(),
    }).eq('id', editEntry.id);
    if (error) { alert('Save failed: ' + error.message); return; }
    logActivity({ academyId, actorId: appUser?.id, actorName: staffName, message: `Edited class log entry for ${editEntry.batch} on ${editEntry.date}` });
    setEditEntry(null);
    fetchEntries();
  };

  const deleteEntry = async (id) => {
    if (!isAdmin) return;
    if (!window.confirm('Delete this class log entry?')) return;
    const entryRow = entries.find(e => e.id === id);
    const { error } = await supabase.from('class_log').delete().eq('id', id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    logActivity({ academyId, actorId: appUser?.id, actorName: staffName, message: `Deleted class log entry for ${entryRow?.batch || ''} on ${entryRow?.date || ''}` });
    fetchEntries();
  };

  const exportRows = () => filteredList.map(e => [
    e.date, e.sport, e.batch, fmt12(e.inTime), fmt12(e.outTime), e.duration || '', e.note || '', e.by || '',
  ]);
  const exportCols = ['Date', 'Sport', 'Batch', 'In Time', 'Out Time', 'Duration', 'Note', 'Logged By'];

  const handleExportPdf = () => {
    const title = isAdmin ? 'Class Log — All' : 'My Class Log';
    exportGenericPdf(title, exportCols, exportRows(), `ClassLog_${todayStr().replace(/-/g, '')}.pdf`);
  };
  const handleExportXlsx = () => {
    exportGenericXlsx(
      exportRows().map(r => Object.fromEntries(exportCols.map((c, i) => [c, r[i]]))),
      `ClassLog_${todayStr().replace(/-/g, '')}.xlsx`,
      'Class Log'
    );
  };

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => String(y - i));
  }, []);

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 6, flexWrap: 'wrap' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>📋 Class Log</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {canExport && (
            <>
              <button className="btn" style={{ background: 'var(--gold)', color: '#fff', fontSize: 11, padding: '7px 10px' }} onClick={handleExportPdf}>PDF</button>
              <button className="btn" style={{ background: '#16a34a', color: '#fff', fontSize: 11, padding: '7px 10px' }} onClick={handleExportXlsx}>XL</button>
            </>
          )}
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '7px 12px' }} onClick={openAdd}>+ Add</button>
        </div>
      </div>

      {/* Sport / Batch filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 7, flexWrap: 'wrap' }}>
        <select
          className="form-select"
          style={{ flex: 1, minWidth: 100, padding: '7px 10px', fontSize: 12 }}
          value={filterSport}
          onChange={(e) => { setFilterSport(e.target.value); setFilterBatch(''); }}
        >
          <option value="">All Sports</option>
          {sportOptions.map(sp => <option key={sp} value={sp}>{sp}</option>)}
        </select>
        <select
          className="form-select"
          style={{ flex: 1, minWidth: 100, padding: '7px 10px', fontSize: 12 }}
          value={filterBatch}
          onChange={(e) => setFilterBatch(e.target.value)}
        >
          <option value="">All Batches</option>
          {filterBatchOptions.map(b => <option key={b.name} value={b.name}>{b.sport} : {b.batchLabel}</option>)}
        </select>
      </div>

      {/* Staff filter (admin only) */}
      {isAdmin && (
        <div style={{ marginBottom: 7 }}>
          <select
            className="form-select"
            style={{ width: '100%', padding: '7px 10px', fontSize: 12 }}
            value={filterStaff}
            onChange={(e) => setFilterStaff(e.target.value)}
          >
            <option value="">👤 All Staff/Admins</option>
            {staffOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {/* Day / Month / Year view */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          className="form-select"
          style={{ flex: '0 0 auto', width: 'auto', padding: '7px 10px', fontSize: 12 }}
          value={viewType}
          onChange={(e) => setViewType(e.target.value)}
        >
          <option value="day">📅 Day</option>
          <option value="month">📆 Month</option>
          <option value="year">🗓️ Year</option>
        </select>
        {viewType === 'day' && (
          <input type="date" className="form-input" style={{ flex: 1, minWidth: 120, padding: '7px 10px', fontSize: 12 }}
            value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        )}
        {viewType === 'month' && (
          <input type="month" className="form-input" style={{ flex: 1, minWidth: 120, padding: '7px 10px', fontSize: 12 }}
            value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
        )}
        {viewType === 'year' && (
          <select className="form-select" style={{ flex: 1, minWidth: 100, padding: '7px 10px', fontSize: 12 }}
            value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>Loading…</div>
      ) : filteredList.length === 0 ? (
        <div className="empty-state" style={{ padding: 20, textAlign: 'center', color: 'var(--gray)' }}>No entries found.</div>
      ) : (
        filteredList.map(e => {
          const d = new Date(e.date + 'T00:00:00');
          const dateDisp = `${DAYS[d.getDay()]}, ${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
          const inDisp = fmt12(e.inTime);
          const outDisp = fmt12(e.outTime);
          return (
            <div key={e.id} className="card" style={{ padding: '11px 13px', marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{dateDisp}</span>
                  <span className="badge badge-blue" style={{ fontSize: 10 }}>{parseBatchKey(e.batch).sport} : {parseBatchKey(e.batch).label}</span>
                </div>
                {(inDisp || outDisp) && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    {inDisp && <span style={{ fontSize: 12, fontWeight: 600 }}><span style={{ color: '#4ade80' }}>🟢 In:</span> {inDisp}</span>}
                    {outDisp && <span style={{ fontSize: 12, fontWeight: 600 }}><span style={{ color: '#f87171' }}>🔴 Out:</span> {outDisp}</span>}
                    {e.duration && <span className="badge badge-gold" style={{ fontSize: 10 }}>⏱ {e.duration}</span>}
                  </div>
                )}
                {e.note && <div style={{ fontSize: 12, color: 'var(--offwhite)', lineHeight: 1.5, marginBottom: 3 }}>{e.note}</div>}
                <div style={{ fontSize: 10, color: 'var(--graydk)' }}>
                  ✍️ {e.by} · {e.at ? new Date(e.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                  <button className="btn btn-primary" style={{ fontSize: 10, padding: '5px 8px' }} onClick={() => openEdit(e)}>✏️ Edit</button>
                  <button className="btn" style={{ fontSize: 10, padding: '5px 8px', background: '#dc2626', color: '#fff' }} onClick={() => deleteEntry(e.id)}>🗑️ Delete</button>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* ── Add Modal ── */}
      {showAdd && (
        <div className="modal-overlay active" style={{ alignItems: 'center', padding: 16 }} onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ borderRadius: 18, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              Log a Class
              <button className="modal-close" onClick={() => setShowAdd(false)}>×</button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label className="form-label" style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>Date</label>
              <input type="date" className="form-input" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>🏆 Sport</label>
                <select className="form-select" value={form.sport}
                  onChange={(e) => setForm(f => ({ ...f, sport: e.target.value, batch: '' }))}>
                  <option value="">— Select —</option>
                  {sportOptions.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>Batch</label>
                <select className="form-select" value={form.batch} onChange={(e) => setForm(f => ({ ...f, batch: e.target.value }))}>
                  <option value="">{form.sport ? '— Select —' : '— sport first —'}</option>
                  {addBatchOptions.map(b => <option key={b.name} value={b.name}>{b.batchLabel}</option>)}
                </select>
              </div>
            </div>

            <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', letterSpacing: '.4px', marginBottom: 8 }}>⏱ CLASS TIMING</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 3, color: '#16a34a' }}>🟢 In Time</label>
                  <TimePicker12 value={form.inTime} onChange={(v) => setForm(f => ({ ...f, inTime: v }))} accentColor="#16a34a" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 3, color: '#dc2626' }}>🔴 Out Time</label>
                  <TimePicker12 value={form.outTime} onChange={(v) => setForm(f => ({ ...f, outTime: v }))} accentColor="#dc2626" />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label" style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>
                Notes <span style={{ fontWeight: 400, color: 'var(--gray)' }}>(optional)</span>
              </label>
              <textarea className="form-input" rows={7} style={{ resize: 'vertical', minHeight: 130 }}
                placeholder="e.g. Warm-up, basics, drills…"
                value={form.note} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1, padding: 11 }} onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2, padding: 11 }} disabled={saving} onClick={saveNewEntry}>
                {saving ? 'Saving…' : '💾 Save Entry'}
              </button>
            </div>
          </div>
        </div>

      )}

      {/* ── Edit Modal (admin only) ── */}
      {editEntry && (
        <div className="modal-overlay active" style={{ alignItems: 'center', padding: 16 }} onClick={() => setEditEntry(null)}>
          <div className="modal" style={{ borderRadius: 18, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              Edit Entry
              <button className="modal-close" onClick={() => setEditEntry(null)}>×</button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label className="form-label" style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>Date</label>
              <input type="date" className="form-input" value={editEntry.date || ''}
                onChange={(e) => setEditEntry(v => ({ ...v, date: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>🏆 Sport</label>
                <select className="form-select" value={editEntry.sport || ''}
                  onChange={(e) => setEditEntry(v => ({ ...v, sport: e.target.value, batch: '' }))}>
                  <option value="">— Select —</option>
                  {sportOptions.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>Batch</label>
                <select className="form-select" value={editEntry.batch || ''}
                  onChange={(e) => setEditEntry(v => ({ ...v, batch: e.target.value }))}>
                  <option value="">{editEntry.sport ? '— Select —' : '— sport first —'}</option>
                  {editBatchOptions.map(b => <option key={b.name} value={b.name}>{b.batchLabel}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 3, color: '#16a34a' }}>🟢 In Time</label>
                <TimePicker12 value={editEntry.inTime || ''} onChange={(v) => setEditEntry(en => ({ ...en, inTime: v }))} accentColor="#16a34a" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 3, color: '#dc2626' }}>🔴 Out Time</label>
                <TimePicker12 value={editEntry.outTime || ''} onChange={(v) => setEditEntry(en => ({ ...en, outTime: v }))} accentColor="#dc2626" />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label" style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>Notes</label>
              <textarea className="form-input" rows={7} style={{ resize: 'vertical', minHeight: 130 }}
                value={editEntry.note || ''} onChange={(e) => setEditEntry(v => ({ ...v, note: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1, padding: 11 }} onClick={() => setEditEntry(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2, padding: 11 }} onClick={saveEdit}>💾 Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
