import { useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { session } from '../../api';
import { Icon, ThemeToggle } from '../../components';
import Dashboard from './Dashboard';
import { Properties, Rooms, Tenants, Employees, Visitors, Complaints } from './Resources';
import { Allocations, Rent } from './Stay';
import { Attendance, Leaves, Payroll, Reports } from './Hr';

const NAV = [
  ['/admin', 'Dashboard', 'dashboard'],
  ['group', 'PG management'], ['/admin/properties', 'Properties', 'building'], ['/admin/rooms', 'Rooms', 'bed'],
  ['group', 'Tenant services'], ['/admin/tenants', 'Tenants', 'users'], ['/admin/allocations', 'Room allocation', 'key'], ['/admin/rent', 'Rent', 'rupee'],
  ['/admin/complaints', 'Complaints', 'alert'], ['/admin/visitors', 'Visitors', 'visitor'],
  ['group', 'Staff and payroll'], ['/admin/employees', 'Employees', 'briefcase'], ['/admin/attendance', 'Attendance', 'calendar'], ['/admin/leaves', 'Leave requests', 'sun'],
  ['/admin/payroll', 'Payroll', 'cash'], ['/admin/reports', 'Reports', 'chart']
];

export default function AdminLayout() {
  const nav = useNavigate(); const loc = useLocation(); const s = session.get(); const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <div className="mobile-bar">
        <button className="btn icon-btn" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <span className="brand">Smart<b>Stay</b></span><ThemeToggle />
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">Smart<b>Stay</b></div>
        <div className="who">{s.user.name} · Admin / HR</div>
        <nav className="nav" aria-label="Admin" onClick={() => setOpen(false)}>
          {NAV.map((n, i) => n[0] === 'group' ? <div className="group" key={i}>{n[1]}</div> :
            <NavLink key={n[0]} to={n[0]} end={n[0] === '/admin'}><Icon name={n[2]} /><span>{n[1]}</span></NavLink>)}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 20 }} className="pill-row">
          <ThemeToggle />
          <button className="btn small" onClick={() => nav('/')}>Public site</button>
          <button className="btn small" onClick={() => { session.clear(); nav('/login'); }}>Sign out</button>
        </div>
      </aside>
      <main className="content"><div className="content-inner page-fade" key={loc.pathname}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="properties" element={<Properties />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="allocations" element={<Allocations />} />
          <Route path="rent" element={<Rent />} />
          <Route path="complaints" element={<Complaints />} />
          <Route path="visitors" element={<Visitors />} />
          <Route path="employees" element={<Employees />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="leaves" element={<Leaves />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="reports" element={<Reports />} />
        </Routes>
      </div></main>
    </div>
  );
}
