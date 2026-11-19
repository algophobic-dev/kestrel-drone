// "Can I fly here?" for one spot. Restrictions are checked first, then controlled airspace, then everything else.
// Status: restricted (don't fly), laanc (LAANC authorization up to the grid ceiling), auth (authorization through
// FAA DroneZone, because LAANC is not available here), or clear (uncontrolled airspace, up to 400 ft above ground).
import { around, contains, distTo, tfrs, tfrType } from './data.js';
import { S } from './settings.js';

const surface = q => +q.LOWER_VAL === 0 || q.LOWER_CODE === 'SFC';
// Does a special use area start low enough to matter for a drone (surface, or within 400 ft of the ground)?
const low = q => surface(q) || (q.LOWER_CODE === 'AGL' && +q.LOWER_VAL <= 400);
const limit = (v, uom, code) => code === 'SFC' || +v === 0 ? 'the surface' : +v <= -9000 || code === 'UNL' ? 'unlimited' : `${Number(v).toLocaleString()} ${uom === 'FL' ? 'FL' : 'ft'} ${code || ''}`.trim();
const CLASS_NAME = { B: 'Class B', C: 'Class C', D: 'Class D', E: 'Class E to the surface' };
const TYPE_NAME = { HP: 'Heliport', SP: 'Seaplane base', AD: 'Airport', BP: 'Balloonport', GL: 'Gliderport', UL: 'Ultralight field' };

