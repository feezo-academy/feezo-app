import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabaseClient';
import AchievementsSection from './AchievementsSection';

function calcAge(dobIso) {
  if (!dobIso) return '';
  const d = new Date(dobIso);
  if (isNaN(d)) return '';
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const mDiff = today.getMonth() - d.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--gray)', fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function StudentDetailModal({ student, academyId, isAdmin, canViewContact, onClose, onEdit, onChanged }) {
  const [attStatus, setAttStatus] = useState(null); // 'present' | 'absent' | null
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from('attendance').select('status')
        .eq('academy_id', academyId).eq('student_id', student.id).eq('date', today).maybeSingle();
      setAttStatus(data?.status || null);
    })();
  }, [student.id, academyId]);

  const isBanned = !!student.banned;
  const attTxt = attStatus === 'present' ? '✅ Present today' : attStatus === 'absent' ? '❌ Absent today' : '— Not marked today';

  const toggleBan = async () => {
    setBusy(true);
    const banned = !isBanned;
    await supabase.from('students').update({ banned, banned_on: banned ? new Date().toISOString() : null }).eq('id', student.id);
    setBusy(false);
    onChanged();
    onClose();
  };

  const doDelete = async () => {
    if (!confirm(`Permanently delete "${student.name}"? Attendance & fee history will remain but be orphaned.`)) return;
    setBusy(true);
    await supabase.from('students').delete().eq('id', student.id);
    setBusy(false);
    onChanged();
    onClose();
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,40,.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--card)', width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '88vh', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>👤</span>
            <span style={{ fontWeight: 800, fontSize: 16 }}>Student Details</span>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 15, color: 'var(--gray)' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            {student.roll_no && (
              <div style={{ display: 'inline-flex', background: 'var(--accent2)', color: '#fff', borderRadius: 8, padding: '3px 14px', fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                Roll No. {student.roll_no}
              </div>
            )}
            <div style={{ fontSize: 18, fontWeight: 800 }}>{student.name}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-blue" style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10 }}>{student.batchLabel}</span>
              {isBanned && <span className="badge badge-red" style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10 }}>Dropout</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 6 }}>{attTxt}</div>
          </div>

          <Row label="Age" value={student.dob ? calcAge(student.dob) : student.age} />
          <Row label="Date of Birth" value={student.dob} />
          <Row label="Contact 1" value={canViewContact ? student.contact : null} />
          <Row label="Contact 2" value={canViewContact ? student.contact2 : null} />
          {!canViewContact && <div style={{ fontSize: 11, color: 'var(--gray)', padding: '4px 0' }}>🔒 Contact number hidden. Ask admin to grant access.</div>}
          <Row label="Parent / Guardian" value={student.parent} />
          <Row label="School" value={student.address} />
          <Row label="Joined" value={student.join_date} />

          <div style={{ padding: '10px 0' }}>
            <div style={{ color: 'var(--gray)', fontSize: 12, marginBottom: 6 }}>🏆 Sports Enrolled</div>
            <span className="badge badge-blue" style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10 }}>
              {student.sport} · {student.batchLabel}
            </span>
          </div>

          <AchievementsSection studentId={student.id} academyId={academyId} canEdit={isAdmin} />
        </div>

        <div style={{ display: 'flex', gap: 6, padding: 16, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={busy} onClick={() => { onClose(); onEdit(student); }}>✏️ Edit</button>
          {!isBanned
            ? <button className="btn btn-warning btn-sm" style={{ flex: 1 }} disabled={busy} onClick={toggleBan}>🚫 Block</button>
            : <button className="btn btn-success btn-sm" style={{ flex: 1 }} disabled={busy} onClick={toggleBan}>✅ Restore</button>}
          <button className="btn btn-danger btn-sm" style={{ flex: 1 }} disabled={busy} onClick={doDelete}>🗑️ Delete</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
