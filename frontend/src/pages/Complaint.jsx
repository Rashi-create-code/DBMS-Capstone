import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../api';
import SiteHeader from '../SiteHeader';

// For current tenants only (no login): they use the mobile number registered with SmartStay
export default function Complaint() {
  const [v, setV] = useState({ phone: '', category: 'Maintenance', description: '' });
  const [done, setDone] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await post('/public/complaints', v); setDone(r.complaintId); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div className="page-full" style={{ overflow: 'auto' }}>
      <SiteHeader />
      <div className="center-wrap">
        {done ? <div className="center-card"><div className="success-box"><div className="tick" aria-hidden="true">✓</div><h1 style={{ margin: '0 0 8px' }}>Complaint #{done} logged</h1><p className="muted">The property team will update its status. Keep this number for reference.</p><Link className="btn primary" to="/">Back to PG search</Link></div></div> : (
          <div className="center-card">
            <div className="label">For current tenants</div><h1>Report an issue</h1>
            <form onSubmit={submit}>
              <div className="field"><label className="label" htmlFor="ph">Registered mobile number</label><input id="ph" className="input" inputMode="numeric" maxLength={10} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} required /></div>
              <div className="field"><label className="label" htmlFor="cat">Category</label>
                <select id="cat" className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{['Room', 'Maintenance', 'Facilities', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="field"><label className="label" htmlFor="d">What is wrong?</label><textarea id="d" className="input" rows={4} maxLength={500} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} required /></div>
              {err && <p className="form-error" role="alert">{err}</p>}
              <button className="btn primary block" disabled={busy}>{busy ? 'Sending...' : 'Send complaint'}</button>
            </form>
            <p className="hint"><Link to="/">Back to PG search</Link></p>
          </div>)}
      </div>
    </div>
  );
}
