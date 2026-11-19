// Map data, all through the relay: FAA drone layers and NPS park boundaries (one map square at a time), TFRs and NOTAMs.
import { CONFIG } from './config.js';
import { dist, inGeom } from './geo.js';

const relay = () => CONFIG.proxyUrl.replace(/\/$/, '');
// Square size in degrees for each layer. Must match DRONE_LAYERS in the relay.
export const TILE = { grid: .25, class: 1, sua: 1, nsufr: 1, ptnsufr: 5, nda: 5, stadium: 1, fria: 1, recsite: 1, airport: .5, park: 1 };

const firstPoint = g => g?.type === 'Point' ? g.coordinates : g?.type === 'Polygon' ? g.coordinates[0]?.[0] : g?.type === 'MultiPolygon' ? g.coordinates[0]?.[0]?.[0] : null;
const got = new Map();   // "layer/x/y" -> Promise of features
function square(layer, x, y) {
  const k = `${layer}/${x}/${y}`;
  if (!got.has(k)) {
    const p = fetch(`${relay()}/faa/${k}`).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Map data did not load');
      // Squares overlap at their edges, so the same feature can arrive twice. Tell copies apart by id, or by details and first point.
      return (j.features || []).map(f => ({ ...f, _k: layer + ':' + (f.id ?? JSON.stringify(f.properties) + JSON.stringify(firstPoint(f.geometry))) }));
    });
    got.set(k, p); p.catch(() => got.delete(k));
  }
  return got.get(k);
}
// Every feature of a layer in a box, without duplicates from neighbouring squares.
export async function inBox(layer, s, w, n, e) {
  const t = TILE[layer], x0 = Math.floor((w + 180) / t), x1 = Math.floor((e + 180) / t), y0 = Math.floor((s + 90) / t), y1 = Math.floor((n + 90) / t);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 40) return [];
  const lists = await Promise.all([...Array(x1 - x0 + 1)].flatMap((_, i) => [...Array(y1 - y0 + 1)].map((_, j) => square(layer, x0 + i, y0 + j))));
  const seen = new Set();
  return lists.flat().filter(f => !seen.has(f._k) && seen.add(f._k));
}
// Features of a layer within `nm` of a point (polygons containing it, or points near it).
export async function around(layer, p, nm = 0) {
  const d = Math.max(nm / 60, .02);
  return inBox(layer, p.lat - d, p.lon - d / Math.cos(p.lat * Math.PI / 180), p.lat + d, p.lon + d / Math.cos(p.lat * Math.PI / 180));
}
export const contains = (list, p) => list.filter(f => inGeom(p.lon, p.lat, f.geometry));

// Distance in nm from a point to a shape: 0 inside, else to its nearest corner.
export function distTo(p, g) {
  if (!g) return Infinity;
  if (g.type === 'Point') return dist(p, { lat: g.coordinates[1], lon: g.coordinates[0] });
  if (inGeom(p.lon, p.lat, g)) return 0;
  const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  let best = Infinity;
  for (const r of rings) for (const [lon, lat] of r) { const d = dist(p, { lat, lon }); if (d < best) best = d; }
  return best;
}

// TFRs (tfr.faa.gov through the relay), kept for 10 minutes.
let tfrCache = null;
export function tfrs() {
  if (tfrCache && Date.now() - tfrCache.t < 6e5) return tfrCache.p;
  const p = fetch(relay() + '/tfr').then(r => { if (!r.ok) throw new Error('TFRs did not load'); return r.json(); });
  tfrCache = { t: Date.now(), p }; p.catch(() => { tfrCache = null; });
  return p;
}
export async function tfrText(id) {
  const r = await fetch(`${relay()}/tfr/text?id=${encodeURIComponent(id)}`), j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Details did not load');
  return j.text;
}
const TFR_TYPE = { SECURITY: 'Security', VIP: 'VIP', HAZARDS: 'Hazards', SPECIAL: 'Special', 'UAS PUBLIC GATHERING': 'Drone, public gathering', 'AIR SHOWS/SPORTS': 'Air show or sports', 'SPACE OPERATIONS': 'Space operations' };
export const tfrType = t => TFR_TYPE[t] || (t ? t[0] + t.slice(1).toLowerCase() : 'TFR');

// NOTAMs for an airport (NOTAM Management Service through the relay).
export async function notams(id) {
  const r = await fetch(`${relay()}/notams?icao=${encodeURIComponent(id)}`), j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'NOTAMs did not load');
  return j.items || [];
}
