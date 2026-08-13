import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { supabase } from '../lib/supabaseClient';

const emptyForm = (role) => ({ name: '', email: '', password: '', role, assigned_sports: [], assigned_batches: [], can_view_contact: false });

export default function UsersPage() {
  const { academyId } = useAuth();
  const { sports, batches } = useAcademyData();
  const [users, setUsers] = useState([]);
  const [view, setView] = useState('admin'); // 'admin' | 'staff'
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm('admin'));
  const [editingId, setEditingId] = useState(null); // app_users.id being edited, or null
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

  const openAdd = () => { setForm(emptyForm(view)); setEditingId(null); setError(''); setShowAdd(true); };

  const openEdit = (u) => {
    setForm({
      name: u.name || '', email: u.email || '', password: '', role: u.role,
      assigned_sports: u.assigned_sports || [], assigned_batches: u.assigned_batches || [],
      can_view_contact: !!u.can_view_contact,
    });
    setEditingId(u.id);
    setError('');
    setShowAdd(true);
  };

  const saveUser = async () => {
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required.'); return; }
    if (form.role === 'staff') {
      if (form.assigned_sports.length === 0) { setError('Please assign at least one sport.'); return; }
      if (form.assigned_batches.length === 0) { setError('Please assign at least one batch.'); return; }
    }
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        // Editing an existing account only updates the profile row — a Supabase
        // Auth user's password can't be changed from the client with the anon
        // key, so there's no password field here.
        const { error: err } = await supabase.from('app_users').update({
          email: form.email.trim().toLowerCase(), name: form.name.trim(), role: form.role,
          assigned_sports: form.assigned_sports, assigned_batches: form.assigned_batches,
          can_view_contact: form.can_view_contact,
        }).eq('id', editingId);
        if (err) throw err;
      } else {
        if (!form.password || form.password.length < 6) throw new Error('Password must be at least 6 characters.');
        // Creating a new login requires the service-role key, which can't run
        // in the browser — the 'create-user' Edge Function does the actual
        // Supabase Auth signup + app_users row server-side.
        const { data, error: err } = await supabase.functions.invoke('create-user', {
          body: {
            email: form.email.trim().toLowerCase(), password: form.password, name: form.name.trim(),
            role: form.role, academy_id: academyId,
            assigned_sports: form.assigned_sports, assigned_batches: form.assigned_batches,
            can_view_contact: form.can_view_contact,
          },
        });
        if (err) {
          let msg = err.message || 'Failed to create user';
          if (err.context && typeof err.context.json === 'function') {
            try { const body = await err.context.json(); if (body?.error) msg = body.error; } catch { /* not JSON */ }
          }
          throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);
      }
      setShowAdd(false);
      setEditingId(null);
      load();
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (u) => {
    if (!confirm(`Permanently delete "${u.name || u.email}"? Their login and access will be removed. This cannot be undone.`)) return;
    try {
      const { data, error: err } = await supabase.functions.invoke('delete-user', { body: { uid: u.id, id: u.id, email: u.email } });
      if (err) throw new Error(err.message || 'Delete failed');
      if (data?.error) throw new Error(data.error);
      load();
      if (data?.warning) alert(data.warning);
    } catch (e) {
      // Fallback: remove the profile row only — the login may linger until
      // cleaned up from the Supabase dashboard, same as the HTML app's fallback.
      await supabase.from('app_users').delete().eq('id', u.id);
      load();
      alert('Removed profile. Note: ' + (e.message || 'login may remain — check the Supabase dashboard.'));
    }
  };

  const toggleContactAccess = async (u) => {
    const next = !u.can_view_contact;
    await supabase.from('app_users').update({ can_view_contact: next }).eq('id', u.id);
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, can_view_contact: next } : x));
  };

  const filtered = users.filter(u => (view === 'admin' ? u.role === 'admin' : u.role !== 'admin'));

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <Link to="/profile" style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 10, display: 'inline-block' }}>← Back to Profile</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>👤 User Management</div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button
          className={'btn btn-sm ' + (view === 'admin' ? 'btn-primary' : 'btn-outline')}
          style={{ flex: 1 }}
          onClick={() => setView('admin')}
        >Admins ({users.filter(u => u.role === 'admin').length})</button>
        <button
          className={'btn btn-sm ' + (view === 'staff' ? 'btn-primary' : 'btn-outline')}
          style={{ flex: 1 }}
          onClick={() => setView('staff')}
        >Staff ({users.filter(u => u.role !== 'admin').length})</button>
      </div>

      {showAdd && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>⚠️ {error}</div>}
          <input className="form-input" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="form-input" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={!!editingId} />
          {!editingId && (
            <input className="form-input" type="password" placeholder="Password (min 6 characters)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          )}
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                <input type="checkbox" checked={form.can_view_contact}
                  onChange={e => setForm({ ...form, can_view_contact: e.target.checked })} />
                📞 Allow viewing student contact numbers
              </label>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => { setShowAdd(false); setEditingId(null); }}>Cancel</button>
            <button className="btn btn-primary btn-sm" style={{ flex: 1.4 }} disabled={saving} onClick={saveUser}>
              {saving ? 'Saving…' : editingId ? '💾 Save Changes' : '💾 Create User'}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--gray)', textAlign: 'center', padding: 24 }}>
          No {view === 'admin' ? 'admins' : 'staff'} yet.
        </div>
      )}
      {filtered.map(u => (
        <div key={u.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700 }}>{u.name}</div>
            <span style={{ fontSize: 11, color: 'var(--accent2)', fontWeight: 700, textTransform: 'capitalize' }}>{u.role}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray)' }}>{u.email}</div>
          {u.role === 'staff' && (
            <>
              <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>
                Sports: {(u.assigned_sports || []).join(', ') || '—'}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, marginTop: 6 }}>
                <input type="checkbox" checked={!!u.can_view_contact} onChange={() => toggleContactAccess(u)} />
                📞 Can view student contact numbers
              </label>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-xs" onClick={() => openEdit(u)}>✏️ Edit</button>
            <button className="btn btn-xs" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => removeUser(u)}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}
