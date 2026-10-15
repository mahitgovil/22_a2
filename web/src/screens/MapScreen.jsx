import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Card, Empty, ErrorBox, Loading } from '../components/ui.jsx';
import { distance, timeOnly } from '../format.js';

const PRESETS = [
  { name: 'MG Road', lng: 77.6068, lat: 12.9756 },
  { name: 'Koramangala', lng: 77.6245, lat: 12.9352 },
  { name: 'Indiranagar', lng: 77.6408, lat: 12.9719 },
  { name: 'Whitefield', lng: 77.7499, lat: 12.9698 },
  { name: 'Hebbal', lng: 77.5970, lat: 13.0358 },
  { name: 'Jayanagar', lng: 77.5838, lat: 12.9308 },
];
const POLL_MS = 4000;
const RADIUS = 5000;

// A pin for the job site, drawn with CSS so no image assets are needed.
const siteIcon = L.divIcon({ className: 'site-pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] });

function ClickToSet({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lng: e.latlng.lng, lat: e.latlng.lat }) });
  return null;
}

function Recenter({ origin }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLng(origin.lat, origin.lng).toBounds(RADIUS * 2.3), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng]);
  return null;
}

export default function MapScreen() {
  const [origin, setOrigin] = useState(PRESETS[0]);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [live, setLive] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [fresh, setFresh] = useState(new Set()); // freelancer ids that are new since the last poll
  const [adding, setAdding] = useState(false);
  const seen = useRef(new Set());
  const requestId = useRef(0);

  const load = useCallback(async (first = false) => {
    const id = ++requestId.current;
    try {
      const d = await api('/map/nearby', { params: { lng: origin.lng, lat: origin.lat, radius: RADIUS, limit: 60, availableOnly } });
      if (id !== requestId.current) return;
      const ids = new Set(d.workers.map((w) => `${w.freelancer_id}:${w.pingId}`));
      // After the first load for this origin, anything not seen before is "new".
      if (!first && seen.current.size) {
        setFresh(new Set(d.workers.filter((w) => !seen.current.has(`${w.freelancer_id}:${w.pingId}`)).map((w) => w.freelancer_id)));
      } else {
        setFresh(new Set());
      }
      seen.current = ids;
      setData(d);
      setError(null);
    } catch (e) {
      if (id === requestId.current) setError(e);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [origin.lat, origin.lng, availableOnly]);

  // Reload straight away when the origin or filter changes.
  useEffect(() => {
    seen.current = new Set();
    setLoading(true);
    setSelected(null);
    load(true);
  }, [load]);

  // Poll for new pings; pause while the tab is hidden or live updates are off.
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => { if (!document.hidden) load(false); }, POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);

  const addPings = async () => {
    setAdding(true);
    try {
      await api('/map/pings', { method: 'POST', body: { lng: origin.lng, lat: origin.lat, count: 8 } });
      await load(false);
    } catch (e) {
      setError(e);
    } finally {
      setAdding(false);
    }
  };

  const workers = data?.workers ?? [];

  return (
    <div className="map-layout">
      <div className="map-main">
        <Card
          title="Nearest workers to the job site"
          actions={<span className={`live ${live ? 'on' : ''}`}>{live ? 'Live' : 'Paused'}</span>}
        >
          <div className="filters">
            <div className="field">
              <label htmlFor="site">Job site</label>
              <select
                id="site"
                value={PRESETS.find((p) => p.lng === origin.lng && p.lat === origin.lat)?.name ?? 'custom'}
                onChange={(e) => { const p = PRESETS.find((x) => x.name === e.target.value); if (p) setOrigin(p); }}
              >
                {PRESETS.map((p) => <option key={p.name}>{p.name}</option>)}
                <option value="custom" disabled>Custom (clicked on map)</option>
              </select>
            </div>
            <label className="check align-end">
              <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
              <span>Available workers only</span>
            </label>
            <label className="check align-end">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              <span>Update live</span>
            </label>
          </div>
          <p className="muted">Click anywhere on the map to move the job site. The circle shows the 5 km search radius.</p>

          <div className="map-box">
            <MapContainer center={[origin.lat, origin.lng]} zoom={12} scrollWheelZoom className="leaflet-host" aria-label="Map of nearby workers">
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <ClickToSet onPick={setOrigin} />
              <Recenter origin={origin} />
              <Circle center={[origin.lat, origin.lng]} radius={RADIUS} pathOptions={{ color: '#2342E6', weight: 2, fillOpacity: 0.05, dashArray: '6 6' }} />
              <Marker position={[origin.lat, origin.lng]} icon={siteIcon}><Tooltip direction="top">Job site</Tooltip></Marker>
              {workers.map((w) => {
                const [lng, lat] = w.location.coordinates;
                const isNew = fresh.has(w.freelancer_id);
                const isSel = selected === w.freelancer_id;
                return (
                  <CircleMarker
                    key={`${w.freelancer_id}:${w.pingId}`}
                    center={[lat, lng]}
                    radius={isSel ? 10 : isNew ? 9 : 6}
                    pathOptions={{ color: isSel ? '#17233B' : '#fff', weight: isSel ? 3 : 1.5, fillColor: w.is_available ? '#0B7A57' : '#8793A8', fillOpacity: 0.95 }}
                    eventHandlers={{ click: () => setSelected(w.freelancer_id) }}
                  >
                    <Tooltip>{w.name} · {distance(w.distanceMeters)}</Tooltip>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
          <div className="legend">
            <span><i className="dot dot-green" /> Available</span>
            <span><i className="dot dot-grey" /> Unavailable</span>
            <span><i className="dot dot-site" /> Job site</span>
          </div>
        </Card>
      </div>

      <div className="map-side">
        <Card
          title="Closest first"
          actions={<button className="btn btn-small" onClick={addPings} disabled={adding}>{adding ? 'Adding…' : 'Simulate new pings'}</button>}
        >
          <ErrorBox error={error} onRetry={() => load(true)} title="Could not load workers" />
          {loading && !data && <Loading rows={6} />}
          {data && (
            <p className="muted" aria-live="polite">
              {data.count} {data.count === 1 ? 'worker' : 'workers'} within 5 km · updated {timeOnly(data.serverTime)} · query {data.queryMs} ms
            </p>
          )}
          {data && workers.length === 0 && !error && (
            <Empty title="No workers within 5 km">Move the job site, include unavailable workers, or press “Simulate new pings”.</Empty>
          )}
          <ol className="worker-list">
            {workers.map((w) => (
              <li key={`${w.freelancer_id}:${w.pingId}`} className={selected === w.freelancer_id ? 'sel' : ''}>
                <button onClick={() => setSelected(w.freelancer_id)}>
                  <span className="worker-name">
                    {w.name}
                    {fresh.has(w.freelancer_id) && <span className="badge badge-progress">new ping</span>}
                  </span>
                  <span className="num worker-dist">{distance(w.distanceMeters)}</span>
                </button>
                <div className="muted worker-meta">
                  <span className={w.is_available ? 'ok' : ''}>{w.is_available ? 'Available' : 'Unavailable'}</span> · pinged {timeOnly(w.created_at)} ·{' '}
                  <Link to={`/browse/freelancers/${w.freelancer_id}`}>profile</Link>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
