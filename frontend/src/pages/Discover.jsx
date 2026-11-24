import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { get, qs, rupee } from '../api';
import SiteHeader from '../SiteHeader';
import EnquiryModal from '../EnquiryModal';

const SHARING = [{ v: 0, t: 'Any' }, { v: 1, t: 'Single' }, { v: 2, t: 'Double' }, { v: 3, t: 'Triple' }, { v: 4, t: '4-sharing' }];
const DEFAULT = { q: '', city: '', maxRent: 16000, sharing: 0, availableOnly: true };

export default function Discover() {
  const [cities, setCities] = useState([]);
  const [f, setF] = useState(DEFAULT);
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);       // full detail of the clicked property
  const [enquiry, setEnquiry] = useState(undefined);    // undefined = closed, null = general, object = about a property
  const [tileErr, setTileErr] = useState(false);
  const mapEl = useRef(); const map = useRef(); const layer = useRef(); const markers = useRef({});
  const selId = useRef(null);

  useEffect(() => { get('/public/cities').then(setCities).catch(() => {}); }, []);

  // all property data comes from MySQL through the API; rooms returned are the ones matching the filters
  useEffect(() => {
    setLoading(true);
    let live = true;
    const t = setTimeout(() => {
      get('/public/properties' + qs({ q: f.q, city: f.city, maxRent: f.maxRent >= 16000 ? '' : f.maxRent, sharing: f.sharing || '', availableOnly: f.availableOnly }))
        .then((d) => live && setProps(d)).catch(() => live && setProps([])).finally(() => live && setLoading(false));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [f]);

  function select(id) { selId.current = id; get('/public/properties/' + id).then(setSelected).catch(() => {}); styleMarkers(); }
  function styleMarkers() { Object.entries(markers.current).forEach(([id, m]) => m.getElement()?.querySelector('.pin')?.classList.toggle('sel', Number(id) === selId.current)); }

  useEffect(() => {
    map.current = L.map(mapEl.current, { zoomControl: false }).setView([28.55, 77.0], 9);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
      .on('tileerror', () => setTileErr(true)).on('tileload', () => setTileErr(false)).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    const ro = new ResizeObserver(() => map.current && map.current.invalidateSize());
    ro.observe(mapEl.current);
    return () => { ro.disconnect(); map.current.remove(); };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    layer.current.clearLayers(); markers.current = {};
    props.forEach((p) => {
      const icon = L.divIcon({ className: 'pin-wrap', html: `<div class="pin">${rupee(p.match_min_rent)}</div>`, iconSize: [0, 0] });
      markers.current[p.property_id] = L.marker([p.latitude, p.longitude], { icon, title: p.name, keyboard: true }).on('click', () => select(p.property_id)).addTo(layer.current);
    });
    if (props.length > 1) map.current.fitBounds(props.map((p) => [p.latitude, p.longitude]), { padding: [60, 60], maxZoom: 13 });
    else if (props.length === 1) map.current.setView([props[0].latitude, props[0].longitude], 14);
    setTimeout(styleMarkers, 0);
  }, [props]); // eslint-disable-line react-hooks/exhaustive-deps

  function focus(p) { select(p.property_id); map.current.flyTo([p.latitude, p.longitude], Math.max(map.current.getZoom(), 13), { duration: 0.8 }); }
  function close() { setSelected(null); selId.current = null; styleMarkers(); }

  const totalBeds = props.reduce((n, p) => n + Number(p.match_beds || 0), 0);
  const sharingLabel = SHARING.find((s) => s.v === f.sharing).t;
  const isDefault = JSON.stringify(f) === JSON.stringify(DEFAULT);
  const matches = (r) => (!f.sharing || r.capacity === f.sharing) && (f.maxRent >= 16000 || r.monthly_rent <= f.maxRent) && (!f.availableOnly || r.available_beds > 0);

  return (
    <div className="page-full">
      <SiteHeader active="find" onEnquire={setEnquiry} />
      <div className={'dsc-body' + (selected ? ' has-detail' : '')}>
        <aside className="dsc-panel" aria-label="Search and results">
          <h1>Find your PG</h1>
          <p className="sub">Sohna, Gurugram and Rohtak. Live availability.</p>
          <section><div className="pill-row">
            <input className="input" style={{ flex: '1 1 180px' }} placeholder="Search name, area or city" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search" />
            <select className="input" style={{ width: 'auto' }} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} aria-label="City"><option value="">All cities</option>{cities.map((c) => <option key={c}>{c}</option>)}</select>
          </div></section>
          <section><div className="label" style={{ marginBottom: 8 }}>Room type</div>
            <div className="pill-row">{SHARING.map((s) => <button key={s.v} className={'chip' + (f.sharing === s.v ? ' on' : '')} aria-pressed={f.sharing === s.v} onClick={() => setF({ ...f, sharing: s.v })}>{s.t}</button>)}</div></section>
          <section><div className="row-between"><span className="label">Monthly budget</span><span className="gold">{f.maxRent >= 16000 ? 'Any' : 'up to ' + rupee(f.maxRent)}</span></div>
            <input type="range" min="4000" max="16000" step="500" value={f.maxRent} onChange={(e) => setF({ ...f, maxRent: Number(e.target.value) })} aria-label="Maximum monthly rent" /></section>
          <section className="pill-row" style={{ justifyContent: 'space-between' }}>
            <label className="switch"><input type="checkbox" checked={f.availableOnly} onChange={(e) => setF({ ...f, availableOnly: e.target.checked })} />Only free beds</label>
            {!isDefault && <button className="btn small" onClick={() => setF(DEFAULT)}>Reset</button>}
          </section>

          <div className={'list-wrap' + (loading && props.length ? ' is-loading' : '')}>
          <div className="result-head"><b>{loading && !props.length ? 'Searching...' : `${props.length} ${props.length === 1 ? 'property' : 'properties'}`}</b><span className="muted">{totalBeds} {sharingLabel === 'Any' ? '' : sharingLabel.toLowerCase() + ' '}beds free</span></div>
          {loading && props.length === 0 && [0, 1, 2].map((i) => <div key={i} className="place skel"><i /><i /><i /></div>)}
          {!loading && props.length === 0 && (
            <div className="empty" style={{ padding: '24px 0' }}>No PG matches these filters.<br /><button className="btn small" style={{ marginTop: 12 }} onClick={() => setF(DEFAULT)}>Clear filters</button></div>
          )}
          {props.map((p) => (
            <div key={p.property_id} role="button" tabIndex={0} className={'place' + (selected?.property_id === p.property_id ? ' sel' : '')} onClick={() => focus(p)} onKeyDown={(e) => e.key === 'Enter' && focus(p)}>
              <h3>{p.name}</h3>
              <div className="where">{p.area}, {p.city}</div>
              <div className="summary"><span><b>{p.match_beds}</b> {sharingLabel === 'Any' ? '' : sharingLabel.toLowerCase() + ' '}beds free</span><span className="gold">from {rupee(p.match_min_rent)}</span></div>
              <div className="mini-rooms">{p.matching_rooms.map((r) => (
                <div className="mini-room" key={r.room_id}><span>Room {r.room_number} · {r.sharing_type}</span>
                  <span><span className={r.available_beds > 0 ? 'free' : 'full'}>{r.available_beds > 0 ? r.available_beds + ' free' : 'Full'}</span> · {rupee(r.monthly_rent)}</span></div>))}</div>
            </div>
          ))}
          </div>
        </aside>

        <div className="dsc-map">
          <div id="map" ref={mapEl} />
          {tileErr && <div className="map-notice">Map tiles could not load. Check your internet connection.</div>}
          <div className="statusbar">Live from the SmartStay database</div>
        </div>
      {selected && (
        <section className="detail-col" aria-label="Property details">
          <button className="close-x" onClick={close} aria-label="Close details">×</button>
          <div className="label">{selected.area} · {selected.city}</div>
          <h2>{selected.name}</h2>
          <p className="muted" style={{ margin: '0 0 8px' }}>{selected.address}, {selected.city}, {selected.state} {selected.pin_code}</p>
          {selected.description && <p style={{ margin: '0 0 4px' }}>{selected.description}</p>}
          <div className="facility-list">{(selected.facilities || '').split(', ').filter(Boolean).map((x) => <span key={x}>{x}</span>)}</div>
          <div className="label" style={{ marginBottom: 4 }}>All rooms{f.sharing || f.maxRent < 16000 || f.availableOnly ? ' (your matches highlighted)' : ''}</div>
          {selected.rooms.map((r) => (
            <div className={'room-row' + (matches(r) ? '' : ' dim')} key={r.room_id}>
              <span>Room {r.room_number} <span className="muted">· {r.sharing_type}</span></span>
              <span className={r.available_beds > 0 ? 'free' : 'muted'}>{r.available_beds > 0 ? r.available_beds + ' free' : 'Full'}</span><b>{rupee(r.monthly_rent)}</b>
            </div>))}
          <div className="pill-row" style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={() => setEnquiry(selected)}>Enquire about this PG</button>
            <a className="btn" href={`https://www.openstreetmap.org/directions?to=${selected.latitude},${selected.longitude}`} target="_blank" rel="noreferrer">Directions</a>
          </div>
        </section>
      )}
      </div>
      {enquiry !== undefined && <EnquiryModal property={enquiry} onClose={() => setEnquiry(undefined)} />}
    </div>
  );
}
