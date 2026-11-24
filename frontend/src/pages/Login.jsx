import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post, session } from '../api';
import SiteHeader from '../SiteHeader';

export default function Login() {
  const nav = useNavigate();
  const [u, setU] = useState(''); const [p, setP] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await post('/auth/login', { username: u, password: p });
      session.set(r); nav(r.user.role === 'ADMIN' ? '/admin' : '/me');
    } catch (x) { setErr(x.message); setBusy(false); }
  }
  return (
    <div className="page-full" style={{ overflow: 'auto' }}><SiteHeader /><div className="center-wrap">
    <div className="center-card">
      <div className="label">SmartStay staff</div>
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <div className="field"><label className="label" htmlFor="u">Username</label><input id="u" className="input" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" required /></div>
        <div className="field"><label className="label" htmlFor="p">Password</label><input id="p" className="input" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required /></div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
      <p className="hint">Demo accounts: <b>admin</b> / Admin@123 (Admin/HR) · <b>emp3</b> / Emp@1234 (Employee).<br /><Link to="/">Back to PG search</Link></p>
    </div></div></div>
  );
}
