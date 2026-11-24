// Simple list + add/edit pages. One generic <Resource> keeps the code short and consistent.
import { useState } from 'react';
import { FormModal, PageHead, StatusBadge, Table, useApi, useToast } from '../../components';
import { fmtDate, get, post, put, rupee, today, del } from '../../api';

function Resource({ title, sub, listUrl, columns, fields, createUrl, updateUrl, toBody, rowToForm, extraActions, toolbar, addLabel = 'Add', canDelete }) {
  const { data, reload, error } = useApi(listUrl);
  const [dlg, setDlg] = useState(null);       // null | {row?}
  const toast = useToast();
  const initial = dlg?.row ? (rowToForm ? rowToForm(dlg.row) : dlg.row) : {};
  const editFields = fields.filter((f) => (dlg?.row ? !f.createOnly : !f.editOnly));
  async function submit(vals) {
    const body = toBody ? toBody(vals) : vals;
    if (dlg.row) await put(updateUrl(dlg.row), body); else await post(createUrl, body);
    setDlg(null); reload(); toast(dlg.row ? 'Changes saved' : 'Added');
  }
  async function remove(row) {
    if (!window.confirm('Delete this record?')) return;
    try { await del(updateUrl(row)); reload(); toast('Deleted'); } catch (e) { toast(e.message, 'error'); }
  }
  const cols = [...columns, ...(updateUrl || extraActions ? [{ label: '', render: (r) => (
    <span className="pill-row">{updateUrl && <button className="btn small" onClick={() => setDlg({ row: r })}>Edit</button>}
      {canDelete && <button className="btn small danger" onClick={() => remove(r)}>Delete</button>}{extraActions && extraActions(r, reload)}</span>) }] : [])];
  return (
    <>
      <PageHead title={title} sub={sub}>{createUrl && <button className="btn primary" onClick={() => setDlg({})}>{addLabel}</button>}</PageHead>
      {toolbar}
      {error ? <p className="form-error">{error}</p> : <Table columns={cols} rows={data} />}
      {dlg && <FormModal title={dlg.row ? 'Edit ' + title.toLowerCase() : addLabel} fields={editFields} initial={initial} onSubmit={submit} onClose={() => setDlg(null)} />}
    </>
  );
}
const opts = (data, v, l) => (data || []).map((x) => ({ value: x[v], label: typeof l === 'function' ? l(x) : x[l] }));

// ---------------- Properties ----------------
export function Properties() {
  const { data, reload } = useApi('/admin/properties');
  const { data: facs } = useApi('/admin/facilities');
  const [dlg, setDlg] = useState(null);
  const toast = useToast();
  const fields = [
    { name: 'name', label: 'Property name', required: true, wide: true },
    { name: 'address', label: 'Address', required: true, wide: true },
    { name: 'area', label: 'Area', required: true }, { name: 'city', label: 'City', required: true },
    { name: 'state', label: 'State', default: 'Haryana' }, { name: 'pinCode', label: 'PIN code', required: true, maxLength: 6 },
    { name: 'latitude', label: 'Latitude', type: 'number', step: 'any', required: true, placeholder: '28.2476' },
    { name: 'longitude', label: 'Longitude', type: 'number', step: 'any', required: true, placeholder: '77.0661' },
    { name: 'description', label: 'Short description', type: 'textarea', wide: true },
    { name: 'facilityIds', label: 'Facilities', type: 'checks', options: opts(facs, 'facility_id', 'name'), wide: true }
  ];
  async function open(row) {
    if (!row) return setDlg({});
    const ids = await get(`/admin/properties/${row.property_id}/facilities`);
    setDlg({ row, initial: { name: row.name, address: row.address, area: row.area, city: row.city, state: row.state, pinCode: row.pin_code, latitude: row.latitude, longitude: row.longitude, description: row.description, facilityIds: ids } });
  }
  async function submit(v) {
    if (dlg.row) await put(`/admin/properties/${dlg.row.property_id}`, v); else await post('/admin/properties', v);
    setDlg(null); reload(); toast('Property saved');
  }
  async function remove(r) {
    if (!window.confirm(`Delete ${r.name}? This only works if no tenant was ever allocated to it.`)) return;
    try { await del('/admin/properties/' + r.property_id); reload(); toast('Deleted'); } catch (e) { toast(e.message, 'error'); }
  }
  const cols = [
    { label: 'Property', render: (r) => <><div>{r.name}</div><div className="muted">{r.area}, {r.city} {r.pin_code}</div></> },
    { label: 'Map coordinates', render: (r) => <span className="muted">{r.latitude}, {r.longitude}</span> },
    { label: 'Beds free', num: true, render: (r) => `${r.available_beds} / ${r.total_beds}` },
    { label: 'Rent range', num: true, render: (r) => `${rupee(r.min_rent)} - ${rupee(r.max_rent)}` },
    { label: '', render: (r) => <span className="pill-row"><button className="btn small" onClick={() => open(r)}>Edit</button><button className="btn small danger" onClick={() => remove(r)}>Delete</button></span> }
  ];
  return (
    <>
      <PageHead title="Properties" sub="Locations shown on the public map"><button className="btn primary" onClick={() => open(null)}>Add property</button></PageHead>
      <Table columns={cols} rows={data} />
      {dlg && <FormModal title={dlg.row ? 'Edit property' : 'Add property'} fields={fields} initial={dlg.initial || {}} onSubmit={submit} onClose={() => setDlg(null)} />}
    </>
  );
}

