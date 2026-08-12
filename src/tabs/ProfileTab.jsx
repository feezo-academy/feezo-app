import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

const ADMIN_LINKS = [
  { to: '/admin/sports-batches', label: 'Sports & Batches', icon: '🥋' },
  { to: '/admin/users', label: 'Staff Users', icon: '👤' },
  { to: '/admin/courses', label: 'Courses', icon: '📚' },
  { to: '/admin/schedules', label: 'Schedules', icon: '🗓️' },
  { to: '/admin/performance', label: 'Performance', icon: '🏆' },
  { to: '/admin/class-log', label: 'Activity Log', icon: '📋' },
  { to: '/admin/activity', label: 'Audit Log', icon: '🛡️' },
  { to: '/admin/leave-count', label: 'Leave Count', icon: '🌴' },
];

export default function ProfileTab() {
  const { user, appUser, isAdmin, logout } = useAuth();

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <div className="section-title" style={{ marginBottom: 14 }}>👤 Profile</div>

      <div className="card" style={{ padding: 16, marginBottom: 14, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, margin: '0 auto 10px' }}>
          {(appUser?.name || user?.email || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{appUser?.name || 'Staff Member'}</div>
        <div style={{ fontSize: 12, color: 'var(--gray)' }}>{user?.email}</div>
        <div style={{ marginTop: 8, display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: 'var(--card2)', color: 'var(--accent2)' }}>
          {isAdmin ? 'Admin' : 'Staff'}
        </div>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {ADMIN_LINKS.map(l => (
            <Link key={l.to} to={l.to} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <span style={{ fontSize: 18 }}>{l.icon}</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{l.label}</span>
            </Link>
          ))}
        </div>
      )}

      {!isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <Link to="/admin/class-log" className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>My Activity</span>
          </Link>
        </div>
      )}

      <button className="btn btn-outline" style={{ width: '100%' }} onClick={logout}>Sign Out</button>
    </div>
  );
}
