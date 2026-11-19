// Optional settings. Leave a value empty to use the keyless fallback.
export const CONFIG = {
  // CARTO basemaps key (free tier, 5,000,000 requests a month).
  // Used for the Dark and Light base maps. Without it, Dark falls back to a keyless Esri map.
  // This key travels with every tile request, so anyone who opens the site or the repo can read it.
  cartoKey: 'cb1_594r_1_b7421bfdc5e693f71913238e',

  // Address of your relay server (see server/ and the README), for example
  // 'https://kestrel-relay.yourname.workers.dev'. Kestrel Drone gets FAA map layers, TFRs and NOTAMs through it.
  // Leave empty to run without them.
  proxyUrl: 'https://kestrel-relay.kestrelefb.workers.dev',
};