// ---------------- Rooms ----------------
export function Rooms() {
  const { data: props } = useApi('/admin/properties');
  const fields = [
    { name: 'propertyId', label: 'Property', type: 'select', options: opts(props, 'property_id', 'name'), required: true, wide: true },
    { name: 'roomNumber', label: 'Room number', required: true, maxLength: 10 },
    { name: 'capacity', label: 'Beds (1-6)', type: 'number', min: 1, max: 6, required: true },
    { name: 'monthlyRent', label: 'Monthly rent per bed (₹)', type: 'number', min: 1, required: true, wide: true }
  ];
  return <Resource title="Rooms" sub="Capacity and rent" listUrl="/admin/rooms" createUrl="/admin/rooms" updateUrl={(r) => '/admin/rooms/' + r.room_id} canDelete fields={fields}
    rowToForm={(r) => ({ propertyId: r.property_id, roomNumber: r.room_number, capacity: r.capacity, monthlyRent: r.monthly_rent })}
    columns={[{ label: 'Property', key: 'property_name' }, { label: 'Room', key: 'room_number' }, { label: 'Sharing', key: 'sharing_type' },
      { label: 'Occupied', num: true, render: (r) => `${r.occupied} / ${r.capacity}` }, { label: 'Free beds', num: true, key: 'available_beds' }, { label: 'Rent / bed', num: true, render: (r) => rupee(r.monthly_rent) }]} addLabel="Add room" />;
}

