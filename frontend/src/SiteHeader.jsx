import { Link } from 'react-router-dom';
import { session } from './api';
import { ThemeToggle } from './components';

// Top bar for the public pages. It sits above the content, never over it.
export default function SiteHeader({ active, onEnquire }) {
  const s = session.get();
  return (
    <header className="site-header">
      <Link to="/" className="logo"><i aria-hidden="true">S</i><span>SmartStay</span></Link>
      <nav className="site-nav" aria-label="Main">
        <Link to="/" className={'link hide-sm' + (active === 'find' ? ' active' : '')}>Find a PG</Link>
        <Link to={s ? (s.user.role === 'ADMIN' ? '/admin' : '/me') : '/login'} className="link">{s ? 'My dashboard' : 'Staff login'}</Link>
        {onEnquire && <button className="btn primary" onClick={() => onEnquire(null)}>Enquire</button>}
        <ThemeToggle />
      </nav>
    </header>
  );
}
