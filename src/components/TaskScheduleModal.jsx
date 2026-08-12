import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { expandDates, isoToDisplay, todayIso } from '../lib/calendarDate';

const DAY_CHIPS = [
  { v: 0, l: 'Sun' }, { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' },
];

export default function TaskScheduleModal({ academyId, userId, sports, batches, staff, editTask, onClose, onSaved }) {
  const isEdit = !!editTask;
  const [task, setTask] = useState(editTask?.task || '');
  const [location, setLocation] = useState(editTask?.location || '');
  const [sport, setSport] = useState(editTask?.sport || '');
  const [batch, setBatch] = useState(editTask?.batch || '');
  const [dateFrom, setDateFrom] = useState(editTask?.date || todayIso());
  const [dateTo, setDateTo] = useState('');
  const [recurDays, setRecurDays] = useState([]);
  const [inTime, setInTime] = useState(editTask?.in_time || '');
  const [outTime, setOutTime] = useState(editTask?.out_time || '');
  const [note, setNote] = useState(editTask?.note || '');
  const [staffIds, setStaffIds] = useState(editTask ? [editTask.staff_id] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const batchOptions = useMemo(() => sport ? batches.filter(b => b.sport === sport) : batches, [sport, batches]);

  useEffect(() => {
    // reset batch if it no longer matches the chosen sport
    if (sport && batch) {
      const b = batches.find(x => x.name === batch);
      if (b && b.sport !== sport) setBatch('');
    }
  }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

  const multiDay = dateFrom && dateTo && dateTo > dateFrom;
  const previewDates = useMemo(() => {
    if (!dateFrom) return [];
    if (!multiDay) return [dateFrom];
    return expandDates(dateFrom, dateTo, recurDays);
  }, [dateFrom, dateTo, recurDays, multiDay]);

  const toggleDay = (v) => setRecurDays(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  const toggleStaff = (id) => setStaffIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const save = async () => {
    setError('');
    if (!task.trim()) { setError('Please enter a task description'); return; }
    if (!dateFrom) { setError('Please pick a From date'); return; }
    if (!staffIds.length) { setError('Please select at least one staff member'); return; }

    let dates;
    if (!multiDay) dates = [dateFrom];
    else {
      dates = expandDates(dateFrom, dateTo, recurDays);
      if (!dates.length) { setError('No matching dates in range for selected days'); return; }
    }

    setSaving(true);
    try {
      if (isEdit) {
        const updRow = {
          task: task.trim(), location: location.trim(), sport, batch,
          date: dateFrom, in_time: inTime || null, out_time: outTime || null, note: note.trim(),
          staff_id: staffIds[0], updated_by: userId, updated_at: new Date().toISOString(),
        };
        const { error: err } = await supabase.from('week_schedules').update(updRow).eq('id', editTask.id);
        if (err) throw err;

        // Extra staff picked while editing → create as new rows
        const extraStaff = staffIds.slice(1);
        if (extraStaff.length) {
          const rows = extraStaff.map(sid => ({
            id: crypto.randomUUID(),
            academy_id: academyId, staff_id: sid, date: dateFrom,
            task: task.trim(), location: location.trim(), sport, batch,
            in_time: inTime || null, out_time: outTime || null, note: note.trim(),
            status: 'scheduled', created_by: userId, created_at: new Date().toISOString(),
          }));
          const { error: e2 } = await supabase.from('week_schedules').insert(rows);
          if (e2) throw e2;
        }
      } else {
        const rows = [];
        dates.forEach(date => {
          staffIds.forEach(sid => {
            rows.push({
              id: crypto.randomUUID(),
              academy_id: academyId, staff_id: sid, date,
              task: task.trim(), location: location.trim(), sport, batch,
              in_time: inTime || null, out_time: outTime || null, note: note.trim(),
              recur_days: recurDays.length ? recurDays : null,
              status: 'scheduled', created_by: userId, created_at: new Date().toISOString(),
            });
          });
        });
        // insert in chunks of 100
        for (let i = 0; i < rows.length; i += 100) {
          const { error: err } = await supabase.from('week_schedules').insert(rows.slice(i, i + 100));
          if (err) throw err;
        }
      }
      onSaved();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-title">
          <span>{isEdit ? '✏️ Edit Task' : '📅 Assign New Task'}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <div className="form-group">
          <label className="form-label">Task / Activity *</label>
          <input className="form-input" value={task} onChange={e => setTask(e.target.value)} placeholder="e.g. Morning Silambam Training" />
        </div>

        <div style={{ display: 'flex', gap: 8 }} className="form-group">
          <div style={{ flex: 1 }}>
            <label className="form-label">Sport</label>
            <select className="form-select" value={sport} onChange={e => setSport(e.target.value)}>
              <option value="">— Any sport —</option>
              {sports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">Batch / Class</label>
            <select className="form-select" value={batch} onChange={e => setBatch(e.target.value)}>
              <option value="">— Any batch —</option>
              {batchOptions.map(b => <option key={b.id} value={b.name}>{b.batchLabel}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }} className="form-group">
          <div style={{ flex: 1 }}>
            <label className="form-label">From Date *</label>
            <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">To Date</label>
            <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 3 }}>Leave blank for single day</div>
          </div>
        </div>

        {multiDay && (
          <div className="form-group">
            <label className="form-label">Repeat on days *</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {DAY_CHIPS.map(c => (
                <label key={c.v} className="ts-day-chip" style={recurDays.includes(c.v) ? { background: 'var(--accent2)', borderColor: 'var(--accent2)', color: '#fff' } : undefined}>
                  <input type="checkbox" checked={recurDays.includes(c.v)} onChange={() => toggleDay(c.v)} style={{ display: 'none' }} />
                  {c.l}
                </label>
              ))}
            </div>
            {recurDays.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 5 }}>
                {previewDates.length} occurrence(s) between {isoToDisplay(dateFrom)} and {isoToDisplay(dateTo)}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }} className="form-group">
          <div style={{ flex: 1 }}>
            <label className="form-label">In Time</label>
            <input type="time" className="form-input" value={inTime} onChange={e => setInTime(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">Out Time</label>
            <input type="time" className="form-input" value={outTime} onChange={e => setOutTime(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Location / Venue</label>
          <input className="form-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Main Hall" />
        </div>

        <div className="form-group">
          <label className="form-label">Assign To * <span style={{ fontSize: 10, color: 'var(--gray)' }}>(multiple staff can share one class)</span></label>
          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {staff.length === 0 && <div style={{ fontSize: 12, color: 'var(--gray)' }}>No staff members found. Add staff from Profile → Staff Users.</div>}
            {staff.map(u => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', background: 'var(--card2)', border: '1px solid var(--border)', marginBottom: 5 }}>
                <input type="checkbox" checked={staffIds.includes(u.id)} onChange={() => toggleStaff(u.id)} style={{ width: 16, height: 16, accentColor: 'var(--accent2)' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--offwhite)' }}>{u.name || u.id}</div>
                  <div style={{ fontSize: 10, color: 'var(--gray)' }}>{u.email || ''}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Note / Instructions</label>
          <textarea className="form-input" rows={2} style={{ resize: 'none' }} value={note} onChange={e => setNote(e.target.value)} placeholder="Any special instructions…" />
        </div>

        {dateFrom && staffIds.length > 0 && (
          <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12, color: 'var(--offwhite)' }}>
            Will create <strong>{Math.max(previewDates.length, 1) * staffIds.length}</strong> task record(s):{' '}
            <strong>{Math.max(previewDates.length, 1)}</strong> date(s) × <strong>{staffIds.length}</strong> staff
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button className="btn" style={{ flex: 1, background: 'var(--card2)' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
