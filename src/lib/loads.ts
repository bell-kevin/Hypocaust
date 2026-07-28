// SPDX-License-Identifier: AGPL-3.0-only
// The load engine.
//
// Heating is a steady-state balance at the winter design temperature with no
// credit for internal or solar gain, which is the conventional and safe way to
// size heating equipment.
//
// Cooling is walked hour by hour across a July design day. Opaque surfaces get
// a sol-air driving temperature that is damped and delayed by the mass of the
// assembly; solar through glass is split into an instant convective part and a
// delayed radiant part. The house peak is the largest hourly total, not the sum
// of each surface's own peak — that distinction alone is usually worth half a
// ton of equipment.

import type {
  Boundary,
  HouseResult,
  LoadBreakdown,
  Project,
  Room,
  RoomResult,
  Orientation,
} from '../types'
import { ORIENTATIONS, ORIENTATION_AZIMUTH } from '../types'
import { findAssembly, findGlazing, SHADE_IAC } from './assemblies'
import {
  altitudeFactor,
  grains,
  humidityRatioFromRh,
  humidityRatioFromWetBulb,
  latentFactor,
  pressureAt,
  sensibleFactor,
} from './psychro'
import { COOLING_DESIGN_DAY, horizontalIrradiance, sunlitFraction, verticalIrradiance } from './solar'

/** Fraction of the daily range subtracted from the design dry bulb, by solar hour. */
const DAILY_RANGE_FRACTION = [
  0.87, 0.92, 0.96, 0.99, 1.0, 0.98, 0.93, 0.84, 0.71, 0.56, 0.39, 0.23,
  0.11, 0.03, 0.0, 0.03, 0.1, 0.21, 0.34, 0.47, 0.58, 0.68, 0.76, 0.82,
]

/** Share of a heating design ΔT that actually crosses a given boundary. */
const HEATING_BOUNDARY_FACTOR: Record<Boundary, number> = {
  outdoor: 1.0,
  attic: 1.0,
  'vented-crawl': 0.75,
  'unconditioned-basement': 0.55,
  garage: 0.75,
  conditioned: 0,
}

/** Share of the cooling ΔT for buffer spaces that are not attics. */
const COOLING_BOUNDARY_FACTOR: Record<Boundary, number> = {
  outdoor: 1.0,
  attic: 1.0, // handled separately with a modelled attic temperature
  'vented-crawl': 0.5,
  'unconditioned-basement': 0.25,
  garage: 0.7,
  conditioned: 0,
}

/** Radiant time series: how a burst of solar gain shows up as cooling load. */
const RADIANT_SERIES = [0.4, 0.3, 0.18, 0.12]

const OUTSIDE_FILM_H = 4.0
const PERSON_SENSIBLE = 230
const PERSON_LATENT = 200

function emptyBreakdown(): LoadBreakdown {
  return {
    walls: 0,
    windowsConduction: 0,
    windowsSolar: 0,
    doors: 0,
    ceiling: 0,
    floor: 0,
    infiltration: 0,
    ventilation: 0,
    internal: 0,
    ducts: 0,
  }
}

export function breakdownTotal(b: LoadBreakdown): number {
  return (
    b.walls +
    b.windowsConduction +
    b.windowsSolar +
    b.doors +
    b.ceiling +
    b.floor +
    b.infiltration +
    b.ventilation +
    b.internal +
    b.ducts
  )
}

/** Apply a mass lag and amplitude decrement to a 24-hour driving temperature. */
function dampen(series: number[], lagHours: number, decrement: number): number[] {
  const mean = series.reduce((a, b) => a + b, 0) / series.length
  const lag = Math.round(lagHours)
  return series.map((_, h) => {
    const src = series[(h - lag + 48) % 24]
    return mean + decrement * (src - mean)
  })
}

/**
 * Natural air changes per hour implied by a blower door result. Uses the LBL
 * divisor approach: taller, more exposed, and colder means a smaller divisor
 * and more infiltration.
 */
