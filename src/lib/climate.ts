// SPDX-License-Identifier: AGPL-3.0-only
// Design conditions from the site's own weather record.
//
// The tables everyone quotes are percentiles of a long hourly series: the 99%
// heating value is the temperature the site stays above 99% of the year, and
// the 1% cooling value is the one it stays below. There is no reason to buy
// that number when the underlying hourly record is free. This pulls ERA5
// reanalysis from Open-Meteo and computes the percentiles directly, plus the
// bin hours that the annual energy model runs on.

import type { ClimateRecord, TempBin } from '../types'
import { pressureAt, wetBulbFromRh } from './psychro'

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'

export interface GeocodeHit {
  name: string
  admin1?: string
  country?: string
  countryCode?: string
  latitude: number
  longitude: number
  elevationM?: number
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeHit[]> {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=8&language=en&format=json`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Place lookup failed (${res.status}).`)
  const data = await res.json()
  if (!data.results) return []
  return data.results.map((r: Record<string, unknown>) => ({
    name: String(r.name),
    admin1: r.admin1 ? String(r.admin1) : undefined,
    country: r.country ? String(r.country) : undefined,
    countryCode: r.country_code ? String(r.country_code) : undefined,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    elevationM: r.elevation != null ? Number(r.elevation) : undefined,
  }))
}

export function describeHit(hit: GeocodeHit): string {
  return [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ')
}

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))))
  return sorted[idx]
}

export interface ClimateProgress {
  stage: 'requesting' | 'reading' | 'computing' | 'done'
  message: string
}

