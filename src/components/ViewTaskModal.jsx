import { calcDuration, fmt24to12, fmtTime12, isoToDisplay, SCHED_COLORS, SCHED_LABELS } from '../lib/calendarDate';

export default function ViewTaskModal({ task, isAdmin, staffName, onClose, onEdit, onDelete, onStart, onDone }) {
  if (!task) return null;
  const color = SCHED_COLORS[task.status] || SCHED_COLORS.scheduled;
  const label = SCHED_LABELS[task.status] || SCHED_LABELS.scheduled;

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">
          <span>📋 Task Detail</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--offwhite)', marginBottom: 8 }}>{task.task || ''}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ background: 'var(--card2)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
              <div style={{ color: 'var(--gray)', fontSize: 10, marginBottom: 2 }}>ASSIGNED TO</div>
              <div style={{ fontWeight: 700, color: 'var(--offwhite)' }}>👤 {staffName(task.staff_id)}</div>
            </div>
            <div style={{ background: 'var(--card2)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
              <div style={{ color: 'var(--gray)', fontSize: 10, marginBottom: 2 }}>DATE &amp; TIME</div>
              <div style={{ fontWeight: 700, color: 'var(--offwhite)' }}>
                📆 {isoToDisplay(task.date)}{task.in_time ? ` ⏰ ${fmt24to12(task.in_time)}${task.out_time ? ' – ' + fmt24to12(task.out_time) : ''}` : ''}
              </div>
            </div>
            {task.location && (
              <div style={{ background: 'var(--card2)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                <div style={{ color: 'var(--gray)', fontSize: 10, marginBottom: 2 }}>LOCATION</div>
                <div style={{ fontWeight: 700, color: 'var(--offwhite)' }}>📍 {task.location}</div>
              </div>
            )}
            <div style={{ background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
              <div style={{ color: 'var(--gray)', fontSize: 10, marginBottom: 2 }}>STATUS</div>
              <div style={{ fontWeight: 700, color }}>{label}</div>
            </div>
          </div>

          {task.note && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--gray)', fontStyle: 'italic', background: 'var(--card2)', borderRadius: 8, padding: 10 }}>
              💬 {task.note}
            </div>
          )}

          {(task.started_at || task.completed_at) && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--card2)', borderRadius: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--gray)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Attendance Timeline</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {task.started_at && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f59e0b22', border: '2px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>▶</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Checked In — {fmtTime12(task.started_at)}</div>
                      <div style={{ fontSize: 10, color: 'var(--gray)' }}>Started by {staffName(task.started_by || task.staff_id)}</div>
                    </div>
                  </div>
                )}
                {task.completed_at && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#22c55e22', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>✓</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>Checked Out — {fmtTime12(task.completed_at)}</div>
                      <div style={{ fontSize: 10, color: 'var(--gray)' }}>{task.started_at ? `Duration: ${calcDuration(task.started_at, task.completed_at)}` : ''}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--graydk)' }}>
          Assigned by {staffName(task.created_by)} on {isoToDisplay((task.created_at || '').slice(0, 10))}
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn" style={{ flex: 1, background: 'var(--card2)' }} onClick={() => { onClose(); onEdit(task); }}>✏️ Edit</button>
            <button className="btn" style={{ flex: 1, background: '#ef444422', color: '#f87171', border: '1px solid #ef444444' }} onClick={() => { onClose(); onDelete(task); }}>🗑 Delete</button>
          </div>
        )}

        {!isAdmin && (task.status === 'scheduled' || task.status === 'pending') && (
          <button
            className="btn"
            style={{ width: '100%', background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44', marginTop: 12, fontSize: 13, padding: 11, fontWeight: 700 }}
            onClick={() => { onStart(task); onClose(); }}
          >▶️ Start — Check In Now</button>
        )}

        {!isAdmin && task.status === 'in_progress' && (
          <div style={{ background: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: 10, padding: 10, marginTop: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, marginBottom: 8 }}>⏱ In progress since {fmtTime12(task.started_at)}</div>
            <button
              className="btn"
              style={{ width: '100%', background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44', fontSize: 13, padding: 11, fontWeight: 700 }}
              onClick={() => { onDone(task); onClose(); }}
            >✅ Done — Check Out Now</button>
          </div>
        )}
      </div>
    </div>
  );
}
