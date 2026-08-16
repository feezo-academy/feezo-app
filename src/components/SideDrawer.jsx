import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/home', icon: '🏠', label: 'Home' },
  { to: '/students', icon: '👥', label: 'Students' },
  { to: '/attendance', icon: '📅', label: 'Attendance' },
  { to: '/fees', icon: '💰', label: 'Fees' },
  { to: '/enquiry', icon: '💬', label: 'Enquiry' },
  { to: '/admin/class-log', icon: '📋', label: 'Activity Log' },
  { to: '/admin/performance', icon: '🏆', label: 'Performance', adminOnly: true },
  { to: '/calendar', icon: '📆', label: 'Calendar' },
  { to: '/leave-requests', icon: '🌴', label: 'Leave Request' },
  { to: '/profile', icon: '👤', label: 'Profile' },
];

export default function SideDrawer({ open, onClose, academyName }) {
  const { appUser, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const items = NAV_ITEMS.filter(i => !i.adminOnly || isAdmin);
  const displayName = appUser?.name || appUser?.id || '';
  const roleLabel = isAdmin ? 'Admin' : 'Staff';

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/');
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          display: open ? 'block' : 'none',
          position: 'fixed', inset: 0, zIndex: 599,
          background: 'rgba(0,0,0,.4)',
        }}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '72vw', maxWidth: 280,
          background: 'var(--card)', borderLeft: '1px solid var(--border)',
          boxShadow: '-4px 0 24px rgba(0,0,0,.45)', zIndex: 600,
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>⚔️</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--offwhite)', lineHeight: 1.25, maxWidth: 150, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>
                {academyName || 'Academy'}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--offwhite)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >✕</button>
          </div>

          {/* User info card */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent2), #7c9ee8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {(displayName || 'U').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--offwhite)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName}
              </div>
              <div style={{ marginTop: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--accent2)22', color: 'var(--accent2)', border: '1px solid var(--accent2)44' }}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) => 'drawer-item' + (isActive ? ' active' : '')}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderRadius: 10, border: '1px solid ' + (isActive ? '#3b82f644' : 'transparent'),
                background: isActive ? '#3b82f622' : 'none',
                color: isActive ? 'var(--accent2)' : 'var(--offwhite)',
                fontSize: 14, fontWeight: 600, textDecoration: 'none',
              })}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Sign out — regular row, styled like the others but in red */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderRadius: 10, border: '1px solid transparent', background: 'none',
              color: '#f87171', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              width: '100%', textAlign: 'left',
            }}
          >
            <span>🚪</span>
            <span>Sign Out</span>
          </button>
        </nav>
      </div>
    </>
  );
}
