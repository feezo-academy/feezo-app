import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function ActivityPage() {
  const { academyId, isAdmin, appUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userNames, setUserNames] = useState({}); // login_id -> name, for legacy rows

  useEffect(() => {
    (async () => {
      if (!academyId) return;
      setLoading(true);
      const { data } = await supabase.from('audit_log').select('*')
        .eq('academy_id', academyId)
        .order('created_at', { ascending: false })
        .limit(200);
      let rows = data || [];

      // Legacy rows (written by the old HTML app) store the actor as
      // `user_id` (their login_id), not `actor_name`/`actor_id`. Resolve
      // those login_ids to display names in one batch lookup.
      const legacyIds = [...new Set(rows.filter(l => !l.actor_name && l.user_id).map(l => l.user_id))];
      let nameMap = {};
      if (legacyIds.length > 0) {
        const { data: users } = await supabase.from('app_users').select('login_id, name').eq('academy_id', academyId).in('login_id', legacyIds);
        nameMap = Object.fromEntries((users || []).map(u => [u.login_id, u.name]));
      }
      setUserNames(nameMap);

      if (!isAdmin) {
        // Staff only ever see their own activity. Older entries (written
        // before actor_id existed) fall back to matching on the saved name
        // or, for legacy rows, the login_id.
        rows = rows.filter(l => {
          if (l.actor_id) return l.actor_id === appUser?.id;
          if (l.actor_name) return l.actor_name === appUser?.name;
          if (l.user_id) return l.user_id === appUser?.login_id;
          return false;
        });
      }
      setLogs(rows);
      setLoading(false);
    })();
  }, [academyId, isAdmin, appUser]);

  const whoFor = (l) => l.actor_name || (l.user_id && userNames[l.user_id]) || l.user_id || '—';
  // New-app rows store the full message in `description`; legacy rows store
  // it in `detail` (their `action` is just a short category like "attendance").
  const whatFor = (l) => l.description || l.detail || l.action || '—';

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
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{whoFor(l)}</td>
                  <td>{whatFor(l)}</td>
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
