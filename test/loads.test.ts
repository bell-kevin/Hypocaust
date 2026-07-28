import { computeLoads, naturalAch } from '../src/lib/loads'
import { sampleProject } from '../src/lib/sample'
import { analyzeEnergy, findBalancePoint, capacityAt } from '../src/lib/energy'
import { synthesizeBins } from '../src/lib/climate'
import { altitudeFactor, humidityRatioFromRh, wetBulbFromRh, pressureAt, grains, satVaporPressure } from '../src/lib/psychro'
import { solarPosition, verticalIrradiance, sunlitFraction, COOLING_DESIGN_DAY } from '../src/lib/solar'

let fails = 0
function check(name: string, cond: boolean, detail = '') {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${detail}`) }
  else console.log(`  ok    ${name} ${detail}`)
}

console.log('\n--- psychrometrics (ASHRAE reference values) ---')
// Saturation pressure at 70F ~= 0.36334 psia
const pws70 = satVaporPressure(70)
check('sat pressure @70F ~ 0.3632 psia', Math.abs(pws70 - 0.36334) < 0.003, `= ${pws70.toFixed(5)}`)
// At sea level, 75F/50%RH -> W ~= 0.00927, ~65 grains
const w = humidityRatioFromRh(75, 50, 14.696)
check('W @75F/50%RH ~ 0.00927', Math.abs(w - 0.00927) < 0.0004, `= ${w.toFixed(5)} (${grains(w).toFixed(1)} gr)`)
// Wet bulb at 95F/40%RH ~= 75.5F
const wb = wetBulbFromRh(95, 40, 14.696)
check('WB @95F/40%RH ~ 75.4F', Math.abs(wb - 75.4) < 1.5, `= ${wb.toFixed(2)}F`)
// Denver 5280 ft: pressure ~12.1 psia, density ratio ~0.82
check('pressure @5280ft ~ 12.1 psia', Math.abs(pressureAt(5280) - 12.1) < 0.2, `= ${pressureAt(5280).toFixed(2)}`)
check('altitude factor @5280ft ~ 0.82', Math.abs(altitudeFactor(5280) - 0.82) < 0.02, `= ${altitudeFactor(5280).toFixed(3)}`)
check('altitude factor @0ft = 1.0', Math.abs(altitudeFactor(0) - 1) < 1e-9)

console.log('\n--- solar geometry ---')
// Summer solstice-ish, solar noon, lat 41: altitude ~= 90 - 41 + 20.4 = ~69.4
const noon = solarPosition(COOLING_DESIGN_DAY, 12, 41.11)
check('July 21 noon altitude @41N ~ 69', Math.abs(noon.altitude - 69) < 2.5, `= ${noon.altitude.toFixed(1)}deg`)
check('solar noon azimuth ~ 0 (due south)', Math.abs(noon.azimuth) < 1, `= ${noon.azimuth.toFixed(2)}`)
const am9 = solarPosition(COOLING_DESIGN_DAY, 9, 41.11)
check('9am sun is east of south (negative azimuth)', am9.azimuth < -40, `= ${am9.azimuth.toFixed(1)}`)
// West window peaks in late afternoon, east in morning
const westIrr = [...Array(24)].map((_, h) => verticalIrradiance(COOLING_DESIGN_DAY, h, 41.11, 90, 0).totalVertical)
const eastIrr = [...Array(24)].map((_, h) => verticalIrradiance(COOLING_DESIGN_DAY, h, 41.11, -90, 0).totalVertical)
const northIrr = [...Array(24)].map((_, h) => verticalIrradiance(COOLING_DESIGN_DAY, h, 41.11, 180, 0).totalVertical)
const wPeak = westIrr.indexOf(Math.max(...westIrr))
const ePeak = eastIrr.indexOf(Math.max(...eastIrr))
check('west glass peaks late afternoon', wPeak >= 15 && wPeak <= 18, `hour ${wPeak}, ${Math.max(...westIrr).toFixed(0)} Btu/h.ft2`)
check('east glass peaks morning', ePeak >= 6 && ePeak <= 9, `hour ${ePeak}, ${Math.max(...eastIrr).toFixed(0)} Btu/h.ft2`)
check('north glass gets far less than west in July', Math.max(...northIrr) < Math.max(...westIrr) * 0.55, `N=${Math.max(...northIrr).toFixed(0)} W=${Math.max(...westIrr).toFixed(0)}`)
check('peak west irradiance in plausible range 180-280', Math.max(...westIrr) > 170 && Math.max(...westIrr) < 290)
// Overhang: 3ft overhang on a south window at noon should shade nearly all of it
const litNoonS = sunlitFraction(3, 0.5, 4, COOLING_DESIGN_DAY, 12, 41.11, 0)
const litAfternoonW = sunlitFraction(3, 0.5, 4, COOLING_DESIGN_DAY, 17, 41.11, 90)
check('3ft overhang shades south glass at noon', litNoonS < 0.1, `lit=${litNoonS.toFixed(2)}`)
check('same overhang barely helps west glass at 5pm', litAfternoonW > 0.6, `lit=${litAfternoonW.toFixed(2)}`)

console.log('\n--- whole-house load, 1978 Clearfield rambler ---')
const p = sampleProject()
const r = computeLoads(p)
const area = r.conditionedAreaFt2
console.log(`  area ${area} ft2, ACHnat ${naturalAch(p).toFixed(2)}, elevation ${p.site.elevationFt} ft`)
console.log(`  HEATING ${Math.round(r.heatingBtuh)} Btu/h  (${r.heatingBtuhPerFt2.toFixed(1)}/ft2)`)
console.log(`  COOLING ${Math.round(r.coolingSensibleBtuh)} sens + ${Math.round(r.coolingLatentBtuh)} lat = ${Math.round(r.coolingTotalBtuh)} Btu/h  (${Math.round(r.coolingFt2PerTon)} ft2/ton, peak ${r.peakHour}:00)`)
console.log(`  UA ${Math.round(r.uaBtuhF)} Btu/h.F, CFM heat ${Math.round(r.totalHeatingCfm)} cool ${Math.round(r.totalCoolingCfm)}`)
console.log('  heating breakdown:', Object.entries(r.heatingBreakdown).map(([k,v]) => `${k}=${Math.round(v as number)}`).join(' '))
console.log('  cooling breakdown:', Object.entries(r.coolingBreakdown).map(([k,v]) => `${k}=${Math.round(v as number)}`).join(' '))

check('heating 20-55 Btu/h per ft2 for a leaky 1978 house', r.heatingBtuhPerFt2 > 20 && r.heatingBtuhPerFt2 < 55)
check('cooling 350-900 ft2/ton in a dry cold-climate house', r.coolingFt2PerTon > 350 && r.coolingFt2PerTon < 900)
check('cooling peak lands mid-to-late afternoon', r.peakHour >= 14 && r.peakHour <= 19, `hour ${r.peakHour}`)
check('latent load near zero in dry climate', r.coolingLatentBtuh < 5000, `= ${Math.round(r.coolingLatentBtuh)}`)
check('room loads sum to house heating', Math.abs(r.rooms.reduce((a,x)=>a+x.heatingBtuh,0) - r.heatingBtuh) < 2)
check('room CFM sums to house heating CFM', Math.abs(r.rooms.reduce((a,x)=>a+x.heatingCfm,0) - r.totalHeatingCfm) < 1)
check('UA x deltaT reproduces heating load', Math.abs(r.uaBtuhF * (70-8) - r.heatingBtuh) < 2)
check('altitude correction applied', r.altitudeFactor < 0.87 && r.altitudeFactor > 0.83, `= ${r.altitudeFactor.toFixed(3)}`)
check('infiltration is a major term in a leaky house', r.heatingBreakdown.infiltration / r.heatingBtuh > 0.15)
check('attic ducts add heating load', r.heatingBreakdown.ducts > 0)

console.log('\n--- sensitivity: does the model respond correctly? ---')
const tight = structuredClone(p); tight.infiltration.ach50 = 2.0
const tightR = computeLoads(tight)
check('tightening 8.5 -> 2.0 ACH50 cuts heating load', tightR.heatingBtuh < r.heatingBtuh * 0.92, `${Math.round(r.heatingBtuh)} -> ${Math.round(tightR.heatingBtuh)}`)
check('  ...and cuts the infiltration term by ~75%', tightR.heatingBreakdown.infiltration < r.heatingBreakdown.infiltration * 0.3,
  `${Math.round(r.heatingBreakdown.infiltration)} -> ${Math.round(tightR.heatingBreakdown.infiltration)}`)

const insulated = structuredClone(p)
insulated.rooms.forEach(rm => { rm.ceiling.assemblyId = 'c-r49'; rm.walls.forEach(w => w.assemblyId = 'w-2x6-r21') })
const insR = computeLoads(insulated)
check('better walls + attic cut heating load', insR.heatingBtuh < r.heatingBtuh * 0.92, `${Math.round(r.heatingBtuh)} -> ${Math.round(insR.heatingBtuh)}`)
check('  ...roughly halving the wall term', insR.heatingBreakdown.walls < r.heatingBreakdown.walls * 0.62,
  `${Math.round(r.heatingBreakdown.walls)} -> ${Math.round(insR.heatingBreakdown.walls)}`)
check('  ...and cutting the ceiling term by half or more', insR.heatingBreakdown.ceiling < r.heatingBreakdown.ceiling * 0.5,
  `${Math.round(r.heatingBreakdown.ceiling)} -> ${Math.round(insR.heatingBreakdown.ceiling)}`)

const ductsIn = structuredClone(p); ductsIn.ducts.boundary = 'conditioned'
const ductsInR = computeLoads(ductsIn)
check('moving ducts inside removes duct load', ductsInR.heatingBreakdown.ducts === 0 && ductsInR.heatingBtuh < r.heatingBtuh)
console.log(`        ducts inside: heating ${Math.round(ductsInR.heatingBtuh)} vs ${Math.round(r.heatingBtuh)}, cooling ${Math.round(ductsInR.coolingTotalBtuh)} vs ${Math.round(r.coolingTotalBtuh)}`)

const seaLevel = structuredClone(p); seaLevel.site.elevationFt = 0
const slR = computeLoads(seaLevel)
check('sea level needs less airflow than 4410 ft for same load', slR.totalHeatingCfm / slR.heatingBtuh < r.totalHeatingCfm / r.heatingBtuh)

// Orientation flip: move all glass to west, cooling should rise
const westGlass = structuredClone(p)
westGlass.rooms.forEach(rm => { rm.walls.forEach(w => w.orientation = 'W'); rm.doors.forEach(d => d.orientation = 'W'); rm.windows.forEach(w => { w.orientation = 'W'; w.overhangDepthFt = 0 }) })
const northGlass = structuredClone(p)
northGlass.rooms.forEach(rm => { rm.walls.forEach(w => w.orientation = 'N'); rm.doors.forEach(d => d.orientation = 'N'); rm.windows.forEach(w => { w.orientation = 'N'; w.overhangDepthFt = 0 }) })
const wR = computeLoads(westGlass), nR = computeLoads(northGlass)
check('all-west glass cools harder than all-north glass', wR.coolingSensibleBtuh > nR.coolingSensibleBtuh * 1.12,
  `W=${Math.round(wR.coolingSensibleBtuh)} N=${Math.round(nR.coolingSensibleBtuh)}`)
check('heating load unchanged by orientation (no solar credit)', Math.abs(wR.heatingBtuh - nR.heatingBtuh) < 1,
  `W=${Math.round(wR.heatingBtuh)} N=${Math.round(nR.heatingBtuh)}`)
check('heating never counts solar gain', r.heatingBreakdown.windowsSolar === 0 && r.heatingBreakdown.internal === 0)
check('west-glass house peaks later than north-glass house', wR.peakHour >= nR.peakHour, `W peak ${wR.peakHour} N peak ${nR.peakHour}`)

console.log('\n--- heat pump balance point ---')
const bins = synthesizeBins(8, 95)
check('synthesized bins total ~8760 h', Math.abs(bins.reduce((a,b)=>a+b.hoursPerYear,0) - 8760) < 1)
const e = analyzeEnergy(p, r.uaBtuhF, r.coolingSensibleBtuh, r.coolingTotalBtuh, bins)
console.log(`  balance point ${e.balance.balancePointF?.toFixed(1) ?? 'none'}F, coverage at design ${(e.balance.designCoverage*100).toFixed(0)}%`)
console.log(`  HP ${Math.round(e.heatPump.heatPumpKwh)} kWh + backup ${Math.round(e.heatPump.backupKwh)} kWh, seasonal COP ${e.heatPump.seasonalCop.toFixed(2)}, cost $${Math.round(e.heatPump.cost)}`)
console.log(`  incumbent gas: ${Math.round(e.incumbent?.fuelUnits ?? 0)} therms, $${Math.round(e.incumbent?.cost ?? 0)}`)
check('capacity falls as it gets colder', capacityAt(p.systems.heatPump, 47) > capacityAt(p.systems.heatPump, 5))
check('balance point sits between design and base temp', e.balance.balancePointF == null || (e.balance.balancePointF > 0 && e.balance.balancePointF < 62))
check('seasonal COP between 1.5 and 4', e.heatPump.seasonalCop > 1.5 && e.heatPump.seasonalCop < 4, `= ${e.heatPump.seasonalCop.toFixed(2)}`)
check('lockout produces zero capacity', capacityAt(p.systems.heatPump, -30) === 0)
// A tiny unit should be short everywhere; an enormous one never short
const tiny = structuredClone(p.systems.heatPump); tiny.points = tiny.points.map(pt => ({...pt, capacityBtuh: pt.capacityBtuh/10}))
const huge = structuredClone(p.systems.heatPump); huge.points = huge.points.map(pt => ({...pt, capacityBtuh: pt.capacityBtuh*5}))
check('undersized unit has a high balance point', (findBalancePoint(tiny, r.uaBtuhF, 62, 8).balancePointF ?? 0) > 45)
check('oversized unit never needs backup', findBalancePoint(huge, r.uaBtuhF, 62, 8).balancePointF === null)

console.log('\n--- other end of the range: tight modern build ---')
const modern = structuredClone(p)
modern.infiltration.ach50 = 1.5
modern.ducts.boundary = 'conditioned'
modern.ventilation = { cfm: 60, kind: 'erv', sensibleRecovery: 0.75, latentRecovery: 0.5 }
modern.rooms.forEach(rm => {
  rm.walls.forEach(w => w.assemblyId = 'w-2x6-r21-ci5')
  rm.windows.forEach(w => w.glazingId = 'g-triple-lowe')
  rm.ceiling.assemblyId = 'c-r60'
  rm.floor = { kind: 'slab', boundary: 'outdoor', areaFt2: rm.floorAreaFt2, assemblyId: 'f-slab-r10', slabPerimeterFt: Math.sqrt(rm.floorAreaFt2) * 2 }
})
const mR = computeLoads(modern)
console.log(`  HEATING ${Math.round(mR.heatingBtuh)} Btu/h (${mR.heatingBtuhPerFt2.toFixed(1)}/ft2)  COOLING ${Math.round(mR.coolingTotalBtuh)} (${Math.round(mR.coolingFt2PerTon)} ft2/ton)`)
check('tight modern build lands under 15 Btu/h per ft2', mR.heatingBtuhPerFt2 < 15, `= ${mR.heatingBtuhPerFt2.toFixed(1)}`)
check('tight modern build is at least 40% lighter than the 1978 house', mR.heatingBtuh < r.heatingBtuh * 0.6)
check('no warnings on a sane modern model', mR.warnings.filter(w => !w.includes('drier')).length === 0, mR.warnings.join(' | '))
const mE = analyzeEnergy(modern, mR.uaBtuhF, mR.coolingSensibleBtuh, mR.coolingTotalBtuh, bins)
check('same heat pump now covers the tight house at design', mE.balance.designCoverage >= 1, `coverage ${(mE.balance.designCoverage*100).toFixed(0)}%`)
check('  ...and needs no backup at all', mE.balance.balancePointF === null || mE.heatPump.backupBtu === 0)

console.log('\n--- degenerate inputs should not explode ---')
const empty = structuredClone(p); empty.rooms = []
const eR = computeLoads(empty)
check('empty project returns finite zeros', Number.isFinite(eR.heatingBtuh) && eR.heatingBtuh === 0 && eR.warnings.length > 0)
const oneRoom = structuredClone(p); oneRoom.rooms = [oneRoom.rooms[0]]
check('single room works', Number.isFinite(computeLoads(oneRoom).heatingBtuh))
const noGlass = structuredClone(p); noGlass.rooms.forEach(rm => rm.windows = [])
check('no windows works', computeLoads(noGlass).coolingBreakdown.windowsSolar === 0)
const hot = structuredClone(p)
hot.design = { ...hot.design, winterOutdoorF: 45, summerOutdoorF: 100, summerMcwbF: 80, dailyRangeF: 14 }
const hotR = computeLoads(hot)
check('humid hot climate produces a real latent load', hotR.coolingLatentBtuh > 4000, `= ${Math.round(hotR.coolingLatentBtuh)}`)
check('humid climate SHR drops below dry climate SHR', hotR.sensibleHeatRatio < r.sensibleHeatRatio,
  `${hotR.sensibleHeatRatio.toFixed(2)} vs ${r.sensibleHeatRatio.toFixed(2)}`)

console.log(fails === 0 ? '\nALL CHECKS PASSED\n' : `\n${fails} CHECK(S) FAILED\n`)
process.exit(fails === 0 ? 0 : 1)
