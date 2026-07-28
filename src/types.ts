// SPDX-License-Identifier: AGPL-3.0-only
// Hypocaust — browser-native building load calculation.
// Copyright (C) 2026 Hypocaust contributors.

export type Orientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

export const ORIENTATIONS: Orientation[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** Surface azimuth in degrees clockwise from true south (ASHRAE convention). */
export const ORIENTATION_AZIMUTH: Record<Orientation, number> = {
  S: 0, SW: 45, W: 90, NW: 135, N: 180, NE: -135, E: -90, SE: -45,
}

/** What sits on the far side of a surface. Drives the applied temperature difference. */
export type Boundary =
  | 'outdoor'
  | 'attic'
  | 'vented-crawl'
  | 'unconditioned-basement'
  | 'garage'
  | 'conditioned'

export interface Site {
  label: string
  latitude: number
  longitude: number
  elevationFt: number
}

export interface DesignConditions {
  source: 'derived' | 'manual'
  /** 99% winter design dry bulb, °F */
  winterOutdoorF: number
  /** 1% summer design dry bulb, °F */
  summerOutdoorF: number
  /** Mean coincident wet bulb at the 1% dry bulb, °F */
  summerMcwbF: number
  /** Mean summer daily temperature swing, °F */
  dailyRangeF: number
  indoorWinterF: number
  indoorSummerF: number
  indoorSummerRh: number
}

export interface TempBin {
  centerF: number
  hoursPerYear: number
}

export interface ClimateRecord {
  fetchedAt: number
  startYear: number
  endYear: number
  elevationFt: number
  heating99F: number
  heating996F: number
  cooling1F: number
  cooling04F: number
  mcwb1F: number
  dailyRangeF: number
  hdd65: number
  cdd65: number
  extremeLowF: number
  extremeHighF: number
  bins: TempBin[]
}

export interface Assembly {
  id: string
  label: string
  category: 'wall' | 'ceiling' | 'floor' | 'door'
  /** Total assembly R-value including air films, h·ft²·°F/Btu. */
  rValue: number
  /** Hours of thermal lag for the sol-air response. */
  lagHours: number
  /** Amplitude decrement factor for the sol-air response, 0–1. */
  decrement: number
  /** Slab edge F-factor, Btu/h·ft·°F. Only meaningful for slab floors. */
  fFactor?: number
  note?: string
}

export interface GlazingType {
  id: string
  label: string
  uValue: number
  shgc: number
  note?: string
}

export type InteriorShade = 'none' | 'blinds-light' | 'blinds-dark' | 'drapes' | 'low-e-film'

export interface WallSurface {
  id: string
  orientation: Orientation
  boundary: Boundary
  /** Gross area including windows and doors, ft². */
  grossAreaFt2: number
  assemblyId: string
  /** Exterior surface absorptance: 0.4 light, 0.7 medium, 0.9 dark. */
  absorptance: number
}

export interface WindowSurface {
  id: string
  orientation: Orientation
  areaFt2: number
  heightFt: number
  glazingId: string
  shade: InteriorShade
  /** Horizontal projection of an overhang above the glass, ft. 0 = none. */
  overhangDepthFt: number
  /** Vertical distance from the overhang down to the head of the glass, ft. */
  overhangAboveFt: number
}

export interface DoorSurface {
  id: string
  orientation: Orientation
  boundary: Boundary
  areaFt2: number
  assemblyId: string
}

export interface CeilingSurface {
  boundary: Boundary
  areaFt2: number
  assemblyId: string
  absorptance: number
}

export interface FloorSurface {
  kind: 'slab' | 'framed'
  boundary: Boundary
  areaFt2: number
  assemblyId: string
  /** Exposed slab edge length, ft. Only used when kind === 'slab'. */
  slabPerimeterFt: number
}

export interface Room {
  id: string
  name: string
  floorAreaFt2: number
  ceilingHeightFt: number
  walls: WallSurface[]
  windows: WindowSurface[]
  doors: DoorSurface[]
  ceiling: CeilingSurface
  floor: FloorSurface
  occupants: number
  /** Steady appliance and plug sensible gain, Btu/h. */
  applianceSensibleBtuh: number
  applianceLatentBtuh: number
}

export type Shielding = 'exposed' | 'normal' | 'sheltered' | 'well-sheltered'

export interface Infiltration {
  method: 'ach50' | 'natural'
  /** Blower door result at 50 Pa, air changes per hour. */
  ach50: number
  /** Direct natural air change rate, used when method === 'natural'. */
  achNatural: number
  stories: number
  shielding: Shielding
}

export interface Ventilation {
  cfm: number
  kind: 'none' | 'exhaust' | 'supply' | 'balanced' | 'hrv' | 'erv'
  sensibleRecovery: number
  latentRecovery: number
}

export interface Ducts {
  boundary: Boundary
  /** Supply + return leakage as a fraction of system airflow. */
  leakageFraction: number
  /** Duct insulation R-value. 0 = bare metal. */
  rValue: number
  /** Duct surface area as a fraction of conditioned floor area. */
  surfaceFraction: number
}

export interface HeatPumpPoint {
  tempF: number
  capacityBtuh: number
  cop: number
}

export interface HeatPumpSpec {
  label: string
  points: HeatPumpPoint[]
  coolingCapacityBtuh: number
  seer2: number
  /** Compressor lockout: below this the unit produces nothing. */
  lockoutF: number
}

export type FuelKind = 'gas' | 'electric-resistance' | 'propane' | 'oil' | 'none'

export interface Incumbent {
  fuel: FuelKind
  /** Steady-state efficiency, 0–1. */
  efficiency: number
  /** Air handler / blower draw while heating, watts. */
  blowerWatts: number
}

export interface Rates {
  electricPerKwh: number
  gasPerTherm: number
  propanePerGal: number
  oilPerGal: number
}

export interface Systems {
  heatPump: HeatPumpSpec
  backup: { fuel: FuelKind; efficiency: number }
  incumbent: Incumbent
  rates: Rates
  /** Outdoor temperature at which the building needs no heat, °F. */
  balanceBaseF: number
  /** Supply air temperature rise in heating, °F. */
  heatingSupplyRiseF: number
  /** Supply air temperature drop in cooling, °F. */
  coolingSupplyDropF: number
}

export interface Project {
  schema: 1
  id: string
  name: string
  updatedAt: number
  site: Site
  design: DesignConditions
  infiltration: Infiltration
  ventilation: Ventilation
  ducts: Ducts
  rooms: Room[]
  systems: Systems
  climate: ClimateRecord | null
}

// ---------------------------------------------------------------- results

export interface LoadBreakdown {
  walls: number
  windowsConduction: number
  windowsSolar: number
  doors: number
  ceiling: number
  floor: number
  infiltration: number
  ventilation: number
  internal: number
  ducts: number
}

export interface RoomResult {
  roomId: string
  name: string
  heatingBtuh: number
  coolingSensibleBtuh: number
  coolingLatentBtuh: number
  /** Hour of the design day where this room alone peaks, 24h solar time. */
  ownPeakHour: number
  ownPeakSensibleBtuh: number
  heatingCfm: number
  coolingCfm: number
  designCfm: number
  heatingBreakdown: LoadBreakdown
  coolingBreakdown: LoadBreakdown
}

export interface HouseResult {
  heatingBtuh: number
  coolingSensibleBtuh: number
  coolingLatentBtuh: number
  coolingTotalBtuh: number
  peakHour: number
  sensibleHeatRatio: number
  heatingBreakdown: LoadBreakdown
  coolingBreakdown: LoadBreakdown
  rooms: RoomResult[]
  conditionedAreaFt2: number
  volumeFt3: number
  heatingBtuhPerFt2: number
  coolingFt2PerTon: number
  /** Whole-house conductance implied by the heating load, Btu/h·°F. */
  uaBtuhF: number
  totalHeatingCfm: number
  totalCoolingCfm: number
  infiltrationWinterCfm: number
  infiltrationSummerCfm: number
  altitudeFactor: number
  /** Sensible cooling load for each hour of the design day, indexed 0–23. */
  hourlyCoolingSensible: number[]
  warnings: string[]
}
