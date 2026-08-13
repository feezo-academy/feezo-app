import { useEffect, useMemo, useState } from 'react';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { exportGenericPdf, exportGenericXlsx } from '../lib/exporters';
import SendMessageModal from '../components/SendMessageModal';
import { DEFAULT_MSG, DEFAULT_THANK } from '../components/FeeMsgModal';

function buildMsg(tpl, ctx) {
  return tpl
    .replace(/{name}/g, ctx.name || '')
    .replace(/{month}/g, ctx.month || '')
    .replace(/{academy}/g, ctx.academy || '')
    .replace(/{amount}/g, ctx.amount != null ? String(ctx.amount) : '')
    .replace(/{method}/g, ctx.method || '');
}

// Admin-only modal for editing a fee entry's status, amount, and method.
function EditFeeModal({ fee, onClose, onSaved }) {
  const [status, setStatus] = useState(fee.status === 'paid' ? 'paid' : 'unpaid');
  const [amount, setAmount] = useState(fee.amount ?? '');
  const [method, setMethod] = useState(fee.method || 'cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    const amt = parseInt(amount, 10) || 0;
    if (status === 'paid' && amt < 1) {
      setError('Please enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      const update = {
        status,
        amount: amt,
        method: status === 'paid' ? method : fee.method || null,
        paid_date: status === 'paid' ? (fee.paid_date || new Date().toISOString().slice(0, 10)) : null,
      };
      const { error: err } = await supabase.from('fees').update(update).eq('id', fee.id);
      if (err) throw err;
      onSaved({ ...fee, ...update });
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">
          <span>✏️ Edit Fee — {fee.student?.name}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>{fee.month}</div>

        <div className="form-group">
          <label className="form-label">Payment Status</label>
          <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="paid">✅ Paid</option>
            <option value="unpaid">❌ Not Paid</option>
          </select>
        </div>

        {status === 'paid' && (
          <>
            <div className="form-group">
              <label className="form-label">Amount Paid ₹</label>
              <input type="number" min="1" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount" />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <select className="form-select" value={method} onChange={e => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn" style={{ flex: 1, background: 'var(--card2)' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FeesTab() {
  const { visibleStudents, visibleSports, academy } = useAcademyData();
  const { isAdmin, academyId } = useAuth();
  const [fees, setFees] = useState([]);
  const [sportFilter, setSportFilter] = useState('');
  const [statusTab, setStatusTab] = useState('unpaid'); // 'unpaid' | 'paid'
  const [sendModal, setSendModal] = useState(null); // { student, month, kind, text }
  const [editFee, setEditFee] = useState(null); // fee row being edited (admin only)

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

  const sportRows = useMemo(() => fees
    .filter(f => studentsById[f.student_id])
    .map(f => ({ ...f, student: studentsById[f.student_id] }))
    .filter(f => !sportFilter || f.sport === sportFilter),
    [fees, studentsById, sportFilter]);

  const paidRows = useMemo(() => sportRows.filter(f => f.status === 'paid'), [sportRows]);
  const unpaidRows = useMemo(() => sportRows.filter(f => f.status !== 'paid'), [sportRows]);
  const rows = statusTab === 'paid' ? paidRows : unpaidRows;

  const totalDue = unpaidRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalCollected = paidRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

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

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={sportFilter} onChange={e => setSportFilter(e.target.value)}>
          <option value="">All Sports</option>
          {visibleSports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </div>

      {/* Paid / Unpaid tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: statusTab === 'unpaid' ? 'var(--red)' : 'var(--card2)', color: statusTab === 'unpaid' ? '#fff' : 'var(--gray)' }}
          onClick={() => setStatusTab('unpaid')}
        >❌ Unpaid ({unpaidRows.length})</button>
        <button
          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: statusTab === 'paid' ? 'var(--green)' : 'var(--card2)', color: statusTab === 'paid' ? '#fff' : 'var(--gray)' }}
          onClick={() => setStatusTab('paid')}
        >✅ Paid ({paidRows.length})</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
        {rows.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--gray)' }}>
            {statusTab === 'paid' ? 'No paid students yet.' : 'No unpaid students 🎉'}
          </div>
        )}
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
            {/* Admin can edit any entry — flip status, amount, method */}
            {isAdmin && (
              <button className="btn btn-xs btn-outline" onClick={() => setEditFee(f)}>✏️ Edit</button>
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

      {editFee && (
        <EditFeeModal
          fee={editFee}
          onClose={() => setEditFee(null)}
          onSaved={(updated) => {
            setFees(prev => prev.map(f => f.id === updated.id ? { ...f, ...updated } : f));
            setEditFee(null);
          }}
        />
      )}
    </div>
  );
}
