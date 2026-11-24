// Employee side: attendance, leave, payroll and reports (the core of the project)
import { useState } from 'react';
import { FormModal, Modal, MonthPick, PageHead, SalarySlip, StatusBadge, Table, useApi, useToast } from '../../components';
import { fmtDate, fmtMonth, lastMonth, post, put, rupee, thisMonth, today } from '../../api';

const opt = (d, v, l) => (d || []).map((x) => ({ value: x[v], label: typeof l === 'function' ? l(x) : x[l] }));
const hm = (t) => (t ? t.slice(0, 5) : '-');

export function Attendance() {
  const [month, setMonth] = useState(thisMonth()); const [emp, setEmp] = useState('');
  const { data: emps } = useApi('/admin/employees');
  const { data, reload } = useApi(`/admin/attendance?month=${month}${emp ? '&employeeId=' + emp : ''}`);
  const [dlg, setDlg] = useState(null); const toast = useToast();
  const fields = [
    { name: 'employeeId', label: 'Employee', type: 'select', required: true, wide: true, options: opt((emps || []).filter((e) => e.is_active), 'employee_id', (e) => `${e.full_name} · ${e.designation}`) },
    { name: 'date', label: 'Date', type: 'date', required: true, default: today() },
    { name: 'status', label: 'Status', type: 'select', required: true, options: ['Present', 'Late', 'Absent'].map((x) => ({ value: x, label: x })) },
    { name: 'checkIn', label: 'Check-in (blank if absent)', type: 'time' }, { name: 'checkOut', label: 'Check-out', type: 'time' }
  ];
  async function submit(v) {
    if (dlg.row) await put('/admin/attendance/' + dlg.row.attendance_id, v); else await post('/admin/attendance', v);
    setDlg(null); reload(); toast('Attendance saved');
  }
  const cols = [
    { label: 'Date', render: (r) => fmtDate(r.att_date) }, { label: 'Employee', key: 'full_name' }, { label: 'Status', render: (r) => <StatusBadge s={r.status} /> },
    { label: 'In', render: (r) => hm(r.check_in) }, { label: 'Out', render: (r) => hm(r.check_out) },
    { label: '', render: (r) => <button className="btn small" onClick={() => setDlg({ row: r })}>Edit</button> }
  ];
  return (<>
    <PageHead title="Attendance" sub="Daily register · 09:15 is the late cut-off · Sunday off"><button className="btn primary" onClick={() => setDlg({})}>Mark attendance</button></PageHead>
    <div className="toolbar"><MonthPick value={month} onChange={setMonth} />
      <select className="input" value={emp} onChange={(e) => setEmp(e.target.value)} aria-label="Employee"><option value="">All employees</option>{opt(emps, 'employee_id', 'full_name').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
    <Table columns={cols} rows={data} empty="No attendance recorded for this selection." />
    {dlg && <FormModal title={dlg.row ? 'Edit attendance' : 'Mark attendance'} fields={fields} onSubmit={submit} onClose={() => setDlg(null)}
      initial={dlg.row ? { employeeId: dlg.row.employee_id, date: dlg.row.att_date, status: dlg.row.status, checkIn: hm(dlg.row.check_in) === '-' ? '' : hm(dlg.row.check_in), checkOut: hm(dlg.row.check_out) === '-' ? '' : hm(dlg.row.check_out) } : {}} />}
  </>);
}

export function Leaves() {
  const [status, setStatus] = useState('Pending');
  const { data, reload } = useApi('/admin/leaves' + (status ? '?status=' + status : ''));
  const toast = useToast();
  async function decide(r, s) { try { await put(`/admin/leaves/${r.leave_id}/status`, { status: s }); reload(); toast('Leave ' + s.toLowerCase()); } catch (e) { toast(e.message, 'error'); } }
  const cols = [
    { label: 'Employee', key: 'full_name' }, { label: 'From', render: (r) => fmtDate(r.start_date) }, { label: 'To', render: (r) => fmtDate(r.end_date) },
    { label: 'Reason', key: 'reason' }, { label: 'Applied', render: (r) => fmtDate(r.applied_on) }, { label: 'Status', render: (r) => <StatusBadge s={r.status} /> },
    { label: '', render: (r) => r.status === 'Pending' && <span className="pill-row"><button className="btn small primary" onClick={() => decide(r, 'Approved')}>Approve</button><button className="btn small danger" onClick={() => decide(r, 'Rejected')}>Reject</button></span> }
  ];
  return (<>
    <PageHead title="Leave requests" sub="Overlapping approved leave is blocked by the database" />
    <div className="toolbar"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="Pending">Waiting for review</option><option value="">All</option><option>Approved</option><option>Rejected</option></select></div>
    <Table columns={cols} rows={data} empty="No leave requests." />
  </>);
}

export function Payroll() {
  const [month, setMonth] = useState(lastMonth());
  const { data, reload } = useApi('/admin/payroll?month=' + month);
  const { data: slabs } = useApi('/admin/tax-slabs');
  const [slip, setSlip] = useState(null); const [busy, setBusy] = useState(false); const [over, setOver] = useState(false);
  const toast = useToast();
  async function generate() {
    setBusy(true);
    try { const r = await post('/admin/payroll/generate', { month, overwrite: over }); reload(); toast(`${r.rows_generated} slips generated, ${r.rows_skipped} already existed`); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  const cols = [
    { label: 'Employee', render: (r) => <><div>{r.full_name}</div><div className="muted">{r.designation} · {r.property_name}</div></> },
    { label: 'Present / Leave / Absent', render: (r) => `${r.days_present} / ${r.approved_leave_days} / ${r.days_absent}` }, { label: 'Late', num: true, key: 'late_marks' },
    { label: 'Payable basic', num: true, render: (r) => rupee(r.payable_basic) }, { label: 'Deductions', num: true, render: (r) => rupee(r.total_deductions) },
    { label: 'Net salary', num: true, render: (r) => <b className="gold">{rupee(r.net_salary)}</b> }, { label: '', render: (r) => <button className="btn small" onClick={() => setSlip(r)}>Slip</button> }
  ];
  const total = (data || []).reduce((n, r) => n + r.net_salary, 0);
  return (<>
    <PageHead title="Payroll" sub="Calculated inside MySQL, saved as history">
      <button className="btn primary" onClick={generate} disabled={busy}>{busy ? 'Calculating...' : `Generate ${fmtMonth(month)}`}</button></PageHead>
    <div className="toolbar"><MonthPick value={month} onChange={setMonth} /><label className="switch"><input type="checkbox" checked={over} onChange={(e) => setOver(e.target.checked)} />Recalculate existing slips</label>
      {data && data.length > 0 && <span className="muted">Net payout: <b className="gold">{rupee(total)}</b></span>}</div>
    <Table columns={cols} rows={data} empty="No payroll for this month yet. Press Generate (only finished months are allowed)." />
    <details style={{ marginTop: 22 }}><summary className="label" style={{ cursor: 'pointer' }}>How salary is calculated</summary>
      <p className="muted">Per-day pay = basic ÷ working days (Mon-Sat). Absent days (no attendance and no approved leave) are deducted; approved leave is paid; every 3 late marks cost one day. Tax is charged on the annualised earned salary using these slabs:</p>
      <Table columns={[{ label: 'Annual income from', num: true, render: (s) => rupee(s.annual_from) }, { label: 'up to', num: true, render: (s) => (s.annual_to ? rupee(s.annual_to) : 'no limit') }, { label: 'Rate', num: true, render: (s) => s.rate_percent + '%' }]} rows={slabs} /></details>
    {slip && <Modal title="Salary slip" onClose={() => setSlip(null)}><SalarySlip s={slip} /><div className="actions"><button className="btn" onClick={() => window.print()}>Print</button><button className="btn primary" onClick={() => setSlip(null)}>Close</button></div></Modal>}
  </>);
}

export function Reports() {
  const [month, setMonth] = useState(lastMonth()); const [tab, setTab] = useState('att');
  const a = useApi('/admin/reports/attendance-summary?month=' + month);
  const l = useApi('/admin/reports/late-marks?month=' + month);
  const p = useApi('/admin/reports/payroll-summary?month=' + month);
  return (<>
    <PageHead title="Reports" sub={fmtMonth(month)} />
    <div className="toolbar"><MonthPick value={month} onChange={setMonth} /></div>
    <div className="tabs">{[['att', 'Attendance summary'], ['late', 'Late marks'], ['pay', 'Payroll by property']].map(([k, t]) => <button key={k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{t}</button>)}</div>
    {tab === 'att' && <Table rows={a.data} empty="No attendance for this month." columns={[{ label: 'Employee', render: (r) => <><div>{r.full_name}</div><div className="muted">{r.designation}</div></> }, { label: 'Property', key: 'property_name' },
      { label: 'Present', num: true, key: 'present_days' }, { label: 'Late', num: true, key: 'late_days' }, { label: 'Absent', num: true, key: 'absent_days' }, { label: 'Days recorded', num: true, key: 'days_recorded' }]} />}
    {tab === 'late' && <>
      <Table rows={l.data?.summary} empty="No late marks this month." columns={[{ label: 'Employee', key: 'full_name' }, { label: 'Property', key: 'property_name' }, { label: 'Late marks', num: true, render: (r) => <b className="gold">{r.late_count}</b> },
        { label: 'Avg minutes late', num: true, key: 'avg_minutes' }, { label: 'Worst', num: true, render: (r) => r.worst_minutes + ' min' }]} />
      <div className="label" style={{ margin: '22px 0 8px' }}>Every late entry</div>
      <Table rows={l.data?.detail} columns={[{ label: 'Date', render: (r) => fmtDate(r.att_date) }, { label: 'Employee', key: 'full_name' }, { label: 'Check-in', render: (r) => hm(r.check_in) }, { label: 'Minutes after 09:00', num: true, key: 'minutes_late' }]} /></>}
    {tab === 'pay' && <Table rows={p.data} empty="Payroll has not been generated for this month." columns={[{ label: 'Property', key: 'property_name' }, { label: 'Employees', num: true, key: 'employees' },
      { label: 'Payable basic', num: true, render: (r) => rupee(r.gross) }, { label: 'Deductions', num: true, render: (r) => rupee(r.deductions) }, { label: 'of which tax', num: true, render: (r) => rupee(r.tax) }, { label: 'Net payout', num: true, render: (r) => <b className="gold">{rupee(r.net)}</b> }]} />}
  </>);
}