export async function fetchClimate(
  latitude: number,
  longitude: number,
  years: number,
  onProgress?: (p: ClimateProgress) => void,
  signal?: AbortSignal,
): Promise<ClimateRecord> {
  const now = new Date()
  // ERA5 lags real time, so end on the last complete calendar year.
  const endYear = now.getUTCFullYear() - 1
  const startYear = endYear - years + 1
  const start = `${startYear}-01-01`
  const end = `${endYear}-12-31`

  const url =
    `${ARCHIVE_URL}?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
    `&start_date=${start}&end_date=${end}` +
    `&hourly=temperature_2m,relative_humidity_2m` +
    `&temperature_unit=fahrenheit&timezone=auto`

  onProgress?.({ stage: 'requesting', message: `Asking for ${years} years of hourly weather` })
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Weather archive returned ${res.status}. ${body.slice(0, 160)}`)
  }

  onProgress?.({ stage: 'reading', message: 'Reading the hourly record' })
  const data = await res.json()
  const times: string[] = data.hourly?.time ?? []
  const temps: (number | null)[] = data.hourly?.temperature_2m ?? []
  const rh: (number | null)[] = data.hourly?.relative_humidity_2m ?? []
  if (times.length === 0) throw new Error('The weather archive returned no hours for this location.')

  onProgress?.({ stage: 'computing', message: 'Working out design conditions' })

  const elevationM = Number(data.elevation ?? 0)
  const elevationFt = elevationM * 3.28084
  const atm = pressureAt(elevationFt)

  const clean = new Float32Array(temps.length)
  let n = 0
  for (let i = 0; i < temps.length; i++) {
    const t = temps[i]
    if (t == null || !Number.isFinite(t)) continue
    clean[n++] = t
  }
  const valid = clean.subarray(0, n)
  const sorted = Float32Array.from(valid).sort()

  const heating996 = percentile(sorted, 0.004)
  const heating99 = percentile(sorted, 0.01)
  const cooling1 = percentile(sorted, 0.99)
  const cooling04 = percentile(sorted, 0.996)
  const extremeLow = sorted[0]
  const extremeHigh = sorted[sorted.length - 1]

  // Mean coincident wet bulb: average the wet bulb of hours sitting at the 1% dry bulb.
  let wbSum = 0
  let wbCount = 0
  for (let i = 0; i < temps.length && wbCount < 400; i++) {
    const t = temps[i]
    const h = rh[i]
    if (t == null || h == null) continue
    if (Math.abs(t - cooling1) <= 1.0) {
      wbSum += wetBulbFromRh(t, Math.max(1, Math.min(100, h)), atm)
      wbCount++
    }
  }
  const mcwb = wbCount > 0 ? wbSum / wbCount : cooling1 - 12

  // Daily statistics, keyed by calendar date.
  const dayMin = new Map<string, number>()
  const dayMax = new Map<string, number>()
  const daySum = new Map<string, number>()
  const dayCount = new Map<string, number>()
  for (let i = 0; i < times.length; i++) {
    const t = temps[i]
    if (t == null) continue
    const key = times[i].slice(0, 10)
    dayMin.set(key, Math.min(dayMin.get(key) ?? Infinity, t))
    dayMax.set(key, Math.max(dayMax.get(key) ?? -Infinity, t))
    daySum.set(key, (daySum.get(key) ?? 0) + t)
    dayCount.set(key, (dayCount.get(key) ?? 0) + 1)
  }

  // Daily range for the hottest month of the year.
  const monthTempSum = new Array(12).fill(0)
  const monthTempCount = new Array(12).fill(0)
  for (const [key, sum] of daySum) {
    const m = Number(key.slice(5, 7)) - 1
    monthTempSum[m] += sum
    monthTempCount[m] += dayCount.get(key) ?? 0
  }
  let hottestMonth = 6
  let hottestMean = -Infinity
  for (let m = 0; m < 12; m++) {
    if (monthTempCount[m] === 0) continue
    const mean = monthTempSum[m] / monthTempCount[m]
    if (mean > hottestMean) {
      hottestMean = mean
      hottestMonth = m
    }
  }
  let rangeSum = 0
  let rangeCount = 0
  for (const [key, lo] of dayMin) {
    if (Number(key.slice(5, 7)) - 1 !== hottestMonth) continue
    const hi = dayMax.get(key)
    if (hi == null || !Number.isFinite(lo) || !Number.isFinite(hi)) continue
    rangeSum += hi - lo
    rangeCount++
  }
  const dailyRange = rangeCount > 0 ? rangeSum / rangeCount : 20

  // Degree days.
  let hdd = 0
  let cdd = 0
  let daysCounted = 0
  for (const [key, sum] of daySum) {
    const count = dayCount.get(key) ?? 0
    if (count < 20) continue
    const mean = sum / count
    hdd += Math.max(0, 65 - mean)
    cdd += Math.max(0, mean - 65)
    daysCounted++
  }
  const yearsCounted = Math.max(1, daysCounted / 365.25)

  // Bin hours, 5 °F wide, normalised to a single year.
  const binWidth = 5
  const counts = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const b = Math.floor(valid[i] / binWidth) * binWidth + binWidth / 2
    counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  const bins: TempBin[] = [...counts.entries()]
    .map(([centerF, hours]) => ({ centerF, hoursPerYear: hours / yearsCounted }))
    .sort((a, b) => a.centerF - b.centerF)

  onProgress?.({ stage: 'done', message: 'Design conditions ready' })

  return {
    fetchedAt: Date.now(),
    startYear,
    endYear,
    elevationFt: Math.round(elevationFt),
    heating99F: round1(heating99),
    heating996F: round1(heating996),
    cooling1F: round1(cooling1),
    cooling04F: round1(cooling04),
    mcwb1F: round1(mcwb),
    dailyRangeF: round1(dailyRange),
    hdd65: Math.round(hdd / yearsCounted),
    cdd65: Math.round(cdd / yearsCounted),
    extremeLowF: round1(extremeLow),
    extremeHighF: round1(extremeHigh),
    bins,
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/** Fallback bin hours built from degree days, for projects with no fetched record. */
export function synthesizeBins(heating99F: number, cooling1F: number): TempBin[] {
  const bins: TempBin[] = []
  const mean = (heating99F + cooling1F) / 2
  const spread = Math.max(8, (cooling1F - heating99F) / 4.5)
  for (let c = Math.floor((heating99F - 15) / 5) * 5 + 2.5; c <= cooling1F + 12; c += 5) {
    const z = (c - mean) / spread
    const density = Math.exp(-0.5 * z * z)
    bins.push({ centerF: c, hoursPerYear: density })
  }
  const total = bins.reduce((a, b) => a + b.hoursPerYear, 0)
  return bins.map((b) => ({ centerF: b.centerF, hoursPerYear: (b.hoursPerYear / total) * 8760 }))
}

export function climateZoneLabel(hdd65: number, cdd65: number): string {
  if (hdd65 >= 12600) return 'Zone 8 — subarctic'
  if (hdd65 >= 9000) return 'Zone 7 — very cold'
  if (hdd65 >= 7200) return 'Zone 6 — cold'
  if (hdd65 >= 5400) return 'Zone 5 — cool'
  if (hdd65 >= 3600) return 'Zone 4 — mixed'
  if (cdd65 >= 4500) return 'Zone 1 — very hot'
  if (cdd65 >= 3000) return 'Zone 2 — hot'
  return 'Zone 3 — warm'
}
