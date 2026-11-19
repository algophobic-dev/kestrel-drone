// Great-circle math. Distances in nautical miles, angles in degrees.
const R = 3440.065, D = Math.PI / 180;

export function dist(a, b) {
  const p1 = a.lat * D, p2 = b.lat * D, dl = (b.lon - a.lon) * D;
  const x = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
export function bearing(a, b) {
  const p1 = a.lat * D, p2 = b.lat * D, dl = (b.lon - a.lon) * D;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / D + 360) % 360;
}
// Point a fraction f of the way from a to b along the great circle.
export function along(a, b, f) {
  const d = dist(a, b) / R;
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const p1 = a.lat * D, l1 = a.lon * D, p2 = b.lat * D, l2 = b.lon * D;
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / D, lon: Math.atan2(y, x) / D };
}
export const norm = d => ((d % 360) + 360) % 360;
export const pad3 = d => String(Math.round(norm(d)) % 360 || 360).padStart(3, '0');

export function pointInPoly(lon, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
export function inGeom(lon, lat, g) {
  if (!g) return false;
  if (g.type === 'Polygon') return pointInPoly(lon, lat, g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some(p => pointInPoly(lon, lat, p));
  return false;
}

// Standard-atmosphere pressure level (hPa) nearest an altitude in feet.
const LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150];
export function pressureLevel(ft) {
  const hpa = 1013.25 * Math.pow(1 - 6.87535e-6 * Math.min(ft, 36000), 5.2561);
  return LEVELS.reduce((b, l) => Math.abs(l - hpa) < Math.abs(b - hpa) ? l : b);
}

export const fmtLL = (lat, lon) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}/${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
export function fmtDur(min) {
  if (!isFinite(min)) return '--';
  const m = Math.round(min);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}
export const compass = b => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(norm(b) / 45) % 8];
