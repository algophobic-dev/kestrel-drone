// Drone map: base maps, FAA drone layers for the area in view, tap or GPS to check a spot.
import { $, h, kv, emit, toast, debounce } from './util.js';
import { CONFIG } from './config.js';
import { inBox, tfrs } from './data.js';

const CK = CONFIG.cartoKey ? '?key=' + encodeURIComponent(CONFIG.cartoKey) : '';
const CARTO = 'https://basemaps.cartocdn.com/rastertiles/', CARTO_ATTR = '© OpenStreetMap © CARTO';
const BASES = {
  dark: CK ? { name: 'Dark', url: CARTO + 'dark_all/{z}/{x}/{y}.png' + CK, max: 18, attr: CARTO_ATTR }
    : { name: 'Dark', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', max: 16, attr: '© Esri' },
  ...(CK ? { light: { name: 'Light', url: CARTO + 'voyager/{z}/{x}/{y}.png' + CK, max: 18, attr: CARTO_ATTR } } : {}),
  topo: { name: 'Topographic', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', max: 16, attr: 'USGS' },
  sat: { name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, attr: 'Imagery © Esri, Maxar, Earthstar Geographics' },
};
// Each overlay: label, legend colour, the zoom it starts at, and its style.
export const OVERLAYS = {
  grid: { name: 'Facility map ceilings', color: '#f2b134', min: 10 },
  class: { name: 'Controlled airspace', color: '#3d8bff', min: 6 },
  tfr: { name: 'TFRs', color: '#ef5350', min: 4 },
  nsufr: { name: 'Security restrictions', color: '#ff6b6b', min: 6 },
  sua: { name: 'Prohibited and restricted areas', color: '#e05ad8', min: 6 },
  park: { name: 'National parks', color: '#58b368', min: 6 },
  stadium: { name: 'Stadiums (3 nm)', color: '#c9a04a', min: 8 },
  fria: { name: 'FRIAs (Remote ID)', color: '#4cc9f0', min: 9 },
  recsite: { name: 'Recreational flying sites', color: '#9ad97a', min: 9 },
  airport: { name: 'Airports and heliports', color: '#cfe3ff', min: 9 },
};
const ceilColor = c => c === 0 ? '#ef5350' : c <= 100 ? '#ff9f1c' : c <= 200 ? '#f2d13a' : c <= 300 ? '#a6d75b' : '#3fc35f';
const STYLE = {
  grid: f => ({ color: ceilColor(f.properties.CEILING), weight: .6, fillColor: ceilColor(f.properties.CEILING), fillOpacity: .22 }),
  class: f => { const c = f.properties.CLASS, e = f.properties.LOCAL_TYPE === 'CLASS_E2';
    return { color: c === 'C' || e ? '#d946ef' : '#3d8bff', weight: c === 'B' ? 2.4 : 1.8, dashArray: c === 'D' || e ? '7 5' : null, fillOpacity: .05 }; },
  sua: f => ({ color: f.properties.TYPE_CODE === 'P' ? '#ef5350' : '#e05ad8', weight: 2, fillOpacity: .12 }),
  nsufr: () => ({ color: '#ff6b6b', weight: 2, fillColor: '#ff6b6b', fillOpacity: .25 }),
  ptnsufr: () => ({ color: '#ff6b6b', weight: 2, dashArray: '6 4', fillColor: '#ff6b6b', fillOpacity: .15 }),
  nda: () => ({ color: '#ef5350', weight: 2, fillColor: '#ef5350', fillOpacity: .2 }),
  tfr: () => ({ color: '#ef5350', weight: 2, fillColor: '#ef5350', fillOpacity: .18 }),
  park: () => ({ color: '#58b368', weight: 1.4, fillColor: '#58b368', fillOpacity: .14 }),
  fria: () => ({ color: '#4cc9f0', weight: 1.6, fillOpacity: .1 }),
  recsite: () => ({ color: '#9ad97a', weight: 1.6, dashArray: '4 4', fillOpacity: .08 }),
};

const st = Object.assign({ base: 'dark', c: [39.74, -104.99], z: 10, ov: Object.fromEntries(Object.keys(OVERLAYS).map(k => [k, true])) }, kv.get('map', {}));
for (const k of Object.keys(OVERLAYS)) st.ov[k] ??= true;
const save = () => kv.set('map', st);
export let map;
let baseL, canvas, pin = null, me = null, watch = null;
const groups = {};

export function initMap(onCheck) {
  map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 3, maxZoom: 19, zoomSnap: .5 }).setView(st.c, st.z);
  map.attributionControl.setPrefix(false);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  canvas = L.canvas({ padding: .3 });
  for (const k of [...Object.keys(OVERLAYS), 'labels']) groups[k] = L.layerGroup().addTo(map);
  setBase();
  map.on('moveend', () => { const c = map.getCenter(); st.c = [c.lat, c.lng]; st.z = map.getZoom(); save(); draw(); });
  map.on('click', e => { pickSpot({ lat: e.latlng.lat, lon: e.latlng.lng }); onCheck({ lat: e.latlng.lat, lon: e.latlng.lng }); });
  $('#btn-layers').onclick = e => { e.stopPropagation(); const p = $('#layers-pop'); p.classList.toggle('hidden'); if (!p.classList.contains('hidden')) drawPop(); };
  document.addEventListener('click', e => { if (!e.target.closest('#layers-pop')) $('#layers-pop').classList.add('hidden'); });
  $('#btn-here').onclick = () => locate(p => { map.setView([p.lat, p.lon], Math.max(map.getZoom(), 13)); pickSpot(p); onCheck(p); });
  new ResizeObserver(() => map.invalidateSize()).observe($('#map'));
  draw();
  setInterval(() => { if (st.ov.tfr) draw(); }, 10 * 6e4);
}
function setBase() {
  baseL?.remove();
  if (!BASES[st.base]) st.base = 'dark';
  const b = BASES[st.base];
  baseL = L.tileLayer(b.url, { maxNativeZoom: b.max, maxZoom: 19, attribution: b.attr }).addTo(map);
}
function drawPop() {
  $('#layers-pop').replaceChildren(
    h('div', { class: 'sect' }, 'Base map'),
    ...Object.entries(BASES).map(([k, b]) => h('label', {}, h('input', { type: 'radio', name: 'base', checked: st.base === k, onchange: () => { st.base = k; save(); setBase(); } }), b.name)),
    h('div', { class: 'sect' }, 'Layers'),
    ...Object.entries(OVERLAYS).map(([k, o]) => h('label', {}, h('input', { type: 'checkbox', checked: !!st.ov[k], onchange: e => { st.ov[k] = e.target.checked; save(); draw(); } }),
      h('span', { class: 'sw', style: `border-color:${o.color}` }), o.name)),
    h('div', { class: 'note', style: 'padding:6px 12px' }, 'Facility map ceilings show from zoom 10, airports and FRIAs from zoom 9.'));
}

