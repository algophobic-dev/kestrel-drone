// Flight log, drones with batteries, and the preflight checklist. Everything is kept on this device.
import { $, h, kv, emit, toast, modal, confirmDel, uid, download } from './util.js';
import { fmtLL } from './geo.js';
import { S, MODES } from './settings.js';

const flights = () => kv.get('flights', []), drones = () => kv.get('drones', []);
const field = (label, el, wide) => h('label', { class: 'field' + (wide ? ' wide' : '') }, h('span', {}, label), el);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nowTime = () => new Date().toTimeString().slice(0, 5);

// ---------- flight log
export function newFlight(p, f) { editFlight(f || { id: uid(), date: today(), time: nowTime(), minutes: 15, place: '', lat: p?.lat, lon: p?.lon, droneId: drones()[0]?.id || '', battery: '', mode: S.mode, maxAlt: S.alt, auth: '', notes: '' }, !f); }
function editFlight(f, isNew) {
  const ds = drones();
  const el = {
    date: h('input', { type: 'date', value: f.date }), time: h('input', { type: 'time', value: f.time }),
    minutes: h('input', { type: 'number', min: 0, value: f.minutes }), maxAlt: h('input', { type: 'number', min: 0, value: f.maxAlt }),
    place: h('input', { type: 'text', value: f.place, placeholder: 'For example City Park' }),
    drone: h('select', {}, h('option', { value: '' }, ds.length ? 'Choose a drone' : 'Add a drone in the Drones tab'), ds.map(d => h('option', { value: d.id, selected: d.id === f.droneId }, d.name))),
    battery: h('select', {}),
    mode: h('select', {}, Object.entries(MODES).map(([k, v]) => h('option', { value: k, selected: f.mode === k }, v))),
    auth: h('input', { type: 'text', value: f.auth, placeholder: 'LAANC or DroneZone reference, if any' }),
    notes: h('textarea', { rows: 3 }, f.notes || ''),
    cycle: h('input', { type: 'checkbox', checked: isNew }),
  };
  const fillBatteries = () => { const d = ds.find(x => x.id === el.drone.value); el.battery.replaceChildren(h('option', { value: '' }, 'None'), (d?.batteries || []).map((b, i) => h('option', { value: b.id, selected: f.battery ? b.id === f.battery : isNew && i === 0 }, b.name))); };
  el.drone.onchange = fillBatteries; fillBatteries();
  modal(isNew ? 'Log a flight' : 'Edit flight', h('div', { class: 'form' },
    field('Date', el.date), field('Start time', el.time), field('Minutes in the air', el.minutes), field('Highest altitude, ft', el.maxAlt),
    field('Place', el.place, true), f.lat != null ? h('div', { class: 'note wide' }, `Position ${fmtLL(f.lat, f.lon)}`) : null,
    field('Drone', el.drone), field('Battery', el.battery), field('Pilot mode', el.mode), field('Authorization', el.auth), field('Notes', el.notes, true),
    isNew ? h('label', { class: 'wide', style: 'display:flex;gap:8px;align-items:center' }, el.cycle, 'Add one cycle to the chosen battery') : null),
  [{ label: 'Save', run: () => {
    const g = { ...f, date: el.date.value, time: el.time.value, minutes: Math.max(0, +el.minutes.value || 0), maxAlt: Math.max(0, +el.maxAlt.value || 0), place: el.place.value.trim(),
      droneId: el.drone.value, battery: el.battery.value, mode: el.mode.value, auth: el.auth.value.trim(), notes: el.notes.value.trim() };
    if (!g.date) { toast('Enter the date.'); return false; }
    kv.set('flights', [g, ...flights().filter(x => x.id !== g.id)].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)));
    if (isNew && el.cycle.checked && g.battery) bumpCycle(g.droneId, g.battery, 1);
    toast(isNew ? 'Flight logged.' : 'Flight saved.'); emit('records');
  } }]);
}
export function renderLog(view) {
  const list = flights(), ds = Object.fromEntries(drones().map(d => [d.id, d]));
  const total = list.reduce((a, f) => a + (f.minutes || 0), 0);
  view.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Flight log'), h('div', { class: 's' }, `${list.length} flight${list.length === 1 ? '' : 's'} · ${Math.floor(total / 60)} h ${total % 60} min in the air`)),
      h('div', { class: 'acts', style: 'margin:0' }, h('button', { class: 'btn', disabled: !list.length, onclick: exportCsv }, 'Export CSV'), h('button', { class: 'btn primary', onclick: () => newFlight(null) }, 'Log a flight'))),
    list.length ? h('div', { class: 'list' }, list.map(f => h('button', { class: 'row', onclick: () => editFlight(f, false) },
      h('div', { class: 'grow' }, h('div', { class: 't' }, `${f.date} · ${f.place || (f.lat != null ? fmtLL(f.lat, f.lon) : 'No place')}`),
        h('div', { class: 's' }, [`${f.minutes} min`, ds[f.droneId]?.name, MODES[f.mode], f.maxAlt ? `${f.maxAlt} ft` : '', f.auth ? `Authorization ${f.auth}` : ''].filter(Boolean).join(' · '))),
      h('span', { class: 'btn sm danger', onclick: e => { e.stopPropagation(); confirmDel('this flight', () => { kv.set('flights', flights().filter(x => x.id !== f.id)); emit('records'); }); } }, 'Delete'))))
      : h('div', { class: 'empty' }, 'No flights yet. Log one here, or from a checked spot on the map.')));
}
function exportCsv() {
  const ds = Object.fromEntries(drones().map(d => [d.id, d])), q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Date', 'Start time', 'Minutes', 'Place', 'Latitude', 'Longitude', 'Drone', 'Registration', 'Battery', 'Pilot mode', 'Highest altitude ft', 'Authorization', 'Notes'];
  const rows = flights().map(f => { const d = ds[f.droneId], b = d?.batteries?.find(x => x.id === f.battery);
    return [f.date, f.time, f.minutes, f.place, f.lat?.toFixed(5), f.lon?.toFixed(5), d?.name, d?.reg, b?.name, MODES[f.mode], f.maxAlt, f.auth, f.notes].map(q).join(','); });
  download(`kestrel-drone-log-${today()}.csv`, [head.map(q).join(','), ...rows].join('\n'), 'text/csv');
}

