import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import PanelWindow from '../components/PanelWindow';

export default function ProgramManagerModal({ academyId, userId, userName, sports, programs, challenges, onClose, onChanged }) {
  const [newProgramName, setNewProgramName] = useState('');
  const [newProgramSport, setNewProgramSport] = useState(sports[0]?.name || '');
  const [busy, setBusy] = useState(false);
  const [addingChallengeTo, setAddingChallengeTo] = useState(null); // program id
  const [challengeName, setChallengeName] = useState('');
  const [challengePoints, setChallengePoints] = useState('');
  const [editingChallenge, setEditingChallenge] = useState(null); // challenge id
  const [editName, setEditName] = useState('');
  const [editPoints, setEditPoints] = useState('');

  const addProgram = async () => {
    if (!newProgramName.trim() || !newProgramSport) return;
    setBusy(true);
    const { error } = await supabase.from('programs').insert({
      academy_id: academyId, sport: newProgramSport, name: newProgramName.trim(),
      created_by_id: userId, created_by_name: userName,
    });
    setBusy(false);
    if (error) { alert('Failed: ' + error.message); return; }
    setNewProgramName('');
    onChanged?.();
  };

  const deleteProgram = async (p) => {
    if (!confirm(`Delete program "${p.name}" and all its challenges?`)) return;
    const { error } = await supabase.from('programs').delete().eq('id', p.id);
    if (error) { alert('Failed: ' + error.message); return; }
    onChanged?.();
  };

  const addChallenge = async (program) => {
    if (!challengeName.trim() || !challengePoints) return;
    setBusy(true);
    const { error } = await supabase.from('program_challenges').insert({
      program_id: program.id, academy_id: academyId, sport: program.sport,
      name: challengeName.trim(), total_points: Number(challengePoints), created_by_id: userId,
    });
    setBusy(false);
    if (error) { alert('Failed: ' + error.message); return; }
    setChallengeName(''); setChallengePoints(''); setAddingChallengeTo(null);
    onChanged?.();
  };

  const saveEditChallenge = async (c) => {
    if (!editName.trim() || !editPoints) return;
    setBusy(true);
    const { error } = await supabase.from('program_challenges')
      .update({ name: editName.trim(), total_points: Number(editPoints), updated_at: new Date().toISOString() })
      .eq('id', c.id);
    setBusy(false);
    if (error) { alert('Failed: ' + error.message); return; }
    setEditingChallenge(null);
    onChanged?.();
  };

  const deleteChallenge = async (c) => {
    if (!confirm(`Delete challenge "${c.name}"?`)) return;
    const { error } = await supabase.from('program_challenges').delete().eq('id', c.id);
    if (error) { alert('Failed: ' + error.message); return; }
    onChanged?.();
  };

  return (
    <PanelWindow onClose={onClose}>
      <div className="modal" style={{ width: '100%', maxWidth: 480, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">
          <span>🏆 Manage Programs</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* new program */}
          <div className="card" style={{ padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>+ New Program</div>
            <select className="form-select" style={{ width: '100%', fontSize: 12, marginBottom: 6 }} value={newProgramSport} onChange={e => setNewProgramSport(e.target.value)}>
              {sports.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
            <input className="form-input" style={{ width: '100%', fontSize: 12, marginBottom: 8 }} placeholder="Program name (e.g. Level 1 Basics)"
              value={newProgramName} onChange={e => setNewProgramName(e.target.value)} />
            <button className="btn btn-primary" style={{ width: '100%', fontSize: 12 }} disabled={busy || !newProgramName.trim()} onClick={addProgram}>Add Program</button>
          </div>

          {/* existing programs */}
          {programs.map(p => {
            const progChallenges = challenges.filter(c => c.program_id === p.id);
            return (
              <div key={p.id} className="card" style={{ padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray)' }}>{p.sport}</div>
                  </div>
                  <button className="btn btn-sm" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444', fontSize: 11 }} onClick={() => deleteProgram(p)}>🗑</button>
                </div>

                {progChallenges.map(c => (
                  <div key={c.id} style={{ background: 'var(--card2)', borderRadius: 7, padding: 8, marginBottom: 6 }}>
                    {editingChallenge === c.id ? (
                      <div>
                        <input className="form-input" style={{ width: '100%', fontSize: 12, marginBottom: 5 }} value={editName} onChange={e => setEditName(e.target.value)} />
                        <input className="form-input" type="number" style={{ width: '100%', fontSize: 12, marginBottom: 6 }} value={editPoints} onChange={e => setEditPoints(e.target.value)} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn" style={{ flex: 1, fontSize: 11, background: 'var(--card)' }} onClick={() => setEditingChallenge(null)}>Cancel</button>
                          <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }} disabled={busy} onClick={() => saveEditChallenge(c)}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{c.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--gray)' }}>{c.total_points} pts</div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm" style={{ fontSize: 10, padding: '4px 7px' }}
                            onClick={() => { setEditingChallenge(c.id); setEditName(c.name); setEditPoints(String(c.total_points)); }}>✏️</button>
                          <button className="btn btn-sm" style={{ fontSize: 10, padding: '4px 7px', background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444' }}
                            onClick={() => deleteChallenge(c)}>🗑</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {addingChallengeTo === p.id ? (
                  <div style={{ marginTop: 6 }}>
                    <input className="form-input" style={{ width: '100%', fontSize: 12, marginBottom: 5 }} placeholder="Challenge name" value={challengeName} onChange={e => setChallengeName(e.target.value)} />
                    <input className="form-input" type="number" style={{ width: '100%', fontSize: 12, marginBottom: 6 }} placeholder="Total points" value={challengePoints} onChange={e => setChallengePoints(e.target.value)} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn" style={{ flex: 1, fontSize: 11, background: 'var(--card2)' }} onClick={() => setAddingChallengeTo(null)}>Cancel</button>
                      <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }} disabled={busy} onClick={() => addChallenge(p)}>Add</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-outline btn-sm" style={{ width: '100%', fontSize: 11, marginTop: 4 }} onClick={() => setAddingChallengeTo(p.id)}>+ Add Challenge</button>
                )}
              </div>
            );
          })}
          {programs.length === 0 && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 20, fontSize: 12 }}>No programs yet.</div>}
        </div>
      </div>
    </PanelWindow>
  );
}
