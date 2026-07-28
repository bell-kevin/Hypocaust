// SPDX-License-Identifier: AGPL-3.0-only
import type { Boundary, Project, Shielding } from '../types'
import { conditionedVolume, naturalAch } from '../lib/loads'
import { fmt } from '../lib/sample'
import { NumberInput, Panel, Select } from './ui'

const BOUNDARY_OPTIONS: { value: Boundary; label: string }[] = [
  { value: 'conditioned', label: 'Inside conditioned space' },
  { value: 'attic', label: 'Vented attic' },
  { value: 'vented-crawl', label: 'Vented crawl space' },
  { value: 'unconditioned-basement', label: 'Unconditioned basement' },
  { value: 'garage', label: 'Attached garage' },
  { value: 'outdoor', label: 'Outdoors' },
]

export function EnvelopePanel({
  project,
  update,
}: {
  project: Project
  update: (fn: (p: Project) => Project) => void
}) {
  const { infiltration: inf, ventilation: vent, ducts } = project
  const ach = naturalAch(project)
  const volume = conditionedVolume(project.rooms)
  const cfm50 = (inf.ach50 * volume) / 60
  const area = project.rooms.reduce((a, r) => a + r.floorAreaFt2, 0)
  const ashrae622 = 0.03 * area + 7.5 * (estimateBedrooms(project) + 1)

  return (
    <>
      <div className="page-head">
        <h2>Air leakage, ventilation, and ducts</h2>
        <p>
          On a tight modern house these three lines are small. On a 1970s house with ducts in a vented attic they
          can be a third of the load, and they are the part a contractor's rule of thumb gets most wrong.
        </p>
      </div>

      <Panel
        title="Air leakage"
        note="A blower door number is the honest input. Without one, pick a natural air change rate: 0.35 for a tight new build, 0.5 for average, 0.8 or more for an older house with original windows."
      >
        <div className="grid cols-4">
          <Select
            label="How leakage is known"
            value={inf.method}
            onChange={(v) => update((p) => ({ ...p, infiltration: { ...p.infiltration, method: v } }))}
            options={[
              { value: 'ach50', label: 'Blower door result' },
              { value: 'natural', label: 'Estimated natural rate' },
            ]}
          />
          {inf.method === 'ach50' ? (
            <NumberInput
              label="Blower door"
              value={inf.ach50}
              onChange={(v) => update((p) => ({ ...p, infiltration: { ...p.infiltration, ach50: v } }))}
              suffix="ACH50"
              min={0.2}
              max={40}
              hint={`about ${fmt(cfm50)} CFM50`}
            />
          ) : (
            <NumberInput
              label="Natural air changes"
              value={inf.achNatural}
              onChange={(v) => update((p) => ({ ...p, infiltration: { ...p.infiltration, achNatural: v } }))}
              suffix="ACH"
              min={0.05}
              max={3}
            />
          )}
          <NumberInput
            label="Stories above grade"
            value={inf.stories}
            onChange={(v) => update((p) => ({ ...p, infiltration: { ...p.infiltration, stories: Math.round(v) } }))}
            min={1}
            max={4}
            step={1}
            hint="Taller means more stack effect"
          />
          <Select<Shielding>
            label="Wind shielding"
            value={inf.shielding}
            onChange={(v) => update((p) => ({ ...p, infiltration: { ...p.infiltration, shielding: v } }))}
            options={[
              { value: 'exposed', label: 'Exposed — open country' },
              { value: 'normal', label: 'Normal — some obstructions' },
              { value: 'sheltered', label: 'Sheltered — neighbours and trees' },
              { value: 'well-sheltered', label: 'Well sheltered — dense urban' },
            ]}
          />
        </div>
        <div className="notice" style={{ marginTop: 14, marginBottom: 0 }}>
          Working rate: <strong>{ach.toFixed(2)} natural air changes per hour</strong> over{' '}
          {fmt(volume)} cubic feet. Heating design uses {fmt((ach * 1.4 * volume) / 60)} CFM, cooling design{' '}
          {fmt((ach * 0.8 * volume) / 60)} CFM — leakage runs harder in winter because the temperature difference
          driving it is larger.
        </div>
      </Panel>

      <Panel
        title="Mechanical ventilation"
        note={`ASHRAE 62.2 would ask for roughly ${fmt(ashrae622)} CFM continuous for this floor area and bedroom count. Recovery ventilators hand most of the heat back, which is why they barely move the design load.`}
      >
        <div className="grid cols-4">
          <Select
            label="System"
            value={vent.kind}
            onChange={(v) => update((p) => ({ ...p, ventilation: { ...p.ventilation, kind: v } }))}
            options={[
              { value: 'none', label: 'None' },
              { value: 'exhaust', label: 'Exhaust only' },
              { value: 'supply', label: 'Supply only' },
              { value: 'balanced', label: 'Balanced, no recovery' },
              { value: 'hrv', label: 'HRV — heat recovery' },
              { value: 'erv', label: 'ERV — heat and moisture recovery' },
            ]}
          />
          <NumberInput
            label="Continuous airflow"
            value={vent.cfm}
            onChange={(v) => update((p) => ({ ...p, ventilation: { ...p.ventilation, cfm: v } }))}
            suffix="CFM"
            min={0}
            max={600}
          />
          {vent.kind === 'hrv' || vent.kind === 'erv' ? (
            <NumberInput
              label="Sensible recovery"
              value={vent.sensibleRecovery}
              onChange={(v) => update((p) => ({ ...p, ventilation: { ...p.ventilation, sensibleRecovery: v } }))}
              min={0}
              max={0.95}
              step={0.01}
              hint="0.70 is typical"
            />
          ) : null}
          {vent.kind === 'erv' ? (
            <NumberInput
              label="Latent recovery"
              value={vent.latentRecovery}
              onChange={(v) => update((p) => ({ ...p, ventilation: { ...p.ventilation, latentRecovery: v } }))}
              min={0}
              max={0.9}
              step={0.01}
            />
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Ducts"
        note="Ducts outside the thermal envelope lose heat through their walls and lose air through their seams. Move them inside and both terms go to zero, which is usually cheaper than the extra ton of equipment they force you to buy."
      >
        <div className="grid cols-4">
          <Select<Boundary>
            label="Where the ducts run"
            value={ducts.boundary}
            onChange={(v) => update((p) => ({ ...p, ducts: { ...p.ducts, boundary: v } }))}
            options={BOUNDARY_OPTIONS}
          />
          <NumberInput
            label="Duct insulation"
            value={ducts.rValue}
            onChange={(v) => update((p) => ({ ...p, ducts: { ...p.ducts, rValue: v } }))}
            suffix="R"
            min={0}
            max={16}
            hint="R-6 flex is common"
          />
          <NumberInput
            label="Total leakage"
            value={ducts.leakageFraction}
            onChange={(v) => update((p) => ({ ...p, ducts: { ...p.ducts, leakageFraction: v } }))}
            min={0}
            max={0.4}
            step={0.01}
            hint="0.03 sealed and tested, 0.15 typical older"
          />
          <NumberInput
            label="Duct surface area"
            value={ducts.surfaceFraction}
            onChange={(v) => update((p) => ({ ...p, ducts: { ...p.ducts, surfaceFraction: v } }))}
            min={0}
            max={0.6}
            step={0.01}
            hint="Fraction of floor area; 0.27 typical"
          />
        </div>
      </Panel>

      <Panel title="Airflow targets" note="These set how the calculated load turns into CFM per room.">
        <div className="grid cols-3">
          <NumberInput
            label="Heating supply air rise"
            value={project.systems.heatingSupplyRiseF}
            onChange={(v) => update((p) => ({ ...p, systems: { ...p.systems, heatingSupplyRiseF: v } }))}
            suffix="°F"
            min={12}
            max={70}
            hint="Heat pumps run 25–35°F; furnaces 45–60°F"
          />
          <NumberInput
            label="Cooling supply air drop"
            value={project.systems.coolingSupplyDropF}
            onChange={(v) => update((p) => ({ ...p, systems: { ...p.systems, coolingSupplyDropF: v } }))}
            suffix="°F"
            min={12}
            max={30}
            hint="20°F is the usual target"
          />
          <NumberInput
            label="No-heat balance temperature"
            value={project.systems.balanceBaseF}
            onChange={(v) => update((p) => ({ ...p, systems: { ...p.systems, balanceBaseF: v } }))}
            suffix="°F"
            min={45}
            max={70}
            hint="Outdoor temperature where gains cover the losses"
          />
        </div>
      </Panel>
    </>
  )
}

function estimateBedrooms(project: Project): number {
  const named = project.rooms.filter((r) => /bed|bdrm|master|primary/i.test(r.name)).length
  return Math.max(1, named)
}
