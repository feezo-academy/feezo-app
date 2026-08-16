import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const FREQUENCIES = [
  { key: 'daily', label: 'Daily', days: 1 },
  { key: 'weekly', label: 'Weekly', days: 7 },
  { key: 'monthly', label: 'Monthly', days: 30 },
];

export default function StudentHistoryModal({
  row, academyId, userId, userName, canEdit,
  pointsRecords, challenges, onClose, onAddPoints,
}) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [pickedFrequency, setPickedFrequency] = useState('weekly');
  const [saving, setSaving] = useState(false);

  // ---------- last points entry ----------
  const challengeById = useMemo(() => {
    const m = {};
    challenges.forEach(c => { m[c.id] = c; });
    return m;
  }, [challenges]);

  const lastEntry = useMemo(() => {
    const list = pointsRecords
      .filter(p => challengeById[p.challenge_id])
      .map(p => ({
        challengeName: challengeById[p.challenge_id]?.name || 'Challenge',
        points: Number(p.points_awarded || 0),
        date: p.awarded_at || p.created_at,
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return list[0] || null;
  }, [pointsRecords, challengeById]);

  // ---------- schedule ----------
  const loadSchedule = async () => {
    if (!academyId || !row?.student?.id) return;
    setLoadingSchedule(true);
    const { data, error } = await supabase
      .from('student_schedules')
      .select('*')
      .eq('academy_id', academyId)
      .eq('student_id', row.student.id)
      .eq('sport', row.sport)
      .maybeSingle();
    if (!error) setSchedule(data || null);
    setLoadingSchedule(false);
  };

  const openSchedule = () => {
    setShowSchedule(true);
    loadSchedule();
  };

  const saveSchedule = async () => {
    setSaving(true);
    const freq = FREQUENCIES.find(f => f.key === pickedFrequency);
    const next = new Date();
    next.setDate(next.getDate() + freq.days);
    const { error } = await supabase.from('student_schedules').upsert({
      academy_id: academyId,
      student_id: row.student.id,
      sport: row.sport,
      frequency: pickedFrequency,
      next_due_date: next.toISOString().slice(0, 10),
      created_by_id: userId,
      created_by_name: userName,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'academy_id,student_id,sport' });
    setSaving(false);
    if (error) { alert('Failed to save schedule: ' + error.message); return; }
    loadSchedule();
  };

  return (
    // Rendered in-flow as page content, same pattern as the charts page —
    // keeps a single scroll container with the rest of the app.
    <div style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--gray)', cursor: 'pointer', padding: 4 }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{row.student.name}</div>
          <div style={{ fontSize: 11, color: 'var(--gray)' }}>{row.sport} · {row.batchLabel}</div>
        </div>
      </div>

      {/* ---------- last entry ---------- */}
      <div className="card" style={{ padding: 16, borderRadius: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', marginBottom: 8 }}>LAST ENTRY</div>
        {lastEntry ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{lastEntry.challengeName}</div>
              <div style={{ fontSize: 11, color: 'var(--gray)' }}>{(lastEntry.date || '').slice(0, 10)}</div>
            </div>
            <div style={{ fontWeight: 800, color: 'var(--accent2)', fontSize: 18 }}>+{lastEntry.points}</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--gray)', textAlign: 'center', padding: 10 }}>No points given yet.</div>
        )}
      </div>

      {/* ---------- actions ---------- */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={openSchedule}>
          🗓️ New Entry
        </button>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={onAddPoints}>
          ➕ Add Points
        </button>
      </div>

      {/* ---------- schedule panel ---------- */}
      {showSchedule && (
        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', marginBottom: 8 }}>SCHEDULE</div>

          {loadingSchedule && <div style={{ fontSize: 12, color: 'var(--gray)', textAlign: 'center', padding: 10 }}>Loading…</div>}

          {!loadingSchedule && schedule && (
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                Assigned: <b style={{ textTransform: 'capitalize' }}>{schedule.frequency}</b>
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>
                Next entry due: {schedule.next_due_date}
              </div>
              {canEdit && (
                <button className="btn btn-outline btn-sm" onClick={() => setSchedule(null)}>
                  Change frequency
                </button>
              )}
            </div>
          )}

          {!loadingSchedule && !schedule && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>
                No schedule set for this student's {row.sport} entries yet.
              </div>
              {canEdit ? (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {FREQUENCIES.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setPickedFrequency(f.key)}
                        className={`btn btn-sm ${pickedFrequency === f.key ? 'btn-primary' : 'btn-outline'}`}
                        style={{ flex: 1, fontSize: 12 }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={saveSchedule} disabled={saving} style={{ width: '100%' }}>
                    {saving ? 'Saving…' : 'Save Schedule'}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>Ask an admin/staff to set up a schedule.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
