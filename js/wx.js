// Drone weather for the chosen spot.
// In the US, temperature, dew point, surface wind and rain chance come from the National Weather Service.
// Gusts, wind at 80 m and 120 m (about 260 and 390 ft), visibility and low cloud come from Open-Meteo (credit required, CC BY 4.0).
// Kp index from NOAA's Space Weather Prediction Center. Sun times are calculated on the device.
import { h } from './util.js';
import { fmtLL } from './geo.js';
import { S, wind, temp, distance } from './settings.js';
import { sunTimes, light } from './sun.js';

const hr = d => d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--';
const DIRS = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
const dir = d => d == null ? '' : `${String(Math.round(d / 10) * 10 % 360 || 360).padStart(3, '0')}°`;

async function openMeteo(p) {
  const v = 'temperature_2m,dew_point_2m,precipitation_probability,visibility,cloud_cover_low,wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_80m,wind_direction_80m,wind_speed_120m,wind_direction_120m';
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(3)}&longitude=${p.lon.toFixed(3)}&hourly=${v}&forecast_days=2&timezone=GMT`);
  if (!r.ok) throw new Error('Weather did not load');
  const j = (await r.json()).hourly;
  return j.time.map((t, i) => ({ t: new Date(t + 'Z'), temp: j.temperature_2m[i], dew: j.dew_point_2m[i], pop: j.precipitation_probability[i], vis: j.visibility[i], low: j.cloud_cover_low[i],
    w10: j.wind_speed_10m[i], d10: j.wind_direction_10m[i], gust: j.wind_gusts_10m[i], w80: j.wind_speed_80m[i], d80: j.wind_direction_80m[i], w120: j.wind_speed_120m[i], d120: j.wind_direction_120m[i], src: 'Open-Meteo' }));
}
// NWS hourly forecast (US only). Returns a map of hour -> values, or null outside the US.
async function nws(p) {
  try {
    const pt = await (await fetch(`https://api.weather.gov/points/${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, { headers: { Accept: 'application/geo+json' } })).json();
    const url = pt.properties?.forecastHourly; if (!url) return null;
    const f = await (await fetch(url, { headers: { Accept: 'application/geo+json' } })).json();
    const out = new Map();
    for (const q of f.properties?.periods || []) {
      const mph = Math.max(...(q.windSpeed || '').match(/\d+/g)?.map(Number) || [NaN]);
      out.set(+new Date(q.startTime), { temp: q.temperatureUnit === 'F' ? (q.temperature - 32) * 5 / 9 : q.temperature, dew: q.dewpoint?.value ?? null, pop: q.probabilityOfPrecipitation?.value ?? null,
        w10: isFinite(mph) ? mph * 1.609 : null, d10: DIRS[q.windDirection] ?? null });
    }
    return out;
  } catch { return null; }
}
async function kp() {
  const j = await (await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json')).json();
  const now = Date.now(), rows = j.map(x => ({ t: Date.parse(x.time_tag + 'Z'), kp: +x.kp, obs: x.observed }));
  const past = rows.filter(x => x.t <= now), next = rows.filter(x => x.t > now && x.t <= now + 864e5);
  return { now: past[past.length - 1], max: next.reduce((a, b) => (b.kp > (a?.kp ?? -1) ? b : a), null) };
}
// Cloud base estimate from the temperature and dew point spread: about 400 ft per °C.
const base = x => x.temp == null || x.dew == null ? null : Math.max(0, Math.round((x.temp - x.dew) * 400 / 100) * 100);

let seq = 0;
export async function renderWx(view, p, label) {
  const my = ++seq;
  if (!p) { view.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'empty' }, 'Tap a spot on the map, or use Check my location, to see the weather there.'))); return; }
  view.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', {}, 'Weather'), h('div', { class: 's' }, label || fmtLL(p.lat, p.lon))), h('div', { class: 'empty' }, 'Loading weather.')));
  const [om, nw, k] = await Promise.all([openMeteo(p).catch(() => null), nws(p), kp().catch(() => null)]);
  if (my !== seq) return;
  if (!om) { view.firstChild.lastChild.textContent = 'Weather did not load. Check your connection.'; return; }
  // US values from the NWS replace Open-Meteo's for the same hour.
  const rows = om.map(x => { const n = nw?.get(+x.t); return n ? { ...x, temp: n.temp ?? x.temp, dew: n.dew ?? x.dew, pop: n.pop ?? x.pop, w10: n.w10 ?? x.w10, d10: n.d10 ?? x.d10, src: 'NWS' } : x; });
  const now = Date.now(), i0 = Math.max(0, rows.findIndex(x => +x.t + 36e5 > now)), cur = rows[i0], next = rows.slice(i0, i0 + 13);
  const sun = sunTimes(new Date(), p.lat, p.lon), lt = light(new Date(), p.lat, p.lon);
  const LT = { day: 'Daylight', twilight: 'Civil twilight', night: 'Night' };
  const visMi = cur.vis != null ? cur.vis / 1609.34 : null, cb = base(cur);
  const warn = [];
  if (cur.gust != null && cur.gust / 1.609 >= 25) warn.push(`Gusts of ${wind(cur.gust)}. Many small drones can't hold position in gusts this strong.`);
  if (cur.w120 != null && cur.w120 / 1.609 >= 25) warn.push(`Wind of ${wind(cur.w120)} at 390 ft.`);
  if (S.mode === 'part107' && visMi != null && visMi < 3) warn.push('Visibility is below 3 statute miles, the Part 107 minimum.');
  if (S.mode === 'part107' && cb != null && cur.low > 30 && cb < 900) warn.push(`Cloud base is about ${cb.toLocaleString()} ft. Part 107 needs 500 ft below clouds.`);
  if (k?.now?.kp >= 5) warn.push(`Kp ${k.now.kp.toFixed(1)}: geomagnetic storm. GPS positions may drift.`);
  if (lt !== 'day' && S.mode === 'part107') warn.push(`${LT[lt]}: Part 107 needs anti-collision lighting visible for 3 statute miles.`);
  const kv = (a, b) => h('div', { class: 'kv' }, h('span', {}, a), h('span', {}, b));
  view.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Weather'), h('div', { class: 's' }, label || fmtLL(p.lat, p.lon))), h('div', { class: 's' }, `${hr(cur.t)} forecast`)),
    warn.length ? h('div', { class: 'card', style: 'border:1px solid rgba(242,177,52,.55)' }, h('h3', {}, 'Check before you fly'), h('ul', { class: 'rules' }, warn.map(w => h('li', {}, w)))) : null,
    h('div', { class: 'cards', style: 'margin-top:10px' },
      h('div', { class: 'card' }, h('h3', {}, 'Wind'), kv('Surface', `${dir(cur.d10)} ${wind(cur.w10)}`), kv('Gusts', wind(cur.gust)), kv('About 260 ft', `${dir(cur.d80)} ${wind(cur.w80)}`), kv('About 390 ft', `${dir(cur.d120)} ${wind(cur.w120)}`)),
      h('div', { class: 'card' }, h('h3', {}, 'Conditions'), kv('Temperature', temp(cur.temp)), kv('Cloud base', cur.low != null && cur.low < 10 ? 'No low clouds' : cb != null ? `About ${cb.toLocaleString()} ft` : '--'),
        kv('Visibility', cur.vis != null ? (visMi >= 10 ? '10+ mi' : distance(cur.vis)) : '--'), kv('Rain chance', cur.pop != null ? cur.pop + '%' : '--')),
      h('div', { class: 'card' }, h('h3', {}, 'Light'), h('div', { class: 'big', style: `color:${lt === 'day' ? 'var(--ok)' : 'var(--warn)'}` }, LT[lt]),
        kv('Civil dawn', hr(sun.dawn)), kv('Sunrise', hr(sun.rise)), kv('Sunset', hr(sun.set)), kv('Civil dusk', hr(sun.dusk)),
        h('div', { class: 'note', style: 'margin-top:6px' }, 'Civil twilight is from civil dawn to sunrise and from sunset to civil dusk. Part 107 flights in twilight or at night need anti-collision lighting.')),
      h('div', { class: 'card' }, h('h3', {}, 'Kp index (GPS)'), k?.now ? h('div', { class: 'big', style: `color:${k.now.kp >= 5 ? 'var(--bad)' : k.now.kp >= 4 ? 'var(--warn)' : 'var(--ok)'}` }, k.now.kp.toFixed(1)) : h('div', {}, 'Did not load'),
        k?.max ? kv('Highest in next 24 hours', k.max.kp.toFixed(1)) : null,
        h('div', { class: 'note', style: 'margin-top:6px' }, 'Kp 0 to 3 is quiet. At 5 or more, a geomagnetic storm can make GPS positions drift.'))),
    h('div', { class: 'card' }, h('h3', {}, 'Next 12 hours'), h('div', { class: 'scroll-x' }, h('table', { class: 'grid' },
      h('tr', {}, ['Time', 'Surface', 'Gusts', '260 ft', '390 ft', 'Temp', 'Cloud base', 'Visibility', 'Rain', 'Light'].map(x => h('th', {}, x))),
      next.map((x, i) => { const b = base(x), l = light(x.t, p.lat, p.lon);
        return h('tr', { class: i === 0 ? 'now' : '' }, h('td', {}, hr(x.t)), h('td', {}, `${dir(x.d10)} ${wind(x.w10)}`), h('td', {}, wind(x.gust)), h('td', {}, wind(x.w80)), h('td', {}, wind(x.w120)), h('td', {}, temp(x.temp)),
          h('td', {}, x.low != null && x.low < 10 ? 'None low' : b != null ? `${b.toLocaleString()} ft` : '--'), h('td', {}, x.vis != null ? (x.vis >= 16093 ? '10+ mi' : distance(x.vis)) : '--'),
          h('td', {}, x.pop != null ? x.pop + '%' : '--'), h('td', {}, LT[l])); })))),
    h('p', { class: 'note', style: 'margin-top:10px' }, `Forecast data: ${nw ? 'National Weather Service and ' : ''}Open-Meteo (open-meteo.com, CC BY 4.0). Kp index: NOAA Space Weather Prediction Center. Cloud base is estimated from temperature and dew point.`)));
}
