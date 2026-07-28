// SPDX-License-Identifier: AGPL-3.0-only
import type { HouseResult, Project } from '../types'
import { fmt, fmtTons, hourLabel } from '../lib/sample'
import { downloadText, slugify } from '../lib/storage'
import { BreakdownBars, DesignDayChart, RoomBars } from './charts'
import { Panel, Readout } from './ui'

export function ResultsPanel({ project, result }: { project: Project; result: HouseResult }) {
  const exportCsv = () => {
    const header = [
      'Room',
      'Floor area ft2',
      'Heating Btu/h',
      'Cooling sensible Btu/h',
      'Cooling latent Btu/h',
      'Heating CFM',
      'Cooling CFM',
      'Design CFM',
      'Own peak hour',
    ].join(',')
    const rows = result.rooms.map((r) =>
      [
        `"${r.name.replace(/"/g, '""')}"`,
        Math.round(project.rooms.find((x) => x.id === r.roomId)?.floorAreaFt2 ?? 0),
        Math.round(r.heatingBtuh),
        Math.round(r.coolingSensibleBtuh),
        Math.round(r.coolingLatentBtuh),
        Math.round(r.heatingCfm),
        Math.round(r.coolingCfm),
        Math.round(r.designCfm),
        hourLabel(r.ownPeakHour),
      ].join(','),
    )
    const totals = [
      '"Whole house"',
      Math.round(result.conditionedAreaFt2),
      Math.round(result.heatingBtuh),
      Math.round(result.coolingSensibleBtuh),
      Math.round(result.coolingLatentBtuh),
      Math.round(result.totalHeatingCfm),
      Math.round(result.totalCoolingCfm),
      Math.round(Math.max(result.totalHeatingCfm, result.totalCoolingCfm)),
      hourLabel(result.peakHour),
    ].join(',')
    downloadText(`${slugify(project.name)}-room-loads.csv`, [header, ...rows, totals].join('\n'))
  }

  const latentShare = result.coolingTotalBtuh > 0 ? result.coolingLatentBtuh / result.coolingTotalBtuh : 0

  return (
    <>
      <div className="page-head">
        <h2>Loads</h2>
        <p>
          Heating is a steady-state balance at the winter design temperature with no credit for sunshine or body
          heat. Cooling is walked hour by hour across a July design day and reported at the hour the whole house
          peaks — {hourLabel(result.peakHour)} here — rather than by adding up each surface's own worst moment.
        </p>
      </div>

      {result.warnings.map((w, i) => (
        <div className="notice bad" key={i}>
          {w}
        </div>
      ))}

      <div className="readouts">
        <Readout
          label="Heating load"
          value={fmt(result.heatingBtuh)}
          unit="Btu/h"
          sub={`${result.heatingBtuhPerFt2.toFixed(1)} Btu/h per ft²`}
          tone="heat"
        />
        <Readout
          label="Cooling load"
          value={fmt(result.coolingTotalBtuh)}
          unit="Btu/h"
          sub={`${fmtTons(result.coolingTotalBtuh)} tons · ${fmt(result.coolingFt2PerTon)} ft² per ton`}
          tone="cool"
        />
        <Readout
          label="Sensible heat ratio"
          value={result.sensibleHeatRatio.toFixed(2)}
          sub={latentShare > 0.01 ? `${(latentShare * 100).toFixed(0)}% latent` : 'no dehumidification needed'}
        />
        <Readout
          label="Building conductance"
          value={fmt(result.uaBtuhF)}
          unit="Btu/h·°F"
          sub="what the balance point is built on"
        />
        <Readout
          label="Design airflow"
          value={fmt(Math.max(result.totalHeatingCfm, result.totalCoolingCfm))}
          unit="CFM"
          sub={`${fmt(result.totalHeatingCfm)} heating · ${fmt(result.totalCoolingCfm)} cooling`}
        />
      </div>

      {result.altitudeFactor < 0.96 ? (
        <div className="notice">
          At {fmt(project.site.elevationFt)} ft the air is{' '}
          <strong>{((1 - result.altitudeFactor) * 100).toFixed(0)}% thinner</strong> than at sea level. Every
          airflow figure here already carries that correction — a duct sized off sea-level tables would move the
          right cubic feet and the wrong number of pounds.
        </div>
      ) : null}

      <div className="split">
        <div className="chart-block">
          <h3>Where the heating load goes</h3>
          <p className="lede">Total {fmt(result.heatingBtuh)} Btu/h at {project.design.winterOutdoorF.toFixed(0)}°F outside.</p>
          <BreakdownBars breakdown={result.heatingBreakdown} tone="heat" />
        </div>
        <div className="chart-block">
          <h3>Where the cooling load comes from</h3>
          <p className="lede">
            Sensible {fmt(result.coolingSensibleBtuh)} Btu/h at the {hourLabel(result.peakHour)} peak.
          </p>
          <BreakdownBars breakdown={result.coolingBreakdown} tone="cool" />
        </div>
      </div>

      <div className="chart-block">
        <h3>Cooling load across the design day</h3>
        <p className="lede">
          Mass in the walls and roof delays the outdoor swing, and sun through the glass keeps working for hours
          after it lands. Both push the peak into the late afternoon.
        </p>
        <DesignDayChart result={result} />
      </div>

      <div className="chart-block">
        <h3>Airflow by room</h3>
        <p className="lede">
          Each room gets its share of the total. Where the orange and blue bars disagree, the larger one sets the
          duct — that is the number to hand a duct designer.
        </p>
        <RoomBars result={result} />
      </div>

      <Panel
        title="Room by room"
        actions={
          <button className="btn small" onClick={exportCsv}>
            Export CSV
          </button>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Area</th>
                <th>Heating</th>
                <th>Cooling sens.</th>
                <th>Latent</th>
                <th>Heating CFM</th>
                <th>Cooling CFM</th>
                <th>Design CFM</th>
                <th>Own peak</th>
              </tr>
            </thead>
            <tbody>
              {result.rooms.map((r) => {
                const room = project.rooms.find((x) => x.id === r.roomId)
                return (
                  <tr key={r.roomId}>
                    <td>{r.name}</td>
                    <td>{fmt(room?.floorAreaFt2 ?? 0)}</td>
                    <td className="num-heat">{fmt(r.heatingBtuh)}</td>
                    <td className="num-cool">{fmt(r.coolingSensibleBtuh)}</td>
                    <td>{fmt(r.coolingLatentBtuh)}</td>
                    <td>{fmt(r.heatingCfm)}</td>
                    <td>{fmt(r.coolingCfm)}</td>
                    <td>
                      <strong>{fmt(r.designCfm)}</strong>
                    </td>
                    <td style={{ color: r.ownPeakHour === result.peakHour ? 'var(--ash-dim)' : 'var(--gold)' }}>
                      {hourLabel(r.ownPeakHour)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Whole house</td>
                <td>{fmt(result.conditionedAreaFt2)}</td>
                <td className="num-heat">{fmt(result.heatingBtuh)}</td>
                <td className="num-cool">{fmt(result.coolingSensibleBtuh)}</td>
                <td>{fmt(result.coolingLatentBtuh)}</td>
                <td>{fmt(result.totalHeatingCfm)}</td>
                <td>{fmt(result.totalCoolingCfm)}</td>
                <td>{fmt(Math.max(result.totalHeatingCfm, result.totalCoolingCfm))}</td>
                <td>{hourLabel(result.peakHour)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="panel-note" style={{ marginTop: 12, marginBottom: 0 }}>
          Rooms whose own peak sits at a different hour than the house are marked. A west bedroom peaking at 6pm
          gets less air than its own worst hour needs, which is exactly why it runs warm at dinner time even when
          the thermostat in the hall is satisfied.
        </p>
      </Panel>
    </>
  )
}
