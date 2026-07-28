// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react'
import type { Project } from '../types'
import { climateZoneLabel, describeHit, fetchClimate, geocode, type GeocodeHit } from '../lib/climate'
import { fmt } from '../lib/sample'
import { TemperatureStrip } from './charts'
import { Field, NumberInput, Panel, Select, TextInput } from './ui'

export function SitePanel({
  project,
  update,
}: {
  project: Project
  update: (fn: (p: Project) => Project) => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<GeocodeHit[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [years, setYears] = useState<'5' | '10' | '20' | '30'>('10')

  const search = async () => {
    if (!query.trim()) return
    setError(null)
    setBusy('Looking up the place')
    try {
      const results = await geocode(query.trim())
      setHits(results)
      if (results.length === 0) setError('No place matched that. Try adding a state or country.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Place lookup failed.')
    } finally {
      setBusy(null)
    }
  }

  const pull = async (lat: number, lon: number, label?: string) => {
    setError(null)
    setHits(null)
    try {
      const record = await fetchClimate(lat, lon, Number(years), (p) => setBusy(p.message))
      update((p) => ({
        ...p,
        site: {
          ...p.site,
          label: label ?? p.site.label,
          latitude: lat,
          longitude: lon,
          elevationFt: record.elevationFt,
        },
        design: {
          ...p.design,
          source: 'derived',
          winterOutdoorF: record.heating99F,
          summerOutdoorF: record.cooling1F,
          summerMcwbF: record.mcwb1F,
          dailyRangeF: record.dailyRangeF,
        },
        climate: record,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the weather archive.')
    } finally {
      setBusy(null)
    }
  }

  const c = project.climate
  const d = project.design

  return (
    <>
      <div className="page-head">
        <h2>Site and design conditions</h2>
        <p>
          Design temperatures are percentiles of a long hourly weather record — the 99% heating value is the
          temperature your site stays above 99% of the year. Hypocaust computes them from the site's own
          reanalysis history rather than a lookup table, so you also get the bin hours the annual energy model
          runs on.
        </p>
      </div>

      <Panel title="Location">
        <div className="grid cols-2" style={{ alignItems: 'end' }}>
          <Field label="Find a place">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="control"
                value={query}
                placeholder="Ogden, Utah"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void search()
                }}
              />
              <button className="btn" onClick={() => void search()} disabled={!!busy}>
                Search
              </button>
            </div>
          </Field>
          <Select
            label="Years of weather history"
            value={years}
            onChange={setYears}
            options={[
              { value: '5', label: '5 years — fastest' },
              { value: '10', label: '10 years — recommended' },
              { value: '20', label: '20 years' },
              { value: '30', label: '30 years — full normal period' },
            ]}
          />
        </div>

        {hits && hits.length > 0 ? (
          <div className="hit-list">
            {hits.map((h, i) => (
              <button key={i} className="hit" onClick={() => void pull(h.latitude, h.longitude, describeHit(h))}>
                {describeHit(h)}
                <small>
                  {h.latitude.toFixed(3)}, {h.longitude.toFixed(3)}
                  {h.elevationM != null ? ` · ${Math.round(h.elevationM * 3.28084)} ft` : ''}
                </small>
              </button>
            ))}
          </div>
        ) : null}

        {busy ? <div className="notice good">{busy}…</div> : null}
        {error ? (
          <div className="notice bad">
            {error} You can still enter design conditions by hand below.
          </div>
        ) : null}

        <div className="grid cols-4" style={{ marginTop: 14 }}>
          <TextInput
            label="Job location"
            value={project.site.label}
            onChange={(v) => update((p) => ({ ...p, site: { ...p.site, label: v } }))}
          />
          <NumberInput
            label="Latitude"
            value={project.site.latitude}
            onChange={(v) => update((p) => ({ ...p, site: { ...p.site, latitude: v } }))}
            min={-90}
            max={90}
            suffix="°"
          />
          <NumberInput
            label="Longitude"
            value={project.site.longitude}
            onChange={(v) => update((p) => ({ ...p, site: { ...p.site, longitude: v } }))}
            min={-180}
            max={180}
            suffix="°"
          />
          <NumberInput
            label="Elevation"
            value={project.site.elevationFt}
            onChange={(v) => update((p) => ({ ...p, site: { ...p.site, elevationFt: v } }))}
            min={-300}
            max={14000}
            suffix="ft"
            hint="Thins the air and shrinks capacity"
          />
        </div>

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button
            className="btn"
            disabled={!!busy}
            onClick={() => void pull(project.site.latitude, project.site.longitude)}
          >
            Pull weather for these coordinates
          </button>
        </div>
      </Panel>

      {c ? (
        <>
          <div className="readouts">
            <Readout k="Heating 99%" v={`${c.heating99F.toFixed(0)}°`} sub={`99.6% is ${c.heating996F.toFixed(0)}°`} tone="heat" />
            <Readout k="Cooling 1%" v={`${c.cooling1F.toFixed(0)}°`} sub={`coincident wet bulb ${c.mcwb1F.toFixed(0)}°`} tone="cool" />
            <Readout k="Daily range" v={`${c.dailyRangeF.toFixed(0)}°`} sub="hottest month average swing" />
            <Readout k="Heating degree days" v={fmt(c.hdd65)} sub={climateZoneLabel(c.hdd65, c.cdd65)} />
            <Readout k="Cooling degree days" v={fmt(c.cdd65)} sub={`${c.startYear}–${c.endYear} record`} />
          </div>

          <div className="strip">
            <h4>Hours per year at each temperature</h4>
            <TemperatureStrip
              bins={c.bins}
              heating99={c.heating99F}
              cooling1={c.cooling1F}
              extremeLow={c.extremeLowF}
              extremeHigh={c.extremeHighF}
            />
          </div>
        </>
      ) : (
        <div className="notice">
          No weather record loaded yet. Search for the job's location above, or type design conditions in by hand
          — the load calculation works either way, but the annual energy and cost numbers need the bin hours.
        </div>
      )}

      <p className="panel-note" style={{ marginTop: -6 }}>
        Weather from{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        , ERA5 reanalysis, licensed CC BY 4.0. Their server is AGPL too, so you can point this at your own
        instance if you would rather not depend on anyone.
      </p>

      <Panel
        title="Design conditions"
        note={
          d.source === 'derived'
            ? 'Derived from the weather record. Edit any of these and they become your own values.'
            : 'Entered by hand.'
        }
      >
        <div className="grid cols-4">
          <NumberInput
            label="Winter outdoor design"
            value={d.winterOutdoorF}
            onChange={(v) => setDesign(update, { winterOutdoorF: v })}
            suffix="°F"
          />
          <NumberInput
            label="Indoor winter setpoint"
            value={d.indoorWinterF}
            onChange={(v) => setDesign(update, { indoorWinterF: v })}
            suffix="°F"
          />
          <NumberInput
            label="Summer outdoor design"
            value={d.summerOutdoorF}
            onChange={(v) => setDesign(update, { summerOutdoorF: v })}
            suffix="°F"
          />
          <NumberInput
            label="Indoor summer setpoint"
            value={d.indoorSummerF}
            onChange={(v) => setDesign(update, { indoorSummerF: v })}
            suffix="°F"
          />
          <NumberInput
            label="Coincident wet bulb"
            value={d.summerMcwbF}
            onChange={(v) => setDesign(update, { summerMcwbF: v })}
            suffix="°F"
            hint="Sets the latent load"
          />
          <NumberInput
            label="Summer daily range"
            value={d.dailyRangeF}
            onChange={(v) => setDesign(update, { dailyRangeF: v })}
            suffix="°F"
            hint="How far the night cools off"
          />
          <NumberInput
            label="Indoor summer humidity"
            value={d.indoorSummerRh}
            onChange={(v) => setDesign(update, { indoorSummerRh: v })}
            suffix="%"
            min={20}
            max={70}
          />
        </div>
      </Panel>
    </>
  )
}

function setDesign(update: (fn: (p: Project) => Project) => void, patch: Partial<Project['design']>) {
  update((p) => ({ ...p, design: { ...p.design, ...patch, source: 'manual' } }))
}

function Readout({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: 'heat' | 'cool' }) {
  return (
    <div className="readout">
      <span className="k">{k}</span>
      <div className={`v${tone ? ` ${tone}` : ''}`}>{v}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  )
}
