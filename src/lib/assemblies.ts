// SPDX-License-Identifier: AGPL-3.0-only
// A starting library of construction assemblies. R-values are whole-assembly
// values including interior and exterior air films, with framing factored in
// at typical framing fractions. Every one of these can be overridden per job.

import type { Assembly, GlazingType, InteriorShade } from '../types'

export const WALL_ASSEMBLIES: Assembly[] = [
  { id: 'w-solid-masonry', label: 'Solid masonry, no insulation', category: 'wall', rValue: 3.5, lagHours: 6, decrement: 0.45, note: 'Brick or block, pre-1940' },
  { id: 'w-2x4-empty', label: '2×4 frame, empty cavity', category: 'wall', rValue: 4.4, lagHours: 2, decrement: 0.85, note: 'Common before 1960' },
  { id: 'w-2x4-r11', label: '2×4 frame, R-11 batt', category: 'wall', rValue: 11.2, lagHours: 2, decrement: 0.8 },
  { id: 'w-2x4-r13', label: '2×4 frame, R-13 batt', category: 'wall', rValue: 12.6, lagHours: 2, decrement: 0.8, note: '1980s–2000s default' },
  { id: 'w-2x6-r19', label: '2×6 frame, R-19 batt', category: 'wall', rValue: 17.1, lagHours: 2.5, decrement: 0.78 },
  { id: 'w-2x6-r21', label: '2×6 frame, R-21 batt', category: 'wall', rValue: 19.0, lagHours: 2.5, decrement: 0.78 },
  { id: 'w-2x6-r21-ci5', label: '2×6 frame, R-21 + R-5 exterior', category: 'wall', rValue: 24.0, lagHours: 3, decrement: 0.72 },
  { id: 'w-2x6-spray', label: '2×6 frame, closed-cell spray foam', category: 'wall', rValue: 21.5, lagHours: 2.5, decrement: 0.75 },
  { id: 'w-icf', label: 'Insulated concrete form', category: 'wall', rValue: 23.0, lagHours: 8, decrement: 0.3 },
  { id: 'w-double-stud', label: 'Double stud, R-40 dense pack', category: 'wall', rValue: 38.0, lagHours: 4, decrement: 0.65 },
  { id: 'w-basement-bare', label: 'Basement wall, bare concrete', category: 'wall', rValue: 2.0, lagHours: 10, decrement: 0.2 },
  { id: 'w-basement-r10', label: 'Basement wall, R-10 interior', category: 'wall', rValue: 11.5, lagHours: 10, decrement: 0.2 },
]

export const CEILING_ASSEMBLIES: Assembly[] = [
  { id: 'c-none', label: 'No attic insulation', category: 'ceiling', rValue: 2.5, lagHours: 1, decrement: 0.95 },
  { id: 'c-r11', label: 'Attic, R-11', category: 'ceiling', rValue: 12.0, lagHours: 2, decrement: 0.8 },
  { id: 'c-r19', label: 'Attic, R-19', category: 'ceiling', rValue: 20.0, lagHours: 2, decrement: 0.8 },
  { id: 'c-r30', label: 'Attic, R-30', category: 'ceiling', rValue: 31.0, lagHours: 3, decrement: 0.72 },
  { id: 'c-r38', label: 'Attic, R-38', category: 'ceiling', rValue: 39.0, lagHours: 3, decrement: 0.7, note: 'Current code in most cold climates' },
  { id: 'c-r49', label: 'Attic, R-49', category: 'ceiling', rValue: 50.0, lagHours: 3.5, decrement: 0.68 },
  { id: 'c-r60', label: 'Attic, R-60', category: 'ceiling', rValue: 61.0, lagHours: 4, decrement: 0.65 },
  { id: 'c-cathedral-r30', label: 'Cathedral, R-30', category: 'ceiling', rValue: 28.0, lagHours: 3, decrement: 0.75 },
  { id: 'c-flat-roof-r20', label: 'Flat roof, R-20 above deck', category: 'ceiling', rValue: 21.0, lagHours: 4, decrement: 0.7 },
  { id: 'c-interior', label: 'Ceiling under conditioned space', category: 'ceiling', rValue: 100, lagHours: 0, decrement: 0 },
]

