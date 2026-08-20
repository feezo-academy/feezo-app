import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AcademyDataProvider, useAcademyData } from './context/AcademyDataContext';
import { PlanProvider } from './context/PlanContext';
import { LoadingProvider } from './components/LoadingContext';
import GlobalLoaderOverlay from './components/GlobalLoaderOverlay';
import CircularLoader from './components/CircularLoader';
import useSwipeNav, { SWIPE_TABS } from './hooks/useSwipeNav';
import LoginScreen from './pages/LoginScreen';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import NavDrawer from './components/NavDrawer';
import HomeTab from './tabs/HomeTab';
import StudentsTab from './tabs/StudentsTab';
import AttendanceTab from './tabs/AttendanceTab';
import FeesTab from './tabs/FeesTab';
import EnquiryTab from './tabs/EnquiryTab';
import ProfileTab from './tabs/ProfileTab';
import CalendarTab from './tabs/CalendarTab';
import SportsBatchesPage from './admin/SportsBatchesPage';
import UsersPage from './admin/UsersPage';
import CoursesPage from './admin/CoursesPage';
import SchedulesPage from './admin/SchedulesPage';
import PerformancePage from './admin/PerformancePage';
import ActivityPage from './admin/ActivityPage';
import LeaveCountPage from './admin/LeaveCountPage';
import StaffLeavePage from './admin/StaffLeavePage';

function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { academy } = useAcademyData();
  const viewportRef = useRef(null);
  useSwipeNav(viewportRef);

  // Directional slide+fade whenever the active tab changes (swipe or bottom-nav tap).
  const location = useLocation();
  const prevIndexRef = useRef(SWIPE_TABS.indexOf(location.pathname));
  const [animClass, setAnimClass] = useState('');
  useEffect(() => {
    const idx = SWIPE_TABS.indexOf(location.pathname);
    const prevIdx = prevIndexRef.current;
    setAnimClass(idx !== -1 && prevIdx !== -1 && idx !== prevIdx ? (idx > prevIdx ? 'tab-enter-right' : 'tab-enter-left') : '');
    prevIndexRef.current = idx;
  }, [location.pathname]);

  return (
    <div id="app" className="active">
      <TopBar
        academyName={academy?.name || 'Academy'}
        logoUrl={academy?.logo_url}
        greeting="Welcome back"
        onToggleMenu={() => setMenuOpen(v => !v)}
        onToggleNotif={() => {}}
        hasNotif={false}
      />
      <div className="content pages-viewport" ref={viewportRef} style={{ padding: '10px 14px' }}>
        <div key={location.pathname} className={animClass} style={{ position: 'absolute', inset: 0 }}>
          <Routes>
            <Route path="/home" element={<HomeTab />} />
            <Route path="/students" element={<StudentsTab />} />
            <Route path="/attendance" element={<AttendanceTab />} />
            <Route path="/fees" element={<FeesTab />} />
            <Route path="/enquiry" element={<EnquiryTab />} />
            <Route path="/calendar" element={<CalendarTab />} />
            <Route path="/calendar/leave" element={<StaffLeavePage />} />
            <Route path="/profile" element={<ProfileTab />} />
            <Route path="/admin/sports-batches" element={<SportsBatchesPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/courses" element={<CoursesPage />} />
            <Route path="/admin/schedules" element={<SchedulesPage />} />
            <Route path="/admin/performance" element={<PerformancePage />} />
            <Route path="/admin/activity" element={<ActivityPage />} />
            <Route path="/admin/leave-count" element={<LeaveCountPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </div>
      <BottomNav />
      <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="app-copyright">© 2026 FeeZo Solutions · v3</div>
      <GlobalLoaderOverlay />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <CircularLoader label="Signing you in..." />
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return (
    <AcademyDataProvider>
      <PlanProvider>
        <LoadingProvider>
          <AppShell />
        </LoadingProvider>
      </PlanProvider>
    </AcademyDataProvider>
  );
}
