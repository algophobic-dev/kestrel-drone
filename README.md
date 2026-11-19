# Kestrel Drone

A free airspace and preflight app for drone pilots, recreational and Part 107, by Kestrel Aviation Solutions.

- App: https://app.drone.kestrelaviation.tech
- Website: https://drone.kestrelaviation.tech

It runs in the browser and installs on iPhone, iPad, Mac and Windows (Share > Add to Home Screen, or the install icon in Chrome or Edge). There is no build step: the repository is the app.

## What it does

| Tab | Function |
|---|---|
| Map | Controlled airspace (Class B, C, D, E to the surface), FAA UAS facility map ceilings, TFRs, National Security UAS Flight Restrictions, prohibited and restricted areas, stadiums, FRIAs, recreational flying sites, airports and heliports, national parks. Tap a spot, or use Check my location, for "Can I fly here?": clear, LAANC authorization needed (with the ceiling), authorization through FAA DroneZone, or restricted, with the reasons, nearby TFRs and NOTAMs. |
| Weather | Wind at the surface and at about 260 and 390 ft, gusts, temperature, cloud base, visibility, rain chance, the Kp index, and sunrise, sunset and civil twilight. |
| Log | Flights with date, place, drone, battery and notes. Export as CSV. |
| Drones | Registration, Remote ID and battery cycle counts. |
| Checklist | A preflight checklist you can edit. |
| More | Pilot mode and a short summary of its rules, preferred LAANC app, units, data sources. |

Flights, drones and the checklist are kept on the device.

## LAANC

Kestrel Drone is not a LAANC provider. When a spot needs LAANC, it opens the FAA-approved provider the pilot chooses (Aloft, AirHub Portal or AutoPylot) and copies the location and altitude. None of them documents a link that opens at a location.

All LAANC code is behind one interface in `js/laanc.js`: `laanc.request({ lat, lon, altitude, airport, ceiling, start, minutes })`. A direct integration (for example Airspace Link's AirHub API or Aloft's API, both of which need an approved application) can replace the hand-off there. Its API key would go only into the relay, with `npx wrangler secret put NAME`.

## Relay

Map data, TFRs and NOTAMs come through the Kestrel relay (a Cloudflare Worker in the Kestrel-EFB-App repository, `server/`). Its address is `proxyUrl` in `js/config.js`. The relay's `/faa/{layer}/{x}/{y}` route fetches FAA and NPS layers one map square at a time and keeps each square for 12 hours, because the FAA's map server is shared and rate limited. If the FAA server refuses, the relay serves its last copy, kept up to 14 days.

## Data sources

| Data | Source |
|---|---|
| Airspace, UAS facility map ceilings, security restrictions, prohibited and restricted areas, stadiums, FRIAs, recreational flying sites, airports | FAA (ArcGIS, services6.arcgis.com/ssFJjBXIUyZDrSYZ) |
| TFRs | tfr.faa.gov |
| NOTAMs | NOTAM Management Service |
| National park boundaries | National Park Service, Land Resources Division |
| Weather | National Weather Service (US), Open-Meteo (open-meteo.com, CC BY 4.0) |
| Kp index | NOAA Space Weather Prediction Center |
| Sun times | Calculated on the device |
| Base maps | CARTO and OpenStreetMap contributors, USGS, Esri |

Open-Meteo's free service is for non-commercial use.

## Hosting

`CNAME` holds app.drone.kestrelaviation.tech. In **Settings > Pages**, set the source to the `main` branch and root folder, enter the custom domain, and turn on Enforce HTTPS once the certificate is ready. Bump `SHELL` in `sw.js` with each release so devices pick up the new files.

Provided as is, with no warranty.