export function naturalAch(project: Project): number {
  const inf = project.infiltration
  if (inf.method === 'natural') return Math.max(0, inf.achNatural)
  const hdd = project.climate?.hdd65 ?? 5500
  const severity = Math.max(0, Math.min(6, (hdd - 1500) / 1400))
  const base = 20.5 - 1.35 * severity
  const storyFactor = inf.stories >= 3 ? 0.78 : inf.stories === 2 ? 0.85 : 1.0
  const shieldFactor =
    inf.shielding === 'exposed'
      ? 0.85
      : inf.shielding === 'sheltered'
        ? 1.15
        : inf.shielding === 'well-sheltered'
          ? 1.3
          : 1.0
  return inf.ach50 / (base * storyFactor * shieldFactor)
}

export function conditionedArea(rooms: Room[]): number {
  return rooms.reduce((a, r) => a + Math.max(0, r.floorAreaFt2), 0)
}

export function conditionedVolume(rooms: Room[]): number {
  return rooms.reduce((a, r) => a + Math.max(0, r.floorAreaFt2) * Math.max(1, r.ceilingHeightFt), 0)
}

function netWallArea(room: Room, orientation: Orientation): number {
  const gross = room.walls
    .filter((w) => w.orientation === orientation)
    .reduce((a, w) => a + w.grossAreaFt2, 0)
  const glass = room.windows
    .filter((w) => w.orientation === orientation)
    .reduce((a, w) => a + w.areaFt2, 0)
  const doors = room.doors
    .filter((d) => d.orientation === orientation)
    .reduce((a, d) => a + d.areaFt2, 0)
  return gross - glass - doors
}

