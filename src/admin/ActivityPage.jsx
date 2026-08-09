import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function ActivityPage() {
  const { academyId, isSuperadmin } = useAuth();
  const [logs, setLogs] = useState([]);
  const [mode, setMode] = useState('academy'); // 'academy' | 'superadmin'

  useEffect(() => {
    (async () => {
      if (!academyId) return;
      let query = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100);
      query = mode === 'academy' ? query.eq('academy_id', academyId) : query.eq('scope', 'superadmin');
      const { data } = await query;
      setLogs(data || []);
    })();
  }, [academyId, mode]);

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <Link to="/profile" style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 10, display: 'inline-block' }}>← Back to Profile</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>📋 Activity Log</div>
        {isSuperadmin && (
          <div style={{ display: 'flex', gap: 2, background: 'var(--royal)', borderRadius: 8, padding: 2 }}>
            {['academy', 'superadmin'].map(m => (
              <button key={m} className="btn btn-xs" onClick={() => setMode(m)}
                style={{ background: mode === m ? 'var(--accent2)' : 'transparent', color: mode === m ? '#fff' : 'var(--gray)', border: 'none', textTransform: 'capitalize' }}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {logs.map(l => (
        <div key={l.id} className="card" style={{ padding: 10, marginBottom: 6 }}>
          <div style={{ fontSize: 13 }}>{l.action || l.description}</div>
          <div style={{ fontSize: 11, color: 'var(--gray)' }}>{l.actor_name} · {new Date(l.created_at).toLocaleString()}</div>
        </div>
      ))}
      {logs.length === 0 && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No activity recorded.</div>}
    </div>
  );
}
