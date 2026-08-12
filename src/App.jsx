import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AcademyDataProvider } from './context/AcademyDataContext';
import LoginScreen from './pages/LoginScreen';
import TopBar from './components/TopBar';
import SideDrawer from './components/SideDrawer';
import BottomNav from './components/BottomNav';
import HomeTab from './tabs/HomeTab';
import StudentsTab from './tabs/StudentsTab';
import AttendanceTab from './tabs/AttendanceTab';
import FeesTab from './tabs/FeesTab';
import EnquiryTab from './tabs/EnquiryTab';
import ProfileTab from './tabs/ProfileTab';
import SportsBatchesPage from './admin/SportsBatchesPage';
import UsersPage from './admin/UsersPage';
import CoursesPage from './admin/CoursesPage';
import SchedulesPage from './admin/SchedulesPage';
import PerformancePage from './admin/PerformancePage';
import ActivityPage from './admin/ActivityPage';
import ClassLogPage from './admin/ClassLogPage';
import LeaveCountPage from './admin/LeaveCountPage';

function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div id="app" className="active">
      <TopBar
        academyName="Academy"
        greeting="Welcome back"
        onToggleMenu={() => setMenuOpen(v => !v)}
        onToggleNotif={() => {}}
        hasNotif={false}
      />
      <SideDrawer open={menuOpen} onClose={() => setMenuOpen(false)} academyName="Academy" />
      <div className="content pages-viewport" style={{ padding: '10px 14px' }}>
        <Routes>
          <Route path="/home" element={<HomeTab />} />
          <Route path="/students" element={<StudentsTab />} />
          <Route path="/attendance" element={<AttendanceTab />} />
          <Route path="/fees" element={<FeesTab />} />
          <Route path="/enquiry" element={<EnquiryTab />} />
          <Route path="/profile" element={<ProfileTab />} />
          <Route path="/admin/sports-batches" element={<SportsBatchesPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/courses" element={<CoursesPage />} />
          <Route path="/admin/schedules" element={<SchedulesPage />} />
          <Route path="/admin/performance" element={<PerformancePage />} />
          <Route path="/admin/activity" element={<ActivityPage />} />
          <Route path="/admin/class-log" element={<ClassLogPage />} />
          <Route path="/admin/leave-count" element={<LeaveCountPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </div>
      <BottomNav />
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
