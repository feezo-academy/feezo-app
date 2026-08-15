import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const todayIso = () => new Date().toISOString().slice(0, 10);
const tomorrowIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export default function TopBar({ academyName, logoUrl, greeting, onToggleMenu, onToggleNotif, hasNotif, enquiriesPath = '/enquiries' }) {
  const { isAdmin, academyId, appUser } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });

  // ---- Reminder notifications (enquiry follow-ups) ----
  const [reminderRows, setReminderRows] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState(null); // the enquiry shown in the small popup

  const createdByName = appUser?.name || appUser?.id || 'Staff';

  const loadReminders = async () => {
    if (!academyId) return;
    const { data, error } = await supabase
      .from('enquiries')
      .select('id, name, phone, reminder_date, assigned_to, created_by, archived')
      .eq('academy_id', academyId)
      .eq('archived', false)
      .not('reminder_date', 'is', null);
    if (!error) setReminderRows(data || []);
  };

  useEffect(() => {
    loadReminders();
    const t = setInterval(loadReminders, 60000); // keep the bell fresh without needing a page reload
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [academyId]);

  const scopedReminders = useMemo(() => {
    let list = reminderRows;
    if (!isAdmin) {
      list = list.filter(q => q.assigned_to === appUser?.id || q.created_by === createdByName || q.created_by === appUser?.id);
    }
    return list;
  }, [reminderRows, isAdmin, appUser, createdByName]);

  const { overdue, dueToday, dueTomorrow } = useMemo(() => {
    const today = todayIso();
    const tomorrow = tomorrowIso();
    return {
      overdue: scopedReminders.filter(q => q.reminder_date < today),
      dueToday: scopedReminders.filter(q => q.reminder_date === today),
      dueTomorrow: scopedReminders.filter(q => q.reminder_date === tomorrow),
    };
  }, [scopedReminders]);

  const pendingList = useMemo(() => (
    [...overdue, ...dueToday, ...dueTomorrow] // most urgent first
  ), [overdue, dueToday, dueTomorrow]);

  const dotColor = overdue.length > 0 ? '#ef4444' : (dueToday.length + dueTomorrow.length > 0 ? '#f97316' : (hasNotif ? '#22c55e' : null));

  const statusFor = (q) => {
    const today = todayIso();
    if (q.reminder_date < today) return { label: 'Overdue', color: '#ef4444' };
    if (q.reminder_date === today) return { label: 'Today', color: '#f97316' };
    return { label: 'Tomorrow', color: '#f97316' };
  };

  const openBell = () => {
    setShowDropdown(s => !s);
    onToggleNotif?.();
  };

  const goToEnquiries = () => {
    setSelected(null);
    setShowDropdown(false);
    navigate(enquiriesPath, { state: { focusEnquiryId: selected?.id } });
  };

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
          <div style={{ position: 'relative' }}>
            <button onClick={openBell} aria-label="Notifications"
              style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {dotColor && <span style={{ position: 'absolute', top: 4, right: 4, width: 9, height: 9, background: dotColor, borderRadius: '50%', border: '2px solid var(--card2)' }} />}
            </button>

            {showDropdown && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowDropdown(false)} />
                <div className="card" style={{ position: 'absolute', top: 40, right: 0, width: 270, maxHeight: 340, overflowY: 'auto', padding: 8, zIndex: 999, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray)', padding: '4px 6px 8px' }}>
                    ⏰ Enquiry Follow-ups {pendingList.length > 0 && `(${pendingList.length})`}
                  </div>
                  {pendingList.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--gray)', padding: '6px 6px 10px' }}>Nothing pending. 🎉</div>
                  )}
                  {pendingList.map(q => {
                    const s = statusFor(q);
                    return (
                      <div key={q.id} onClick={() => { setSelected(q); setShowDropdown(false); }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 6px', borderRadius: 6, cursor: 'pointer', marginBottom: 2 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--card2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--gray)' }}>📞 {q.phone || '—'}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0, color: s.color, background: 'var(--card2)', borderRadius: 5, padding: '2px 6px' }}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
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

      {selected && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,40,.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setSelected(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 320, padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{selected.name}</div>
              <button onClick={() => setSelected(null)} style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--border)', cursor: 'pointer' }}>✕</button>
            </div>
            {selected.phone && (
              <a href={`tel:${selected.phone}`} style={{ display: 'block', fontSize: 13, color: 'var(--accent2)', textDecoration: 'none', marginBottom: 8 }}>📞 {selected.phone}</a>
            )}
            <div style={{ fontSize: 12.5, marginBottom: 16 }}>
              <span style={{ color: 'var(--gray)' }}>⏰ Reminder: </span>
              <span style={{ fontWeight: 700, color: statusFor(selected).color }}>
                {selected.reminder_date} ({statusFor(selected).label})
              </span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', padding: 11 }} onClick={goToEnquiries}>
              ➜ Go to Enquiries
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
