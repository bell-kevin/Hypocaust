// SPDX-License-Identifier: AGPL-3.0-only
// Solar geometry and the ASHRAE clear-sky irradiance model, in Btu/h·ft².
// Angles are handled in degrees at the boundary and radians inside.

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

/** ASHRAE clear-sky coefficients by month index 0–11. */
const CLEAR_SKY = [
  { a: 390.0, b: 0.142, c: 0.058 },
  { a: 385.0, b: 0.144, c: 0.06 },
  { a: 376.0, b: 0.156, c: 0.071 },
  { a: 360.0, b: 0.18, c: 0.097 },
  { a: 350.0, b: 0.196, c: 0.121 },
  { a: 345.0, b: 0.205, c: 0.134 },
  { a: 344.0, b: 0.207, c: 0.136 },
  { a: 351.0, b: 0.201, c: 0.122 },
  { a: 365.0, b: 0.177, c: 0.092 },
  { a: 378.0, b: 0.16, c: 0.073 },
  { a: 387.0, b: 0.149, c: 0.063 },
  { a: 391.0, b: 0.142, c: 0.057 },
]

export interface SolarPosition {
  /** Altitude above the horizon, degrees. Negative when the sun is down. */
  altitude: number
  /** Azimuth in degrees clockwise from true south, matching surface azimuths. */
  azimuth: number
}

/** Solar declination for a day of year, degrees. */
export function declination(dayOfYear: number): number {
  return 23.45 * Math.sin(D2R * ((360 * (284 + dayOfYear)) / 365))
}

/**
 * Sun position at a given solar hour. Hour 12 is solar noon, so this skips
 * clock-time and longitude corrections that would only shift the design-day
 * profile by a few minutes.
 */
export function solarPosition(dayOfYear: number, solarHour: number, latitudeDeg: number): SolarPosition {
  const dec = declination(dayOfYear) * D2R
  const lat = latitudeDeg * D2R
  const hourAngle = (solarHour - 12) * 15 * D2R
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  const cosAlt = Math.cos(altitude)
  let azimuth: number
  if (Math.abs(cosAlt) < 1e-6) {
    azimuth = 0
  } else {
    const sinAz = (Math.cos(dec) * Math.sin(hourAngle)) / cosAlt
    const cosAz = (Math.sin(altitude) * Math.sin(lat) - Math.sin(dec)) / (cosAlt * Math.cos(lat))
    azimuth = Math.atan2(sinAz, cosAz)
  }
  return { altitude: altitude * R2D, azimuth: azimuth * R2D }
}

export interface Irradiance {
  /** Direct normal beam, Btu/h·ft². */
  directNormal: number
  /** Total on the vertical surface, Btu/h·ft². */
  totalVertical: number
  /** Beam component landing on the surface, Btu/h·ft². */
  beamVertical: number
  /** Cosine of the incidence angle on the surface. */
  cosIncidence: number
}

/**
 * Clear-sky irradiance on a vertical surface. Elevation raises the beam
 * component because there is less atmosphere in the way — roughly 2% per
 * 1000 ft, which matters on the Wasatch Front and in the Mountain West
 * generally.
 */
export function verticalIrradiance(
  dayOfYear: number,
  solarHour: number,
  latitudeDeg: number,
  surfaceAzimuthDeg: number,
  elevationFt: number,
  groundReflectance = 0.2,
): Irradiance {
  const pos = solarPosition(dayOfYear, solarHour, latitudeDeg)
  const empty: Irradiance = { directNormal: 0, totalVertical: 0, beamVertical: 0, cosIncidence: 0 }
  if (pos.altitude <= 0.5) return empty

  const month = monthFromDayOfYear(dayOfYear)
  const { a, b, c } = CLEAR_SKY[month]
  const sinBeta = Math.sin(pos.altitude * D2R)
  const elevationGain = 1 + 0.00002 * Math.min(elevationFt, 10000)
  const directNormal = (a / Math.exp(b / sinBeta)) * elevationGain

  let gamma = pos.azimuth - surfaceAzimuthDeg
  while (gamma > 180) gamma -= 360
  while (gamma < -180) gamma += 360

  const cosTheta = Math.cos(pos.altitude * D2R) * Math.cos(gamma * D2R)
  const beam = cosTheta > 0 ? directNormal * cosTheta : 0

  // Diffuse from the sky onto a vertical surface, per the ASHRAE Y-ratio.
  const y = cosTheta > -0.2 ? Math.max(0.45, 0.55 + 0.437 * cosTheta + 0.313 * cosTheta * cosTheta) : 0.45
  const diffuse = c * directNormal * y

  // Ground-reflected component; a vertical surface sees half the ground plane.
  const reflected = directNormal * (c + sinBeta) * groundReflectance * 0.5

  return {
    directNormal,
    beamVertical: beam,
    totalVertical: beam + diffuse + reflected,
    cosIncidence: Math.max(0, cosTheta),
  }
}

/** Total clear-sky irradiance on a horizontal roof, Btu/h·ft². */
export function horizontalIrradiance(
  dayOfYear: number,
  solarHour: number,
  latitudeDeg: number,
  elevationFt: number,
): number {
  const pos = solarPosition(dayOfYear, solarHour, latitudeDeg)
  if (pos.altitude <= 0.5) return 0
  const { a, b, c } = CLEAR_SKY[monthFromDayOfYear(dayOfYear)]
  const sinBeta = Math.sin(pos.altitude * D2R)
  const directNormal = (a / Math.exp(b / sinBeta)) * (1 + 0.00002 * Math.min(elevationFt, 10000))
  return directNormal * sinBeta + c * directNormal
}

/**
 * Fraction of a window still in the sun under a horizontal overhang.
 * Returns 1 when there is no overhang or the sun is behind the wall.
 */
export function sunlitFraction(
  overhangDepthFt: number,
  overhangAboveFt: number,
  windowHeightFt: number,
  dayOfYear: number,
  solarHour: number,
  latitudeDeg: number,
  surfaceAzimuthDeg: number,
): number {
  if (overhangDepthFt <= 0 || windowHeightFt <= 0) return 1
  const pos = solarPosition(dayOfYear, solarHour, latitudeDeg)
  if (pos.altitude <= 0.5) return 1

  let gamma = pos.azimuth - surfaceAzimuthDeg
  while (gamma > 180) gamma -= 360
  while (gamma < -180) gamma += 360
  if (Math.abs(gamma) >= 89) return 1

  // Profile angle: the apparent sun altitude in the plane normal to the wall.
  const tanProfile = Math.tan(pos.altitude * D2R) / Math.cos(gamma * D2R)
  if (tanProfile <= 0) return 1
  const shadowDrop = overhangDepthFt * tanProfile
  const shadeOnGlass = Math.max(0, shadowDrop - overhangAboveFt)
  return Math.max(0, 1 - Math.min(shadeOnGlass, windowHeightFt) / windowHeightFt)
}

export function monthFromDayOfYear(dayOfYear: number): number {
  const cum = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]
  const d = Math.max(1, Math.min(365, Math.round(dayOfYear)))
  for (let m = 0; m < 12; m++) if (d <= cum[m]) return m
  return 11
}

/** July 21 — the conventional cooling design day in the northern hemisphere. */
export const COOLING_DESIGN_DAY = 202
