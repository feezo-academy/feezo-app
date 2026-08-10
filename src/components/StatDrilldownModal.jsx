import { createPortal } from 'react-dom';

export default function StatDrilldownModal({ title, icon, students, onClose }) {
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,40,.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--card)', width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '82vh', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ fontWeight: 800, fontSize: 16 }}>{title}</span>
            <span style={{ fontSize: 12, color: 'var(--gray)', fontWeight: 600 }}>({students.length})</span>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 15, color: 'var(--gray)' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {students.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No students in this category.</div>
          )}
          {students.map((s, i) => (
            <div key={s.id || i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                  {s.sport && s.batchLabel ? `${s.sport} · ${s.batchLabel}` : ''}
                  {s.extra ? (s.sport ? ' · ' : '') + s.extra : ''}
                </div>
              </div>
              {s.contact ? (
                <a href={`tel:${s.contact}`} onClick={e => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--accent2)', color: '#fff', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                  📞 {s.contact}
                </a>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--gray)' }}>No contact</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
