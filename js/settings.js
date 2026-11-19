// Settings kept on this device: pilot mode, preferred LAANC app, units and planned altitude.
import { kv, emit } from './util.js';

export const S = Object.assign({ mode: 'part107', laanc: 'aloft', units: 'us', alt: 400 }, kv.get('settings', {}));
export function setS(patch) { Object.assign(S, patch); kv.set('settings', S); emit('settings', S); }

export const MODES = { part107: 'Part 107', rec: 'Recreational' };
// Wind in the chosen unit. Open-Meteo and NWS values arrive in km/h.
export const wind = kmh => kmh == null ? '--' : S.units === 'metric' ? `${Math.round(kmh / 3.6)} m/s` : `${Math.round(kmh / 1.609)} mph`;
export const temp = c => c == null ? '--' : S.units === 'metric' ? `${Math.round(c)}°C` : `${Math.round(c * 9 / 5 + 32)}°F`;
export const distance = m => m == null ? '--' : S.units === 'metric' ? (m >= 10000 ? `${Math.round(m / 1000)} km` : `${(m / 1000).toFixed(1)} km`) : `${(m / 1609.34).toFixed(m >= 16093 ? 0 : 1)} mi`;