export async function check(p) {
  const R = [], add = (lv, text) => R.push({ lv, text });
  const [cls, grid, sua, nsufr, pt, nda, stadium, fria, rec, apt, park, tf] = await Promise.all([
    around('class', p), around('grid', p), around('sua', p), around('nsufr', p), around('ptnsufr', p), around('nda', p),
    around('stadium', p, 3.5), around('fria', p), around('recsite', p), around('airport', p, 5), around('park', p),
    tfrs().then(j => j.features).catch(() => null)]);

  // Restrictions: don't fly.
  let restricted = false;
  for (const f of contains(nsufr, p)) { restricted = true; const q = f.properties;
    add('bad', `National Security UAS Flight Restriction: ${q.Facility || q.Base || 'restricted site'}. Drones may not fly here from ${q.Floor || 'the surface'} to ${q.Ceiling || '400 ft'} without FAA approval.`); }
  for (const f of contains(nda, p)) { restricted = true; add('bad', `National defense airspace: ${f.properties.NAME}. Drone flights are not allowed without a waiver.`); }
  for (const f of contains(sua, p)) { const q = f.properties;
    if (q.TYPE_CODE === 'P') { restricted = true; add('bad', `Prohibited area ${q.NAME}. No flights at any time.`); }
    else if (low(q)) { restricted = true; add('bad', `Restricted area ${q.NAME}, from ${limit(q.LOWER_VAL, q.LOWER_UOM, q.LOWER_CODE)} to ${limit(q.UPPER_VAL, q.UPPER_UOM, q.UPPER_CODE)}. Don't fly when it is active${q.TIMESOFUSE ? ` (${q.TIMESOFUSE.trim()})` : ''} without the controlling agency's permission.`); }
    else add('warn', `Restricted area ${q.NAME} above you, from ${limit(q.LOWER_VAL, q.LOWER_UOM, q.LOWER_CODE)}.`); }
  for (const f of contains(pt, p)) { restricted = true; const q = f.properties;
    add('bad', `Part-time National Security UAS Flight Restriction: ${q.Facility}. Restricted when active${q.ADVISENOTE ? `: ${q.ADVISENOTE}` : ''}.`); }
  // A TFR can have several shapes. List each TFR once.
  const tfrHere = tf ? [...new Map(contains(tf, p).map(f => [f.properties.id, f])).values()] : [];
  for (const f of tfrHere) { restricted = true; add('bad', `TFR ${f.properties.id} · ${tfrType(f.properties.type)}: ${f.properties.title}. Check its times and limits in the details.`); }
  for (const f of contains(park, p)) { restricted = true; add('bad', `${f.properties.UNIT_NAME}. The National Park Service does not allow drones to take off or land in its parks without a permit.`); }
  if (!tf) add('warn', 'TFRs did not load, so this check does not include them. Check your connection.');

  // Controlled airspace at the surface, and the UAS facility map grid.
  const ctl = contains(cls, p).filter(f => surface(f.properties));
  const cell = contains(grid, p)[0]?.properties;
  const airports = cell ? [1, 2, 3].map(i => ({ id: cell[`APT${i}_FAAID`], name: cell[`APT${i}_NAME`], laanc: cell[`APT${i}_LAANC`] === 1 })).filter(a => a.id) : [];
  const laancOk = airports.some(a => a.laanc);
  const ceiling = cell ? cell.CEILING : null;
  for (const f of ctl) { const q = f.properties; add('warn', `${CLASS_NAME[q.CLASS] || q.LOCAL_TYPE}: ${q.NAME}. Flights need FAA authorization.${q.WKHR_RMK ? ` Hours: ${q.WKHR_RMK}.` : ''}`); }
  if (cell) add('info', `UAS facility map ceiling here: ${ceiling} ft${airports.length ? ` (${airports.map(a => `${a.id} ${a.name}${a.laanc ? '' : ', no LAANC'}`).join('; ')})` : ''}. Map effective ${cell.MAP_EFF}.`);

  // Other things worth knowing.
  for (const f of stadium) { const d = distTo(p, f.geometry); if (d <= 3) add('warn', `${f.properties.NAME} is ${d.toFixed(1)} nm away. Drones may not fly within 3 nm of a stadium from 1 hour before to 1 hour after a major sporting event.`); }
  for (const f of contains(fria, p)) add('info', `FAA-Recognized Identification Area: ${f.properties.title}. Drones without Remote ID may fly here, within sight of the pilot.`);
  for (const f of contains(rec, p)) { const q = f.properties;
    add('info', `FAA-recognized recreational flying site: ${q.SITE_NAME}, up to ${q.CEILING} ${(q.UNIT || 'feet').toLowerCase()}.${S.mode === 'rec' ? ' Recreational flyers may fly here up to that height under the site\'s agreement with the FAA.' : ''}`); }
  const near = apt.map(f => ({ q: f.properties, d: distTo(p, f.geometry) })).filter(a => a.d <= 3 && a.q.OPERSTATUS !== 'CLOSED_INDEFINITELY').sort((a, b) => a.d - b.d);
  if (near.length) add('info', `Within 3 nm: ${near.slice(0, 6).map(a => `${a.q.ICAO_ID || a.q.IDENT} ${a.q.NAME} (${TYPE_NAME[a.q.TYPE_CODE] || a.q.TYPE_CODE}${a.q.PRIVATEUSE ? ', private' : ''}, ${a.d.toFixed(1)} nm)`).join('; ')}. Give way to crewed aircraft.`);
  const tfrNear = tf ? [...new Map(tf.map(f => ({ q: f.properties, d: distTo(p, f.geometry) })).filter(t => t.d <= 10 && !tfrHere.some(x => x.properties.id === t.q.id)).sort((a, b) => b.d - a.d).map(t => [t.q.id, t])).values()].sort((a, b) => a.d - b.d) : [];

  // NOTAMs come from the nearest public airport with an identifier.
  const pub = apt.map(f => ({ q: f.properties, d: distTo(p, f.geometry) })).filter(a => !a.q.PRIVATEUSE && a.q.TYPE_CODE === 'AD' && a.d <= 10).sort((a, b) => a.d - b.d)[0];
  const notamId = pub ? pub.q.ICAO_ID || pub.q.IDENT : null;

  let status, title, sub;
  if (restricted) { status = 'restricted'; title = 'Restricted'; sub = "Don't fly here. See why below."; }
  else if (ctl.length || cell) {
    if (cell && ceiling > 0 && laancOk) { status = 'laanc'; title = `LAANC authorization needed`; sub = `You can ask for up to ${ceiling} ft above ground here.`; }
    else { status = 'auth'; title = 'Authorization needed'; sub = cell && ceiling === 0 ? 'The facility map ceiling here is 0 ft, so LAANC cannot approve it. Request authorization through FAA DroneZone.' : 'LAANC is not available here. Request authorization through FAA DroneZone.'; }
  } else { status = 'clear'; title = 'Clear to fly'; sub = 'Uncontrolled airspace. Fly up to 400 ft above ground.'; }
  if (status === 'clear' && !R.some(r => r.lv !== 'info')) add('ok', 'No controlled airspace, TFRs, security restrictions, restricted areas or national parks found here.');
  return { p, status, title, sub, reasons: R, ceiling, airports, laancAirport: airports.find(a => a.laanc), tfrNear, notamId, notamAirport: pub?.q, tfrHere: tfrHere.map(f => f.properties) };
}
