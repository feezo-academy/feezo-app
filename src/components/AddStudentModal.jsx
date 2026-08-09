import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AddStudentModal({ academyId, sports, batches, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', roll_no: '', sport: sports[0]?.name || '', batch: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const batchOptions = batches.filter(b => b.sport === form.sport);

  const save = async () => {
    if (!form.name || !form.roll_no) { setError('Name and roll number are required.'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('students').insert({ ...form, academy_id: academyId });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ background: 'var(--card)', width: '100%', maxWidth: 380, padding: 20, borderRadius: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Add Student</div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="form-input" placeholder="Full name" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="form-input" placeholder="Roll number" value={form.roll_no}
            onChange={e => setForm({ ...form, roll_no: e.target.value })} />
          <select className="form-select" value={form.sport}
            onChange={e => setForm({ ...form, sport: e.target.value, batch: '' })}>
            {sports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <select className="form-select" value={form.batch}
            onChange={e => setForm({ ...form, batch: e.target.value })}>
            <option value="">Select batch</option>
            {batchOptions.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          <input className="form-input" placeholder="Phone" value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
