import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { get } from './api';

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const notify = useCallback((message, type = 'ok') => {
    setT({ message, type }); clearTimeout(timer.current); timer.current = setTimeout(() => setT(null), 3500);
  }, []);
  return <ToastCtx.Provider value={notify}>{children}{t && <div className={'toast ' + t.type} role="status">{t.message}</div>}</ToastCtx.Provider>;
}

// ---------- data hook ----------
export function useApi(url, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    get(url).then((data) => live && setState({ data, loading: false, error: '' }))
             .catch((e) => live && setState({ data: null, loading: false, error: e.message }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);
  return { ...state, reload: () => setTick((n) => n + 1) };
}

// ---------- small pieces ----------
export const Badge = ({ tone = '', children }) => <span className={'badge ' + tone}>{children}</span>;
const TONES = { Paid: 'ok', Pending: 'warn', Approved: 'ok', Rejected: 'bad', Present: 'ok', Late: 'warn', Absent: 'bad', Open: 'bad', 'In Progress': 'warn', Resolved: 'ok', Active: 'ok', Vacated: '', Staying: 'ok', 'Moved out': '', 'Not allocated': 'warn', New: 'info', Contacted: 'warn', Closed: 'ok' };
export const StatusBadge = ({ s }) => <Badge tone={TONES[s] || ''}>{s}</Badge>;

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';   // page behind does not scroll
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  // Rendered straight into <body> so it is always centred on the screen, whatever page animation or scroll is behind it
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="close-x" onClick={onClose} aria-label="Close" type="button">×</button><h2>{title}</h2>{children}</div>
    </div>, document.body);
}

export function Table({ columns, rows, empty = 'Nothing here yet.' }) {
  if (!rows) return <div className="table-wrap" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skel-row"><i /><i /><i /></div>)}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((c) => <th key={c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length}><div className="empty">{empty}</div></td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id ?? i}>{columns.map((c) => <td key={c.label} data-label={c.label} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- form field ----------
export function Field({ f, value, onChange }) {
  const common = { id: 'f_' + f.name, className: 'input', value: value ?? '', required: f.required, placeholder: f.placeholder };
  const set = (e) => onChange(e.target.value);
  let input;
  if (f.type === 'select') {
    input = <select {...common} onChange={set}><option value="">Select...</option>{(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  } else if (f.type === 'textarea') input = <textarea {...common} rows={3} onChange={set} />;
  else if (f.type === 'checks') {
    const sel = Array.isArray(value) ? value : [];
    input = <div className="pill-row">{(f.options || []).map((o) => (
      <button type="button" key={o.value} className={'chip' + (sel.includes(o.value) ? ' on' : '')}
        onClick={() => onChange(sel.includes(o.value) ? sel.filter((x) => x !== o.value) : [...sel, o.value])}>{o.label}</button>))}</div>;
  } else input = <input {...common} type={f.type || 'text'} step={f.step} min={f.min} max={f.max} maxLength={f.maxLength} onChange={set} />;
  return <div className="field" style={f.wide ? { gridColumn: '1 / -1' } : null}><label className="label" htmlFor={'f_' + f.name}>{f.label}</label>{input}</div>;
}

// Generic form dialog. fields: [{name,label,type,options,required,...}], onSubmit(values) may throw
export function FormModal({ title, fields, initial = {}, submitLabel = 'Save', onSubmit, onClose }) {
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map((f) => [f.name, initial[f.name] ?? f.default ?? (f.type === 'checks' ? [] : '')])));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await onSubmit(vals); } catch (x) { setErr(x.message); setBusy(false); }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid2">{fields.map((f) => <Field key={f.name} f={f} value={vals[f.name]} onChange={(v) => setVals({ ...vals, [f.name]: v })} />)}</div>
        {err && <p className="form-error" role="alert">{err}</p>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving...' : submitLabel}</button></div>
      </form>
    </Modal>
  );
}

export const PageHead = ({ title, sub, children }) => (
  <div className="page-head"><div><div className="label">{sub}</div><h1>{title}</h1></div><div className="pill-row">{children}</div></div>
);

// Month input helper
export const MonthPick = ({ value, onChange }) => <input className="input" type="month" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Month" />;

// ---------- salary slip (used by admin and employee) ----------
import { rupee, fmtMonth } from './api';
export function SalarySlip({ s }) {
  const Row = ({ k, v, cls }) => <div className={'row ' + (cls || '')}><span>{k}</span><span>{v}</span></div>;
  return (
    <div className="slip">
      <div className="label">Salary slip · {fmtMonth(s.pay_month)}</div>
      <h3>{s.full_name}</h3>
      <div className="muted" style={{ marginBottom: 14 }}>{s.designation} · {s.property_name}</div>
      <Row k="Working days / Present / Leave (paid) / Absent" v={`${s.working_days} / ${s.days_present} / ${s.approved_leave_days} / ${s.days_absent}`} />
      <Row k="Late marks" v={s.late_marks} />
      <Row k="Basic salary" v={rupee(s.basic_salary)} />
      {s.payable_basic !== s.basic_salary && <Row k="Payable basic (part month)" v={rupee(s.payable_basic)} />}
      <Row k="Absence deduction" v={'- ' + rupee(s.absence_deduction)} />
      <Row k="Late-mark deduction" v={'- ' + rupee(s.late_deduction)} />
      <Row k="Income tax" v={'- ' + rupee(s.tax_deduction)} />
      <Row k="Net salary" v={rupee(s.net_salary)} cls="total" />
    </div>
  );
}

// ---------- light / dark theme ----------
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    root.classList.add('theme-anim'); setTimeout(() => root.classList.remove('theme-anim'), 450);
    root.dataset.theme = next;
    try { localStorage.setItem('ss_theme', next); } catch { /* private mode */ }
    setTheme(next);
  };
  return [theme, toggle];
}
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button className="btn icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
      {theme === 'dark'
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
    </button>
  );
}

// ---------- tiny icon set (stroke icons, 24x24) ----------
const ICONS = {
  dashboard: 'M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z',
  building: 'M4 21V5l8-3 8 3v16 M9 21v-5h6v5 M9 9h.01 M15 9h.01 M9 13h.01 M15 13h.01',
  bed: 'M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7 M3 14h18 M3 21v-3 M21 21v-3 M7 9V6h4v3',
  mail: 'M3 5h18v14H3z M3 7l9 6 9-6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  key: 'M15.5 7.5l3 3L22 7l-3-3 M21 2l-2 2 M11.4 11.6a5 5 0 1 0-7 7 5 5 0 0 0 7-7 M15.5 7.5l-4.1 4.1',
  rupee: 'M6 4h12 M6 9h12 M9 4c6 0 6 9 0 9H6l9 8',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  visitor: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 11l2 2 4-4',
  briefcase: 'M3 7h18v13H3z M8 7V4h8v3 M3 13h18',
  calendar: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4 M9 16l2 2 4-4',
  sun: 'M12 3v2 M12 19v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M3 12h2 M19 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  cash: 'M2 6h20v12H2z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M6 12h.01 M18 12h.01',
  chart: 'M3 3v18h18 M7 15l4-4 3 3 5-6'
};
export const Icon = ({ name }) => (
  <svg className="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(ICONS[name] || '').split(' M').map((d, i) => <path key={i} d={(i ? 'M' : '') + d} />)}
  </svg>
);
