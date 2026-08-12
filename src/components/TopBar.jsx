import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function TopBar({ academyName, logoUrl, greeting, onToggleMenu, onToggleNotif, hasNotif }) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="topbar" style={{ gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <div
          className="logo-img"
          onClick={() => { if (isAdmin) navigate('/profile'); }}
          style={{ cursor: 'pointer', flexShrink: 0, overflow: 'hidden' }}
          title="Go to Profile"
        >{logoUrl ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '⚔️'}</div>
        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <div className="academy-name" style={{ whiteSpace: 'normal', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25, fontSize: 13, wordBreak: 'break-word' }}>
            {academyName || 'Academy'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {greeting}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={onToggleNotif} aria-label="Notifications"
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {hasNotif && <span style={{ position: 'absolute', top: 4, right: 4, width: 9, height: 9, background: '#22c55e', borderRadius: '50%', border: '2px solid var(--card2)' }} />}
          </button>
          <button className="hamburger-btn" onClick={onToggleMenu} aria-label="Navigation"
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--border)' }}>
            <span></span><span></span><span></span>
          </button>
        </div>
        <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
          <div className="datetime-time" style={{ fontSize: 12, fontWeight: 700 }}>{time}</div>
          <div className="datetime-date" style={{ fontSize: 9 }}>{date}</div>
        </div>
      </div>
    </div>
  );
}
