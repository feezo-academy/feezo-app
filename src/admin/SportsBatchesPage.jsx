import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function SportsBatchesPage() {
  const { sports, batches, refresh } = useAcademyData();
  const { academyId } = useAuth();
  const [tab, setTab] = useState('sports');
  const [newSport, setNewSport] = useState('');
  const [newBatch, setNewBatch] = useState({ name: '', sport: sports[0]?.name || '' });

  const addSport = async () => {
    if (!newSport.trim()) return;
    await supabase.from('sports').insert({ name: newSport.trim(), academy_id: academyId });
    setNewSport('');
    refresh();
  };

  const deleteSport = async (id) => {
    if (!confirm('Delete this sport? Related batches remain but will be orphaned.')) return;
    await supabase.from('sports').delete().eq('id', id);
    refresh();
  };

  const addBatch = async () => {
    if (!newBatch.name.trim() || !newBatch.sport) return;
    // Composite key pattern: Sport::Name for sport-scoping
    await supabase.from('batches').insert({ name: newBatch.name.trim(), sport: newBatch.sport, academy_id: academyId });
    setNewBatch({ ...newBatch, name: '' });
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

      <div style={{ display: 'flex', gap: 2, background: 'var(--royal)', borderRadius: 8, padding: 2, marginBottom: 12 }}>
        {['sports', 'batches'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={'btn btn-xs'} style={{ flex: 1, background: tab === t ? 'var(--accent2)' : 'transparent', color: tab === t ? '#fff' : 'var(--gray)', border: 'none', textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'sports' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input className="form-input" placeholder="New sport name" value={newSport} onChange={e => setNewSport(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={addSport}>Add</button>
          </div>
          {sports.map(s => (
            <div key={s.id} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <button className="btn btn-xs" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => deleteSport(s.id)}>Delete</button>
            </div>
          ))}
        </>
      )}

      {tab === 'batches' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <select className="form-select" style={{ flex: 1, minWidth: 100 }} value={newBatch.sport} onChange={e => setNewBatch({ ...newBatch, sport: e.target.value })}>
              {sports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <input className="form-input" style={{ flex: 1, minWidth: 100 }} placeholder="Batch name" value={newBatch.name} onChange={e => setNewBatch({ ...newBatch, name: e.target.value })} />
            <button className="btn btn-primary btn-sm" onClick={addBatch}>Add</button>
          </div>
          {batches.map(b => (
            <div key={b.id} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>{b.name} <span style={{ color: 'var(--gray)', fontWeight: 400, fontSize: 12 }}>({b.sport})</span></span>
              <button className="btn btn-xs" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => deleteBatch(b.id)}>Delete</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
