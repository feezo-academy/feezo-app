import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { todayIso } from '../lib/calendarDate';

export default function ApplyLeaveModal({ academyId, userId, userName, myTasksByDate, onClose, onSubmitted }) {
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const conflicts = (myTasksByDate[date] || []).filter(t => t.status !== 'done' && t.status !== 'cancelled');

  const submit = async () => {
    setError('');
    if (!date) { setError('Please select a date'); return; }
    if (!reason.trim()) { setError('Please enter a reason'); return; }

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
      onSubmitted();
    } catch (err) {
      setError(err.message || 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">
          <span>🏖️ Apply for Leave</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <div className="form-group">
          <label className="form-label">Leave Date</label>
          <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
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

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1, background: 'var(--card2)' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={submit} disabled={saving}>
            {saving ? 'Submitting…' : '📤 Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
