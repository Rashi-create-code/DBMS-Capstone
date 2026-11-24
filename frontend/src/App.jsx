import { Navigate, Route, Routes } from 'react-router-dom';
import { Protected } from './auth';
import Discover from './pages/Discover';
import Login from './pages/Login';
import Complaint from './pages/Complaint';
import AdminLayout from './pages/admin/AdminLayout';
import Employee from './pages/Employee';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Discover />} />
      <Route path="/complaint" element={<Complaint />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin/*" element={<Protected role="ADMIN"><AdminLayout /></Protected>} />
      <Route path="/me/*" element={<Protected role="EMPLOYEE"><Employee /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
