import { fetchClimate, synthesizeBins, climateZoneLabel } from '../src/lib/climate'

let fails = 0
function check(name: string, cond: boolean, detail = '') {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${detail}`) }
  else console.log(`  ok    ${name} ${detail}`)
}

// Build a synthetic 10-year hourly record shaped like a Wasatch Front site:
// annual swing about a 52F mean, a 30F diurnal swing, plus weather noise.
function synthYear(years: number) {
  const time: string[] = [], temp: number[] = [], rh: number[] = []
  let seed = 12345
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  for (let y = 0; y < years; y++) {
    for (let d = 0; d < 365; d++) {
      // synoptic weather persists a few days
      const synoptic = (rnd() - 0.5) * 22
      for (let h = 0; h < 24; h++) {
        const annual = 52 - 25 * Math.cos((2 * Math.PI * d) / 365)
        const diurnal = -15 * Math.cos((2 * Math.PI * (h - 3)) / 24)
        const t = annual + diurnal + synoptic
        const date = new Date(Date.UTC(2014 + y, 0, 1 + d, h))
        time.push(date.toISOString().slice(0, 13) + ':00')
        temp.push(Math.round(t * 10) / 10)
        rh.push(Math.max(8, Math.min(95, 70 - (t - 40) * 0.75)))
      }
    }
  }
  return { time, temp, rh }
}

const s = synthYear(10)
console.log(`\n--- synthetic record: ${s.temp.length} hours, min ${Math.min(...s.temp).toFixed(1)} max ${Math.max(...s.temp).toFixed(1)} ---`)

let capturedUrl = ''
;(globalThis as any).fetch = async (url: string) => {
  capturedUrl = url
  return {
    ok: true,
    status: 200,
    json: async () => ({
      latitude: 41.11, longitude: -112.03, elevation: 1344.5,
      utc_offset_seconds: -21600, timezone: 'America/Denver',
      hourly: { time: s.time, temperature_2m: s.temp, relative_humidity_2m: s.rh },
      hourly_units: { temperature_2m: '°F' },
    }),
  }
}

const rec = await fetchClimate(41.11, -112.03, 10)
console.log('  request:', capturedUrl.replace('https://archive-api.open-meteo.com/v1/archive?', ''))
console.log(`  heating 99% ${rec.heating99F}F  99.6% ${rec.heating996F}F`)
console.log(`  cooling 1% ${rec.cooling1F}F  0.4% ${rec.cooling04F}F  MCWB ${rec.mcwb1F}F`)
console.log(`  daily range ${rec.dailyRangeF}F  HDD ${rec.hdd65}  CDD ${rec.cdd65}  ${climateZoneLabel(rec.hdd65, rec.cdd65)}`)
console.log(`  extremes ${rec.extremeLowF}F to ${rec.extremeHighF}F, elevation ${rec.elevationFt} ft, ${rec.bins.length} bins`)

check('request asks for Fahrenheit', capturedUrl.includes('temperature_unit=fahrenheit'))
check('request asks for both hourly variables', capturedUrl.includes('temperature_2m') && capturedUrl.includes('relative_humidity_2m'))
check('request ends on a complete calendar year', /end_date=\d{4}-12-31/.test(capturedUrl))
check('request spans 10 years', (() => {
  const a = /start_date=(\d{4})/.exec(capturedUrl)![1], b = /end_date=(\d{4})/.exec(capturedUrl)![1]
  return Number(b) - Number(a) === 9
})())

check('elevation converted m -> ft', rec.elevationFt === Math.round(1344.5 * 3.28084), `= ${rec.elevationFt}`)
check('99.6% is colder than 99%', rec.heating996F < rec.heating99F)
check('0.4% is hotter than 1%', rec.cooling04F > rec.cooling1F)
check('heating design well above the record low', rec.heating99F > rec.extremeLowF + 4)
check('cooling design below the record high', rec.cooling1F < rec.extremeHighF - 2)
check('MCWB below the dry bulb', rec.mcwb1F < rec.cooling1F && rec.mcwb1F > rec.cooling1F - 40, `${rec.mcwb1F} vs ${rec.cooling1F}`)
check('daily range near the 30F built in', Math.abs(rec.dailyRangeF - 30) < 5, `= ${rec.dailyRangeF}`)

// Percentile correctness against a direct computation
const sorted = [...s.temp].sort((a, b) => a - b)
const p = (f: number) => sorted[Math.round(f * (sorted.length - 1))]
check('99% matches an independent percentile', Math.abs(rec.heating99F - p(0.01)) < 0.15, `${rec.heating99F} vs ${p(0.01).toFixed(1)}`)
check('1% matches an independent percentile', Math.abs(rec.cooling1F - p(0.99)) < 0.15, `${rec.cooling1F} vs ${p(0.99).toFixed(1)}`)

// Degree days: compare against a direct daily-mean computation
let hdd = 0
for (let d = 0; d < s.temp.length / 24; d++) {
  let sum = 0
  for (let h = 0; h < 24; h++) sum += s.temp[d * 24 + h]
  hdd += Math.max(0, 65 - sum / 24)
}
check('HDD within 2% of a direct computation', Math.abs(rec.hdd65 - hdd / 10) / (hdd / 10) < 0.02, `${rec.hdd65} vs ${Math.round(hdd / 10)}`)

const binTotal = rec.bins.reduce((a, b) => a + b.hoursPerYear, 0)
check('bins total about 8760 hours a year', Math.abs(binTotal - 8760) < 40, `= ${binTotal.toFixed(0)}`)
check('bins are ordered and 5F wide', rec.bins.every((b, i) => i === 0 || Math.abs(b.centerF - rec.bins[i-1].centerF - 5) < 1e-6))
check('coldest bin is near the record low', Math.abs(rec.bins[0].centerF - rec.extremeLowF) < 6)

// Missing values must not poison the percentiles
;(globalThis as any).fetch = async () => ({
  ok: true, status: 200,
  json: async () => ({
    elevation: 100,
    hourly: {
      time: s.time.slice(0, 8760),
      temperature_2m: s.temp.slice(0, 8760).map((t, i) => (i % 97 === 0 ? null : t)),
      relative_humidity_2m: s.rh.slice(0, 8760),
    },
  }),
})
const gappy = await fetchClimate(41, -112, 1)
check('gaps in the record are skipped, not read as zero', gappy.heating99F > 0 && gappy.heating99F < 30, `= ${gappy.heating99F}`)

// Error surface
;(globalThis as any).fetch = async () => ({ ok: false, status: 400, text: async () => 'bad date' })
let threw = ''
try { await fetchClimate(41, -112, 5) } catch (e) { threw = (e as Error).message }
check('HTTP errors surface a readable message', threw.includes('400'), `"${threw}"`)

;(globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ hourly: { time: [] } }) })
threw = ''
try { await fetchClimate(41, -112, 5) } catch (e) { threw = (e as Error).message }
check('empty record surfaces a readable message', threw.length > 10, `"${threw}"`)

const sb = synthesizeBins(8, 95)
check('fallback bins total 8760', Math.abs(sb.reduce((a,b)=>a+b.hoursPerYear,0) - 8760) < 1)
check('fallback bins span the design range', sb[0].centerF < 8 && sb[sb.length-1].centerF > 95)

console.log(fails === 0 ? '\nALL CLIMATE CHECKS PASSED\n' : `\n${fails} FAILED\n`)
process.exit(fails === 0 ? 0 : 1)
