// Tenant side: room allocation and monthly rent (kept separate from employee payroll)
import { useState } from 'react';
import { FormModal, MonthPick, PageHead, StatusBadge, Table, useApi, useToast } from '../../components';
import { fmtDate, fmtMonth, post, put, rupee, thisMonth, today } from '../../api';

export function Allocations() {
  const [status, setStatus] = useState('Active');
  const { data, reload } = useApi('/admin/allocations' + (status ? '?status=' + status : ''));
  const { data: tenants } = useApi('/admin/tenants');
  const { data: rooms } = useApi('/admin/rooms');
  const [dlg, setDlg] = useState(null);
  const toast = useToast();
  const free = (rooms || []).filter((r) => r.available_beds > 0);
  const unhoused = (tenants || []).filter((t) => t.stay_status !== 'Active');
  const allocFields = [
    { name: 'tenantId', label: 'Tenant (without a room)', type: 'select', required: true, wide: true, options: unhoused.map((t) => ({ value: t.tenant_id, label: `${t.full_name} · ${t.phone}` })) },
    { name: 'roomId', label: 'Room with a free bed', type: 'select', required: true, wide: true, options: free.map((r) => ({ value: r.room_id, label: `${r.property_name} · Room ${r.room_number} (${r.sharing_type}, ${r.available_beds} free) · ${rupee(r.monthly_rent)}` })) },
    { name: 'startDate', label: 'Move-in date', type: 'date', required: true, default: today() }
  ];
  async function submit(v) {
    if (dlg.vacate) await post(`/admin/allocations/${dlg.vacate.allocation_id}/vacate`, { endDate: v.endDate });
    else await post('/admin/allocations', v);
    setDlg(null); reload(); toast(dlg.vacate ? 'Tenant vacated' : 'Room allocated');
  }
  const cols = [
    { label: 'Tenant', key: 'tenant_name' }, { label: 'Property', key: 'property_name' }, { label: 'Room', key: 'room_number' },
    { label: 'From', render: (r) => fmtDate(r.start_date) }, { label: 'To', render: (r) => fmtDate(r.end_date) }, { label: 'Status', render: (r) => <StatusBadge s={r.status} /> },
    { label: '', render: (r) => r.status === 'Active' && <button className="btn small" onClick={() => setDlg({ vacate: r })}>Vacate</button> }
  ];
  return (<>
    <PageHead title="Room allocation" sub="Who sleeps where"><button className="btn primary" onClick={() => setDlg({})}>Allocate room</button></PageHead>
    <div className="toolbar"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter"><option value="Active">Current stays</option><option value="Vacated">Past stays</option><option value="">All</option></select></div>
    <Table columns={cols} rows={data} />
    {dlg && !dlg.vacate && <FormModal title="Allocate room" fields={allocFields} submitLabel="Allocate" onSubmit={submit} onClose={() => setDlg(null)} />}
    {dlg?.vacate && <FormModal title={`Vacate ${dlg.vacate.tenant_name}`} fields={[{ name: 'endDate', label: 'Move-out date', type: 'date', required: true, default: today() }]} submitLabel="Confirm move-out" onSubmit={submit} onClose={() => setDlg(null)} />}
  </>);
}

export function Rent() {
  const [month, setMonth] = useState(thisMonth()); const [status, setStatus] = useState('');
  const { data, reload } = useApi(`/admin/rent?month=${month}${status ? '&status=' + status : ''}`);
  const [pay, setPay] = useState(null);
  const toast = useToast();
  async function generate() {
    try { const r = await post('/admin/rent/generate', { month }); reload(); toast(`${r.created} rent records created for ${fmtMonth(month)}`); } catch (e) { toast(e.message, 'error'); }
  }
  async function submit(v) { await put(`/admin/rent/${pay.rent_id}/pay`, v); setPay(null); reload(); toast('Payment recorded'); }
  const cols = [
    { label: 'Tenant', render: (r) => <><div>{r.tenant_name}</div><div className="muted">{r.phone}</div></> }, { label: 'Property / room', render: (r) => `${r.property_name} · ${r.room_number}` },
    { label: 'Rent', num: true, render: (r) => rupee(r.amount) }, { label: 'Status', render: (r) => <StatusBadge s={r.status} /> },
    { label: 'Paid on', render: (r) => r.payment_date ? `${fmtDate(r.payment_date)} · ${r.method}` : '-' },
    { label: '', render: (r) => r.status === 'Pending' && <button className="btn small" onClick={() => setPay(r)}>Record payment</button> }
  ];
  return (<>
    <PageHead title="Tenant rent" sub="Paid and pending"><button className="btn" onClick={generate}>Create {fmtMonth(month)} rent rows</button></PageHead>
    <div className="toolbar"><MonthPick value={month} onChange={setMonth} />
      <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Paid and pending</option><option>Paid</option><option>Pending</option></select></div>
    {data && <div className="stats"><div className="stat"><div className="label">Collected</div><div className="n">{rupee(data.totals.paid)}</div></div><div className="stat"><div className="label">Pending</div><div className="n">{rupee(data.totals.pending)}</div></div></div>}
    <Table columns={cols} rows={data?.rows} empty="No rent records for this month. Use the button above to create them." />
    {pay && <FormModal title={`Payment from ${pay.tenant_name}`} submitLabel="Save payment" onClose={() => setPay(null)} onSubmit={submit} initial={{ amount: pay.amount }}
      fields={[{ name: 'amount', label: 'Amount received (₹)', type: 'number', min: 1, step: '0.01', required: true }, { name: 'paymentDate', label: 'Payment date', type: 'date', required: true, default: today() },
        { name: 'method', label: 'Method', type: 'select', required: true, wide: true, options: ['Cash', 'UPI', 'Card', 'Bank Transfer'].map((x) => ({ value: x, label: x })) }]} />}
  </>);
}
