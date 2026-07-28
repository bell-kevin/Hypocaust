// SPDX-License-Identifier: AGPL-3.0-only
// Charts are hand-built SVG. No plotting library, no runtime dependency.

import type { EnergyComparison } from '../lib/energy'
import type { HouseResult, LoadBreakdown, TempBin } from '../types'
import { fmt, hourLabel } from '../lib/sample'

const EMBER = '#ff6b35'
const FRIGID = '#4cc9e8'
const ASH = '#93a5af'
const ASH_DIM = '#61737d'
const GRID = '#2a3a44'

function niceMax(v: number): number {
  if (v <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const norm = v / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return step * mag
}

/**
 * The signature chart. Two lines running in opposite directions: what the
 * building needs as it gets colder, and what the heat pump can actually make.
 * Where they cross is the balance point. Behind both, the hours the site
 * actually spends at each temperature — so the shaded shortfall can be read as
 * a real number of hours per year rather than an abstraction.
 */
export function BalanceChart({
  energy,
  designTempF,
  extremeLowF,
  height = 400,
}: {
  energy: EnergyComparison
  designTempF: number
  extremeLowF?: number
  height?: number
}) {
  const W = 880
  const H = height
  const pad = { top: 22, right: 62, bottom: 46, left: 66 }
  const iw = W - pad.left - pad.right
  const ih = H - pad.top - pad.bottom

  const curve = energy.curve
  if (curve.length < 2) return null

  const tMin = curve[0].tempF
  const tMax = curve[curve.length - 1].tempF
  const yMax = niceMax(
    Math.max(
      ...curve.map((c) => Math.max(c.loadBtuh, c.capacityBtuh)),
      1000,
    ) * 1.08,
  )
  const binMax = Math.max(1, ...energy.binLoad.map((b) => b.hours))

  const x = (t: number) => pad.left + ((t - tMin) / Math.max(1, tMax - tMin)) * iw
  const y = (v: number) => pad.top + ih - (v / yMax) * ih
  const yBin = (h: number) => pad.top + ih - (h / binMax) * ih * 0.5

  const path = (key: 'loadBtuh' | 'capacityBtuh') =>
    curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.tempF).toFixed(1)},${y(c[key]).toFixed(1)}`).join(' ')

  // Shortfall region: load above capacity.
  const short = curve.filter((c) => c.loadBtuh > c.capacityBtuh)
  let shortPath = ''
  if (short.length > 1) {
    const top = short.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.tempF).toFixed(1)},${y(c.loadBtuh).toFixed(1)}`)
    const bottom = [...short]
      .reverse()
      .map((c) => `L${x(c.tempF).toFixed(1)},${y(c.capacityBtuh).toFixed(1)}`)
    shortPath = `${top.join(' ')} ${bottom.join(' ')} Z`
  }

  const bp = energy.balance.balancePointF
  const ticks = 5
  const tempTicks: number[] = []
  const span = tMax - tMin
  const tStep = span > 80 ? 20 : span > 45 ? 10 : 5
  for (let t = Math.ceil(tMin / tStep) * tStep; t <= tMax; t += tStep) tempTicks.push(t)

  const deficitHours = energy.binLoad
    .filter((b) => b.deficitBtuh > 0)
    .reduce((a, b) => a + b.hours, 0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="shortfall" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="7" stroke={EMBER} strokeWidth="1.6" opacity="0.45" />
        </pattern>
      </defs>

      {/* horizontal grid */}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (yMax / ticks) * i
        return (
          <g key={i}>
            <line x1={pad.left} y1={y(v)} x2={pad.left + iw} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={pad.left - 9} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill={ASH_DIM}>
              {fmt(v / 1000, v >= 10000 ? 0 : 1)}k
            </text>
          </g>
        )
      })}

      {/* bin hours behind everything */}
      {energy.binLoad.map((b) => {
        const w = Math.max(2, (iw / Math.max(2, tMax - tMin)) * 5 - 2)
        const bx = x(b.tempF) - w / 2
        if (bx < pad.left - w || bx > pad.left + iw) return null
        return (
          <rect
            key={b.tempF}
            x={bx}
            y={yBin(b.hours)}
            width={w}
            height={Math.max(0, pad.top + ih - yBin(b.hours))}
            fill={ASH}
            opacity="0.17"
          />
        )
      })}

      {shortPath ? <path d={shortPath} fill="url(#shortfall)" stroke="none" /> : null}

      <path className="draw-in" d={path('loadBtuh')} fill="none" stroke={EMBER} strokeWidth="2.4" strokeLinecap="round" />
      <path
        className="draw-in"
        d={path('capacityBtuh')}
        fill="none"
        stroke={FRIGID}
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* published test points */}
      {curve.length > 0 &&
        [47, 17, 5, -13].map((t) => {
          if (t < tMin || t > tMax) return null
          const c = curve.find((p) => p.tempF === t)
          if (!c || c.capacityBtuh <= 0) return null
          return <circle key={t} cx={x(t)} cy={y(c.capacityBtuh)} r="3.2" fill={FRIGID} stroke="#0b1114" strokeWidth="1.2" />
        })}

      {/* design temperature */}
      <line
        x1={x(designTempF)}
        y1={pad.top}
        x2={x(designTempF)}
        y2={pad.top + ih}
        stroke={ASH_DIM}
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <text x={x(designTempF) + 5} y={pad.top + 11} fontSize="10" fill={ASH_DIM}>
        design {designTempF.toFixed(0)}°F
      </text>

      {extremeLowF != null && extremeLowF >= tMin && extremeLowF <= tMax ? (
        <>
          <line
            x1={x(extremeLowF)}
            y1={pad.top}
            x2={x(extremeLowF)}
            y2={pad.top + ih}
            stroke={ASH_DIM}
            strokeWidth="1"
            strokeDasharray="1 5"
            opacity="0.7"
          />
          <text x={x(extremeLowF) + 5} y={pad.top + 25} fontSize="10" fill={ASH_DIM}>
            record {extremeLowF.toFixed(0)}°F
          </text>
        </>
      ) : null}

      {/* balance point */}
      {bp != null && bp > tMin && bp < tMax ? (
        <g>
          <line x1={x(bp)} y1={pad.top} x2={x(bp)} y2={pad.top + ih} stroke="#e9b44c" strokeWidth="1.4" />
          <circle
            cx={x(bp)}
            cy={y(Math.max(0, energy.curve.find((c) => Math.abs(c.tempF - bp) < 1)?.loadBtuh ?? 0))}
            r="5"
            fill="#e9b44c"
            stroke="#0b1114"
            strokeWidth="1.5"
          />
          <text x={x(bp) + 7} y={pad.top + 40} fontSize="11.5" fill="#e9b44c" fontWeight="600">
            balance {bp.toFixed(0)}°F
          </text>
          {deficitHours > 1 ? (
            <text x={x(bp) + 7} y={pad.top + 54} fontSize="10" fill={ASH_DIM}>
              {fmt(deficitHours)} h/yr below
            </text>
          ) : null}
        </g>
      ) : null}

      {/* axes */}
      <line x1={pad.left} y1={pad.top + ih} x2={pad.left + iw} y2={pad.top + ih} stroke={GRID} strokeWidth="1.5" />
      {tempTicks.map((t) => (
        <text key={t} x={x(t)} y={pad.top + ih + 17} textAnchor="middle" fontSize="10.5" fill={ASH_DIM}>
          {t}
        </text>
      ))}
      <text x={pad.left + iw / 2} y={H - 8} textAnchor="middle" fontSize="10.5" fill={ASH_DIM}>
        OUTDOOR TEMPERATURE °F
      </text>
      <text
        x={-(pad.top + ih / 2)}
        y={15}
        transform="rotate(-90)"
        textAnchor="middle"
        fontSize="10.5"
        fill={ASH_DIM}
      >
        THOUSAND BTU/H
      </text>
      <text x={pad.left + iw + 8} y={pad.top + ih - 4} fontSize="9.5" fill={ASH_DIM}>
        hours
      </text>
      <text x={pad.left + iw + 8} y={pad.top + ih + 8} fontSize="9.5" fill={ASH_DIM}>
        per year
      </text>
    </svg>
  )
}