// ---------- drones and batteries
function bumpCycle(droneId, batId, n) {
  kv.set('drones', drones().map(d => d.id !== droneId ? d : { ...d, batteries: d.batteries.map(b => b.id !== batId ? b : { ...b, cycles: Math.max(0, (b.cycles || 0) + n) }) }));
  emit('records');
}
function editDrone(d, isNew) {
  const el = { name: h('input', { type: 'text', value: d.name, placeholder: 'For example Mini 4 Pro' }), model: h('input', { type: 'text', value: d.model }),
    reg: h('input', { type: 'text', value: d.reg, placeholder: 'FA...' }), weight: h('input', { type: 'number', min: 0, value: d.weight ?? '' }),
    rid: h('select', {}, [['built-in', 'Built-in'], ['module', 'Broadcast module'], ['none', 'None (fly only in a FRIA)']].map(([k, v]) => h('option', { value: k, selected: d.rid === k }, v))) };
  modal(isNew ? 'Add a drone' : 'Edit drone', h('div', { class: 'form' }, field('Name', el.name), field('Model', el.model), field('FAA registration number', el.reg), field('Takeoff weight, g', el.weight), field('Remote ID', el.rid, true),
    h('p', { class: 'note wide' }, 'Drones over 250 g must be registered with the FAA, marked with the number, and broadcast Remote ID.')), [{ label: 'Save', run: () => {
    if (!el.name.value.trim()) { toast('Enter a name.'); return false; }
    const g = { ...d, name: el.name.value.trim(), model: el.model.value.trim(), reg: el.reg.value.trim().toUpperCase(), weight: el.weight.value ? +el.weight.value : null, rid: el.rid.value };
    kv.set('drones', isNew ? [...drones(), g] : drones().map(x => x.id === g.id ? g : x)); emit('records');
  } }]);
}
export function renderDrones(view) {
  const ds = drones();
  const addBattery = d => { const name = h('input', { type: 'text', placeholder: `Battery ${(d.batteries?.length || 0) + 1}`, style: 'width:100%' }), cycles = h('input', { type: 'number', min: 0, value: 0, style: 'width:100%' });
    modal(`Add a battery to ${d.name}`, h('div', { class: 'form' }, field('Name or label', name), field('Cycles so far', cycles)), [{ label: 'Add', run: () => {
      const b = { id: uid(), name: name.value.trim() || name.placeholder, cycles: Math.max(0, +cycles.value || 0) };
      kv.set('drones', drones().map(x => x.id === d.id ? { ...x, batteries: [...(x.batteries || []), b] } : x)); emit('records'); } }]); };
  view.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Drones'), h('button', { class: 'btn primary', onclick: () => editDrone({ id: uid(), name: '', model: '', reg: '', rid: 'built-in', batteries: [] }, true) }, 'Add a drone')),
    ds.length ? ds.map(d => h('div', { class: 'card' },
      h('div', { style: 'display:flex;align-items:flex-start;gap:10px' }, h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 't', style: 'font-weight:700;font-size:16px' }, d.name),
        h('div', { class: 'note' }, [d.model, d.reg ? `Registration ${d.reg}` : 'No registration number', d.weight ? `${d.weight} g` : '', `Remote ID: ${{ 'built-in': 'built-in', module: 'module', none: 'none' }[d.rid] || 'not set'}`].filter(Boolean).join(' · '))),
        h('button', { class: 'btn sm', onclick: () => editDrone(d, false) }, 'Edit'), h('button', { class: 'btn sm danger', onclick: () => confirmDel(d.name, () => { kv.set('drones', drones().filter(x => x.id !== d.id)); emit('records'); }) }, 'Delete')),
      h('div', { class: 'sect' }, 'Batteries'),
      (d.batteries || []).length ? h('div', { class: 'list', style: 'background:var(--bg)' }, d.batteries.map(b => h('div', { class: 'row' },
        h('div', { class: 'grow' }, h('div', { class: 't' }, b.name), h('div', { class: 's' }, `${b.cycles || 0} cycle${b.cycles === 1 ? '' : 's'}`)),
        h('button', { class: 'btn sm', title: 'One cycle fewer', onclick: () => bumpCycle(d.id, b.id, -1) }, '−'), h('button', { class: 'btn sm', title: 'One cycle more', onclick: () => bumpCycle(d.id, b.id, 1) }, '+1 cycle'),
        h('button', { class: 'btn sm danger', onclick: () => confirmDel(b.name, () => { kv.set('drones', drones().map(x => x.id === d.id ? { ...x, batteries: x.batteries.filter(y => y.id !== b.id) } : x)); emit('records'); }) }, 'Delete'))))
        : h('div', { class: 'note' }, 'No batteries yet.'),
      h('div', { class: 'acts' }, h('button', { class: 'btn sm', onclick: () => addBattery(d) }, 'Add a battery'))))
      : h('div', { class: 'empty' }, 'No drones yet. Add one to track its registration, Remote ID and battery cycles.')));
}

