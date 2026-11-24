import { PageHead, useApi } from '../../components';
import { rupee } from '../../api';

export default function Dashboard() {
  const { data: s } = useApi('/admin/stats');
  const { data: props } = useApi('/admin/properties');
  const tile = (label, n) => <div className="stat"><div className="label">{label}</div><div className="n">{n ?? '-'}</div></div>;
  return (
    <>
      <PageHead title="Everything at a glance" sub="Dashboard" />
      <div className="stats">
        {tile('Properties', s?.properties)}{tile('Beds in use', s && `${s.occupied} / ${s.beds}`)}{tile('Tenants', s?.tenants)}
        {tile('Rent pending', s && rupee(s.pendingRent))}{tile('Employees', s?.employees)}
        {tile('Open complaints', s?.openComplaints)}{tile('Leave to review', s?.pendingLeaves)}
      </div>
      <div className="label" style={{ marginBottom: 6 }}>Occupancy by property</div>
      {(props || []).map((p) => {
        const used = p.total_beds - p.available_beds, pct = Math.round((used / p.total_beds) * 100);
        return (
          <div className="occ-row" key={p.property_id}>
            <div><div>{p.name}</div><div className="muted">{p.area}, {p.city}</div></div>
            <div className="bar" aria-hidden="true"><i style={{ width: pct + '%' }} /></div>
            <div className="num">{used} / {p.total_beds} beds · {pct}%</div>
          </div>
        );
      })}
    </>
  );
}
