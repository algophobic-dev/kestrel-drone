// More: pilot mode and its rules, LAANC app, units, data sources and credits.
import { h } from './util.js';
import { S, setS, MODES } from './settings.js';
import { APPS } from './laanc.js';

export const RULES = {
  rec: ['Pass The Recreational UAS Safety Test (TRUST) and carry your certificate.', 'Fly only for fun, not for work or pay.',
    'Register drones over 250 g with the FAA and mark the registration number on the outside.',
    'Broadcast Remote ID (built in or with a module), or fly only inside an FAA-Recognized Identification Area (FRIA).',
    'Fly at or below 400 ft above the ground in uncontrolled airspace.',
    'Get FAA authorization before flying in controlled airspace (Class B, C, D or E to the surface), through LAANC or FAA DroneZone.',
    'Keep the drone where you, or a visual observer next to you, can see it.', 'Give way to crewed aircraft and never interfere with them.',
    'Follow the safety guidelines of a community-based organization.', "Don't fly over people at outdoor events, or in TFRs, security restrictions or prohibited areas.", "Don't fly under the influence of drugs or alcohol."],
  part107: ['Hold a Remote Pilot Certificate and carry it. Complete the free recurrent training every 24 calendar months.',
    'Register the drone with the FAA and mark the registration number on the outside.', 'Broadcast Remote ID (built in or with a module), or fly only inside a FRIA.',
    'Fly at or below 400 ft above the ground, or within 400 ft of a structure.', 'Keep the drone within visual line of sight, yours or a visual observer\'s.',
    'Get FAA authorization before flying in controlled airspace (Class B, C, D or E to the surface), through LAANC or FAA DroneZone.',
    'Visibility at least 3 statute miles. Stay 500 ft below and 2,000 ft away from clouds.', 'Top speed 100 mph (87 knots).',
    'Civil twilight and night: anti-collision lighting visible for 3 statute miles.', 'Flying over people or moving vehicles has its own rules. Check the category your drone meets.',
    "Don't fly in TFRs, security restrictions or prohibited areas.", 'Report a crash to the FAA within 10 days if it causes serious injury or over $500 of damage to property other than the drone.'],
};

export function renderMore(view) {
  const seg = (key, opts) => h('div', { class: 'seg' }, Object.entries(opts).map(([k, v]) => h('button', { class: S[key] === k ? 'on' : '', onclick: () => { setS({ [key]: k }); renderMore(view); } }, v)));
  view.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h1', {}, 'More')),
    h('div', { class: 'card' }, h('h3', {}, 'Pilot mode'), seg('mode', MODES),
      h('div', { class: 'sect' }, `${MODES[S.mode]} rules in short`), h('ul', { class: 'rules' }, RULES[S.mode].map(r => h('li', {}, r))),
      h('p', { class: 'note', style: 'margin-top:8px' }, 'A short summary, not the full rules. See faa.gov/uas for the complete requirements.')),
    h('div', { class: 'card' }, h('h3', {}, 'LAANC app'),
      h('p', { class: 'note', style: 'margin-bottom:8px' }, 'Kestrel Drone does not submit LAANC requests. When a spot needs LAANC, it opens the FAA-approved LAANC provider you choose here and copies the location and altitude for you.'),
      h('select', { onchange: e => setS({ laanc: e.target.value }) }, Object.entries(APPS).map(([k, a]) => h('option', { value: k, selected: S.laanc === k }, a.name)))),
    h('div', { class: 'card' }, h('h3', {}, 'Units'), seg('units', { us: 'mph, °F, miles', metric: 'm/s, °C, km' }), h('p', { class: 'note', style: 'margin-top:8px' }, 'Heights are always in feet, as on FAA maps.')),
    h('div', { class: 'card' }, h('h3', {}, 'Data sources'), h('ul', { class: 'rules note' },
      ['Airspace, UAS facility map ceilings, security restrictions, prohibited and restricted areas, stadiums, FRIAs, recreational flying sites and airports: FAA (UAS Data Delivery System and aeronautical data).',
        'TFRs: tfr.faa.gov.', 'NOTAMs: NOTAM Management Service.', 'National park boundaries: National Park Service.',
        'Weather: National Weather Service and Open-Meteo (open-meteo.com, CC BY 4.0).', 'Kp index: NOAA Space Weather Prediction Center.',
        'Base maps: CARTO, OpenStreetMap contributors, USGS, Esri.'].map(t => h('li', {}, t))),
      h('p', { class: 'note', style: 'margin-top:8px' }, 'Facility map ceilings change every 56 days. The date of the map in use shows when you check a spot.')),
    h('div', { class: 'card' }, h('h3', {}, 'About'), h('p', {}, 'Kestrel Drone is a free airspace and preflight app for drone pilots, by Kestrel Aviation Solutions.'),
      h('p', { class: 'note', style: 'margin-top:6px' }, 'Your flights, drones and checklist stay on this device. Provided as is, with no warranty.'),
      h('div', { class: 'acts' }, h('a', { class: 'btn', href: 'https://kestrelaviation.tech', target: '_blank', rel: 'noopener' }, 'kestrelaviation.tech'),
        h('a', { class: 'btn', href: 'https://github.com/algophobic-dev/kestrel-drone/issues', target: '_blank', rel: 'noopener' }, 'Report a problem')))));
}
