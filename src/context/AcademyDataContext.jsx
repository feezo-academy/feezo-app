import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

const AcademyDataContext = createContext(null);

export function AcademyDataProvider({ children }) {
  const { academyId, isAdmin, assignedSports, assignedBatches } = useAuth();
  const [sports, setSports] = useState([]);
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    const [sp, bt, st] = await Promise.all([
      supabase.from('sports').select('*').eq('academy_id', academyId),
      supabase.from('batches').select('*').eq('academy_id', academyId),
      supabase.from('students').select('*').eq('academy_id', academyId),
    ]);
    setSports(sp.data || []);
    setBatches(bt.data || []);
    setStudents(st.data || []);
    setLoading(false);
  }, [academyId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Staff scoping: restrict dropdowns to assigned sports/batches unless admin.
  // Batches use composite key Sport::Name for sport-scoping.
  const visibleSports = useMemo(() => {
    if (isAdmin) return sports;
    return sports.filter(s => assignedSports.includes(s.name));
  }, [sports, isAdmin, assignedSports]);

  const visibleBatches = useMemo(() => {
    if (isAdmin) return batches;
    return batches.filter(b => {
      const key = `${b.sport}::${b.name}`;
      return assignedBatches.includes(key) || assignedBatches.includes(b.name);
    });
  }, [batches, isAdmin, assignedBatches]);

  const visibleStudents = useMemo(() => {
    if (isAdmin) return students;
    const sportSet = new Set(assignedSports);
    const batchSet = new Set(assignedBatches);
    return students.filter(s => sportSet.has(s.sport) || batchSet.has(s.batch));
  }, [students, isAdmin, assignedSports, assignedBatches]);

  const value = {
    sports, batches, students, loading, refresh,
    visibleSports, visibleBatches, visibleStudents,
  };

  return <AcademyDataContext.Provider value={value}>{children}</AcademyDataContext.Provider>;
}

export function useAcademyData() {
  const ctx = useContext(AcademyDataContext);
  if (!ctx) throw new Error('useAcademyData must be used within AcademyDataProvider');
  return ctx;
}