export function computeLoads(project: Project): HouseResult {
  const warnings: string[] = []
  const { design, site, rooms, ventilation, ducts } = project
  const elevation = site.elevationFt
  const acf = altitudeFactor(elevation)
  const atm = pressureAt(elevation)
  const sf = sensibleFactor(elevation)
  const lf = latentFactor(elevation)

  const area = conditionedArea(rooms)
  const volume = conditionedVolume(rooms)

  const heatingDeltaT = design.indoorWinterF - design.winterOutdoorF
  if (heatingDeltaT <= 0) warnings.push('Winter design temperature is at or above the indoor setpoint, so there is no heating load to calculate.')

  // ---------------------------------------------------------------- moisture
  const wIndoor = humidityRatioFromRh(design.indoorSummerF, design.indoorSummerRh, atm)
  const wOutdoor = humidityRatioFromWetBulb(design.summerOutdoorF, design.summerMcwbF, atm)
  const rawGrainDiff = grains(wOutdoor) - grains(wIndoor)
  const grainDiff = Math.max(0, rawGrainDiff)
  if (rawGrainDiff <= 0) {
    warnings.push(
      `Outdoor design air is drier than the indoor target by ${Math.abs(Math.round(rawGrainDiff))} grains, so there is no latent cooling load. Sizing for dehumidification here would only oversize the system.`,
    )
  }

  // ---------------------------------------------------------------- weather profile
  const outdoorHourly: number[] = DAILY_RANGE_FRACTION.map(
    (f) => design.summerOutdoorF - f * design.dailyRangeF,
  )

  const roofIrradiance: number[] = []
  for (let h = 0; h < 24; h++) {
    roofIrradiance.push(horizontalIrradiance(COOLING_DESIGN_DAY, h, site.latitude, elevation))
  }
  const wallIrradiance: Record<Orientation, number[]> = {} as Record<Orientation, number[]>
  const wallBeamShare: Record<Orientation, number[]> = {} as Record<Orientation, number[]>
  for (const o of ORIENTATIONS) {
    const series: number[] = []
    const beam: number[] = []
    for (let h = 0; h < 24; h++) {
      const irr = verticalIrradiance(COOLING_DESIGN_DAY, h, site.latitude, ORIENTATION_AZIMUTH[o], elevation)
      series.push(irr.totalVertical)
      beam.push(irr.beamVertical)
    }
    wallIrradiance[o] = series
    wallBeamShare[o] = beam
  }

  // Attic air: partway between outdoor air and the roof's sol-air temperature.
  const roofAbsorptance = rooms[0]?.ceiling.absorptance ?? 0.85
  const atticTemp = outdoorHourly.map((t, h) => {
    const solAirRoof = t + (roofAbsorptance * roofIrradiance[h]) / OUTSIDE_FILM_H - 7
    return t + 0.55 * (solAirRoof - t)
  })

  const dampCache = new Map<string, number[]>()
  const dampedDrive = (drive: number[], lag: number, dec: number, key: string): number[] => {
    const cached = dampCache.get(key)
    if (cached) return cached
    const out = dampen(drive, lag, dec)
    dampCache.set(key, out)
    return out
  }

  // ---------------------------------------------------------------- per-room
  interface RoomWork {
    room: Room
    heating: LoadBreakdown
    heatingTotal: number
    hourly: LoadBreakdown[]
    hourlyTotal: number[]
    latent: number
    exteriorArea: number
    volume: number
  }

  const totalExteriorArea = rooms.reduce((sum, r) => {
    const walls = r.walls.filter((w) => w.boundary !== 'conditioned').reduce((a, w) => a + w.grossAreaFt2, 0)
    const ceiling = r.ceiling.boundary !== 'conditioned' ? r.ceiling.areaFt2 : 0
    const floor = r.floor.boundary !== 'conditioned' ? r.floor.areaFt2 : 0
    return sum + walls + ceiling + floor
  }, 0)

  const achNat = naturalAch(project)
  const infWinterCfm = (achNat * 1.4 * volume) / 60
  const infSummerCfm = (achNat * 0.8 * volume) / 60

  const ventRecoveryS = ventilation.kind === 'hrv' || ventilation.kind === 'erv' ? ventilation.sensibleRecovery : 0
  const ventRecoveryL = ventilation.kind === 'erv' ? ventilation.latentRecovery : 0
  const ventCfm = ventilation.kind === 'none' ? 0 : Math.max(0, ventilation.cfm)

  const work: RoomWork[] = rooms.map((room) => {
    const roomExterior =
      room.walls.filter((w) => w.boundary !== 'conditioned').reduce((a, w) => a + w.grossAreaFt2, 0) +
      (room.ceiling.boundary !== 'conditioned' ? room.ceiling.areaFt2 : 0) +
      (room.floor.boundary !== 'conditioned' ? room.floor.areaFt2 : 0)
    const share = totalExteriorArea > 0 ? roomExterior / totalExteriorArea : 1 / Math.max(1, rooms.length)
    const roomVolume = room.floorAreaFt2 * room.ceilingHeightFt

    // ---- heating
    const heating = emptyBreakdown()
    for (const o of ORIENTATIONS) {
      const net = netWallArea(room, o)
      if (net < -1) {
        warnings.push(`${room.name}: windows and doors on the ${o} wall add up to more than the wall itself.`)
      }
      const wallsHere = room.walls.filter((w) => w.orientation === o)
      for (const w of wallsHere) {
        const asm = findAssembly(w.assemblyId)
        const grossHere = wallsHere.reduce((a, x) => a + x.grossAreaFt2, 0)
        const portion = grossHere > 0 ? w.grossAreaFt2 / grossHere : 0
        const effective = Math.max(0, net) * portion
        heating.walls += (effective / asm.rValue) * heatingDeltaT * HEATING_BOUNDARY_FACTOR[w.boundary]
      }
    }
    for (const win of room.windows) {
      const g = findGlazing(win.glazingId)
      heating.windowsConduction += win.areaFt2 * g.uValue * heatingDeltaT
    }
    for (const d of room.doors) {
      const asm = findAssembly(d.assemblyId)
      heating.doors += (d.areaFt2 / asm.rValue) * heatingDeltaT * HEATING_BOUNDARY_FACTOR[d.boundary]
    }
    {
      const asm = findAssembly(room.ceiling.assemblyId)
      heating.ceiling +=
        (room.ceiling.areaFt2 / asm.rValue) * heatingDeltaT * HEATING_BOUNDARY_FACTOR[room.ceiling.boundary]
    }
    {
      const asm = findAssembly(room.floor.assemblyId)
      if (room.floor.kind === 'slab') {
        const f = asm.fFactor ?? 0.73
        heating.floor += f * room.floor.slabPerimeterFt * heatingDeltaT
      } else {
        heating.floor +=
          (room.floor.areaFt2 / asm.rValue) * heatingDeltaT * HEATING_BOUNDARY_FACTOR[room.floor.boundary]
      }
    }
    heating.infiltration += sf * infWinterCfm * share * heatingDeltaT
    heating.ventilation += sf * ventCfm * share * (1 - ventRecoveryS) * heatingDeltaT

    // ---- cooling, hour by hour
    const hourly: LoadBreakdown[] = []
    const solarRaw: number[] = new Array(24).fill(0)

    for (let h = 0; h < 24; h++) {
      const b = emptyBreakdown()
      const outdoor = outdoorHourly[h]

      for (const o of ORIENTATIONS) {
        const net = Math.max(0, netWallArea(room, o))
        const wallsHere = room.walls.filter((w) => w.orientation === o)
        const grossHere = wallsHere.reduce((a, x) => a + x.grossAreaFt2, 0)
        for (const w of wallsHere) {
          const asm = findAssembly(w.assemblyId)
          const portion = grossHere > 0 ? w.grossAreaFt2 / grossHere : 0
          const effective = net * portion
          if (effective <= 0 || w.boundary === 'conditioned') continue
          let drive: number[]
          if (w.boundary === 'outdoor') {
            const solAir = outdoorHourly.map(
              (t, hh) => t + (w.absorptance * wallIrradiance[o][hh]) / OUTSIDE_FILM_H,
            )
            drive = dampedDrive(solAir, asm.lagHours, asm.decrement, `w:${o}:${w.absorptance}:${asm.id}`)
          } else {
            const buffer = outdoorHourly.map(
              (t) => design.indoorSummerF + COOLING_BOUNDARY_FACTOR[w.boundary] * (t - design.indoorSummerF),
            )
            drive = dampedDrive(buffer, asm.lagHours, asm.decrement, `wb:${w.boundary}:${asm.id}`)
          }
          b.walls += (effective / asm.rValue) * (drive[h] - design.indoorSummerF)
        }
      }

      for (const win of room.windows) {
        const g = findGlazing(win.glazingId)
        b.windowsConduction += win.areaFt2 * g.uValue * (outdoor - design.indoorSummerF)
        const irr = wallIrradiance[win.orientation][h]
        const beam = wallBeamShare[win.orientation][h]
        const diffuse = Math.max(0, irr - beam)
        const lit = sunlitFraction(
          win.overhangDepthFt,
          win.overhangAboveFt,
          win.heightFt,
          COOLING_DESIGN_DAY,
          h,
          site.latitude,
          ORIENTATION_AZIMUTH[win.orientation],
        )
        const effectiveIrradiance = beam * lit + diffuse
        solarRaw[h] += win.areaFt2 * g.shgc * SHADE_IAC[win.shade] * effectiveIrradiance
      }

      for (const d of room.doors) {
        const asm = findAssembly(d.assemblyId)
        if (d.boundary === 'conditioned') continue
        const drive =
          d.boundary === 'outdoor'
            ? outdoor
            : design.indoorSummerF + COOLING_BOUNDARY_FACTOR[d.boundary] * (outdoor - design.indoorSummerF)
        b.doors += (d.areaFt2 / asm.rValue) * (drive - design.indoorSummerF)
      }

      {
        const asm = findAssembly(room.ceiling.assemblyId)
        if (room.ceiling.boundary !== 'conditioned' && room.ceiling.areaFt2 > 0) {
          const drive =
            room.ceiling.boundary === 'attic'
              ? dampedDrive(atticTemp, asm.lagHours, asm.decrement, `attic:${asm.id}`)
              : room.ceiling.boundary === 'outdoor'
                ? dampedDrive(
                    outdoorHourly.map(
                      (t, hh) => t + (room.ceiling.absorptance * roofIrradiance[hh]) / OUTSIDE_FILM_H - 7,
                    ),
                    asm.lagHours,
                    asm.decrement,
                    `roof:${room.ceiling.absorptance}:${asm.id}`,
                  )
                : dampedDrive(
                    outdoorHourly.map(
                      (t) =>
                        design.indoorSummerF +
                        COOLING_BOUNDARY_FACTOR[room.ceiling.boundary] * (t - design.indoorSummerF),
                    ),
                    asm.lagHours,
                    asm.decrement,
                    `cb:${room.ceiling.boundary}:${asm.id}`,
                  )
          b.ceiling += (room.ceiling.areaFt2 / asm.rValue) * (drive[h] - design.indoorSummerF)
        }
      }

      {
        const asm = findAssembly(room.floor.assemblyId)
        if (room.floor.kind === 'slab') {
          b.floor += 0 // a slab is a heat sink in summer; conventional practice ignores the gain
        } else if (room.floor.boundary !== 'conditioned') {
          const drive =
            design.indoorSummerF + COOLING_BOUNDARY_FACTOR[room.floor.boundary] * (outdoor - design.indoorSummerF)
          b.floor += (room.floor.areaFt2 / asm.rValue) * (drive - design.indoorSummerF)
        }
      }

      b.infiltration += sf * infSummerCfm * share * (outdoor - design.indoorSummerF)
      b.ventilation += sf * ventCfm * share * (1 - ventRecoveryS) * (outdoor - design.indoorSummerF)
      b.internal += room.occupants * PERSON_SENSIBLE + room.applianceSensibleBtuh

      hourly.push(b)
    }

    // Spread each hour's solar gain across the radiant time series.
    for (let h = 0; h < 24; h++) {
      for (let k = 0; k < RADIANT_SERIES.length; k++) {
        hourly[(h + k) % 24].windowsSolar += solarRaw[h] * RADIANT_SERIES[k]
      }
    }

    const hourlyTotal = hourly.map(breakdownTotal)
    const latent =
      lf * infSummerCfm * share * grainDiff +
      lf * ventCfm * share * (1 - ventRecoveryL) * grainDiff +
      room.occupants * PERSON_LATENT +
      room.applianceLatentBtuh

    return {
      room,
      heating,
      heatingTotal: breakdownTotal(heating),
      hourly,
      hourlyTotal,
      latent,
      exteriorArea: roomExterior,
      volume: roomVolume,
    }
  })

  // ---------------------------------------------------------------- house peak
  const houseHourly: number[] = new Array(24).fill(0)
  for (let h = 0; h < 24; h++) {
    houseHourly[h] = work.reduce((a, w) => a + Math.max(0, w.hourlyTotal[h]), 0)
  }
  let peakHour = 15
  let peakValue = -Infinity
  for (let h = 0; h < 24; h++) {
    if (houseHourly[h] > peakValue) {
      peakValue = houseHourly[h]
      peakHour = h
    }
  }

  const heatingNoDucts = work.reduce((a, w) => a + w.heatingTotal, 0)
  const coolingSensibleNoDucts = Math.max(0, peakValue)
  const latentTotal = work.reduce((a, w) => a + w.latent, 0)

  // ---------------------------------------------------------------- ducts
  const heatingCfmProvisional =
    heatingNoDucts > 0 ? heatingNoDucts / (sf * Math.max(10, project.systems.heatingSupplyRiseF)) : 0
  const coolingCfmProvisional =
    coolingSensibleNoDucts > 0
      ? coolingSensibleNoDucts / (sf * Math.max(10, project.systems.coolingSupplyDropF))
      : 0

  let ductHeating = 0
  let ductCooling = 0
  let ductLatent = 0
  if (ducts.boundary !== 'conditioned' && area > 0) {
    const ductArea = Math.max(0, ducts.surfaceFraction) * area
    const ductR = Math.max(1.5, ducts.rValue + 1.5)
    const leak = Math.max(0, Math.min(0.4, ducts.leakageFraction))

    const winterBuffer =
      design.winterOutdoorF + (1 - HEATING_BOUNDARY_FACTOR[ducts.boundary]) * heatingDeltaT
    const supplyWinter = design.indoorWinterF + project.systems.heatingSupplyRiseF / 2
    ductHeating =
      (ductArea / ductR) * (supplyWinter - winterBuffer) +
      leak * heatingCfmProvisional * sf * (supplyWinter - winterBuffer)

    const peakOutdoor = outdoorHourly[peakHour]
    const summerBuffer =
      ducts.boundary === 'attic'
        ? atticTemp[peakHour]
        : design.indoorSummerF + COOLING_BOUNDARY_FACTOR[ducts.boundary] * (peakOutdoor - design.indoorSummerF)
    const supplySummer = design.indoorSummerF - project.systems.coolingSupplyDropF / 2
    ductCooling =
      (ductArea / ductR) * (summerBuffer - supplySummer) +
      leak * coolingCfmProvisional * sf * (summerBuffer - supplySummer)
    ductLatent = leak * coolingCfmProvisional * lf * grainDiff
    ductHeating = Math.max(0, ductHeating)
    ductCooling = Math.max(0, ductCooling)
  }

  const heatingTotal = heatingNoDucts + ductHeating
  const coolingSensible = coolingSensibleNoDucts + ductCooling
  const coolingLatent = latentTotal + ductLatent
  const coolingTotal = coolingSensible + coolingLatent

  const totalHeatingCfm = heatingTotal / (sf * Math.max(10, project.systems.heatingSupplyRiseF))
  const totalCoolingCfm = coolingSensible / (sf * Math.max(10, project.systems.coolingSupplyDropF))

  // ---------------------------------------------------------------- room results
  const houseSensibleAtPeak = work.reduce((a, w) => a + Math.max(0, w.hourlyTotal[peakHour]), 0)
  const roomResults: RoomResult[] = work.map((w) => {
    const heatShare = heatingNoDucts > 0 ? w.heatingTotal / heatingNoDucts : 0
    const coolShare =
      houseSensibleAtPeak > 0 ? Math.max(0, w.hourlyTotal[peakHour]) / houseSensibleAtPeak : 0

    const heatingBreakdown = { ...w.heating, ducts: ductHeating * heatShare }
    const coolingBreakdown = { ...w.hourly[peakHour], ducts: ductCooling * coolShare }

    let ownPeakHour = peakHour
    let ownPeak = -Infinity
    for (let h = 0; h < 24; h++) {
      if (w.hourlyTotal[h] > ownPeak) {
        ownPeak = w.hourlyTotal[h]
        ownPeakHour = h
      }
    }

    const roomHeating = w.heatingTotal + ductHeating * heatShare
    const roomCoolSensible = Math.max(0, w.hourlyTotal[peakHour]) + ductCooling * coolShare
    const heatingCfm = totalHeatingCfm * heatShare
    const coolingCfm = totalCoolingCfm * coolShare

    return {
      roomId: w.room.id,
      name: w.room.name,
      heatingBtuh: roomHeating,
      coolingSensibleBtuh: roomCoolSensible,
      coolingLatentBtuh: w.latent + ductLatent * coolShare,
      ownPeakHour,
      ownPeakSensibleBtuh: Math.max(0, ownPeak),
      heatingCfm,
      coolingCfm,
      designCfm: Math.max(heatingCfm, coolingCfm),
      heatingBreakdown,
      coolingBreakdown,
    }
  })

  const sumBreakdown = (pick: (r: RoomResult) => LoadBreakdown): LoadBreakdown => {
    const out = emptyBreakdown()
    for (const r of roomResults) {
      const b = pick(r)
      out.walls += b.walls
      out.windowsConduction += b.windowsConduction
      out.windowsSolar += b.windowsSolar
      out.doors += b.doors
      out.ceiling += b.ceiling
      out.floor += b.floor
      out.infiltration += b.infiltration
      out.ventilation += b.ventilation
      out.internal += b.internal
      out.ducts += b.ducts
    }
    return out
  }

  const heatingBtuhPerFt2 = area > 0 ? heatingTotal / area : 0
  const coolingFt2PerTon = coolingTotal > 0 ? area / (coolingTotal / 12000) : 0

  if (area > 0 && heatingBtuhPerFt2 > 60) {
    warnings.push('Heating load is above 60 Btu/h per square foot. That is unusually high — check R-values, wall areas, and the blower door number.')
  }
  if (coolingTotal > 0 && coolingFt2PerTon > 0 && coolingFt2PerTon < 350) {
    warnings.push('Cooling works out to less than 350 square feet per ton, which is heavy for a house. Check glazing area, orientation, and internal gains.')
  }
  if (rooms.length === 0) warnings.push('Add at least one room to get results.')

  return {
    heatingBtuh: heatingTotal,
    coolingSensibleBtuh: coolingSensible,
    coolingLatentBtuh: coolingLatent,
    coolingTotalBtuh: coolingTotal,
    peakHour,
    sensibleHeatRatio: coolingTotal > 0 ? coolingSensible / coolingTotal : 1,
    heatingBreakdown: sumBreakdown((r) => r.heatingBreakdown),
    coolingBreakdown: sumBreakdown((r) => r.coolingBreakdown),
    rooms: roomResults,
    conditionedAreaFt2: area,
    volumeFt3: volume,
    heatingBtuhPerFt2,
    coolingFt2PerTon,
    uaBtuhF: heatingDeltaT > 0 ? heatingTotal / heatingDeltaT : 0,
    totalHeatingCfm,
    totalCoolingCfm,
    infiltrationWinterCfm: infWinterCfm,
    infiltrationSummerCfm: infSummerCfm,
    altitudeFactor: acf,
    hourlyCoolingSensible: houseHourly,
    warnings,
  }
}
