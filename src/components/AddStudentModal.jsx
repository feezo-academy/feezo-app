import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { buildBatchKey } from '../lib/batchKey';

function calcAge(dobIso) {
  if (!dobIso) return '';
  const d = new Date(dobIso);
  if (isNaN(d)) return '';
  const today = new Date();
  if (d > today) return '';
  let age = today.getFullYear() - d.getFullYear();
  const mDiff = today.getMonth() - d.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function AddStudentModal({ academyId, sports, batches, onClose, onSaved }) {
  const [form, setForm] = useState({
    roll_no: '', name: '', dob: '', parent: '', contact: '', contact2: '', address: '',
    join_date: todayIso(), sport: sports[0]?.name || '', batchLabel: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const age = calcAge(form.dob);
  const batchOptions = batches.filter(b => b.sport === form.sport);

  const save = async () => {
    if (!form.name || !form.contact) { setError('Full name and Contact Number 1 are required.'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('students').insert({
      roll_no: form.roll_no || null,
      name: form.name,
      dob: form.dob || null,
      age: age ? String(age) : null,
      parent: form.parent || null,
      contact: form.contact,
      contact2: form.contact2 || null,
      address: form.address || null,
      join_date: form.join_date || null,
      batch: buildBatchKey(form.sport, form.batchLabel), // composite "Sport::BatchName"
      academy_id: academyId,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div className="card" style={{ background: 'var(--card)', width: '100%', maxWidth: 420, padding: 20, borderRadius: 14, marginTop: 30, marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Add Student</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Roll Number</label>
              <input className="form-input" placeholder="Auto-assigned if blank" value={form.roll_no}
                onChange={e => setForm({ ...form, roll_no: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Full Name *</label>
              <input className="form-input" placeholder="Student full name" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Date of Birth</label>
              <input className="form-input" type="date" value={form.dob}
                onChange={e => setForm({ ...form, dob: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Age</label>
              <input className="form-input" value={age} placeholder="Auto-calculated" disabled />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Parent / Guardian Name</label>
            <input className="form-input" placeholder="Parent name" value={form.parent}
              onChange={e => setForm({ ...form, parent: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Contact Number 1 *</label>
              <input className="form-input" placeholder="Primary mobile" value={form.contact}
                onChange={e => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Contact Number 2</label>
              <input className="form-input" placeholder="Secondary (optional)" value={form.contact2}
                onChange={e => setForm({ ...form, contact2: e.target.value })} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>School Name</label>
            <input className="form-input" placeholder="School / College name" value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Joining Date *</label>
            <input className="form-input" type="date" value={form.join_date}
              onChange={e => setForm({ ...form, join_date: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Sport</label>
              <select className="form-select" value={form.sport}
                onChange={e => setForm({ ...form, sport: e.target.value, batchLabel: '' })}>
                {sports.length === 0 && <option value="">No sports added yet</option>}
                {sports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>Batch</label>
              <select className="form-select" value={form.batchLabel}
                onChange={e => setForm({ ...form, batchLabel: e.target.value })}>
                <option value="">— Select Batch —</option>
                {batchOptions.map(b => <option key={b.id} value={b.batchLabel}>{b.batchLabel}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save Student'}
          </button>
        </div>
      </div>
    </div>
  );
}
