// SPDX-License-Identifier: AGPL-3.0-only
import type { HouseResult, Project } from '../types'
import { findAssembly, findGlazing } from '../lib/assemblies'
import { naturalAch } from '../lib/loads'
import { climateZoneLabel } from '../lib/climate'
import { fmt, fmtTons, hourLabel } from '../lib/sample'
import { Panel } from './ui'

export function ReportPanel({ project, result }: { project: Project; result: HouseResult }) {
  const c = project.climate
  const glazingArea = project.rooms.reduce((a, r) => a + r.windows.reduce((s, w) => s + w.areaFt2, 0), 0)
  const glazingRatio = result.conditionedAreaFt2 > 0 ? glazingArea / result.conditionedAreaFt2 : 0

  const usedAssemblies = new Map<string, number>()
  for (const room of project.rooms) {
    for (const w of room.walls) usedAssemblies.set(w.assemblyId, (usedAssemblies.get(w.assemblyId) ?? 0) + w.grossAreaFt2)
    usedAssemblies.set(room.ceiling.assemblyId, (usedAssemblies.get(room.ceiling.assemblyId) ?? 0) + room.ceiling.areaFt2)
    usedAssemblies.set(room.floor.assemblyId, (usedAssemblies.get(room.floor.assemblyId) ?? 0) + room.floor.areaFt2)
  }
  const usedGlazing = new Map<string, number>()
  for (const room of project.rooms) {
    for (const w of room.windows) usedGlazing.set(w.glazingId, (usedGlazing.get(w.glazingId) ?? 0) + w.areaFt2)
  }

  return (
    <>
      <div className="page-head">
        <h2>Report</h2>
        <p className="no-print">
          Everything the calculation rests on, in one place. Print this to PDF from your browser and it lays out
          on paper without the interface around it.
        </p>
      </div>

      <div className="btn-row no-print" style={{ marginBottom: 18 }}>
        <button className="btn primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>

      <div className="report-body">
        <Panel title="Job">
          <div className="table-wrap">
            <table>
              <tbody>
                <Row k="Project" v={project.name} />
                <Row k="Location" v={project.site.label} />
                <Row
                  k="Coordinates"
                  v={`${project.site.latitude.toFixed(3)}, ${project.site.longitude.toFixed(3)} · ${fmt(project.site.elevationFt)} ft`}
                />
                <Row k="Conditioned area" v={`${fmt(result.conditionedAreaFt2)} ft² over ${fmt(result.volumeFt3)} ft³`} />
                <Row k="Glazing" v={`${fmt(glazingArea)} ft², ${(glazingRatio * 100).toFixed(1)}% of floor area`} />
                <Row k="Prepared" v={new Date().toLocaleDateString()} />
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Design conditions">
          <div className="table-wrap">
            <table>
              <tbody>
                <Row
                  k="Winter design"
                  v={`${project.design.winterOutdoorF.toFixed(0)}°F outdoor, ${project.design.indoorWinterF.toFixed(0)}°F indoor`}
                />
                <Row
                  k="Summer design"
                  v={`${project.design.summerOutdoorF.toFixed(0)}°F dry bulb / ${project.design.summerMcwbF.toFixed(0)}°F wet bulb, ${project.design.indoorSummerF.toFixed(0)}°F and ${project.design.indoorSummerRh.toFixed(0)}% RH indoor`}
                />
                <Row k="Summer daily range" v={`${project.design.dailyRangeF.toFixed(0)}°F`} />
                <Row
                  k="Source"
                  v={
                    c
                      ? `Percentiles of ${c.endYear - c.startYear + 1} years of hourly reanalysis, ${c.startYear}–${c.endYear}`
                      : 'Entered by hand'
                  }
                />
                {c ? (
                  <>
                    <Row k="Degree days" v={`${fmt(c.hdd65)} heating, ${fmt(c.cdd65)} cooling, base 65°F`} />
                    <Row k="Climate zone" v={climateZoneLabel(c.hdd65, c.cdd65)} />
                    <Row k="Record range in that period" v={`${c.extremeLowF.toFixed(0)}°F to ${c.extremeHighF.toFixed(0)}°F`} />
                  </>
                ) : null}
                <Row
                  k="Altitude correction"
                  v={`${result.altitudeFactor.toFixed(3)} — airflow constants scaled from 1.08 to ${(1.08 * result.altitudeFactor).toFixed(3)} Btu/h per CFM per °F`}
                />
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Envelope">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Assembly</th>
                  <th>R-value</th>
                  <th>Area</th>
                </tr>
              </thead>
              <tbody>
                {[...usedAssemblies.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, area]) => {
                    const a = findAssembly(id)
                    return (
                      <tr key={id}>
                        <td>{a.label}</td>
                        <td>{a.fFactor != null ? `F-${a.fFactor}` : `R-${a.rValue}`}</td>
                        <td>{fmt(area)} ft²</td>
                      </tr>
                    )
                  })}
                {[...usedGlazing.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, area]) => {
                    const g = findGlazing(id)
                    return (
                      <tr key={id}>
                        <td>{g.label}</td>
                        <td>
                          U-{g.uValue} · SHGC {g.shgc}
                        </td>
                        <td>{fmt(area)} ft²</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <tbody>
                <Row
                  k="Air leakage"
                  v={
                    project.infiltration.method === 'ach50'
                      ? `${project.infiltration.ach50} ACH50, working out to ${naturalAch(project).toFixed(2)} natural air changes per hour`
                      : `${project.infiltration.achNatural} natural air changes per hour, estimated`
                  }
                />
                <Row
                  k="Ventilation"
                  v={
                    project.ventilation.kind === 'none'
                      ? 'None'
                      : `${project.ventilation.cfm} CFM, ${project.ventilation.kind.toUpperCase()}`
                  }
                />
                <Row
                  k="Ducts"
                  v={
                    project.ducts.boundary === 'conditioned'
                      ? 'Inside the conditioned envelope — no duct load'
                      : `In the ${project.ducts.boundary.replace(/-/g, ' ')}, R-${project.ducts.rValue}, ${(project.ducts.leakageFraction * 100).toFixed(0)}% leakage`
                  }
                />
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Results">
          <div className="table-wrap">
            <table>
              <tbody>
                <Row k="Heating load" v={`${fmt(result.heatingBtuh)} Btu/h · ${result.heatingBtuhPerFt2.toFixed(1)} Btu/h per ft²`} />
                <Row
                  k="Cooling load"
                  v={`${fmt(result.coolingTotalBtuh)} Btu/h total — ${fmt(result.coolingSensibleBtuh)} sensible, ${fmt(result.coolingLatentBtuh)} latent · ${fmtTons(result.coolingTotalBtuh)} tons`}
                />
                <Row k="Cooling peak hour" v={`${hourLabel(result.peakHour)} solar time, July design day`} />
                <Row k="Sensible heat ratio" v={result.sensibleHeatRatio.toFixed(2)} />
                <Row k="Building conductance" v={`${fmt(result.uaBtuhF)} Btu/h·°F`} />
                <Row
                  k="Design airflow"
                  v={`${fmt(result.totalHeatingCfm)} CFM heating, ${fmt(result.totalCoolingCfm)} CFM cooling`}
                />
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Room loads">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Heating Btu/h</th>
                  <th>Cooling Btu/h</th>
                  <th>Design CFM</th>
                </tr>
              </thead>
              <tbody>
                {result.rooms.map((r) => (
                  <tr key={r.roomId}>
                    <td>{r.name}</td>
                    <td>{fmt(r.heatingBtuh)}</td>
                    <td>{fmt(r.coolingSensibleBtuh + r.coolingLatentBtuh)}</td>
                    <td>{fmt(r.designCfm)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Whole house</td>
                  <td>{fmt(result.heatingBtuh)}</td>
                  <td>{fmt(result.coolingTotalBtuh)}</td>
                  <td>{fmt(Math.max(result.totalHeatingCfm, result.totalCoolingCfm))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <Panel title="Method and limits">
          <p>
            Heating is a steady-state balance at the winter design temperature. Nothing is credited for solar gain
            or internal heat, which is the conventional and safe assumption for equipment that has to work at four
            in the morning.
          </p>
          <p>
            Cooling walks all 24 hours of a July design day. Outdoor temperature follows the daily range profile;
            opaque surfaces are driven by a sol-air temperature that is delayed and flattened by the mass of each
            assembly; sun through glass is split into an immediate part and a radiant part that shows up over the
            following three hours. Solar geometry is computed from the site's latitude with a clear-sky irradiance
            model, and overhangs are shaded by profile angle. The reported load is the largest hourly total for the
            whole house, not the sum of each surface's individual worst hour.
          </p>
          <p>
            Air density is corrected for elevation throughout, so airflow constants shrink as the site rises.
            Infiltration is converted from a blower door result with the leakage-area divisor approach, adjusted
            for stories, wind shielding, and climate severity.
          </p>
          <p>
            This is a physics model built from published methods, not a certified implementation of any
            proprietary standard, and it carries no approval from any trade body. It will not stand in for a
            stamped submittal where a jurisdiction demands one. Treat it as a serious second opinion: enough to
            check whether a quote is sized to the building or to a rule of thumb, and enough to see what changes
            when you improve the envelope instead of the equipment.
          </p>
        </Panel>
      </div>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td style={{ textAlign: 'left', fontFamily: 'var(--body)', color: 'var(--ash)', width: 220 }}>{k}</td>
      <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{v}</td>
    </tr>
  )
}
