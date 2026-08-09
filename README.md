# FeeZo — React Conversion

Converted from the single-file `index.html` (16.5k lines) into a Vite + React app with each tab as its own component and a shared data/auth layer.

## Run it

```bash
npm install
npm run dev       # local dev server
npm run build     # production build
```

## Structure

```
src/
  lib/
    supabaseClient.js       Supabase init (same URL/anon key as original)
    exporters.js            PDF (jsPDF) / Excel (SheetJS) export helpers
  context/
    AuthContext.jsx          session, app_users row, role (admin/staff/superadmin)
    AcademyDataContext.jsx   sports/batches/students + staff visibility scoping
  pages/
    LoginScreen.jsx
  components/
    TopBar.jsx, BottomNav.jsx, AddStudentModal.jsx
  tabs/                      the 6 main bottom-nav tabs
    HomeTab.jsx, StudentsTab.jsx, AttendanceTab.jsx,
    FeesTab.jsx, EnquiryTab.jsx, ProfileTab.jsx
  admin/                     admin-only pages, reached from Profile
    SportsBatchesPage.jsx, UsersPage.jsx, CoursesPage.jsx,
    SchedulesPage.jsx, PerformancePage.jsx, ActivityPage.jsx, LeaveCountPage.jsx
  styles/global.css          your original design tokens/CSS, ported unchanged
```

Routing is React Router (`/home`, `/students`, `/attendance`, `/fees`, `/enquiry`,
`/profile`, `/admin/*`) instead of the old `switchPage()` show/hide DOM approach.

## What's fully wired vs. scaffolded

**Fully wired to Supabase** (real reads/writes against your `students`, `attendance`,
`fees`, `enquiries`, `sports`, `batches`, `app_users`, `courses`, `week_schedules`,
`class_log`, `leave_requests`, `audit_log` tables):
- Auth (sign in/out, session persistence)
- Students: list, search, sport/batch filter, sort, add, bulk delete, PDF/XL export
- Attendance: per-date marking, save/upsert
- Fees: list, filter, mark-paid, totals, export
- Enquiries: add, status updates
- Sports & Batches, Staff Users, Courses, Schedules, Performance leaderboard,
  Activity log, Leave count — basic CRUD/list views

**Staff permission scoping**: `AcademyDataContext` filters sports/batches/students to
`assigned_sports` / `assigned_batches` on the `app_users` row unless `role` is
`admin`/`superadmin` — mirrors the scoping work you did across tabs in the original.

**Not ported (was UI-only or very deep legacy logic in the original file)**:
- Notification panel / bell dropdown content
- Chart-maximize full-screen view, month/year snapshot charts beyond the 7-day bar
- CSV/Excel *import* flows (only export is wired)
- Superadmin console (plans, DB Backup tab, freeze/subscription flow, WhatsApp CTA)
- Bulk-edit modal, change-password screen, Turnstile CAPTCHA
- PWA manifest/service worker, custom app icons

These are straightforward to add following the same pattern (new file under
`tabs/` or `admin/`, pull from the relevant Supabase table, add a route). I focused
the budget on getting every main tab functionally real rather than stubbing all of
them shallowly.

## Known thing to fix (carried over from your notes)
The "admin add staff member" error you hadn't investigated yet in the original app —
worth checking Supabase RLS/`GRANT` on `app_users` insert for the `anon`/authenticated
role first, since that pattern bit you before on the DB Backup tab.
