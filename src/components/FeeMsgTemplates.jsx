import { useEffect, useState } from 'react';
import { useAcademyData } from '../context/AcademyDataContext';
import { supabase } from '../lib/supabaseClient';

const DEFAULT_MSG = 'Dear {name}, your fee for {month} is pending at {academy}. Kindly pay at the earliest. Thank you.';
const DEFAULT_THANK = 'Dear {name}, we have received your fee payment of ₹{amount} for {month} via {method}. Thank you for your continued trust in {academy}!';

function Accordion({ title, color, children, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="card">
      <button
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        onClick={() => setOpen(v => !v)}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{title}</span>
        <span style={{ fontSize: 13, color: 'var(--gray)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

export default function FeeMsgTemplates() {
  const { academy, refreshAcademy } = useAcademyData();
  const [msgTpl, setMsgTpl] = useState('');
  const [thankTpl, setThankTpl] = useState('');
  const [savingMsg, setSavingMsg] = useState(false);
  const [savingThank, setSavingThank] = useState(false);

  useEffect(() => {
    if (!academy) return;
    setMsgTpl(academy.msg_template || DEFAULT_MSG);
    setThankTpl(academy.thank_template || DEFAULT_THANK);
  }, [academy]);

  const saveMsg = async () => {
    setSavingMsg(true);
    const { error } = await supabase.from('academies').update({ msg_template: msgTpl.trim(), updated_at: new Date().toISOString() }).eq('id', academy.id);
    setSavingMsg(false);
    if (error) { alert('Save failed: ' + error.message); return; }
    refreshAcademy();
  };

  const saveThank = async () => {
    setSavingThank(true);
    const { error } = await supabase.from('academies').update({ thank_template: thankTpl.trim(), updated_at: new Date().toISOString() }).eq('id', academy.id);
    setSavingThank(false);
    if (error) { alert('Save failed: ' + error.message); return; }
    refreshAcademy();
  };

  if (!academy) return null;

  return (
    <>
      <Accordion title="✅ Default Fee Reminder Message" color="var(--gold)">
        <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 8, lineHeight: 1.6 }}>
          Use <b style={{ color: 'var(--gold)' }}>{'{name}'}</b> for student name, <b style={{ color: 'var(--gold)' }}>{'{month}'}</b> for fee month, <b style={{ color: 'var(--gold)' }}>{'{academy}'}</b> for academy name.
        </div>
        <textarea className="form-input" rows={4} style={{ resize: 'none', lineHeight: 1.7, marginBottom: 10 }} value={msgTpl} onChange={e => setMsgTpl(e.target.value)} />
        <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={saveMsg} disabled={savingMsg}>
          {savingMsg ? 'Saving…' : '💾 Save Message Template'}
        </button>
      </Accordion>

      <Accordion title="🎉 Payment Thank-You Message" color="var(--gold)">
        <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 8, lineHeight: 1.6 }}>
          Sent when a payment is recorded. Use <b style={{ color: 'var(--gold)' }}>{'{name}'}</b>, <b style={{ color: 'var(--gold)' }}>{'{month}'}</b>, <b style={{ color: 'var(--gold)' }}>{'{academy}'}</b>, <b style={{ color: 'var(--gold)' }}>{'{amount}'}</b>, <b style={{ color: 'var(--gold)' }}>{'{method}'}</b>.
        </div>
        <textarea className="form-input" rows={4} style={{ resize: 'none', lineHeight: 1.7, marginBottom: 10 }} value={thankTpl} onChange={e => setThankTpl(e.target.value)} />
        <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={saveThank} disabled={savingThank}>
          {savingThank ? 'Saving…' : '💾 Save Thank-You Template'}
        </button>
      </Accordion>
    </>
  );
}

export { DEFAULT_MSG, DEFAULT_THANK };