// ---------- preflight checklist
const DEFAULT_ITEMS = ['Weather, wind and Kp checked', 'Airspace checked, authorization received if needed', 'TFRs and NOTAMs checked', 'Registration number marked on the drone',
  'Remote ID broadcasting', 'Batteries charged and seated', 'Propellers undamaged and tight', 'Firmware and app up to date', 'Compass and GPS ready, home point set',
  'Return-to-home altitude set above obstacles', 'Takeoff area clear of people', 'Visual observer briefed, if you have one', 'Certificate (Part 107 or TRUST) with you'];
const list = () => kv.get('checklist', { items: DEFAULT_ITEMS.map(t => ({ id: uid(), text: t })), done: {} });
export function renderChecklist(view, editing = false) {
  const c = list(), done = c.items.filter(i => c.done[i.id]).length, save = v => { kv.set('checklist', v); renderChecklist(view, editing); };
  const input = h('input', { type: 'text', placeholder: 'New item', style: 'flex:1', onkeydown: e => { if (e.key === 'Enter') add(); } });
  const add = () => { const t = input.value.trim(); if (!t) return; save({ ...c, items: [...c.items, { id: uid(), text: t }] }); };
  view.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Preflight checklist'), h('div', { class: 's' }, `${done} of ${c.items.length} done`)),
      h('div', { class: 'acts', style: 'margin:0' }, h('button', { class: 'btn', onclick: () => renderChecklist(view, !editing) }, editing ? 'Done editing' : 'Edit list'),
        h('button', { class: 'btn', onclick: () => save({ ...c, done: {} }) }, 'Start over'))),
    h('div', { class: 'list' }, c.items.map(i => editing
      ? h('div', { class: 'row' }, h('div', { class: 'grow' }, i.text), h('button', { class: 'btn sm danger', onclick: () => save({ ...c, items: c.items.filter(x => x.id !== i.id) }) }, 'Remove'))
      : h('label', { class: 'check-item' + (c.done[i.id] ? ' done' : '') }, h('input', { type: 'checkbox', checked: !!c.done[i.id], onchange: e => save({ ...c, done: { ...c.done, [i.id]: e.target.checked } }) }), h('span', {}, i.text)))),
    editing ? h('div', { class: 'acts' }, input, h('button', { class: 'btn primary', onclick: add }, 'Add'), h('button', { class: 'btn', onclick: () => save({ items: DEFAULT_ITEMS.map(t => ({ id: uid(), text: t })), done: {} }) }, 'Restore the default list')) : null,
    done === c.items.length && c.items.length ? h('p', { class: 'note', style: 'margin-top:10px' }, 'All items done.') : null));
}
