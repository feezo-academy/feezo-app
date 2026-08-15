import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { logActivity } from '../lib/auditLog';
import { todayIso } from '../lib/calendarDate';
import PanelWindow from './PanelWindow';

export default function ApplyLeaveModal({ academyId, userId, userName, myTasksByDate, onClose, onSubmitted }) {
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const conflicts = (myTasksByDate[date] || []).filter(t => t.status !== 'done' && t.status !== 'cancelled');

  // Earliest scheduled start time today, so leave can't be requested once
  // that task is already underway.
  const earliestTodayStart = (myTasksByDate[todayIso()] || [])
    .filter(t => t.in_time && t.status !== 'done' && t.status !== 'cancelled')
    .map(t => t.in_time)
    .sort()[0];

  const submit = async () => {
    setError('');
    if (!date) { setError('Please select a date'); return; }
    if (!reason.trim()) { setError('Please enter a reason'); return; }

    const today = todayIso();
    if (date < today) { setError('Cannot apply for leave on a past date'); return; }
    if (date === today && earliestTodayStart) {
      const now = new Date();
      const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (nowHM >= earliestTodayStart) {
        setError(`Cannot apply for leave today — your task at ${earliestTodayStart} has already started`);
        return;
      }
    }

    setSaving(true);
    try {
      const { data: existing } = await supabase.from('leave_requests').select('id')
        .eq('academy_id', academyId).eq('staff_id', userId).eq('date', date).eq('status', 'pending').maybeSingle();
      if (existing) { setError('You already have a pending leave request for this date'); setSaving(false); return; }

      const { error: err } = await supabase.from('leave_requests').insert({
        id: crypto.randomUUID(),
        academy_id: academyId, staff_id: userId, staff_name: userName, date,
        reason: reason.trim(), status: 'pending', applied_at: new Date().toISOString(),
      });
      if (err) throw err;
      logActivity({ academyId, actorId: userId, actorName: userName, message: `Applied for leave on ${date}` });
      onSubmitted();
    } catch (err) {
      setError(err.message || 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelWindow onClose={onClose}>
      <div
        className="modal"
        style={{ width: '100%', maxWidth: 400, height: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        <div className="modal-title" style={{ padding: '16px 20px', flexShrink: 0, borderBottom: '1px solid var(--border)', margin: 0 }}>
          <span>🏖️ Apply for Leave</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', minHeight: 0 }}>
          {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}

          <div className="form-group">
            <label className="form-label">Leave Date</label>
            <input type="date" className="form-input" value={date} min={todayIso()} onChange={e => setDate(e.target.value)} />
            {date === todayIso() && earliestTodayStart && (
              <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 3 }}>Must be applied before {earliestTodayStart} today</div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <textarea className="form-input" rows={3} style={{ resize: 'none' }} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Personal work, medical appointment…" />
          </div>

          {conflicts.length > 0 && (
            <div style={{ background: '#f59e0b18', border: '1px solid #f59e0b44', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#b45309' }}>
              ⚠️ You have <b>{conflicts.length} task{conflicts.length > 1 ? 's' : ''}</b> scheduled on this day. Admin will be notified to reassign.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '14px 20px', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <button className="btn" style={{ flex: 1, background: 'var(--card2)' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={submit} disabled={saving}>
            {saving ? 'Submitting…' : '📤 Submit Request'}
          </button>
        </div>
      </div>
    </PanelWindow>
  );
}