export const FLOOR_ASSEMBLIES: Assembly[] = [
  { id: 'f-slab-uninsulated', label: 'Slab on grade, uninsulated edge', category: 'floor', rValue: 5, lagHours: 12, decrement: 0.1, fFactor: 0.73 },
  { id: 'f-slab-r5', label: 'Slab on grade, R-5 edge', category: 'floor', rValue: 8, lagHours: 12, decrement: 0.1, fFactor: 0.54 },
  { id: 'f-slab-r10', label: 'Slab on grade, R-10 edge', category: 'floor', rValue: 12, lagHours: 12, decrement: 0.1, fFactor: 0.45 },
  { id: 'f-slab-r10-full', label: 'Slab on grade, R-10 under full slab', category: 'floor', rValue: 14, lagHours: 12, decrement: 0.1, fFactor: 0.36 },
  { id: 'f-framed-none', label: 'Framed floor, no insulation', category: 'floor', rValue: 4.0, lagHours: 2, decrement: 0.8 },
  { id: 'f-framed-r13', label: 'Framed floor, R-13', category: 'floor', rValue: 14.0, lagHours: 2, decrement: 0.8 },
  { id: 'f-framed-r19', label: 'Framed floor, R-19', category: 'floor', rValue: 20.0, lagHours: 2, decrement: 0.8 },
  { id: 'f-framed-r30', label: 'Framed floor, R-30', category: 'floor', rValue: 31.0, lagHours: 2.5, decrement: 0.75 },
  { id: 'f-interior', label: 'Floor over conditioned space', category: 'floor', rValue: 100, lagHours: 0, decrement: 0 },
]

export const DOOR_ASSEMBLIES: Assembly[] = [
  { id: 'd-wood-solid', label: 'Solid wood door', category: 'door', rValue: 2.2, lagHours: 1, decrement: 0.9 },
  { id: 'd-steel-foam', label: 'Insulated steel door', category: 'door', rValue: 5.0, lagHours: 1, decrement: 0.9 },
  { id: 'd-fiberglass', label: 'Insulated fiberglass door', category: 'door', rValue: 6.0, lagHours: 1, decrement: 0.9 },
  { id: 'd-sliding-glass', label: 'Sliding glass door, double pane', category: 'door', rValue: 2.0, lagHours: 0, decrement: 1 },
]

export const ALL_ASSEMBLIES: Assembly[] = [
  ...WALL_ASSEMBLIES,
  ...CEILING_ASSEMBLIES,
  ...FLOOR_ASSEMBLIES,
  ...DOOR_ASSEMBLIES,
]

export const GLAZING_TYPES: GlazingType[] = [
  { id: 'g-single-clear', label: 'Single pane, clear', uValue: 1.04, shgc: 0.79, note: 'Original pre-1970 sash' },
  { id: 'g-single-storm', label: 'Single pane + storm', uValue: 0.6, shgc: 0.67 },
  { id: 'g-double-clear', label: 'Double pane, clear, aluminum', uValue: 0.81, shgc: 0.7 },
  { id: 'g-double-vinyl', label: 'Double pane, clear, vinyl', uValue: 0.49, shgc: 0.56 },
  { id: 'g-double-lowe', label: 'Double pane, low-E, vinyl', uValue: 0.32, shgc: 0.4, note: 'Typical replacement window' },
  { id: 'g-double-lowe-south', label: 'Double pane, high-gain low-E', uValue: 0.31, shgc: 0.55, note: 'Solar-gain glass for south walls' },
  { id: 'g-double-lowe-spectral', label: 'Double pane, spectrally selective', uValue: 0.3, shgc: 0.26, note: 'Cooling-climate glass' },
  { id: 'g-triple-lowe', label: 'Triple pane, low-E', uValue: 0.2, shgc: 0.35 },
  { id: 'g-triple-passive', label: 'Triple pane, passive house', uValue: 0.14, shgc: 0.5 },
  { id: 'g-glass-block', label: 'Glass block', uValue: 0.52, shgc: 0.4 },
]

/** Interior attenuation coefficient — how much of the transmitted sun a covering stops. */
export const SHADE_IAC: Record<InteriorShade, number> = {
  none: 1.0,
  'blinds-light': 0.6,
  'blinds-dark': 0.75,
  drapes: 0.55,
  'low-e-film': 0.5,
}

export const SHADE_LABEL: Record<InteriorShade, string> = {
  none: 'Bare glass',
  'blinds-light': 'Light blinds',
  'blinds-dark': 'Dark blinds',
  drapes: 'Closed drapes',
  'low-e-film': 'Applied low-E film',
}

export function findAssembly(id: string): Assembly {
  return ALL_ASSEMBLIES.find((a) => a.id === id) ?? WALL_ASSEMBLIES[3]
}

export function findGlazing(id: string): GlazingType {
  return GLAZING_TYPES.find((g) => g.id === id) ?? GLAZING_TYPES[4]
}

export function assembliesFor(category: Assembly['category']): Assembly[] {
  return ALL_ASSEMBLIES.filter((a) => a.category === category)
}
