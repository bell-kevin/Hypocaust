// SPDX-License-Identifier: AGPL-3.0-only
import type { FuelKind, HouseResult, Project, TempBin } from '../types'
import { analyzeEnergy, capacityAt, HEAT_PUMP_PRESETS } from '../lib/energy'
import { synthesizeBins } from '../lib/climate'
import { fmt, fmtMoney, fmtTons } from '../lib/sample'
import { BalanceChart, CostBars } from './charts'
import { NumberInput, Panel, Readout, Select, TextInput } from './ui'

const FUELS: { value: FuelKind; label: string }[] = [
  { value: 'gas', label: 'Natural gas' },
  { value: 'electric-resistance', label: 'Electric resistance' },
  { value: 'propane', label: 'Propane' },
  { value: 'oil', label: 'Fuel oil' },
  { value: 'none', label: 'Nothing to compare' },
]

export function EquipmentPanel({
  project,
  update,
  result,
}: {
  project: Project
  update: (fn: (p: Project) => Project) => void
  result: HouseResult
}) {
  const bins: TempBin[] =
    project.climate?.bins && project.climate.bins.length > 0
      ? project.climate.bins
      : synthesizeBins(project.design.winterOutdoorF, project.design.summerOutdoorF)
  const synthetic = !(project.climate?.bins && project.climate.bins.length > 0)

  const energy = analyzeEnergy(
    project,
    result.uaBtuhF,
    result.coolingSensibleBtuh,
    result.coolingTotalBtuh,
    bins,
  )
  const spec = project.systems.heatPump
  const coolingMargin =
    result.coolingTotalBtuh > 0 ? spec.coolingCapacityBtuh / result.coolingTotalBtuh : 1

  const setSpec = (patch: Partial<typeof spec>) =>
    update((p) => ({ ...p, systems: { ...p.systems, heatPump: { ...p.systems.heatPump, ...patch } } }))

  const setPoint = (index: number, patch: Partial<(typeof spec.points)[number]>) =>
    setSpec({ points: spec.points.map((pt, i) => (i === index ? { ...pt, ...patch } : pt)) })

  const bp = energy.balance.balancePointF

  return (
    <>
      <div className="page-head">
        <h2>Equipment and balance point</h2>
        <p>
          A heat pump loses capacity exactly as the building's demand grows. Where the two curves cross is the
          balance point, and everything colder than that has to come from somewhere else. Enter the capacity your
          candidate unit publishes at each rating temperature and read the crossing directly.
        </p>
      </div>

      <div className="chart-block">
        <h3>Building load against heat pump capacity</h3>
        <p className="lede">
          Orange is what the house needs. Blue is what the unit can make, with dots at its published test points.
          The hatched wedge is the shortfall your backup heat has to cover, drawn over the hours this site
          actually spends at each temperature.
        </p>
        <BalanceChart
          energy={energy}
          designTempF={project.design.winterOutdoorF}
          extremeLowF={project.climate?.extremeLowF}
        />
        <div className="legend">
          <span>
            <i style={{ background: '#ff6b35' }} />
            building load
          </span>
          <span>
            <i style={{ background: '#4cc9e8' }} />
            heat pump capacity
          </span>
          <span>
            <i style={{ background: '#e9b44c' }} />
            balance point
          </span>
          <span>
            <i style={{ background: '#93a5af', opacity: 0.35 }} />
            hours per year at that temperature
          </span>
        </div>
      </div>

      {synthetic ? (
        <div className="notice">
          No weather record loaded, so the hours behind the chart are a smooth estimate from your design
          temperatures. Pull real weather on the site page and the annual energy and cost figures below become
          site-specific.
        </div>
      ) : null}

      <div className="readouts">
        <Readout
          label="Balance point"
          value={bp == null ? 'none' : `${bp.toFixed(0)}°`}
          sub={
            bp == null
              ? 'covers the load all the way down'
              : `${fmt(energy.heatPump.hoursWithBackup)} hours a year below it`
          }
        />
        <Readout
          label="Capacity at design"
          value={fmt(energy.balance.capacityAtDesign)}
          unit="Btu/h"
          sub={`${(energy.balance.designCoverage * 100).toFixed(0)}% of the ${fmt(result.heatingBtuh)} Btu/h load`}
          tone="cool"
        />
        <Readout
          label="Backup heat needed"
          value={fmt(energy.heatPump.backupBtu / 1e6, 1)}
          unit="MMBtu/yr"
          sub={
            energy.heatPump.backupKwh > 0
              ? `${fmt(energy.heatPump.backupKwh)} kWh of resistance heat`
              : energy.heatPump.backupTherms > 0
                ? `${fmt(energy.heatPump.backupTherms)} therms`
                : 'none'
          }
        />
        <Readout
          label="Seasonal efficiency"
          value={energy.heatPump.seasonalCop.toFixed(2)}
          unit="COP"
          sub={`${fmt(energy.heatPump.heatPumpKwh)} kWh through the compressor`}
        />
        <Readout
          label="Cooling capacity"
          value={`${(coolingMargin * 100).toFixed(0)}%`}
          sub={`${fmtTons(spec.coolingCapacityBtuh)} tons against a ${fmtTons(result.coolingTotalBtuh)} ton load`}
          tone="cool"
        />
      </div>

      <SizingVerdict
        coverage={energy.balance.designCoverage}
        coolingMargin={coolingMargin}
        balancePoint={bp}
        capacityAtRecord={
          project.climate ? capacityAt(spec, project.climate.extremeLowF) : null
        }
        recordLow={project.climate?.extremeLowF ?? null}
      />

      <Panel
        title="Heat pump"
        note="Manufacturers publish capacity and COP at 47, 17, and 5°F, and cold-climate units add a point near −13°F. Copy those numbers straight off the submittal or the NEEP listing."
        actions={
          <Select
            value=""
            onChange={(id) => {
              const preset = HEAT_PUMP_PRESETS.find((p) => p.id === id)
              if (preset) setSpec(preset.build())
            }}
            options={[{ value: '', label: 'Load a starting point…' }, ...HEAT_PUMP_PRESETS.map((p) => ({ value: p.id, label: p.label }))]}
          />
        }
      >
        <div className="grid cols-4" style={{ marginBottom: 16 }}>
          <TextInput label="Model or label" value={spec.label} onChange={(v) => setSpec({ label: v })} />
          <NumberInput
            label="Cooling capacity"
            value={spec.coolingCapacityBtuh}
            onChange={(v) => setSpec({ coolingCapacityBtuh: v })}
            suffix="Btu/h"
            min={0}
          />
          <NumberInput label="SEER2" value={spec.seer2} onChange={(v) => setSpec({ seer2: v })} min={6} max={40} />
          <NumberInput
            label="Compressor lockout"
            value={spec.lockoutF}
            onChange={(v) => setSpec({ lockoutF: v })}
            suffix="°F"
            min={-40}
            max={45}
            hint="Below this it stops entirely"
          />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rating point</th>
                <th>Heating capacity</th>
                <th>COP</th>
                <th>Building load there</th>
                <th>Margin</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {spec.points.map((pt, i) => {
                const load = Math.max(0, result.uaBtuhF * (project.systems.balanceBaseF - pt.tempF))
                const margin = load > 0 ? pt.capacityBtuh / load : 2
                return (
                  <tr key={i}>
                    <td>
                      <NumberInput value={pt.tempF} onChange={(v) => setPoint(i, { tempF: v })} suffix="°F" />
                    </td>
                    <td>
                      <NumberInput
                        value={pt.capacityBtuh}
                        onChange={(v) => setPoint(i, { capacityBtuh: v })}
                        suffix="Btu/h"
                        min={0}
                      />
                    </td>
                    <td>
                      <NumberInput value={pt.cop} onChange={(v) => setPoint(i, { cop: v })} min={0.5} max={7} step={0.05} />
                    </td>
                    <td>{fmt(load)}</td>
                    <td className={margin >= 1 ? 'num-cool' : 'num-heat'}>{(margin * 100).toFixed(0)}%</td>
                    <td>
                      <button
                        className="icon-btn"
                        title="Remove rating point"
                        onClick={() => setSpec({ points: spec.points.filter((_, j) => j !== i) })}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            className="btn small"
            onClick={() =>
              setSpec({
                points: [...spec.points, { tempF: 35, capacityBtuh: spec.points[0]?.capacityBtuh ?? 24000, cop: 3 }],
              })
            }
          >
            Add rating point
          </button>
        </div>
      </Panel>

      <Panel title="Backup heat and the system it replaces">
        <div className="grid cols-4">
          <Select<FuelKind>
            label="Backup heat"
            value={project.systems.backup.fuel}
            onChange={(v) =>
              update((p) => ({ ...p, systems: { ...p.systems, backup: { ...p.systems.backup, fuel: v } } }))
            }
            options={FUELS}
          />
          <NumberInput
            label="Backup efficiency"
            value={project.systems.backup.efficiency}
            onChange={(v) =>
              update((p) => ({ ...p, systems: { ...p.systems, backup: { ...p.systems.backup, efficiency: v } } }))
            }
            min={0.5}
            max={1}
            step={0.01}
            hint="1.00 for resistance strips"
          />
          <Select<FuelKind>
            label="Existing system"
            value={project.systems.incumbent.fuel}
            onChange={(v) =>
              update((p) => ({ ...p, systems: { ...p.systems, incumbent: { ...p.systems.incumbent, fuel: v } } }))
            }
            options={FUELS}
          />
          <NumberInput
            label="Existing efficiency"
            value={project.systems.incumbent.efficiency}
            onChange={(v) =>
              update((p) => ({
                ...p,
                systems: { ...p.systems, incumbent: { ...p.systems.incumbent, efficiency: v } },
              }))
            }
            min={0.5}
            max={1}
            step={0.01}
            hint="AFUE as a decimal — 0.80 or 0.95"
          />
        </div>
      </Panel>

      <Panel title="Energy prices" note="Use the all-in rate off a recent bill, including delivery and fixed charges spread over usage.">
        <div className="grid cols-4">
          <NumberInput
            label="Electricity"
            value={project.systems.rates.electricPerKwh}
            onChange={(v) => setRate(update, { electricPerKwh: v })}
            suffix="$/kWh"
            min={0}
            step={0.001}
          />
          <NumberInput
            label="Natural gas"
            value={project.systems.rates.gasPerTherm}
            onChange={(v) => setRate(update, { gasPerTherm: v })}
            suffix="$/therm"
            min={0}
            step={0.01}
          />
          <NumberInput
            label="Propane"
            value={project.systems.rates.propanePerGal}
            onChange={(v) => setRate(update, { propanePerGal: v })}
            suffix="$/gal"
            min={0}
            step={0.01}
          />
          <NumberInput
            label="Fuel oil"
            value={project.systems.rates.oilPerGal}
            onChange={(v) => setRate(update, { oilPerGal: v })}
            suffix="$/gal"
            min={0}
            step={0.01}
          />
        </div>
      </Panel>

      <div className="split">
        <div className="chart-block">
          <h3>Heating season operating cost</h3>
          <p className="lede">
            {fmt(energy.annualHeatingBtu / 1e6, 1)} million Btu of heat delivered across the year, priced at the
            rates above.
          </p>
          <CostBars energy={energy} />
          {energy.savings != null ? (
            <p className="lede" style={{ marginTop: 8, marginBottom: 0 }}>
              {energy.savings >= 0 ? (
                <>
                  The heat pump comes out <strong style={{ color: 'var(--frigid)' }}>{fmtMoney(energy.savings)} cheaper</strong> a
                  season at these prices.
                </>
              ) : (
                <>
                  The heat pump costs <strong style={{ color: 'var(--ember)' }}>{fmtMoney(-energy.savings)} more</strong> a
                  season at these prices. Cheap gas and expensive electricity do that; the comparison flips as the
                  ratio between them changes.
                </>
              )}
            </p>
          ) : null}
        </div>

        <Panel title="Season at a glance">
          <div className="table-wrap">
            <table>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'left', fontFamily: 'var(--body)' }}>Compressor electricity</td>
                  <td>{fmt(energy.heatPump.heatPumpKwh)} kWh</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left', fontFamily: 'var(--body)' }}>Backup heat</td>
                  <td>
                    {energy.heatPump.backupKwh > 0
                      ? `${fmt(energy.heatPump.backupKwh)} kWh`
                      : energy.heatPump.backupTherms > 0
                        ? `${fmt(energy.heatPump.backupTherms)} therms`
                        : '—'}
                  </td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left', fontFamily: 'var(--body)' }}>Hours needing backup</td>
                  <td>{fmt(energy.heatPump.hoursWithBackup)} h</td>
                </tr>
                {energy.incumbent ? (
                  <tr>
                    <td style={{ textAlign: 'left', fontFamily: 'var(--body)' }}>Existing system fuel</td>
                    <td>
                      {fmt(energy.incumbent.fuelUnits)} {energy.incumbent.unitLabel}
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <td style={{ textAlign: 'left', fontFamily: 'var(--body)' }}>Cooling electricity</td>
                  <td>{fmt(energy.cooling.kwh)} kWh</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left', fontFamily: 'var(--body)' }}>Cooling cost</td>
                  <td>{fmtMoney(energy.cooling.cost)}</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left', fontFamily: 'var(--body)' }}>Equivalent full-load cooling hours</td>
                  <td>{fmt(energy.cooling.equivalentFullLoadHours)} h</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  )
}

function setRate(update: (fn: (p: Project) => Project) => void, patch: Partial<Project['systems']['rates']>) {
  update((p) => ({ ...p, systems: { ...p.systems, rates: { ...p.systems.rates, ...patch } } }))
}

function SizingVerdict({
  coverage,
  coolingMargin,
  balancePoint,
  capacityAtRecord,
  recordLow,
}: {
  coverage: number
  coolingMargin: number
  balancePoint: number | null
  capacityAtRecord: number | null
  recordLow: number | null
}) {
  const notes: { tone: 'good' | 'bad' | ''; text: string }[] = []

  if (coverage >= 1) {
    notes.push({
      tone: 'good',
      text: `This unit carries the whole heating load at the design temperature on its own${balancePoint == null ? ', with margin below it' : ''}.`,
    })
  } else if (coverage >= 0.85) {
    notes.push({
      tone: '',
      text: `Covers ${(coverage * 100).toFixed(0)}% of the design load. The gap is small and short — backup heat will run, but rarely.`,
    })
  } else {
    notes.push({
      tone: 'bad',
      text: `Covers only ${(coverage * 100).toFixed(0)}% of the design load. Either size up, tighten the envelope, or plan for backup heat to do real work.`,
    })
  }

  if (coolingMargin > 1.35) {
    notes.push({
      tone: 'bad',
      text: `Cooling capacity is ${(coolingMargin * 100).toFixed(0)}% of the load. Oversized cooling short-cycles, never pulls moisture out, and leaves the house clammy — a smaller unit that runs longer usually feels better.`,
    })
  } else if (coolingMargin < 0.9) {
    notes.push({
      tone: 'bad',
      text: `Cooling capacity is only ${(coolingMargin * 100).toFixed(0)}% of the load; expect it to fall behind on design days.`,
    })
  }

  if (capacityAtRecord != null && recordLow != null && capacityAtRecord <= 0) {
    notes.push({
      tone: 'bad',
      text: `The compressor locks out before ${recordLow.toFixed(0)}°F, which this site has actually seen. Backup heat has to carry the house alone at that point.`,
    })
  }

  return (
    <>
      {notes.map((n, i) => (
        <div className={`notice${n.tone ? ` ${n.tone}` : ''}`} key={i}>
          {n.text}
        </div>
      ))}
    </>
  )
}