// ---------------- Tenants ----------------
export function Tenants() {
  const [q, setQ] = useState('');
  const fields = [
    { name: 'fullName', label: 'Full name', required: true, wide: true },
    { name: 'phone', label: 'Mobile number', required: true, maxLength: 10 }, { name: 'email', label: 'Email', type: 'email' },
    { name: 'gender', label: 'Gender', type: 'select', required: true, options: ['Male', 'Female', 'Other'].map((x) => ({ value: x, label: x })) },
    { name: 'occupationType', label: 'Student or professional', type: 'select', required: true, options: ['Student', 'Professional'].map((x) => ({ value: x, label: x })) },
    { name: 'organisation', label: 'College / employer', wide: true }
  ];
  return <Resource title="Tenants" sub="Profiles and current rooms" listUrl={'/admin/tenants' + (q ? '?q=' + encodeURIComponent(q) : '')} createUrl="/admin/tenants" updateUrl={(r) => '/admin/tenants/' + r.tenant_id} fields={fields} addLabel="Add tenant"
    rowToForm={(r) => ({ fullName: r.full_name, phone: r.phone, email: r.email, gender: r.gender, occupationType: r.occupation_type, organisation: r.organisation })}
    toolbar={<div className="toolbar"><input className="input" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tenants" /></div>}
    columns={[{ label: 'Name', render: (r) => <><div><b>{r.full_name}</b></div><div className="muted">{r.phone}</div></> }, { label: 'Type', render: (r) => <span>{r.occupation_type}<div className="muted">{r.organisation}</div></span> },
      { label: 'Property / room', render: (r) => r.room_number ? <><div>{r.property_name}</div><div className="muted">Room {r.room_number}</div></> : <span className="muted">-</span> },
      { label: 'Check-in', render: (r) => fmtDate(r.start_date) }, { label: 'Check-out', render: (r) => r.stay_status === 'Active' ? <span className="muted">Still staying</span> : fmtDate(r.end_date) },
      { label: 'Status', render: (r) => <StatusBadge s={r.stay_status === 'Active' ? 'Staying' : r.stay_status === 'Vacated' ? 'Moved out' : 'Not allocated'} /> }]} />;
}

// ---------------- Employees ----------------
export function Employees() {
  const { data: props } = useApi('/admin/properties'); const { data: des } = useApi('/admin/designations');
  const fields = [
    { name: 'fullName', label: 'Full name', required: true, wide: true }, { name: 'phone', label: 'Mobile number', required: true, maxLength: 10 }, { name: 'email', label: 'Email', type: 'email' },
    { name: 'designationId', label: 'Designation', type: 'select', required: true, options: opts(des, 'designation_id', 'title') },
    { name: 'propertyId', label: 'Assigned property', type: 'select', required: true, options: opts(props, 'property_id', 'name') },
    { name: 'joiningDate', label: 'Joining date', type: 'date', required: true, default: today() },
    { name: 'basicSalary', label: 'Basic salary (₹ / month)', type: 'number', min: 1, step: '0.01', required: true },
    { name: 'username', label: 'Login username', createOnly: true, required: true }, { name: 'password', label: 'Initial password (8+ chars)', type: 'password', createOnly: true, required: true },
    { name: 'isActive', label: 'Status', type: 'select', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Left the company' }], default: 'true', editOnly: true }
  ];
  return <Resource title="Employees" sub="Wardens, guards, cleaners and managers" listUrl="/admin/employees" createUrl="/admin/employees" updateUrl={(r) => '/admin/employees/' + r.employee_id}
    fields={fields} addLabel="Add employee"
    toBody={(v) => ({ ...v, isActive: v.isActive !== 'false' })}
    rowToForm={(r) => ({ fullName: r.full_name, phone: r.phone, email: r.email, designationId: r.designation_id, propertyId: r.property_id, joiningDate: r.joining_date, basicSalary: r.basic_salary, isActive: r.is_active ? 'true' : 'false' })}
    columns={[{ label: 'Employee', render: (r) => <><div>{r.full_name}</div><div className="muted">{r.phone}</div></> }, { label: 'Role', key: 'designation' }, { label: 'Property', key: 'property_name' },
      { label: 'Joined', render: (r) => fmtDate(r.joining_date) }, { label: 'Basic salary', num: true, render: (r) => rupee(r.basic_salary) }, { label: 'Login', render: (r) => <span className="muted">{r.username}</span> },
      { label: 'Status', render: (r) => <StatusBadge s={r.is_active ? 'Active' : 'Vacated'} /> }]} />;
}

// ---------------- Visitors ----------------
export function Visitors() {
  const { data: props } = useApi('/admin/properties'); const { data: tenants } = useApi('/admin/tenants');
  const fields = [
    { name: 'visitorName', label: 'Visitor name', required: true }, { name: 'phone', label: 'Visitor mobile', required: true, maxLength: 10 },
    { name: 'propertyId', label: 'Property', type: 'select', required: true, options: opts(props, 'property_id', 'name') },
    { name: 'tenantId', label: 'Visiting tenant', type: 'select', required: true, options: opts(tenants, 'tenant_id', (t) => `${t.full_name}${t.property_name ? ' (' + t.property_name + ')' : ''}`) },
    { name: 'purpose', label: 'Purpose of visit', required: true, wide: true }
  ];
  return <Resource title="Visitors" sub="Entry register" listUrl="/admin/visitors" createUrl="/admin/visitors" fields={fields} addLabel="Record visitor"
    columns={[{ label: 'When', render: (r) => new Date(r.visit_datetime.replace(' ', 'T')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) }, { label: 'Visitor', render: (r) => <><div>{r.visitor_name}</div><div className="muted">{r.phone}</div></> },
      { label: 'Visiting', key: 'tenant_name' }, { label: 'Property', key: 'property_name' }, { label: 'Purpose', key: 'purpose' }]} />;
}

// ---------------- Complaints ----------------
export function Complaints() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const { data, reload } = useApi('/admin/complaints' + (status ? '?status=' + encodeURIComponent(status) : ''));
  async function setS(r, s) { try { await put(`/admin/complaints/${r.complaint_id}/status`, { status: s }); reload(); toast('Status updated'); } catch (e) { toast(e.message, 'error'); } }
  const cols = [
    { label: 'Raised', render: (r) => fmtDate(r.created_at) }, { label: 'Tenant', render: (r) => <><div>{r.tenant_name}</div><div className="muted">{r.property_name} {r.room_number && '· ' + r.room_number}</div></> },
    { label: 'Category', key: 'category' }, { label: 'Problem', key: 'description' }, { label: 'Status', render: (r) => <StatusBadge s={r.status} /> },
    { label: 'Update', render: (r) => <select className="input" style={{ width: 150 }} value={r.status} onChange={(e) => setS(r, e.target.value)} aria-label="Change status">{['Open', 'In Progress', 'Resolved'].map((s) => <option key={s}>{s}</option>)}</select> }
  ];
  return (<>
    <PageHead title="Complaints" sub="Raised by tenants" />
    <div className="toolbar"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status"><option value="">All statuses</option>{['Open', 'In Progress', 'Resolved'].map((s) => <option key={s}>{s}</option>)}</select></div>
    <Table columns={cols} rows={data} empty="No complaints." />
  </>);
}
