// SPDX-License-Identifier: AGPL-3.0-only

import type { Project, Room } from '../types'
import { newId } from './storage'

export function fmt(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtBtu(value: number): string {
  return `${fmt(Math.round(value))}`
}

export function fmtTons(btuh: number): string {
  return (btuh / 12000).toFixed(2)
}

export function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function fmtTemp(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}°`
}

export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const suffix = h < 12 ? 'am' : 'pm'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}${suffix}`
}

function room(partial: Partial<Room> & { name: string; floorAreaFt2: number }): Room {
  return {
    id: newId(),
    ceilingHeightFt: 8,
    walls: [],
    windows: [],
    doors: [],
    ceiling: { boundary: 'attic', areaFt2: partial.floorAreaFt2, assemblyId: 'c-r19', absorptance: 0.85 },
    floor: {
      kind: 'framed',
      boundary: 'unconditioned-basement',
      areaFt2: partial.floorAreaFt2,
      assemblyId: 'f-framed-none',
      slabPerimeterFt: 0,
    },
    occupants: 0,
    applianceSensibleBtuh: 0,
    applianceLatentBtuh: 0,
    ...partial,
  }
}

/**
 * A 1978 single-story house on the Wasatch Front: original windows on the
 * street side, R-19 attic, ducts in a vented attic. Close to the median
 * candidate for a heat pump retrofit in a cold, dry, high-altitude climate.
 */
