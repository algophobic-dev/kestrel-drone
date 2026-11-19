// Kestrel Drone: tabs and start-up.
import { $, $$, on, emit } from './util.js';
import { initMap, center, map } from './map.js';
import { showCheck } from './panel.js';
import { renderWx } from './wx.js';
import { renderLog, renderDrones, renderChecklist } from './records.js';
import { renderMore } from './more.js';
import { S, setS, MODES } from './settings.js';
import { fmtLL } from './geo.js';

let spot = null, current = 'map';
const views = { wx: v => renderWx(v, spot || center(), spot ? `Checked spot · ${fmtLL(spot.lat, spot.lon)}` : `Map center · ${fmtLL(center().lat, center().lon)}`),
  log: renderLog, drones: renderDrones, list: renderChecklist, more: renderMore };

function show(id) {
  current = id;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === id));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
  if (views[id]) views[id]($('#v-' + id));
  if (id === 'map') setTimeout(() => map?.invalidateSize(), 0);
}
$$('#tabs button').forEach(b => b.onclick = () => show(b.dataset.v));
on('tab', show);
on('spot', p => { spot = p; });
on('records', () => { if (views[current] && current !== 'wx') views[current]($('#v-' + current)); });
const badge = () => { $('#mode-badge').textContent = MODES[S.mode]; };
on('settings', badge); badge();
$('#mode-badge').onclick = () => { setS({ mode: S.mode === 'part107' ? 'rec' : 'part107' }); if (current === 'more') renderMore($('#v-more')); };

initMap(p => showCheck(p));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
