import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import PanelWindow from '../components/PanelWindow';

const FREQUENCIES = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

export default function ProgramManagerModal({ academyId, userId, userName, sports, programs, challenges, isAdmin, onClose, onChanged }) {
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [newProgramSport, setNewProgramSport] = useState(sports[0]?.name || '');
  const [newProgramFrequency, setNewProgramFrequency] = useState('weekly');
  const [busy, setBusy] = useState(false);
  const [openProgram, setOpenProgram] = useState(null); // program currently drilled into

  // staff should never reach this screen at all — the entry point in
  // PerformancePage already gates it, this is just a safety net
  if (!isAdmin) return null;

  const addProgram = async () => {
    if (!newProgramName.trim() || !newProgramSport) return;
    setBusy(true);
    const { error } = await supabase.from('programs').insert({
      academy_id: academyId, sport: newProgramSport, name: newProgramName.trim(),
      frequency: newProgramFrequency,
      created_by_id: userId, created_by_name: userName,
    });
    setBusy(false);
    if (error) { alert('Failed: ' + error.message); return; }
    setNewProgramName('');
    setNewFormOpen(false);
    onChanged?.();
  };

  const deleteProgram = async (p) => {
    if (!confirm(`Delete program "${p.name}" and all its challenges?`)) return;
    const { error } = await supabase.from('programs').delete().eq('id', p.id);
    if (error) { alert('Failed: ' + error.message); return; }
    setOpenProgram(null);
    onChanged?.();
  };

  return (
    <PanelWindow onClose={onClose}>
      {/* borderRadius/margin overridden to 0 so this fills the panel band
          edge-to-edge instead of showing rounded card corners */}
      <div className="modal" style={{ width: '100%', maxWidth: '100%', height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 0, margin: 0 }}>
        <div className="modal-title">
          <span>🏆 Manage Programs</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 2px' }}>
          {/* new program — collapsed by default, tap header to expand */}
          <div className="card" style={{ padding: 12, marginBottom: 14 }}>
            <div
              onClick={() => setNewFormOpen(o => !o)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: 12, fontWeight: 700, marginBottom: newFormOpen ? 8 : 0 }}
            >
              <span>+ New Program</span>
              <span style={{ color: 'var(--gray)', transform: newFormOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
            </div>
            {newFormOpen && (
              <>
                <select className="form-select" style={{ width: '100%', fontSize: 12, marginBottom: 6 }} value={newProgramSport} onChange={e => setNewProgramSport(e.target.value)}>
                  {sports.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
                <input className="form-input" style={{ width: '100%', fontSize: 12, marginBottom: 8 }} placeholder="Program name (e.g. Level 1 Basics)"
                  value={newProgramName} onChange={e => setNewProgramName(e.target.value)} />
                <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 5 }}>Points entry frequency</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {FREQUENCIES.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setNewProgramFrequency(f.key)}
                      className={`btn btn-sm ${newProgramFrequency === f.key ? 'btn-primary' : 'btn-outline'}`}
                      style={{ flex: 1, fontSize: 11 }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary" style={{ width: '100%', fontSize: 12 }} disabled={busy || !newProgramName.trim()} onClick={addProgram}>Add Program</button>
              </>
            )}
          </div>

          {/* program summary rows — name + challenge count only; tap to drill in */}
          {programs.map(p => {
            const count = challenges.filter(c => c.program_id === p.id).length;
            return (
              <div
                key={p.id}
                className="card"
                style={{ padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setOpenProgram(p)}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)' }}>
                    {p.sport} · {count} challenge{count !== 1 ? 's' : ''}{p.frequency ? ` · ${p.frequency}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 18, color: 'var(--gray)' }}>›</span>
              </div>
            );
          })}
          {programs.length === 0 && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 20, fontSize: 12 }}>No programs yet.</div>}
        </div>
      </div>

      {openProgram && (
        <ProgramDetailPanel
          program={openProgram}
          challenges={challenges.filter(c => c.program_id === openProgram.id)}
          academyId={academyId}
          userId={userId}
          onClose={() => setOpenProgram(null)}
          onDeleteProgram={() => deleteProgram(openProgram)}
          onChanged={onChanged}
        />
      )}
    </PanelWindow>
  );
}

// Second full-screen panel — opens on top when a program row is tapped.
// Lists that program's challenges, all editable.
function ProgramDetailPanel({ program, challenges, academyId, userId, onClose, onDeleteProgram, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [addingChallenge, setAddingChallenge] = useState(false);
  const [challengeName, setChallengeName] = useState('');
  const [challengePoints, setChallengePoints] = useState('');
  const [editingChallenge, setEditingChallenge] = useState(null); // challenge id
  const [editName, setEditName] = useState('');
  const [editPoints, setEditPoints] = useState('');

  const addChallenge = async () => {
    if (!challengeName.trim() || !challengePoints) return;
    setBusy(true);
    const { error } = await supabase.from('program_challenges').insert({
      program_id: program.id, academy_id: academyId, sport: program.sport,
      name: challengeName.trim(), total_points: Number(challengePoints), created_by_id: userId,
    });
    setBusy(false);
    if (error) { alert('Failed: ' + error.message); return; }
    setChallengeName(''); setChallengePoints(''); setAddingChallenge(false);
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
      <div className="modal" style={{ width: '100%', maxWidth: '100%', height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 0, margin: 0 }}>
        <div className="modal-title">
          <span>{program.name}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 2px' }}>
          <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>{program.sport}{program.frequency ? ` · ${program.frequency}` : ''}</div>
            <button className="btn btn-sm" style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444', fontSize: 11 }} onClick={onDeleteProgram}>
              🗑 Delete Program
            </button>
          </div>

          {challenges.map(c => (
            <div key={c.id} style={{ background: 'var(--card2)', borderRadius: 7, padding: 10, marginBottom: 8 }}>
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
          {challenges.length === 0 && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 16, fontSize: 12 }}>No challenges yet.</div>}

          {addingChallenge ? (
            <div style={{ marginTop: 6 }}>
              <input className="form-input" style={{ width: '100%', fontSize: 12, marginBottom: 5 }} placeholder="Challenge name" value={challengeName} onChange={e => setChallengeName(e.target.value)} />
              <input className="form-input" type="number" style={{ width: '100%', fontSize: 12, marginBottom: 6 }} placeholder="Total points" value={challengePoints} onChange={e => setChallengePoints(e.target.value)} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" style={{ flex: 1, fontSize: 11, background: 'var(--card2)' }} onClick={() => setAddingChallenge(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }} disabled={busy} onClick={addChallenge}>Add</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-outline btn-sm" style={{ width: '100%', fontSize: 11, marginTop: 4 }} onClick={() => setAddingChallenge(true)}>+ Add Challenge</button>
          )}
        </div>
      </div>
    </PanelWindow>
  );
}