export function sampleProject(): Project {
  const rooms: Room[] = [
    room({
      name: 'Living room',
      floorAreaFt2: 320,
      walls: [
        { id: newId(), orientation: 'S', boundary: 'outdoor', grossAreaFt2: 160, assemblyId: 'w-2x4-r11', absorptance: 0.7 },
        { id: newId(), orientation: 'W', boundary: 'outdoor', grossAreaFt2: 128, assemblyId: 'w-2x4-r11', absorptance: 0.7 },
      ],
      windows: [
        { id: newId(), orientation: 'S', areaFt2: 42, heightFt: 5, glazingId: 'g-double-clear', shade: 'blinds-light', overhangDepthFt: 2, overhangAboveFt: 1 },
        { id: newId(), orientation: 'W', areaFt2: 24, heightFt: 4, glazingId: 'g-double-clear', shade: 'none', overhangDepthFt: 0, overhangAboveFt: 0 },
      ],
      doors: [
        { id: newId(), orientation: 'S', boundary: 'outdoor', areaFt2: 21, assemblyId: 'd-steel-foam' },
      ],
      occupants: 3,
      applianceSensibleBtuh: 400,
    }),
    room({
      name: 'Kitchen and dining',
      floorAreaFt2: 300,
      walls: [
        { id: newId(), orientation: 'E', boundary: 'outdoor', grossAreaFt2: 144, assemblyId: 'w-2x4-r11', absorptance: 0.7 },
        { id: newId(), orientation: 'N', boundary: 'outdoor', grossAreaFt2: 120, assemblyId: 'w-2x4-r11', absorptance: 0.7 },
      ],
      windows: [
        { id: newId(), orientation: 'E', areaFt2: 20, heightFt: 4, glazingId: 'g-double-lowe', shade: 'blinds-light', overhangDepthFt: 0, overhangAboveFt: 0 },
        { id: newId(), orientation: 'N', areaFt2: 12, heightFt: 3, glazingId: 'g-double-lowe', shade: 'none', overhangDepthFt: 0, overhangAboveFt: 0 },
      ],
      doors: [],
      occupants: 2,
      applianceSensibleBtuh: 1200,
      applianceLatentBtuh: 800,
    }),
    room({
      name: 'Primary bedroom',
      floorAreaFt2: 220,
      walls: [
        { id: newId(), orientation: 'W', boundary: 'outdoor', grossAreaFt2: 112, assemblyId: 'w-2x4-r11', absorptance: 0.7 },
        { id: newId(), orientation: 'N', boundary: 'outdoor', grossAreaFt2: 96, assemblyId: 'w-2x4-r11', absorptance: 0.7 },
      ],
      windows: [
        { id: newId(), orientation: 'W', areaFt2: 18, heightFt: 4, glazingId: 'g-single-clear', shade: 'drapes', overhangDepthFt: 0, overhangAboveFt: 0 },
      ],
      doors: [],
      occupants: 2,
      applianceSensibleBtuh: 150,
    }),
    room({
      name: 'Bedroom 2',
      floorAreaFt2: 150,
      walls: [
        { id: newId(), orientation: 'N', boundary: 'outdoor', grossAreaFt2: 96, assemblyId: 'w-2x4-r11', absorptance: 0.7 },
      ],
      windows: [
        { id: newId(), orientation: 'N', areaFt2: 15, heightFt: 4, glazingId: 'g-single-clear', shade: 'blinds-light', overhangDepthFt: 0, overhangAboveFt: 0 },
      ],
      doors: [],
      occupants: 1,
      applianceSensibleBtuh: 120,
    }),
    room({
      name: 'Bedroom 3',
      floorAreaFt2: 140,
      walls: [
        { id: newId(), orientation: 'E', boundary: 'outdoor', grossAreaFt2: 88, assemblyId: 'w-2x4-r11', absorptance: 0.7 },
      ],
      windows: [
        { id: newId(), orientation: 'E', areaFt2: 15, heightFt: 4, glazingId: 'g-single-clear', shade: 'blinds-light', overhangDepthFt: 0, overhangAboveFt: 0 },
      ],
      doors: [],
      occupants: 1,
      applianceSensibleBtuh: 120,
    }),
    room({
      name: 'Hall and bath',
      floorAreaFt2: 170,
      walls: [
        { id: newId(), orientation: 'S', boundary: 'outdoor', grossAreaFt2: 72, assemblyId: 'w-2x4-r11', absorptance: 0.7 },
      ],
      windows: [
        { id: newId(), orientation: 'S', areaFt2: 6, heightFt: 2, glazingId: 'g-double-lowe', shade: 'none', overhangDepthFt: 2, overhangAboveFt: 1 },
      ],
      doors: [],
      occupants: 0,
      applianceSensibleBtuh: 100,
      applianceLatentBtuh: 300,
    }),
  ]

  return {
    schema: 1,
    id: newId(),
    name: 'Sample — 1978 rambler',
    updatedAt: Date.now(),
    site: { label: 'Clearfield, Utah', latitude: 41.1108, longitude: -112.0261, elevationFt: 4410 },
    design: {
      source: 'manual',
      winterOutdoorF: 8,
      summerOutdoorF: 95,
      summerMcwbF: 62,
      dailyRangeF: 30,
      indoorWinterF: 70,
      indoorSummerF: 75,
      indoorSummerRh: 50,
    },
    infiltration: { method: 'ach50', ach50: 8.5, achNatural: 0.5, stories: 1, shielding: 'normal' },
    ventilation: { cfm: 0, kind: 'none', sensibleRecovery: 0.7, latentRecovery: 0.5 },
    ducts: { boundary: 'attic', leakageFraction: 0.12, rValue: 6, surfaceFraction: 0.27 },
    rooms,
    systems: {
      heatPump: {
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
      },
      backup: { fuel: 'electric-resistance', efficiency: 1 },
      incumbent: { fuel: 'gas', efficiency: 0.8, blowerWatts: 500 },
      rates: { electricPerKwh: 0.12, gasPerTherm: 1.05, propanePerGal: 2.6, oilPerGal: 4.1 },
      balanceBaseF: 62,
      heatingSupplyRiseF: 40,
      coolingSupplyDropF: 20,
    },
    climate: null,
  }
}

export function blankProject(name = 'Untitled job'): Project {
  const base = sampleProject()
  return {
    ...base,
    id: newId(),
    name,
    rooms: [
      {
        id: newId(),
        name: 'Room 1',
        floorAreaFt2: 200,
        ceilingHeightFt: 8,
        walls: [
          { id: newId(), orientation: 'S', boundary: 'outdoor', grossAreaFt2: 120, assemblyId: 'w-2x6-r21', absorptance: 0.7 },
        ],
        windows: [
          { id: newId(), orientation: 'S', areaFt2: 20, heightFt: 4, glazingId: 'g-double-lowe', shade: 'blinds-light', overhangDepthFt: 0, overhangAboveFt: 0 },
        ],
        doors: [],
        ceiling: { boundary: 'attic', areaFt2: 200, assemblyId: 'c-r38', absorptance: 0.85 },
        floor: { kind: 'slab', boundary: 'outdoor', areaFt2: 200, assemblyId: 'f-slab-r10', slabPerimeterFt: 40 },
        occupants: 2,
        applianceSensibleBtuh: 300,
        applianceLatentBtuh: 0,
      },
    ],
    climate: null,
  }
}
