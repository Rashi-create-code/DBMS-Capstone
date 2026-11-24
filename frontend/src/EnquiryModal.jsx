import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from './components';
import { post } from './api';

// "Interested? Leave a message and we will call you." Stored in MySQL, shown to the admin.
export default function EnquiryModal({ property, onClose }) {
  const [v, setV] = useState({ name: '', phone: '', email: '', message: property ? `Hi, I am interested in ${property.name}. Please contact me.` : '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await post('/public/enquiries', { ...v, propertyId: property?.property_id }); setDone(true); }
    catch (x) { setErr(x.message); setBusy(false); }
  }
  if (done) return (
    <Modal title="Thank you!" onClose={onClose}>
      <div className="success-box"><div className="tick" aria-hidden="true">✓</div>
        <p>Your message is with our team. We will call you on <b>{v.phone}</b> soon.</p>
        <button className="btn primary" onClick={onClose}>Close</button></div>
    </Modal>
  );
  return (
    <Modal title={property ? `Enquire about ${property.name}` : 'Send us an enquiry'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label className="label" htmlFor="en">Your name</label><input id="en" className="input" value={v.name} onChange={set('name')} required minLength={2} autoComplete="name" /></div>
        <div className="grid2">
          <div className="field"><label className="label" htmlFor="ep">Mobile number</label><input id="ep" className="input" value={v.phone} onChange={set('phone')} required inputMode="numeric" maxLength={10} autoComplete="tel" placeholder="10 digits" /></div>
          <div className="field"><label className="label" htmlFor="ee">Email (optional)</label><input id="ee" className="input" type="email" value={v.email} onChange={set('email')} autoComplete="email" /></div>
        </div>
        <div className="field"><label className="label" htmlFor="em">Message</label><textarea id="em" className="input" rows={4} maxLength={500} value={v.message} onChange={set('message')} required placeholder="Which room type, budget and move-in date are you looking for?" /></div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Sending...' : 'Send message'}</button></div>
        <p className="hint">Already staying with us? <Link to="/complaint">Report an issue</Link></p>
      </form>
    </Modal>
  );
}