const BREAKDOWN_KEYS: { key: keyof LoadBreakdown; label: string }[] = [
  { key: 'walls', label: 'Walls' },
  { key: 'ceiling', label: 'Ceiling' },
  { key: 'floor', label: 'Floor' },
  { key: 'windowsConduction', label: 'Windows, conduction' },
  { key: 'windowsSolar', label: 'Windows, sun' },
  { key: 'doors', label: 'Doors' },
  { key: 'infiltration', label: 'Air leakage' },
  { key: 'ventilation', label: 'Ventilation' },
  { key: 'internal', label: 'People and appliances' },
  { key: 'ducts', label: 'Ducts' },
]

/** Where the load actually comes from, sorted largest first. */
export function BreakdownBars({ breakdown, tone }: { breakdown: LoadBreakdown; tone: 'heat' | 'cool' }) {
  const rows = BREAKDOWN_KEYS.map((k) => ({ ...k, value: breakdown[k.key] })).filter(
    (r) => Math.abs(r.value) > 1,
  )
  rows.sort((a, b) => b.value - a.value)
  const total = rows.reduce((a, r) => a + Math.max(0, r.value), 0)
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)))
  const color = tone === 'heat' ? EMBER : FRIGID

  if (rows.length === 0) return <p className="panel-note">Nothing to show yet.</p>

  return (
    <div>
      {rows.map((r) => {
        const pct = total > 0 ? (Math.max(0, r.value) / total) * 100 : 0
        const w = (Math.abs(r.value) / max) * 100
        const negative = r.value < 0
        return (
          <div
            key={r.key}
            style={{ display: 'grid', gridTemplateColumns: '160px 1fr 92px 52px', gap: 10, alignItems: 'center', padding: '3px 0' }}
          >
            <span style={{ fontSize: 12.5, color: ASH }}>{r.label}</span>
            <span style={{ background: '#0e161a', height: 12, borderRadius: 2, overflow: 'hidden' }}>
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${w}%`,
                  background: negative ? ASH_DIM : color,
                  opacity: negative ? 0.5 : 0.85,
                  transition: 'width 220ms ease-out',
                }}
              />
            </span>
            <span
              style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
            >
              {fmt(r.value)}
            </span>
            <span
              style={{ fontFamily: 'var(--mono)', fontSize: 11, textAlign: 'right', color: ASH_DIM, fontVariantNumeric: 'tabular-nums' }}
            >
              {pct.toFixed(0)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** The cooling load across the design day, with the peak hour called out. */
export function DesignDayChart({ result }: { result: HouseResult }) {
  const W = 880
  const H = 200
  const pad = { top: 16, right: 16, bottom: 34, left: 62 }
  const iw = W - pad.left - pad.right
  const ih = H - pad.top - pad.bottom
  const data = result.hourlyCoolingSensible
  const yMax = niceMax(Math.max(...data, 1000) * 1.1)
  const x = (h: number) => pad.left + (h / 23) * iw
  const y = (v: number) => pad.top + ih - (Math.max(0, v) / yMax) * ih

  const line = data.map((v, h) => `${h === 0 ? 'M' : 'L'}${x(h).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(23)},${pad.top + ih} L${x(0)},${pad.top + ih} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.left} y1={y(yMax * f)} x2={pad.left + iw} y2={y(yMax * f)} stroke={GRID} strokeWidth="1" />
          <text x={pad.left - 8} y={y(yMax * f) + 4} textAnchor="end" fontSize="10" fill={ASH_DIM}>
            {fmt((yMax * f) / 1000, 1)}k
          </text>
        </g>
      ))}
      <path d={area} fill={FRIGID} opacity="0.1" />
      <path className="draw-in" d={line} fill="none" stroke={FRIGID} strokeWidth="2.2" strokeLinejoin="round" />
      <line
        x1={x(result.peakHour)}
        y1={pad.top}
        x2={x(result.peakHour)}
        y2={pad.top + ih}
        stroke="#e9b44c"
        strokeWidth="1.4"
      />
      <circle cx={x(result.peakHour)} cy={y(data[result.peakHour])} r="4.5" fill="#e9b44c" stroke="#0b1114" strokeWidth="1.4" />
      <text x={x(result.peakHour) + 7} y={pad.top + 13} fontSize="11" fill="#e9b44c" fontWeight="600">
        peak {hourLabel(result.peakHour)}
      </text>
      {[0, 4, 8, 12, 16, 20, 23].map((h) => (
        <text key={h} x={x(h)} y={pad.top + ih + 16} textAnchor="middle" fontSize="10" fill={ASH_DIM}>
          {hourLabel(h)}
        </text>
      ))}
      <text x={pad.left + iw / 2} y={H - 4} textAnchor="middle" fontSize="10" fill={ASH_DIM}>
        SOLAR TIME, JULY DESIGN DAY
      </text>
    </svg>
  )
}

