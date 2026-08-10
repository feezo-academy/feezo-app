import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabaseClient';
import { buildBatchKey } from '../lib/batchKey';
import { rollPrefix, nextRollNumbers } from '../lib/rollNumber';

function Field({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// Bulk-edit School, Sport, Batch (and optionally re-number roll numbers) for a
// selected set of students. Leave a field blank/unchecked to leave it unchanged.
export default function BulkEditStudentsModal({ students, selectedIds, allStudents, sports, batches, academyId, onClose, onSaved }) {
  const selected = students.filter(s => selectedIds.has(s.id));
  const [changeSchool, setChangeSchool] = useState(false);
  const [school, setSchool] = useState('');
  const [changeSportBatch, setChangeSportBatch] = useState(false);
  const [sport, setSport] = useState(sports[0]?.name || '');
  const [batchLabel, setBatchLabel] = useState('');
  const [regenerateRoll, setRegenerateRoll] = useState(false);
  const [blockAction, setBlockAction] = useState(''); // '', 'block', 'unblock'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const blockedCount = selected.filter(s => s.banned).length;
  const activeCount = selected.length - blockedCount;

  const batchOptions = batches.filter(b => b.sport === sport);
  const previewPrefix = changeSportBatch && sport && batchLabel ? rollPrefix(sport, batchLabel) : null;

  const save = async () => {
    if (changeSportBatch && (!sport || !batchLabel)) { setError('Pick both Sport and Batch, or turn that section off.'); return; }
    setSaving(true);
    setError('');

    let rollAssignments = {}; // student.id -> new roll_no
    if (changeSportBatch && regenerateRoll) {
      const prefix = rollPrefix(sport, batchLabel);
      const existingRolls = allStudents.map(s => s.roll_no).filter(Boolean);
      const fresh = nextRollNumbers(prefix, existingRolls, selected.length);
      selected.forEach((s, i) => { rollAssignments[s.id] = fresh[i]; });
    }

    try {
      for (const s of selected) {
        const payload = {};
        if (changeSchool) payload.address = school || null;
        if (changeSportBatch) payload.batch = buildBatchKey(sport, batchLabel);
        if (rollAssignments[s.id]) payload.roll_no = rollAssignments[s.id];
        if (blockAction === 'block' && !s.banned) {
          payload.banned = true;
          payload.banned_on = new Date().toISOString();
        } else if (blockAction === 'unblock' && s.banned) {
          payload.banned = false;
          payload.banned_on = null;
        }
        if (Object.keys(payload).length === 0) continue;
        const { error: err } = await supabase.from('students').update(payload).eq('id', s.id);
        if (err) throw err;
      }
      onSaved();
    } catch (e) {
      setError(e.message || 'Bulk update failed.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,40,.55)', zIndex: 9999 }}>
      <div style={{
        background: 'var(--card)', width: '100%', maxWidth: 480, margin: '0 auto',
        height: '100%', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          background: 'var(--card2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>✏️</span>
            <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--offwhite)' }}>Bulk Edit ({selected.length})</span>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 15, color: 'var(--gray)' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{ fontSize: 12.5, color: '#dc2626', background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.25)', borderRadius: 8, padding: '8px 10px' }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--gray)' }}>
            Applies to {selected.length} selected student{selected.length === 1 ? '' : 's'}. Turn on only the fields you want to change.
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <input type="checkbox" checked={changeSchool} onChange={e => setChangeSchool(e.target.checked)} />
              🏫 Change School
            </label>
            {changeSchool && (
              <Field label="School Name">
                <input className="form-input" placeholder="School / College name" value={school} onChange={e => setSchool(e.target.value)} />
              </Field>
            )}
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              <input type="checkbox" checked={changeSportBatch} onChange={e => setChangeSportBatch(e.target.checked)} />
              🏆 Change Sport / Batch
            </label>
            {changeSportBatch && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Sport">
                    <select className="form-select" value={sport} onChange={e => { setSport(e.target.value); setBatchLabel(''); }}>
                      {sports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Batch">
                    <select className="form-select" value={batchLabel} onChange={e => setBatchLabel(e.target.value)}>
                      <option value="">Select batch</option>
                      {batchOptions.map(b => <option key={b.id} value={b.batchLabel}>{b.batchLabel}</option>)}
                    </select>
                  </Field>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600 }}>
                  <input type="checkbox" checked={regenerateRoll} onChange={e => setRegenerateRoll(e.target.checked)} />
                  Re-assign roll numbers to match new batch{previewPrefix ? ` (${previewPrefix}01, ${previewPrefix}02…)` : ''}
                </label>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🚫 Dropout Status</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontSize: 12.5, fontWeight: 700, padding: '9px 8px', borderRadius: 8, cursor: 'pointer',
                border: blockAction === 'block' ? '1.5px solid #dc2626' : '1px solid var(--border)',
                background: blockAction === 'block' ? 'rgba(220,38,38,.08)' : 'transparent',
                color: blockAction === 'block' ? '#dc2626' : 'var(--offwhite)',
              }}>
                <input type="radio" name="blockAction" style={{ display: 'none' }}
                  checked={blockAction === 'block'}
                  onChange={() => setBlockAction(blockAction === 'block' ? '' : 'block')} />
                🚫 Block ({activeCount})
              </label>
              <label style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontSize: 12.5, fontWeight: 700, padding: '9px 8px', borderRadius: 8, cursor: 'pointer',
                border: blockAction === 'unblock' ? '1.5px solid var(--accent2, #4a6cf7)' : '1px solid var(--border)',
                background: blockAction === 'unblock' ? 'rgba(74,108,247,.08)' : 'transparent',
                color: blockAction === 'unblock' ? 'var(--accent2, #4a6cf7)' : 'var(--offwhite)',
              }}>
                <input type="radio" name="blockAction" style={{ display: 'none' }}
                  checked={blockAction === 'unblock'}
                  onChange={() => setBlockAction(blockAction === 'unblock' ? '' : 'unblock')} />
                ↩️ Unblock ({blockedCount})
              </label>
            </div>
            {blockAction === 'block' && (
              <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 6 }}>
                Moves {activeCount} active student{activeCount === 1 ? '' : 's'} to the Dropped Students list. Already-dropped selections are left as-is.
              </div>
            )}
            {blockAction === 'unblock' && (
              <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 6 }}>
                Restores {blockedCount} dropped student{blockedCount === 1 ? '' : 's'} back to the active list.
              </div>
            )}
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border)',
          flexShrink: 0, background: 'var(--card2)', boxShadow: '0 -4px 12px rgba(0,0,0,.04)',
        }}>
          <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center', padding: '10px 0' }} onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" style={{ flex: 1.4, justifyContent: 'center', padding: '10px 0' }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : `💾 Apply to ${selected.length}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
