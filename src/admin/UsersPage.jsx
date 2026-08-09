import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { supabase } from '../lib/supabaseClient';

export default function UsersPage() {
  const { academyId } = useAuth();
  const { sports, batches } = useAcademyData();
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'staff', assigned_sports: [], assigned_batches: [] });
  const [error, setError] = useState('');

  const load = async () => {
    if (!academyId) return;
    const { data } = await supabase.from('app_users').select('*').eq('academy_id', academyId);
    setUsers(data || []);
  };
  useEffect(() => { load(); }, [academyId]);

  const toggleMulti = (field, value) => {
    setForm(prev => {
      const set = new Set(prev[field]);
      set.has(value) ? set.delete(value) : set.add(value);
      return { ...prev, [field]: Array.from(set) };
    });
  };

  const addUser = async () => {
    if (!form.name || !form.email) { setError('Name and email required.'); return; }
    setError('');
    const { error: err } = await supabase.from('app_users').insert({ ...form, academy_id: academyId });
    if (err) { setError(err.message); return; }
    setForm({ name: '', email: '', role: 'staff', assigned_sports: [], assigned_batches: [] });
    setShowAdd(false);
    load();
  };

  const removeUser = async (id) => {
    if (!confirm('Remove this staff member?')) return;
    await supabase.from('app_users').delete().eq('id', id);
    load();
  };

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <Link to="/profile" style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 10, display: 'inline-block' }}>← Back to Profile</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>👤 Staff Users</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add</button>
      </div>

      {showAdd && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
          <input className="form-input" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="form-input" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          {form.role === 'staff' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Assigned Sports</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {sports.map(s => (
                  <button key={s.id} type="button"
                    className={'btn btn-xs ' + (form.assigned_sports.includes(s.name) ? 'btn-primary' : 'btn-outline')}
                    onClick={() => toggleMulti('assigned_sports', s.name)}>{s.name}</button>
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Assigned Batches</div>
             <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {batches.map(b => (
                  <button key={b.id} type="button"
                    className={'btn btn-xs ' + (form.assigned_batches.includes(b.name) ? 'btn-primary' : 'btn-outline')}
                    onClick={() => toggleMulti('assigned_batches', b.name)}>{b.batchLabel}</button>
                ))}
              </div>
            </>
          )}
          <button className="btn btn-primary btn-sm" onClick={addUser}>Save Staff Member</button>
        </div>
      )}

      {users.map(u => (
        <div key={u.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700 }}>{u.name}</div>
            <span style={{ fontSize: 11, color: 'var(--accent2)', fontWeight: 700, textTransform: 'capitalize' }}>{u.role}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray)' }}>{u.email}</div>
          {u.role === 'staff' && (
            <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>
              Sports: {(u.assigned_sports || []).join(', ') || '—'}
            </div>
          )}
          <button className="btn btn-xs" style={{ marginTop: 8, background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => removeUser(u.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