// Draw every layer for the area in view. A newer call cancels an older one.
let seq = 0, warned = false;
const draw = debounce(async () => {
  if (!map) return;
  const my = ++seq, z = map.getZoom(), b = map.getBounds().pad(.1), s = b.getSouth(), w = b.getWest(), n = b.getNorth(), e = b.getEast();
  const want = k => st.ov[k] && z >= OVERLAYS[k].min;
  const jobs = {
    grid: want('grid') ? inBox('grid', s, w, n, e) : null,
    class: want('class') ? inBox('class', s, w, n, e) : null,
    sua: want('sua') ? inBox('sua', s, w, n, e) : null,
    nsufr: want('nsufr') ? Promise.all([inBox('nsufr', s, w, n, e), inBox('ptnsufr', s, w, n, e), inBox('nda', s, w, n, e)]).then(([a, b2, c]) => [...a, ...b2.map(f => ({ ...f, _pt: 1 })), ...c]) : null,
    park: want('park') ? inBox('park', s, w, n, e) : null,
    stadium: want('stadium') ? inBox('stadium', s, w, n, e) : null,
    fria: want('fria') ? inBox('fria', s, w, n, e) : null,
    recsite: want('recsite') ? inBox('recsite', s, w, n, e) : null,
    airport: want('airport') ? inBox('airport', s, w, n, e) : null,
    tfr: want('tfr') ? tfrs().then(j => j.features) : null,
  };
  for (const [k, job] of Object.entries(jobs)) {
    if (!job) { groups[k].clearLayers(); if (k === 'grid') groups.labels.clearLayers(); continue; }
    job.then(list => {
      if (my !== seq) return;
      groups[k].clearLayers();
      if (k === 'stadium') list.forEach(f => L.circle([f.geometry.coordinates[1], f.geometry.coordinates[0]], { radius: 5556, renderer: canvas, interactive: false, color: '#c9a04a', weight: 1.5, dashArray: '5 5', fillOpacity: .06 }).addTo(groups[k]));
      else if (k === 'airport') list.filter(f => f.properties.OPERSTATUS !== 'CLOSED_INDEFINITELY').slice(0, 400).forEach(f => L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="apt ${f.properties.TYPE_CODE}"><i></i>${z >= 11 ? f.properties.ICAO_ID || f.properties.IDENT : ''}</div>` }) }).addTo(groups[k]));
      else L.geoJSON({ type: 'FeatureCollection', features: list }, { renderer: canvas, interactive: false, style: f => (k === 'nsufr' && f._pt ? STYLE.ptnsufr : STYLE[k])(f) }).addTo(groups[k]);
      if (k === 'grid') {
        groups.labels.clearLayers();
        if (z >= 12.5) for (const f of list.slice(0, 600)) { const q = f.properties, c = f.properties && centroid(f.geometry);
          if (c && b.contains([c[1], c[0]])) L.marker([c[1], c[0]], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [40, 14], iconAnchor: [20, 7], html: `<div class="ceil">${q.CEILING}</div>` }) }).addTo(groups.labels); }
      }
    }).catch(err => { if (my === seq && !warned) { warned = true; toast(err.message + '.'); setTimeout(() => { warned = false; }, 15000); } });
  }
}, 250);
const centroid = g => { const r = g?.type === 'Polygon' ? g.coordinates[0] : g?.type === 'MultiPolygon' ? g.coordinates[0][0] : null; if (!r) return null; let x = 0, y = 0; for (const [a, b] of r) { x += a; y += b; } return [x / r.length, y / r.length]; };

export function pickSpot(p) {
  pin?.remove();
  pin = L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2.5, fillColor: '#2bb3a0', fillOpacity: 1, interactive: false }).addTo(map);
  emit('spot', p);
}
export const clearSpot = () => { pin?.remove(); pin = null; };
export const center = () => { const c = map.getCenter(); return { lat: c.lat, lon: c.lng }; };

// One position fix from the device. Keeps a blue dot on the map while the app is open.
export function locate(done) {
  if (!navigator.geolocation) return toast('This device has no location service.');
  toast('Finding your location.');
  navigator.geolocation.getCurrentPosition(pos => {
    const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    me?.remove(); me = L.marker([p.lat, p.lon], { interactive: false, icon: L.divIcon({ className: '', iconSize: [16, 16], html: '<div class="me"></div>' }) }).addTo(map);
    done(p);
  }, err => toast(err.code === 1 ? 'Location access is off. Allow it in your browser settings.' : 'No position fix yet. Try again outside.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
}