/** A year of hours, laid out as a temperature scale with the design points on it. */
export function TemperatureStrip({
  bins,
  heating99,
  cooling1,
  extremeLow,
  extremeHigh,
}: {
  bins: TempBin[]
  heating99: number
  cooling1: number
  extremeLow?: number
  extremeHigh?: number
}) {
  if (bins.length === 0) return null
  const W = 880
  const H = 78
  const pad = { left: 12, right: 12, top: 6, bottom: 26 }
  const iw = W - pad.left - pad.right
  const lo = Math.min(bins[0].centerF, extremeLow ?? bins[0].centerF)
  const hi = Math.max(bins[bins.length - 1].centerF, extremeHigh ?? bins[bins.length - 1].centerF)
  const x = (t: number) => pad.left + ((t - lo) / Math.max(1, hi - lo)) * iw
  const maxHours = Math.max(...bins.map((b) => b.hoursPerYear), 1)
  const barH = 30

  const mix = (t: number) => {
    const f = Math.max(0, Math.min(1, (t - lo) / Math.max(1, hi - lo)))
    const c1 = [28, 125, 153]
    const c2 = [255, 107, 53]
    return `rgb(${c1.map((c, i) => Math.round(c + (c2[i] - c) * f)).join(',')})`
  }

  const marker = (t: number, label: string, color: string) => (
    <g key={label}>
      <line x1={x(t)} y1={pad.top - 2} x2={x(t)} y2={pad.top + barH + 5} stroke={color} strokeWidth="1.6" />
      <text x={x(t)} y={pad.top + barH + 18} textAnchor="middle" fontSize="10" fill={color}>
        {label} {t.toFixed(0)}°
      </text>
    </g>
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" preserveAspectRatio="none">
      {bins.map((b) => {
        const w = Math.max(1.5, iw / bins.length - 1)
        return (
          <rect
            key={b.centerF}
            x={x(b.centerF) - w / 2}
            y={pad.top + barH - (b.hoursPerYear / maxHours) * barH}
            width={w}
            height={(b.hoursPerYear / maxHours) * barH}
            fill={mix(b.centerF)}
            opacity="0.85"
          />
        )
      })}
      <line x1={pad.left} y1={pad.top + barH} x2={pad.left + iw} y2={pad.top + barH} stroke={GRID} strokeWidth="1" />
      {marker(heating99, 'heating 99%', EMBER)}
      {marker(cooling1, 'cooling 1%', FRIGID)}
      {extremeLow != null ? (
        <text x={x(extremeLow)} y={pad.top + barH + 18} textAnchor="start" fontSize="10" fill={ASH_DIM}>
          {extremeLow.toFixed(0)}°
        </text>
      ) : null}
      {extremeHigh != null ? (
        <text x={x(extremeHigh)} y={pad.top + barH + 18} textAnchor="end" fontSize="10" fill={ASH_DIM}>
          {extremeHigh.toFixed(0)}°
        </text>
      ) : null}
    </svg>
  )
}

