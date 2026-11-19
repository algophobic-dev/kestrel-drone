// Sunrise, sunset and civil twilight for a place and day, from the standard solar formula (NOAA / Almanac for Computers).
const D = Math.PI / 180;
const nrm = (v, m) => ((v % m) + m) % m;

// The moment the sun crosses `zenith` (90.833 for sunrise/sunset, 96 for civil twilight) on the local day of `day`.
// Returns null when it does not happen that day (polar day or night).
function cross(day, lat, lon, zenith, rising) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const N = Math.round((start - new Date(day.getFullYear(), 0, 0)) / 864e5);
  const lngHour = lon / 15, t = N + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  const L = nrm(M + 1.916 * Math.sin(M * D) + 0.020 * Math.sin(2 * M * D) + 282.634, 360);
  let RA = nrm(Math.atan(0.91764 * Math.tan(L * D)) / D, 360);
  RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
  const sinDec = 0.39782 * Math.sin(L * D), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(zenith * D) - sinDec * Math.sin(lat * D)) / (cosDec * Math.cos(lat * D));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rising ? 360 - Math.acos(cosH) / D : Math.acos(cosH) / D) / 15;
  const UT = nrm(H + RA - 0.06571 * t - 6.622 - lngHour, 24);
  let when = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) + UT * 36e5);
  // Keep the result inside the local day.
  while (when < start) when = new Date(+when + 864e5);
  while (when >= new Date(+start + 864e5)) when = new Date(+when - 864e5);
  return when;
}

export function sunTimes(day, lat, lon) {
  return { dawn: cross(day, lat, lon, 96, true), rise: cross(day, lat, lon, 90.833, true), set: cross(day, lat, lon, 90.833, false), dusk: cross(day, lat, lon, 96, false) };
}
// Day, civil twilight or night at a moment. Part 107 needs anti-collision lighting in twilight and at night.
export function light(at, lat, lon) {
  const s = sunTimes(at, lat, lon);
  if (!s.rise || !s.set) return s.dawn && s.dusk ? 'twilight' : 'night';
  if (at >= s.rise && at < s.set) return 'day';
  if ((s.dawn && at >= s.dawn && at < s.rise) || (s.dusk && at >= s.set && at < s.dusk)) return 'twilight';
  return 'night';
}
