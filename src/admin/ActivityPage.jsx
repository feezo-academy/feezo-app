import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function ActivityPage() {
  const { academyId } = useAuth();
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    (async () => {
      if (!academyId) return;
      const { data } = await supabase.from('audit_log').select('*')
        .eq('academy_id', academyId)
        .order('created_at', { ascending: false })
        .limit(100);
      setLogs(data || []);
    })();
  }, [academyId]);

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <Link to="/profile" style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 10, display: 'inline-block' }}>← Back to Profile</Link>
      <div className="section-title" style={{ marginBottom: 10 }}>📋 Activity Log</div>

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
