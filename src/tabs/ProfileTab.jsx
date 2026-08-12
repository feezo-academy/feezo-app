import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import AcademyCard from '../components/AcademyCard';
import SettingsModal from '../components/SettingsModal';
import FeeMsgTemplates from '../components/FeeMsgTemplates';
import FeesLogCard from '../components/FeesLogCard';

const ADMIN_LINKS = [
  { to: '/admin/sports-batches', label: 'Sports & Batches', icon: '🥋' },
  { to: '/admin/users', label: 'Staff Users', icon: '👤' },
  { to: '/admin/courses', label: 'Courses', icon: '📚' },
  { to: '/admin/performance', label: 'Performance', icon: '🏆' },
  { to: '/admin/activity', label: 'Activity Log', icon: '📋' },
  { to: '/admin/leave-count', label: 'Leave Count', icon: '🌴' },
];

export default function ProfileTab() {
  const { isAdmin, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>👤 Profile</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowSettings(true)}>⚙️ Settings</button>
          <button className="btn btn-danger btn-sm" onClick={logout}>Logout</button>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <AcademyCard />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <Link to="/calendar" className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <span style={{ fontSize: 18 }}>📅</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Calendar</span>
        </Link>
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

      {isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <FeeMsgTemplates />
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <FeesLogCard />
      </div>

      <button className="btn btn-outline" style={{ width: '100%' }} onClick={logout}>Sign Out</button>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
