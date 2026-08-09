import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, signIn, signOut } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [academyId, setAcademyId] = useState(null);
  const [appUser, setAppUser] = useState(null); // row from app_users (role, permissions, assigned sports/batches)
  const [loading, setLoading] = useState(true);

  const loadAppUser = useCallback(async (authUser) => {
    if (!authUser) { setAppUser(null); setAcademyId(null); return; }
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('auth_uid', authUser.id)
      .maybeSingle();
    if (!error && data) {
      setAppUser(data);
      setAcademyId(data.academy_id);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session ? data.session.user : null;
      setUser(u);
      loadAppUser(u).finally(() => setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session ? session.user : null;
      setUser(u);
      loadAppUser(u);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadAppUser]);

  const login = async (email, password) => {
    const { data, error } = await signIn(email, password);
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    await signOut();
    setUser(null);
    setAppUser(null);
    setAcademyId(null);
  };

  // Permission helper: superadmin/admin see everything, staff restricted to assigned sports/batches
  const isAdmin = appUser?.role === 'admin' || appUser?.role === 'superadmin';
  const isSuperadmin = appUser?.role === 'superadmin';
  const assignedSports = appUser?.assigned_sports || [];
  const assignedBatches = appUser?.assigned_batches || [];

  const value = {
    user, appUser, academyId, loading,
    isAdmin, isSuperadmin, assignedSports, assignedBatches,
    login, logout, refreshAppUser: () => loadAppUser(user),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
