import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const THEME_KEY = 'feezo-theme';

function applyTheme(theme) {
  document.body.classList.toggle('dark-theme', theme === 'dark');
}

export default function SettingsModal({ onClose }) {
  const { isAdmin, academyId } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
  const [showPass, setShowPass] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [passSaving, setPassSaving] = useState(false);

  const [snapshots, setSnapshots] = useState([]);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapping, setSnapping] = useState(false);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  };

  const changePassword = async () => {
    setPassMsg('');
    if (newPass.length < 6) { setPassMsg('Password must be at least 6 characters'); return; }
    if (newPass !== confirmPass) { setPassMsg('Passwords do not match'); return; }
    setPassSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setPassSaving(false);
    if (error) { setPassMsg(error.message); return; }
    setPassMsg('✅ Password updated');
    setNewPass('');
    setConfirmPass('');
    setTimeout(() => setShowPass(false), 1200);
  };

  const closePasswordModal = () => {
    setShowPass(false);
    setNewPass('');
    setConfirmPass('');
    setPassMsg('');
  };

  const passwordsMatch = newPass.length > 0 && newPass === confirmPass;

  const loadSnapshots = async () => {
    if (!academyId) return;
    setSnapLoading(true);
    const { data } = await supabase.from('snapshots').select('id,snap_key,label,created_at')
      .eq('academy_id', academyId).order('created_at', { ascending: false });
    setSnapshots(data || []);
    setSnapLoading(false);
  };
  useEffect(() => { if (isAdmin) loadSnapshots(); }, [isAdmin, academyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const takeSnapshot = async () => {
    setSnapping(true);
    try {
      const [
        academyRow, students, fees, batches, sports, enquiries,
        appUsers, attendance, attendanceDayStatus, classLog, courses,
        leaveRequests, msgLogs, achievements, weekSchedules, auditLog,
      ] = await Promise.all([
        supabase.from('academies').select('*').eq('id', academyId),
        supabase.from('students').select('*').eq('academy_id', academyId),
        supabase.from('fees').select('*').eq('academy_id', academyId),
        supabase.from('batches').select('*').eq('academy_id', academyId),
        supabase.from('sports').select('*').eq('academy_id', academyId),
        supabase.from('enquiries').select('*').eq('academy_id', academyId),
        supabase.from('app_users').select('*').eq('academy_id', academyId),
        supabase.from('attendance').select('*').eq('academy_id', academyId),
        supabase.from('attendance_day_status').select('*').eq('academy_id', academyId),
        supabase.from('class_log').select('*').eq('academy_id', academyId),
        supabase.from('courses').select('*').eq('academy_id', academyId),
        supabase.from('leave_requests').select('*').eq('academy_id', academyId),
        supabase.from('msg_logs').select('*').eq('academy_id', academyId),
        supabase.from('achievements').select('*').eq('academy_id', academyId),
        supabase.from('week_schedules').select('*').eq('academy_id', academyId),
        supabase.from('audit_log').select('*').eq('academy_id', academyId),
      ]);
      const snapKey = new Date().toISOString().slice(0, 10) + '-' + Date.now();
      const { error } = await supabase.from('snapshots').insert({
        academy_id: academyId, snap_key: snapKey, label: 'manual',
        data: {
          academies: academyRow.data || [],
          students: students.data || [],
          fees: fees.data || [],
          batches: batches.data || [],
          sports: sports.data || [],
          enquiries: enquiries.data || [],
          app_users: appUsers.data || [],
          attendance: attendance.data || [],
          attendance_day_status: attendanceDayStatus.data || [],
          class_log: classLog.data || [],
          courses: courses.data || [],
          leave_requests: leaveRequests.data || [],
          msg_logs: msgLogs.data || [],
          achievements: achievements.data || [],
          week_schedules: weekSchedules.data || [],
          audit_log: auditLog.data || [],
        },
      });
      if (error) throw error;
      await loadSnapshots();
    } catch (e) {
      alert('Snapshot failed: ' + e.message);
    } finally {
      setSnapping(false);
    }
  };

  const deleteSnapshot = async (id) => {
    if (!confirm('Delete this snapshot? This cannot be undone.')) return;
    const { error } = await supabase.from('snapshots').delete().eq('id', id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    setSnapshots(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-title">
          <span>⚙️ Settings</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Appearance */}
        <div style={{ marginBottom: 16 }}>
          <div className="section-title" style={{ fontSize: 13, marginBottom: 8 }}>🎨 Appearance</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--royal2)', borderRadius: 8, padding: '11px 12px' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--offwhite)' }}>Theme</span>
            <button className="btn btn-outline btn-sm" onClick={toggleTheme}>{theme === 'dark' ? '🌙 Dark' : '☀️ Light'}</button>
          </div>
        </div>

        {/* Account */}
        <div style={{ marginBottom: 16 }}>
          <div className="section-title" style={{ fontSize: 13, marginBottom: 8 }}>🔐 Account</div>
          <button className="btn btn-outline btn-sm" style={{ width: '100%' }} onClick={() => setShowPass(true)}>🔑 Change My Password</button>
        </div>

        {isAdmin && (
          <div>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 16px' }} />

            {/* Snapshots */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div className="section-title" style={{ marginBottom: 0, fontSize: 13 }}>📸 Daily Snapshots</div>
                <button className="btn btn-primary btn-xs" onClick={takeSnapshot} disabled={snapping}>{snapping ? 'Saving…' : '📸 Snap Now'}</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 10, lineHeight: 1.6 }}>
                Saves a full restore point of this academy: profile, students, fees, batches, sports, enquiries, staff, attendance, class logs, courses, leave requests, achievements, schedules, message logs & activity log.
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {snapLoading && <div style={{ padding: 14, fontSize: 12, color: 'var(--gray)' }}>Loading…</div>}
                {!snapLoading && snapshots.length === 0 && <div style={{ padding: 14, fontSize: 12, color: 'var(--gray)' }}>No snapshots yet. Tap 📸 Snap Now to create one.</div>}
                {snapshots.map(s => {
                  const d = new Date(s.created_at);
                  const isManual = s.label === 'manual';
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isManual ? 'var(--accent2)' : 'var(--gold)' }}>{isManual ? '🖐 Manual' : '🕛 Auto'}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                          {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <button className="btn btn-danger btn-xs" onClick={() => deleteSnapshot(s.id)}>🗑️</button>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--graydk)', marginTop: 8 }}>
                Restore isn't available from the app yet — contact support with the snapshot date if you need one restored.
              </div>
            </div>
          </div>
        )}
      </div>

      {showPass && (
        <div className="modal-overlay active" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && closePasswordModal()}>
          <div className="modal" style={{ maxWidth: 340 }}>
            <div className="modal-title">
              <span>🔑 Change Password</span>
              <button className="modal-close" onClick={closePasswordModal}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="password"
                className="form-input"
                placeholder="New password (min 6 chars)"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                autoFocus
              />
              <input
                type="password"
                className="form-input"
                placeholder="Confirm new password"
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
              />
              {passMsg && (
                <div style={{ fontSize: 12, color: passMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>
                  {passMsg}
                </div>
              )}
              {!passMsg && confirmPass.length > 0 && (
                <div style={{ fontSize: 12, color: passwordsMatch ? 'var(--green)' : 'var(--red)' }}>
                  {passwordsMatch ? '✅ Passwords match' : '❌ Passwords do not match'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={closePasswordModal}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1 }}
                  onClick={changePassword}
                  disabled={passSaving || !passwordsMatch}
                >
                  {passSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
