import { Navigate } from 'react-router-dom';
import { session } from './api';

// Route guard: send people to the login page, or to their own area if they are in the wrong one
export function Protected({ role, children }) {
  const s = session.get();
  if (!s) return <Navigate to="/login" replace />;
  if (s.user.role !== role) return <Navigate to={s.user.role === 'ADMIN' ? '/admin' : '/me'} replace />;
  return children;
}
