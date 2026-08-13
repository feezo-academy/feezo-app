import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { buildBatchKey } from '../lib/batchKey';

export default function SportsBatchesPage() {
  const { sports, batches, students, refresh } = useAcademyData();
  const { academyId } = useAuth();
  const [newSport, setNewSport] = useState('');
  const [expandedId, setExpandedId] = useState(null); // sport currently expanded, or null

  const [editingSportId, setEditingSportId] = useState(null);
  const [editSportValue, setEditSportValue] = useState('');

  const [editingBatchId, setEditingBatchId] = useState(null);
  const [editBatchValue, setEditBatchValue] = useState('');

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

  const startEditSport = (s) => { setEditingSportId(s.id); setEditSportValue(s.name); };
  const cancelEditSport = () => { setEditingSportId(null); setEditSportValue(''); };

  const saveEditSport = async (s) => {
    const name = editSportValue.trim();
    if (!name || name === s.name) { cancelEditSport(); return; }
    const affectedBatches = batches.filter(b => b.sport === s.name);
    const affectedStudents = students.filter(st => st.sport === s.name);

    await supabase.from('sports').update({ name }).eq('id', s.id);
    // Batches (and students' batch assignment) store their sport as a
    // "Sport::BatchName" composite key, not a separate column — so renaming
    // a sport means rebuilding that key for every batch/student under it,
    // or they'd silently detach from their (renamed) sport and batch.
    await Promise.all(affectedBatches.map(b =>
      supabase.from('batches').update({ name: buildBatchKey(name, b.batchLabel), sport: name }).eq('id', b.id)
    ));
    await Promise.all(affectedStudents.map(st =>
      supabase.from('students').update({ batch: buildBatchKey(name, st.batchLabel) }).eq('id', st.id)
    ));

    cancelEditSport();
    refresh();
  };

  const toggleExpand = (id) => {
    setExpandedId(cur => (cur === id ? null : id));
    setNewBatchName('');
    setEditingBatchId(null);
  };

  const addBatch = async (sport) => {
    if (!newBatchName.trim()) return;
    await supabase.from('batches').insert({ name: buildBatchKey(sport.name, newBatchName.trim()), sport: sport.name, academy_id: academyId });
    setNewBatchName('');
    refresh();
  };

  const startEditBatch = (b) => { setEditingBatchId(b.id); setEditBatchValue(b.batchLabel); };
  const cancelEditBatch = () => { setEditingBatchId(null); setEditBatchValue(''); };

  const saveEditBatch = async (b, sport) => {
    const label = editBatchValue.trim();
    if (!label || label === b.batchLabel) { cancelEditBatch(); return; }
    const newName = buildBatchKey(sport.name, label);
    const affectedStudents = students.filter(st => st.batch === b.name);

    await supabase.from('batches').update({ name: newName }).eq('id', b.id);
    await Promise.all(affectedStudents.map(st =>
      supabase.from('students').update({ batch: newName }).eq('id', st.id)
    ));

    cancelEditBatch();
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
        const isEditingSport = editingSportId === s.id;
        const sportBatches = batches.filter(b => b.sport === s.name);

        return (
          <div key={s.id} className="card" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
            <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              {isEditingSport ? (
                <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    value={editSportValue}
                    autoFocus
                    onChange={e => setEditSportValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEditSport(s); if (e.key === 'Escape') cancelEditSport(); }}
                  />
                  <button className="btn btn-primary btn-xs" onClick={() => saveEditSport(s)}>Save</button>
                  <button className="btn btn-xs" onClick={cancelEditSport}>Cancel</button>
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
                  <button className="btn btn-xs" onClick={() => startEditSport(s)}>✏️ Edit</button>
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
                {sportBatches.map(b => {
                  const isEditingBatch = editingBatchId === b.id;
                  return (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 6 }}>
                      {isEditingBatch ? (
                        <>
                          <input
                            className="form-input"
                            style={{ flex: 1 }}
                            value={editBatchValue}
                            autoFocus
                            onChange={e => setEditBatchValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEditBatch(b, s); if (e.key === 'Escape') cancelEditBatch(); }}
                          />
                          <button className="btn btn-primary btn-xs" onClick={() => saveEditBatch(b, s)}>Save</button>
                          <button className="btn btn-xs" onClick={cancelEditBatch}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontWeight: 500, fontSize: 13.5, flex: 1 }}>{b.batchLabel}</span>
                          <button className="btn btn-xs" onClick={() => startEditBatch(b)}>✏️ Edit</button>
                          <button className="btn btn-xs" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => deleteBatch(b.id)}>Delete</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
