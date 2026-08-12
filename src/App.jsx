import { useRef, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AcademyDataProvider, useAcademyData } from './context/AcademyDataContext';
import useSwipeNav from './hooks/useSwipeNav';
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
      <BottomNav />
      <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="app-copyright">© 2026 FeeZo Solutions · v3</div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--gray)' }}>Loading…</div>;
  }

  if (!user) return <LoginScreen />;

  return (
    <AcademyDataProvider>
      <AppShell />
    </AcademyDataProvider>
  );
}
