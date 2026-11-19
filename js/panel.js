// The "Can I fly here?" panel under the map.
import { $, h, emit, toast, modal } from './util.js';
import { fmtLL } from './geo.js';
import { check } from './check.js';
import { notams, tfrText, tfrType } from './data.js';
import { laanc, APPS } from './laanc.js';
import { S, setS } from './settings.js';
import { clearSpot } from './map.js';
import { newFlight } from './records.js';

const DRONEZONE = 'https://faadronezone-access.faa.gov/';
let seq = 0;

export async function showCheck(p) {
  const box = $('#check'), my = ++seq;
  const close = () => { box.classList.add('hidden'); clearSpot(); };
  const head = h('div', { class: 'head' }, h('div', { class: 'where' }, `Checked spot · ${fmtLL(p.lat, p.lon)}`), h('button', { class: 'btn sm', onclick: close }, 'Close'));
  box.replaceChildren(head, h('div', { class: 'body' }, h('div', { class: 'status loading' }, h('span', { class: 'mark' }), h('div', {}, h('h2', {}, 'Checking'), h('p', { class: 'note' }, 'Looking up airspace, restrictions and TFRs.')))));
  box.classList.remove('hidden');
  let r;
  try { r = await check(p); } catch (e) {
    if (my === seq) box.lastChild.replaceChildren(h('div', { class: 'status loading' }, h('span', { class: 'mark' }), h('div', {}, h('h2', {}, 'Could not check this spot'), h('p', { class: 'note' }, e.message + '. Try again in a minute.'))));
    return;
  }
  if (my !== seq) return;
  emit('checked', r);

  const alt = h('input', { type: 'number', min: 0, max: 400, step: 10, value: r.status === 'laanc' ? Math.min(S.alt, r.ceiling) : S.alt, style: 'width:90px', onchange: e => setS({ alt: Math.max(0, Math.min(400, +e.target.value || 0)) }) });
  const acts = h('div', { class: 'acts' });
  if (r.status === 'laanc') acts.append(h('button', { class: 'btn primary', onclick: async () => {
    const want = Math.min(+alt.value || 0, r.ceiling);
    const res = await laanc.request({ lat: p.lat, lon: p.lon, altitude: want, ceiling: r.ceiling, airport: r.laancAirport ? `${r.laancAirport.id} ${r.laancAirport.name}` : '' });
    if (res.copied) toast(res.message);
    else modal('Request details', h('div', {}, h('p', { class: 'note' }, res.message), h('pre', { class: 'raw' }, res.text)));
  } }, `Get LAANC authorization in ${(APPS[S.laanc] || APPS.aloft).name}`));
  if (r.status === 'auth') acts.append(h('a', { class: 'btn primary', href: DRONEZONE, target: '_blank', rel: 'noopener' }, 'Open FAA DroneZone'));
  acts.append(h('button', { class: 'btn', onclick: () => emit('tab', 'wx') }, 'Weather here'), h('button', { class: 'btn', onclick: () => newFlight(p) }, 'Log a flight here'));

  const tfrRows = r.tfrNear.slice(0, 8).map(t => h('div', { class: 'row', style: 'padding:8px 0' },
    h('div', { class: 'grow' }, h('div', { class: 't' }, `TFR ${t.q.id} · ${tfrType(t.q.type)} · ${t.d.toFixed(1)} nm away`), h('div', { class: 's' }, t.q.title)),
    h('button', { class: 'btn sm', onclick: () => details(t.q) }, 'Details')));
  const ntBox = h('div', {}, r.notamId ? `Loading NOTAMs for ${r.notamId}.` : 'No public airport within 10 nm, so no airport NOTAMs to show.');

  box.lastChild.replaceChildren(...[
    h('div', { class: 'status ' + r.status }, h('span', { class: 'mark' }), h('div', {}, h('h2', {}, r.title), h('p', {}, r.sub))),
    r.status !== 'restricted' ? h('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:10px' }, h('label', { class: 'note' }, 'Planned height, ft above ground'), alt,
      r.status === 'laanc' ? h('span', { class: 'note' }, `Up to ${r.ceiling} ft here`) : null) : null,
    acts,
    h('ul', { class: 'reasons' }, r.reasons.map(x => h('li', { class: x.lv }, h('span', { class: 'dot' }), h('span', {}, x.text)))),
    r.tfrHere.length ? h('div', { class: 'acts' }, r.tfrHere.map(t => h('button', { class: 'btn sm', onclick: () => details(t) }, `TFR ${t.id} details`))) : null,
    h('div', { class: 'sect' }, 'TFRs within 10 nm'), tfrRows.length ? tfrRows : h('div', { class: 'note' }, 'None.'),
    h('div', { class: 'sect' }, r.notamAirport ? `NOTAMs · ${r.notamId} ${r.notamAirport.NAME}` : 'NOTAMs'), ntBox].flat().filter(x => x != null && x !== false));
  if (r.notamId) notams(r.notamId).then(list => {
    if (my !== seq) return;
    ntBox.replaceChildren(list.length ? h('details', {}, h('summary', {}, `${list.length} NOTAM${list.length === 1 ? '' : 's'}`), list.map(n => h('pre', { class: 'raw' }, n.text))) : 'No NOTAMs.');
  }).catch(e => { if (my === seq) ntBox.replaceChildren(h('span', { class: 'note' }, e.message + '.')); });
}

async function details(t) {
  const body = h('pre', { class: 'raw', style: 'max-height:60vh;overflow:auto;border:0' }, 'Loading.');
  modal(`TFR ${t.id}`, h('div', {}, body, h('p', { class: 'note', style: 'margin-top:8px' }, h('a', { href: `https://tfr.faa.gov/tfr3/?page=detail_${t.id.replace('/', '_')}`, target: '_blank', rel: 'noopener' }, 'Open on tfr.faa.gov'))));
  try { body.textContent = await tfrText(t.id); } catch (e) { body.textContent = e.message + '.'; }
}
