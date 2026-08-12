import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function SportsBatchesPage() {
  const { sports, batches, refresh } = useAcademyData();
  const { academyId } = useAuth();
  const [newSport, setNewSport] = useState('');
  const [expandedId, setExpandedId] = useState(null); // sport currently expanded, or null
  const [editingId, setEditingId] = useState(null); // sport currently being renamed, or null
  const [editValue, setEditValue] = useState('');
  const [newBatchName, setNewBatchName] = useState('');

  const addSport = async () => {
    if (!newSport.trim()) return;
    await supabase.from('sports').insert({ name: newSport.trim(), academy_id: academyId });
    setNewSport('');
    refresh();
  };

  const deleteSport = async (id) => {
    if (!confirm('Delete this sport? Related batches remain but will be orphaned.')) return;
    await supabase.from('sports').delete().eq('id', id);
    if (expandedId === id) setExpandedId(null);
    refresh();
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditValue(s.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveEdit = async (s) => {
    const name = editValue.trim();
    if (!name || name === s.name) { cancelEdit(); return; }
    // Batches reference their sport by name (composite "Sport::Batch" key pattern),
    // so renaming a sport needs its batch rows updated to the new name too.
    await supabase.from('sports').update({ name }).eq('id', s.id);
    await supabase.from('batches').update({ sport: name }).eq('academy_id', academyId).eq('sport', s.name);
    cancelEdit();
    refresh();
  };

  const toggleExpand = (id) => {
    setExpandedId(cur => (cur === id ? null : id));
    setNewBatchName('');
  };

  const addBatch = async (sport) => {
    if (!newBatchName.trim()) return;
    await supabase.from('batches').insert({ name: newBatchName.trim(), sport: sport.name, academy_id: academyId });
    setNewBatchName('');
    refresh();
  };

  const deleteBatch = async (id) => {
    if (!confirm('Delete this batch?')) return;
    await supabase.from('batches').delete().eq('id', id);
    refresh();
  };

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <Link to="/profile" style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 10, display: 'inline-block' }}>← Back to Profile</Link>
      <div className="section-title" style={{ marginBottom: 10 }}>🥋 Sports & Batches</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input className="form-input" placeholder="New sport name" value={newSport} onChange={e => setNewSport(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={addSport}>Add</button>
      </div>

      {sports.map(s => {
        const isExpanded = expandedId === s.id;
        const isEditing = editingId === s.id;
        const sportBatches = batches.filter(b => b.sport === s.name);

        return (
          <div key={s.id} className="card" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
            <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              {isEditing ? (
                <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    value={editValue}
                    autoFocus
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(s); if (e.key === 'Escape') cancelEdit(); }}
                  />
                  <button className="btn btn-primary btn-xs" onClick={() => saveEdit(s)}>Save</button>
                  <button className="btn btn-xs" onClick={cancelEdit}>Cancel</button>
                </div>
              ) : (
                <>
                  <div
                    onClick={() => toggleExpand(s.id)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--gray)', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--gray)' }}>({sportBatches.length})</span>
                  </div>
                  <button className="btn btn-xs" onClick={() => startEdit(s)}>✏️ Edit</button>
                  <button className="btn btn-xs" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => deleteSport(s.id)}>Delete</button>
                </>
              )}
            </div>

            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--border)', padding: 12, background: 'var(--card2)' }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <input
                    className="form-input"
                    placeholder="New batch name"
                    value={newBatchName}
                    onChange={e => setNewBatchName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addBatch(s); }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => addBatch(s)}>Add</button>
                </div>
                {sportBatches.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--gray)', textAlign: 'center', padding: '8px 0' }}>No batches yet for {s.name}.</div>
                )}
                {sportBatches.map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 500, fontSize: 13.5 }}>{b.name}</span>
                    <button className="btn btn-xs" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => deleteBatch(b.id)}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
