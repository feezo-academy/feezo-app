import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import PanelWindow from '../components/PanelWindow';

export default function AwardPointsModal({ row, academyId, userId, userName, programs, challenges, existingPoints, onClose, onChanged }) {
  const [values, setValues] = useState(() => {
    const map = {};
    challenges.forEach(c => {
      const existing = existingPoints.find(p => p.challenge_id === c.id);
      map[c.id] = existing ? String(existing.points_awarded) : '';
    });
    return map;
  });
  const [busy, setBusy] = useState(false);

  const setVal = (challengeId, val, maxPoints) => {
    if (val === '') { setValues(prev => ({ ...prev, [challengeId]: '' })); return; }
    let num = Number(val);
    if (Number.isNaN(num)) return;
    if (num < 0) num = 0;
    if (num > maxPoints) num = maxPoints;
    setValues(prev => ({ ...prev, [challengeId]: String(num) }));
  };

  const saveAll = async () => {
    setBusy(true);
    try {
      const rowsToUpsert = challenges
        .filter(c => values[c.id] !== '' && values[c.id] != null)
        .map(c => ({
          academy_id: academyId,
          student_id: row.student.id,
          challenge_id: c.id,
          sport: c.sport,
          points_awarded: Math.min(Number(values[c.id]), c.total_points),
          awarded_by_id: userId,
          awarded_by_name: userName,
          awarded_at: new Date().toISOString(),
        }));
      if (rowsToUpsert.length === 0) { onClose(); return; }
      const { error } = await supabase.from('student_challenge_points').upsert(rowsToUpsert, { onConflict: 'student_id,challenge_id' });
      if (error) throw error;
      onChanged?.();
      onClose();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelWindow onClose={onClose}>
      <div className="modal" style={{ width: '100%', maxWidth: 420, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">
          <span>🏆 Award Points</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{row.student.name}</div>
          <div style={{ fontSize: 12, color: 'var(--gray)' }}>{row.sport} · {row.batchLabel}</div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {programs.map(p => {
            const progChallenges = challenges.filter(c => c.program_id === p.id);
            if (progChallenges.length === 0) return null;
            return (
              <div key={p.id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent2)', marginBottom: 6 }}>{p.name}</div>
                {progChallenges.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1, fontSize: 12 }}>{c.name} <span style={{ color: 'var(--gray)' }}>/ {c.total_points}</span></div>
                    <input
                      type="number" min={0} max={c.total_points}
                      className="form-input" style={{ width: 70, fontSize: 12, padding: '6px 8px' }}
                      placeholder="0"
                      value={values[c.id] ?? ''}
                      onChange={e => setVal(c.id, e.target.value, c.total_points)}
                    />
                  </div>
                ))}
              </div>
            );
          })}
          {challenges.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 20, fontSize: 12 }}>
              No programs/challenges set up for {row.sport} yet.
            </div>
          )}
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={busy} onClick={saveAll}>
          {busy ? 'Saving…' : 'Save Points'}
        </button>
      </div>
    </PanelWindow>
  );
}
