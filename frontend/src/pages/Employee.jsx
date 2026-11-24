// Employee self-service area: attendance, own leave, own salary slips. Nothing else is reachable.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormModal, MonthPick, Modal, PageHead, SalarySlip, StatusBadge, Table, ThemeToggle, useApi, useToast } from '../components';
import { fmtDate, fmtMonth, lastMonth, post, rupee, session, thisMonth, today } from '../api';

const hm = (t) => (t ? t.slice(0, 5) : '-');

export default function Employee() {
  const nav = useNavigate(); const s = session.get(); const toast = useToast();
  const [tab, setTab] = useState('att'); const [month, setMonth] = useState(thisMonth());
  const { data: me } = useApi('/me/profile');
  const att = useApi('/me/attendance?month=' + month);
  const leaves = useApi('/me/leaves');
  const slips = useApi('/me/salary-slips');
  const [slip, setSlip] = useState(null); const [dlg, setDlg] = useState(false);
  const counts = (att.data || []).reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), {});
  async function submitLeave(v) { await post('/me/leaves', v); setDlg(false); leaves.reload(); toast('Leave request sent for approval'); }
  return (
    <div className="page-full">
      <header className="site-header">
        <span className="logo"><i aria-hidden="true">S</i><span>SmartStay</span></span>
        <div className="site-nav"><ThemeToggle /><button className="btn" onClick={() => { session.clear(); nav('/login'); }}>Sign out</button></div>
      </header>
      <main className="content" style={{ flex: 1, minHeight: 0 }}><div className="content-inner">
        <PageHead title={`Hello, ${s.user.name.split(' ')[0]}`} sub={me ? `${me.designation} · joined ${fmtDate(me.joining_date)}` : 'Employee'}>
</PageHead>
        <div className="tabs">{[['att', 'My attendance'], ['leave', 'My leave'], ['pay', 'Salary slips']].map(([k, t]) => <button key={k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{t}</button>)}</div>

        {tab === 'att' && <>
          <div className="toolbar"><MonthPick value={month} onChange={setMonth} /></div>
          <div className="stats"><div className="stat"><div className="label">Present</div><div className="n">{counts.Present || 0}</div></div><div className="stat"><div className="label">Late</div><div className="n">{counts.Late || 0}</div></div><div className="stat"><div className="label">Absent</div><div className="n">{counts.Absent || 0}</div></div></div>
          <Table rows={att.data} empty="No attendance recorded for this month." columns={[{ label: 'Date', render: (r) => fmtDate(r.att_date) }, { label: 'Status', render: (r) => <StatusBadge s={r.status} /> }, { label: 'Check-in', render: (r) => hm(r.check_in) }, { label: 'Check-out', render: (r) => hm(r.check_out) }]} /></>}

        {tab === 'leave' && <>
          <div className="toolbar"><button className="btn primary" onClick={() => setDlg(true)}>Request leave</button></div>
          <Table rows={leaves.data} empty="You have not requested any leave." columns={[{ label: 'From', render: (r) => fmtDate(r.start_date) }, { label: 'To', render: (r) => fmtDate(r.end_date) }, { label: 'Reason', key: 'reason' }, { label: 'Status', render: (r) => <StatusBadge s={r.status} /> }]} /></>}

        {tab === 'pay' && <Table rows={slips.data} empty="No salary slips yet." columns={[{ label: 'Month', render: (r) => fmtMonth(r.pay_month) }, { label: 'Absent days', num: true, key: 'days_absent' }, { label: 'Late marks', num: true, key: 'late_marks' },
          { label: 'Deductions', num: true, render: (r) => rupee(r.total_deductions) }, { label: 'Net salary', num: true, render: (r) => <b className="gold">{rupee(r.net_salary)}</b> }, { label: '', render: (r) => <button className="btn small" onClick={() => setSlip(r)}>View slip</button> }]} />}

        {dlg && <FormModal title="Request leave" submitLabel="Send request" onClose={() => setDlg(false)} onSubmit={submitLeave}
          fields={[{ name: 'startDate', label: 'From', type: 'date', required: true, default: today() }, { name: 'endDate', label: 'To', type: 'date', required: true, default: today() }, { name: 'reason', label: 'Reason', required: true, wide: true }]} />}
        {slip && <Modal title="Salary slip" onClose={() => setSlip(null)}><SalarySlip s={slip} /><div className="actions"><button className="btn" onClick={() => window.print()}>Print</button><button className="btn primary" onClick={() => setSlip(null)}>Close</button></div></Modal>}
      </div></main>
    </div>
  );
}
