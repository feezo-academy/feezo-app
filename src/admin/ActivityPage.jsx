import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function ActivityPage() {
  const { academyId, isAdmin, appUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!academyId) return;
      setLoading(true);
      const { data } = await supabase.from('audit_log').select('*')
        .eq('academy_id', academyId)
        .order('created_at', { ascending: false })
        .limit(200);
      let rows = data || [];
      if (!isAdmin) {
        // Staff only ever see their own activity. Older entries (written
        // before actor_id existed) fall back to matching on the saved name.
        rows = rows.filter(l => (l.actor_id ? l.actor_id === appUser?.id : l.actor_name === appUser?.name));
      }
      setLogs(rows);
      setLoading(false);
    })();
  }, [academyId, isAdmin, appUser]);

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: 90 }}>
      <Link to="/profile" style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 10, display: 'inline-block' }}>← Back to Profile</Link>
      <div className="section-title" style={{ marginBottom: 10 }}>📋 Activity Log</div>

      {loading && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 20, fontSize: 12 }}>Loading…</div>}

      {!loading && logs.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No activity recorded.</div>
      )}

      {!loading && logs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Who</th>
                <th>What</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{l.actor_name || '—'}</td>
                  <td>{l.action || l.description || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--gray)', fontSize: 12 }}>{new Date(l.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
