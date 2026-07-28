// SPDX-License-Identifier: AGPL-3.0-only
// Equipment matching and annual energy.
//
// The building load line and the heat pump capacity curve run in opposite
// directions as it gets colder. Where they cross is the balance point, and
// everything below it has to come from somewhere else. Pairing that crossing
// with real bin hours from the site's own weather history turns a sizing
// question into an operating-cost question.

import type { FuelKind, HeatPumpSpec, Project, Rates, TempBin } from '../types'

const BTU_PER_KWH = 3412.14
const BTU_PER_THERM = 100_000
const BTU_PER_GAL_PROPANE = 91_500
const BTU_PER_GAL_OIL = 138_500

/** Interpolate a heat pump property between published test points. */
function interpolate(points: { tempF: number; value: number }[], tempF: number): number {
  if (points.length === 0) return 0
  const sorted = [...points].sort((a, b) => a.tempF - b.tempF)
  if (tempF <= sorted[0].tempF) {
    if (sorted.length === 1) return sorted[0].value
    const [p0, p1] = sorted
    const slope = (p1.value - p0.value) / (p1.tempF - p0.tempF)
    return Math.max(0, p0.value + slope * (tempF - p0.tempF))
  }
  if (tempF >= sorted[sorted.length - 1].tempF) {
    const p1 = sorted[sorted.length - 1]
    if (sorted.length === 1) return p1.value
    const p0 = sorted[sorted.length - 2]
    const slope = (p1.value - p0.value) / (p1.tempF - p0.tempF)
    return Math.max(0, p1.value + slope * (tempF - p1.tempF))
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (tempF >= a.tempF && tempF <= b.tempF) {
      const t = (tempF - a.tempF) / (b.tempF - a.tempF)
      return a.value + t * (b.value - a.value)
    }
  }
  return sorted[sorted.length - 1].value
}

export function capacityAt(spec: HeatPumpSpec, tempF: number): number {
  if (tempF < spec.lockoutF) return 0
  return Math.max(
    0,
    interpolate(
      spec.points.map((p) => ({ tempF: p.tempF, value: p.capacityBtuh })),
      tempF,
    ),
  )
}

export function copAt(spec: HeatPumpSpec, tempF: number): number {
  if (tempF < spec.lockoutF) return 0
  return Math.max(
    0.6,
    interpolate(
      spec.points.map((p) => ({ tempF: p.tempF, value: p.cop })),
      tempF,
    ),
  )
}

/**
 * Heat the building needs at a given outdoor temperature. Derived from the
 * design load so the two always agree, with a balance temperature that credits
 * the internal and solar gains heating ignores.
 */
export function buildingLoadAt(uaBtuhF: number, balanceBaseF: number, tempF: number): number {
  return Math.max(0, uaBtuhF * (balanceBaseF - tempF))
}

export interface BalanceResult {
  /** Outdoor temperature where capacity stops covering the load, °F. */
  balancePointF: number | null
  /** True when the unit covers the load all the way to the design temperature. */
  coversDesign: boolean
  capacityAtDesign: number
  loadAtDesign: number
  /** Fraction of the design load the heat pump alone covers. */
  designCoverage: number
}

export function findBalancePoint(
  spec: HeatPumpSpec,
  uaBtuhF: number,
  balanceBaseF: number,
  designTempF: number,
): BalanceResult {
  const capDesign = capacityAt(spec, designTempF)
  const loadDesign = buildingLoadAt(uaBtuhF, balanceBaseF, designTempF)

  let balancePointF: number | null = null
  let lo = designTempF - 20
  let hi = balanceBaseF
  const deficit = (t: number) => buildingLoadAt(uaBtuhF, balanceBaseF, t) - capacityAt(spec, t)

  if (deficit(hi) <= 0 && deficit(lo) > 0) {
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2
      if (deficit(mid) > 0) lo = mid
      else hi = mid
    }
    balancePointF = (lo + hi) / 2
  } else if (deficit(lo) <= 0) {
    balancePointF = null // never short, even below design
  } else {
    balancePointF = balanceBaseF // short everywhere it runs
  }

  return {
    balancePointF,
    coversDesign: capDesign >= loadDesign && loadDesign > 0,
    capacityAtDesign: capDesign,
    loadAtDesign: loadDesign,
    designCoverage: loadDesign > 0 ? capDesign / loadDesign : 1,
  }
}

export interface SeasonEnergy {
  heatPumpKwh: number
  backupKwh: number
  backupTherms: number
  backupBtu: number
  deliveredBtu: number
  hoursWithBackup: number
  seasonalCop: number
  cost: number
}

export interface IncumbentEnergy {
  fuelUnits: number
  unitLabel: string
  blowerKwh: number
  cost: number
}

