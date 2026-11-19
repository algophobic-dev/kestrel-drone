// LAANC authorization behind one interface.
//
//   laanc.request({ lat, lon, altitude, airport, ceiling, start, minutes }) -> Promise<{ kind, provider, message }>
//
// Phase 1: hand-off. Kestrel Drone is not a LAANC provider. It copies the request details and opens an FAA-approved
// LAANC provider's app, where the pilot submits the request.
// Phase 2: an API provider (for example Airspace Link's AirHub API, or Aloft's) can replace `provider` below. It would send the
// request through the relay, where the API key is kept as a relay secret, and return { kind: 'submitted', id, status }.
import { S } from './settings.js';

// FAA-approved LAANC providers that are free for pilots. None documents a link that opens at a location, so the
// details go on the clipboard.
export const APPS = {
  aloft: { name: 'Aloft', url: 'https://air.aloft.ai/' },
  airhub: { name: 'AirHub Portal (Airspace Link)', url: 'https://portal.airspacelink.com/' },
  autopylot: { name: 'AutoPylot', url: 'https://app.autopylot.io/' },
};

export function requestText(r) {
  return [`Location: ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`, `Altitude: ${r.altitude} ft above ground`,
    r.ceiling != null ? `UAS facility map ceiling here: ${r.ceiling} ft` : '', r.airport ? `Nearest airport in the facility map: ${r.airport}` : '',
    r.start ? `Start: ${new Date(r.start).toLocaleString()}` : '', r.minutes ? `Duration: ${r.minutes} minutes` : ''].filter(Boolean).join('\n');
}

const handoff = {
  name: 'hand-off',
  async request(r) {
    const app = APPS[S.laanc] || APPS.aloft, text = requestText(r);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch { /* the caller shows the text instead */ }
    window.open(app.url, '_blank', 'noopener');
    return { kind: 'handoff', provider: app.name, copied, text,
      message: copied ? `Opened ${app.name}. The location and altitude are copied: paste them into your request.` : `Opened ${app.name}. Enter the location and altitude shown here.` };
  },
};

let provider = handoff;
export const laanc = {
  request: r => provider.request(r),
  get providerName() { return provider.name; },
  // Phase 2 replaces the hand-off here.
  use(p) { provider = p; },
};
