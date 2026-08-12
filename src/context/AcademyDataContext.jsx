import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { parseBatchKey } from '../lib/batchKey';

const AcademyDataContext = createContext(null);

export function AcademyDataProvider({ children }) {
  const { academyId, isAdmin, assignedSports, assignedBatches } = useAuth();
  const [sports, setSports] = useState([]);
  const [rawBatches, setRawBatches] = useState([]);
  const [rawStudents, setRawStudents] = useState([]);
  const [academy, setAcademy] = useState(null);
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
    setRawBatches(bt.data || []);
    setRawStudents(st.data || []);
    setLoading(false);
  }, [academyId]);

  const refreshAcademy = useCallback(async () => {
    if (!academyId) return;
    const { data } = await supabase.from('academies').select('*').eq('id', academyId).single();
    setAcademy(data || null);
  }, [academyId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshAcademy(); }, [refreshAcademy]);

  // batches.name and students.batch are stored as "Sport::BatchName" composite
  // keys (same batch label can exist under multiple sports), so derive a
  // usable `sport` + `batchLabel` on every row rather than assuming a
  // separate `sport` column exists.
  const batches = useMemo(() => rawBatches.map(b => {
    const { sport, label } = parseBatchKey(b.name);
    return { ...b, sport, batchLabel: label };
  }), [rawBatches]);

  const students = useMemo(() => rawStudents.map(s => {
    const { sport, label } = parseBatchKey(s.batch);
    return { ...s, sport, batchLabel: label };
  }), [rawStudents]);

  const visibleSports = useMemo(() => {
    if (isAdmin) return sports;
    return sports.filter(s => assignedSports.includes(s.name));
  }, [sports, isAdmin, assignedSports]);

  const visibleBatches = useMemo(() => {
    if (isAdmin) return batches;
    return batches.filter(b => assignedBatches.includes(b.name)); // b.name is the full composite key
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
    academy, refreshAcademy,
  };

  return <AcademyDataContext.Provider value={value}>{children}</AcademyDataContext.Provider>;
}

export function useAcademyData() {
  const ctx = useContext(AcademyDataContext);
  if (!ctx) throw new Error('useAcademyData must be used within AcademyDataProvider');
  return ctx;
}