export interface CoolingEnergy {
  kwh: number
  cost: number
  equivalentFullLoadHours: number
}

export interface EnergyComparison {
  heatPump: SeasonEnergy
  incumbent: IncumbentEnergy | null
  cooling: CoolingEnergy
  balance: BalanceResult
  /** Load line and capacity curve sampled across the bin range. */
  curve: { tempF: number; loadBtuh: number; capacityBtuh: number; copValue: number }[]
  binLoad: { tempF: number; hours: number; loadBtuh: number; deficitBtuh: number }[]
  annualHeatingBtu: number
  savings: number | null
}

function fuelCost(fuel: FuelKind, btu: number, efficiency: number, rates: Rates): { units: number; label: string; cost: number } {
  const input = efficiency > 0 ? btu / efficiency : 0
  switch (fuel) {
    case 'gas':
      return { units: input / BTU_PER_THERM, label: 'therms', cost: (input / BTU_PER_THERM) * rates.gasPerTherm }
    case 'propane':
      return {
        units: input / BTU_PER_GAL_PROPANE,
        label: 'gallons',
        cost: (input / BTU_PER_GAL_PROPANE) * rates.propanePerGal,
      }
    case 'oil':
      return { units: input / BTU_PER_GAL_OIL, label: 'gallons', cost: (input / BTU_PER_GAL_OIL) * rates.oilPerGal }
    case 'electric-resistance':
      return { units: input / BTU_PER_KWH, label: 'kWh', cost: (input / BTU_PER_KWH) * rates.electricPerKwh }
    default:
      return { units: 0, label: '', cost: 0 }
  }
}

export function analyzeEnergy(
  project: Project,
  uaBtuhF: number,
  coolingSensibleBtuh: number,
  coolingTotalBtuh: number,
  bins: TempBin[],
): EnergyComparison {
  const { systems, design } = project
  const spec = systems.heatPump
  const balance = findBalancePoint(spec, uaBtuhF, systems.balanceBaseF, design.winterOutdoorF)

  let hpKwh = 0
  let backupBtu = 0
  let deliveredBtu = 0
  let hoursWithBackup = 0
  const binLoad: EnergyComparison['binLoad'] = []

  for (const bin of bins) {
    const load = buildingLoadAt(uaBtuhF, systems.balanceBaseF, bin.centerF)
    const cap = capacityAt(spec, bin.centerF)
    const covered = Math.min(load, cap)
    const deficit = Math.max(0, load - cap)
    if (load > 0) {
      const cop = copAt(spec, bin.centerF)
      if (covered > 0 && cop > 0) hpKwh += (covered * bin.hoursPerYear) / (cop * BTU_PER_KWH)
      backupBtu += deficit * bin.hoursPerYear
      deliveredBtu += load * bin.hoursPerYear
      if (deficit > 0) hoursWithBackup += bin.hoursPerYear
    }
    binLoad.push({ tempF: bin.centerF, hours: bin.hoursPerYear, loadBtuh: load, deficitBtuh: deficit })
  }

  const backup = fuelCost(systems.backup.fuel, backupBtu, systems.backup.efficiency, systems.rates)
  const backupKwh = systems.backup.fuel === 'electric-resistance' ? backup.units : 0
  const backupTherms = systems.backup.fuel === 'gas' ? backup.units : 0

  const heatPumpElectricCost = hpKwh * systems.rates.electricPerKwh
  const heatPumpSeason: SeasonEnergy = {
    heatPumpKwh: hpKwh,
    backupKwh,
    backupTherms,
    backupBtu,
    deliveredBtu,
    hoursWithBackup,
    seasonalCop:
      hpKwh + backupKwh > 0 ? deliveredBtu / ((hpKwh + backupKwh) * BTU_PER_KWH + backupBtu * 0) : 0,
    cost: heatPumpElectricCost + backup.cost,
  }
  if (deliveredBtu > 0) {
    const totalElectricBtu = (hpKwh + backupKwh) * BTU_PER_KWH
    const totalFossilBtu = systems.backup.fuel === 'gas' || systems.backup.fuel === 'propane' || systems.backup.fuel === 'oil'
      ? backupBtu / Math.max(0.01, systems.backup.efficiency)
      : 0
    heatPumpSeason.seasonalCop = deliveredBtu / Math.max(1, totalElectricBtu + totalFossilBtu)
  }

  let incumbent: IncumbentEnergy | null = null
  if (systems.incumbent.fuel !== 'none') {
    const inc = fuelCost(systems.incumbent.fuel, deliveredBtu, systems.incumbent.efficiency, systems.rates)
    const runHours = bins.reduce((a, b) => {
      const load = buildingLoadAt(uaBtuhF, systems.balanceBaseF, b.centerF)
      const full = uaBtuhF * Math.max(1, systems.balanceBaseF - design.winterOutdoorF)
      return a + (full > 0 ? (load / full) * b.hoursPerYear : 0)
    }, 0)
    const blowerKwh = (systems.incumbent.blowerWatts * runHours) / 1000
    incumbent = {
      fuelUnits: inc.units,
      unitLabel: inc.label,
      blowerKwh,
      cost: inc.cost + blowerKwh * systems.rates.electricPerKwh,
    }
  }

  // Cooling: bin hours above the balance base, scaled against the design load.
  const coolBase = 68
  let coolingBtu = 0
  for (const bin of bins) {
    if (bin.centerF <= coolBase) continue
    const fraction = Math.min(1.15, (bin.centerF - coolBase) / Math.max(1, design.summerOutdoorF - coolBase))
    coolingBtu += coolingSensibleBtuh * fraction * bin.hoursPerYear
  }
  const seer = Math.max(6, spec.seer2)
  const coolingKwh = coolingBtu / (seer * 1000)
  const cooling: CoolingEnergy = {
    kwh: coolingKwh,
    cost: coolingKwh * systems.rates.electricPerKwh,
    equivalentFullLoadHours: coolingTotalBtuh > 0 ? coolingBtu / coolingTotalBtuh : 0,
  }

  const curve: EnergyComparison['curve'] = []
  const lowT = Math.min(design.winterOutdoorF - 15, bins.length ? bins[0].centerF : -10)
  const highT = systems.balanceBaseF + 5
  for (let t = Math.floor(lowT); t <= Math.ceil(highT); t += 1) {
    curve.push({
      tempF: t,
      loadBtuh: buildingLoadAt(uaBtuhF, systems.balanceBaseF, t),
      capacityBtuh: capacityAt(spec, t),
      copValue: copAt(spec, t),
    })
  }

  return {
    heatPump: heatPumpSeason,
    incumbent,
    cooling,
    balance,
    curve,
    binLoad,
    annualHeatingBtu: deliveredBtu,
    savings: incumbent ? incumbent.cost - heatPumpSeason.cost : null,
  }
}