/** Per-room airflow, the number that decides duct sizes and register throw. */
export function RoomBars({ result }: { result: HouseResult }) {
  const rooms = [...result.rooms].sort((a, b) => b.designCfm - a.designCfm)
  const max = Math.max(1, ...rooms.map((r) => Math.max(r.heatingCfm, r.coolingCfm)))
  return (
    <div>
      {rooms.map((r) => (
        <div
          key={r.roomId}
          style={{ display: 'grid', gridTemplateColumns: '150px 1fr 70px', gap: 10, alignItems: 'center', padding: '5px 0' }}
        >
          <span style={{ fontSize: 12.5, color: ASH, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.name}
          </span>
          <span style={{ position: 'relative', display: 'block', height: 18 }}>
            <span
              style={{
                position: 'absolute',
                inset: 0,
                background: '#0e161a',
                borderRadius: 2,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: 8,
                width: `${(r.heatingCfm / max) * 100}%`,
                background: EMBER,
                opacity: 0.85,
                borderRadius: 2,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 10,
                height: 8,
                width: `${(r.coolingCfm / max) * 100}%`,
                background: FRIGID,
                opacity: 0.85,
                borderRadius: 2,
              }}
            />
          </span>
          <span
            style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          >
            {fmt(r.designCfm)} cfm
          </span>
        </div>
      ))}
      <div className="legend">
        <span>
          <i style={{ background: EMBER }} />
          heating airflow
        </span>
        <span>
          <i style={{ background: FRIGID }} />
          cooling airflow
        </span>
      </div>
    </div>
  )
}

/** Annual operating cost, side by side. */
export function CostBars({ energy }: { energy: EnergyComparison }) {
  const items = [
    { label: energy.heatPump.backupTherms > 0 ? 'Heat pump + gas backup' : 'Heat pump', value: energy.heatPump.cost, color: FRIGID },
    ...(energy.incumbent ? [{ label: 'Existing system', value: energy.incumbent.cost, color: EMBER }] : []),
  ]
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div>
      {items.map((i) => (
        <div key={i.label} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: ASH }}>{i.label}</span>
            <span style={{ fontFamily: 'var(--mono)', color: i.color }}>
              ${fmt(i.value)}
              <span style={{ color: ASH_DIM }}> / season</span>
            </span>
          </div>
          <div style={{ background: '#0e161a', height: 14, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(i.value / max) * 100}%`, background: i.color, opacity: 0.85 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
