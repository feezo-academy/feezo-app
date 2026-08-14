import { supabase } from './supabaseClient';

// Best-effort activity logger. Writes to both `action` and `description` so
// it shows up in admin/ActivityPage.jsx regardless of which column it reads.
// Never throws — a failed audit write should never block the real action.
export async function logActivity({ academyId, actorId = null, actorName, message }) {
  try {
    const { error } = await supabase.from('audit_log').insert({
      academy_id: academyId,
      actor_id: actorId,
      actor_name: actorName || 'Unknown',
      action: message,
      description: message,
    });
    if (error) console.error('audit_log insert failed:', error);
  } catch (e) {
    console.error('audit_log insert threw:', e);
  }
}