/** Common cold-climate heat pump shapes to start from, in nominal tons. */
export const HEAT_PUMP_PRESETS: { id: string; label: string; build: () => HeatPumpSpec }[] = [
  {
    id: 'ccashp-2',
    label: 'Cold-climate ducted, 2 ton',
    build: () => ({
      label: 'Cold-climate ducted, 2 ton',
      points: [
        { tempF: 47, capacityBtuh: 24000, cop: 3.6 },
        { tempF: 17, capacityBtuh: 21000, cop: 2.4 },
        { tempF: 5, capacityBtuh: 18000, cop: 1.9 },
        { tempF: -13, capacityBtuh: 12500, cop: 1.4 },
      ],
      coolingCapacityBtuh: 24000,
      seer2: 16,
      lockoutF: -22,
    }),
  },
  {
    id: 'ccashp-3',
    label: 'Cold-climate ducted, 3 ton',
    build: () => ({
      label: 'Cold-climate ducted, 3 ton',
      points: [
        { tempF: 47, capacityBtuh: 36000, cop: 3.5 },
        { tempF: 17, capacityBtuh: 31000, cop: 2.35 },
        { tempF: 5, capacityBtuh: 27000, cop: 1.85 },
        { tempF: -13, capacityBtuh: 19000, cop: 1.35 },
      ],
      coolingCapacityBtuh: 36000,
      seer2: 15.5,
      lockoutF: -22,
    }),
  },
  {
    id: 'ductless-1',
    label: 'Ductless mini-split, 1 ton',
    build: () => ({
      label: 'Ductless mini-split, 1 ton',
      points: [
        { tempF: 47, capacityBtuh: 13600, cop: 4.2 },
        { tempF: 17, capacityBtuh: 12000, cop: 2.6 },
        { tempF: 5, capacityBtuh: 10900, cop: 2.05 },
        { tempF: -13, capacityBtuh: 7600, cop: 1.5 },
      ],
      coolingCapacityBtuh: 12000,
      seer2: 20,
      lockoutF: -22,
    }),
  },
  {
    id: 'standard-3',
    label: 'Standard-efficiency ducted, 3 ton',
    build: () => ({
      label: 'Standard-efficiency ducted, 3 ton',
      points: [
        { tempF: 47, capacityBtuh: 34000, cop: 3.3 },
        { tempF: 17, capacityBtuh: 20000, cop: 2.1 },
        { tempF: 5, capacityBtuh: 14000, cop: 1.6 },
      ],
      coolingCapacityBtuh: 36000,
      seer2: 14.3,
      lockoutF: 0,
    }),
  },
]
