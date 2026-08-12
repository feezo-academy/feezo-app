import { useEffect, useMemo, useState } from 'react';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { exportGenericPdf, exportGenericXlsx } from '../lib/exporters';
import SendMessageModal from '../components/SendMessageModal';
import { DEFAULT_MSG, DEFAULT_THANK } from '../components/FeeMsgTemplates';

function buildMsg(tpl, ctx) {
  return tpl
    .replace(/{name}/g, ctx.name || '')
    .replace(/{month}/g, ctx.month || '')
    .replace(/{academy}/g, ctx.academy || '')
    .replace(/{amount}/g, ctx.amount != null ? String(ctx.amount) : '')
    .replace(/{method}/g, ctx.method || '');
}

export default function FeesTab() {
  const { visibleStudents, visibleSports, academy } = useAcademyData();
  const { isAdmin, academyId } = useAuth();
  const [fees, setFees] = useState([]);
  const [sportFilter, setSportFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sendModal, setSendModal] = useState(null); // { student, month, kind, text }

  useEffect(() => {
    (async () => {
      if (!academyId) return;
      const { data } = await supabase.from('fees').select('*').eq('academy_id', academyId);
      setFees(data || []);
    })();
  }, [academyId]);

  const studentsById = useMemo(() => {
    const m = {};
    visibleStudents.forEach(s => { m[s.id] = s; });
    return m;
  }, [visibleStudents]);

  const rows = useMemo(() => fees
    .filter(f => studentsById[f.student_id])
    .map(f => ({ ...f, student: studentsById[f.student_id] }))
    .filter(f => !sportFilter || f.sport === sportFilter)
    .filter(f => !statusFilter || f.status === statusFilter),
    [fees, studentsById, sportFilter, statusFilter]);

  const totalDue = rows.filter(r => r.status !== 'paid').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalCollected = rows.filter(r => r.status === 'paid').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const markPaid = async (feeId) => {
    await supabase.from('fees').update({ status: 'paid', paid_date: new Date().toISOString().slice(0, 10) }).eq('id', feeId);
    setFees(prev => prev.map(f => f.id === feeId ? { ...f, status: 'paid' } : f));
  };

  const openReminder = (f) => {
    const text = buildMsg(academy?.msg_template || DEFAULT_MSG, { name: f.student.name, month: f.month, academy: academy?.name });
    setSendModal({ student: f.student, month: f.month, kind: 'reminder', text });
  };
  const openThankYou = (f) => {
    const text = buildMsg(academy?.thank_template || DEFAULT_THANK, { name: f.student.name, month: f.month, academy: academy?.name, amount: f.amount, method: f.method || 'Cash' });
    setSendModal({ student: f.student, month: f.month, kind: 'paid', text });
  };

  const exportRows = rows.map(r => ({ Student: r.student.name, Roll: r.student.roll_no, Month: r.month, Amount: r.amount, Status: r.status }));

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>💰 Fees</div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button className="btn btn-gold btn-sm" onClick={() => exportGenericPdf('Fees Report', ['Student', 'Roll', 'Month', 'Amount', 'Status'], exportRows.map(Object.values), 'fees.pdf')}>PDF</button>
          <button className="btn btn-success btn-sm" onClick={() => exportGenericXlsx(exportRows, 'fees.xlsx', 'Fees')}>XL</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--gray)' }}>Collected</div>
          <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: 16 }}>₹{totalCollected.toLocaleString()}</div>
        </div>
        <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--gray)' }}>Due</div>
          <div style={{ fontWeight: 800, color: 'var(--red)', fontSize: 16 }}>₹{totalDue.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={sportFilter} onChange={e => setSportFilter(e.target.value)}>
          <option value="">All Sports</option>
          {visibleSports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
        {rows.map(f => (
          <div key={f.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{f.student.name}</div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>₹{f.amount} · {f.month}</div>
            </div>
            <span className={'badge ' + (f.status === 'paid' ? 'badge-green' : 'badge-red')} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10 }}>
              {f.status}
            </span>
            {f.status === 'paid' ? (
              <button className="btn btn-xs btn-outline" onClick={() => openThankYou(f)}>🎉 Thank You</button>
            ) : (
              <button className="btn btn-xs btn-outline" onClick={() => openReminder(f)}>💬 Remind</button>
            )}
            {isAdmin && f.status !== 'paid' && (
              <button className="btn btn-xs btn-primary" onClick={() => markPaid(f.id)}>Mark Paid</button>
            )}
          </div>
        ))}
      </div>

      {sendModal && (
        <SendMessageModal
          student={sendModal.student}
          month={sendModal.month}
          kind={sendModal.kind}
          initialText={sendModal.text}
          onClose={() => setSendModal(null)}
        />
      )}
    </div>
  );
}
