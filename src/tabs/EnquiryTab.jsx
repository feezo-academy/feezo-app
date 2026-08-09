import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function EnquiryTab() {
  const { academyId, isAdmin } = useAuth();
  const [enquiries, setEnquiries] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', interest: '', notes: '' });

  const load = async () => {
    if (!academyId) return;
    const { data } = await supabase.from('enquiries').select('*').eq('academy_id', academyId).order('created_at', { ascending: false });
    setEnquiries(data || []);
  };

  useEffect(() => { load(); }, [academyId]);

  const addEnquiry = async () => {
    if (!form.name || !form.phone) return;
    await supabase.from('enquiries').insert({ ...form, academy_id: academyId, status: 'new' });
    setForm({ name: '', phone: '', interest: '', notes: '' });
    setShowAdd(false);
    load();
  };

  const updateStatus = async (id, status) => {
    await supabase.from('enquiries').update({ status }).eq('id', id);
    load();
  };

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>📞 Enquiries</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>+ New</button>
      </div>

      {showAdd && (
        <div className="card" style={{ padding: 12, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="form-input" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="form-input" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <input className="form-input" placeholder="Interested in (sport)" value={form.interest} onChange={e => setForm({ ...form, interest: e.target.value })} />
          <textarea className="form-input" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <button className="btn btn-primary btn-sm" onClick={addEnquiry}>Save Enquiry</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
        {enquiries.map(e => (
          <div key={e.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700 }}>{e.name}</div>
              <span style={{ fontSize: 11, color: 'var(--gray)' }}>{e.status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>{e.phone} · {e.interest}</div>
            {e.notes && <div style={{ fontSize: 12, marginTop: 4 }}>{e.notes}</div>}
            {isAdmin && e.status !== 'converted' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-xs btn-outline" onClick={() => updateStatus(e.id, 'followup')}>Follow-up</button>
                <button className="btn btn-xs btn-primary" onClick={() => updateStatus(e.id, 'converted')}>Convert</button>
                <button className="btn btn-xs" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => updateStatus(e.id, 'closed')}>Close</button>
              </div>
            )}
          </div>
        ))}
        {enquiries.length === 0 && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No enquiries yet.</div>}
      </div>
    </div>
  );
}
