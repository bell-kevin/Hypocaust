// SPDX-License-Identifier: AGPL-3.0-only
// Psychrometrics in inch-pound units, following the ASHRAE Handbook of
// Fundamentals formulations. Everything here is public-domain physics.

/** Standard barometric pressure at an elevation, psia. */
export function pressureAt(elevationFt: number): number {
  return 14.696 * Math.pow(1 - 6.8754e-6 * elevationFt, 5.2559)
}

/**
 * Air density ratio versus sea level. Sensible and latent airflow constants
 * scale directly with this — the reason a Denver or Salt Lake City job needs
 * roughly 15% more air than the same house at the coast.
 */
export function altitudeFactor(elevationFt: number): number {
  return Math.pow(1 - 6.8754e-6 * elevationFt, 5.2559)
}

/** Saturation vapor pressure over water or ice, psia, for a dry bulb in °F. */
export function satVaporPressure(tF: number): number {
  const tR = tF + 459.67
  if (tR <= 0) return 0
  let lnP: number
  if (tF < 32) {
    lnP =
      -1.0214165e4 / tR -
      4.8932428 -
      5.3765794e-3 * tR +
      1.9202377e-7 * tR * tR +
      3.5575832e-10 * tR ** 3 -
      9.0344688e-14 * tR ** 4 +
      4.1635019 * Math.log(tR)
  } else {
    lnP =
      -1.0440397e4 / tR -
      1.129465e1 -
      2.7022355e-2 * tR +
      1.289036e-5 * tR * tR -
      2.4780681e-9 * tR ** 3 +
      6.5459673 * Math.log(tR)
  }
  return Math.exp(lnP)
}

/** Humidity ratio, lb water per lb dry air. */
export function humidityRatio(vaporPressure: number, atmPressure: number): number {
  const pw = Math.min(vaporPressure, atmPressure * 0.999)
  return (0.621945 * pw) / (atmPressure - pw)
}

export function humidityRatioFromRh(tF: number, rhPercent: number, atmPressure: number): number {
  const pw = (rhPercent / 100) * satVaporPressure(tF)
  return humidityRatio(pw, atmPressure)
}

/** Humidity ratio from a dry bulb / wet bulb pair. */
export function humidityRatioFromWetBulb(tF: number, twbF: number, atmPressure: number): number {
  const wsStar = humidityRatio(satVaporPressure(twbF), atmPressure)
  if (twbF >= 32) {
    const num = (1093 - 0.556 * twbF) * wsStar - 0.24 * (tF - twbF)
    const den = 1093 + 0.444 * tF - twbF
    return Math.max(0, num / den)
  }
  const num = (1220 - 0.04 * twbF) * wsStar - 0.24 * (tF - twbF)
  const den = 1220 + 0.444 * tF - 0.48 * twbF
  return Math.max(0, num / den)
}

/** Wet bulb temperature, °F, solved by bisection. */
export function wetBulbFromRh(tF: number, rhPercent: number, atmPressure: number): number {
  const target = humidityRatioFromRh(tF, rhPercent, atmPressure)
  let lo = -80
  let hi = tF
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const w = humidityRatioFromWetBulb(tF, mid, atmPressure)
    if (w > target) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/** Grains of moisture per pound of dry air. */
export function grains(humidityRatioValue: number): number {
  return humidityRatioValue * 7000
}

/** Sensible airflow constant, Btu/h per cfm per °F, corrected for altitude. */
export function sensibleFactor(elevationFt: number): number {
  return 1.08 * altitudeFactor(elevationFt)
}

/** Latent airflow constant, Btu/h per cfm per grain, corrected for altitude. */
export function latentFactor(elevationFt: number): number {
  return 0.68 * altitudeFactor(elevationFt)
}
