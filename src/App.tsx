// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Project, RoomResult } from './types'
import { computeLoads } from './lib/loads'
import { blankProject, fmt, fmtTons, sampleProject } from './lib/sample'
import {
  decodeShareLink,
  downloadJson,
  encodeShareLink,
  loadActiveId,
  loadProjects,
  newId,
  readJsonFile,
  saveActiveId,
  saveProjects,
} from './lib/storage'
import { SitePanel } from './components/SitePanel'
import { EnvelopePanel } from './components/EnvelopePanel'
import { RoomsPanel } from './components/RoomsPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { EquipmentPanel } from './components/EquipmentPanel'
import { ReportPanel } from './components/ReportPanel'

type Stage = 'site' | 'envelope' | 'rooms' | 'results' | 'equipment' | 'report'

const STAGES: { id: Stage; label: string }[] = [
  { id: 'site', label: 'Site' },
  { id: 'envelope', label: 'Envelope' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'results', label: 'Loads' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'report', label: 'Report' },
]

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const stored = loadProjects()
    return stored.length > 0 ? stored : [sampleProject()]
  })
  const [activeId, setActiveId] = useState<string>(() => {
    const stored = loadProjects()
    const remembered = loadActiveId()
    if (remembered && stored.some((p) => p.id === remembered)) return remembered
    return stored[0]?.id ?? ''
  })
  const [stage, setStage] = useState<Stage>('site')
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // A share link in the fragment wins on first load.
  useEffect(() => {
    if (!window.location.hash.includes('j=')) return
    let cancelled = false
    void decodeShareLink(window.location.hash).then((incoming) => {
      if (cancelled || !incoming) return
      const fresh = { ...incoming, id: newId(), updatedAt: Date.now() }
      setProjects((prev) => [...prev, fresh])
      setActiveId(fresh.id)
      setStage('results')
      history.replaceState(null, '', window.location.pathname)
      setToast('Opened a shared job. It is now saved in this browser.')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const active = projects.find((p) => p.id === activeId) ?? projects[0]

  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => saveProjects(projects), 250)
    return () => clearTimeout(t)
  }, [projects, active])

  useEffect(() => {
    if (activeId) saveActiveId(activeId)
  }, [activeId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const update = useCallback(
    (fn: (p: Project) => Project) => {
      setProjects((prev) => prev.map((p) => (p.id === activeId ? { ...fn(p), updatedAt: Date.now() } : p)))
    },
    [activeId],
  )

  const result = useMemo(() => (active ? computeLoads(active) : null), [active])
  const roomResults = useMemo(() => {
    const map = new Map<string, RoomResult>()
    if (result) for (const r of result.rooms) map.set(r.roomId, r)
    return map
  }, [result])

  if (!active || !result) return null

  const addProject = () => {
    const fresh = blankProject(`Job ${projects.length + 1}`)
    setProjects((prev) => [...prev, fresh])
    setActiveId(fresh.id)
    setStage('site')
  }

  const share = async () => {
    try {
      const link = await encodeShareLink(active)
      if (link.length > 30000) {
        setToast('This job is too large for a link. Export the JSON file instead.')
        return
      }
      await navigator.clipboard.writeText(link)
      setToast('Link copied. The whole job travels inside the link — nothing is uploaded anywhere.')
    } catch {
      setToast('Could not copy to the clipboard. Export the JSON file instead.')
    }
  }

  const importFile = async (file: File) => {
    try {
      const incoming = await readJsonFile(file)
      const fresh = { ...incoming, id: newId(), updatedAt: Date.now() }
      setProjects((prev) => [...prev, fresh])
      setActiveId(fresh.id)
      setToast(`Opened ${fresh.name}.`)
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'That file could not be read.')
    }
  }

  const stageNote = (id: Stage): string => {
    switch (id) {
      case 'site':
        return active.climate
          ? `${active.design.winterOutdoorF.toFixed(0)}° / ${active.design.summerOutdoorF.toFixed(0)}°F`
          : 'no weather loaded'
      case 'envelope':
        return `${active.ducts.boundary === 'conditioned' ? 'ducts inside' : 'ducts outside'}`
      case 'rooms':
        return `${active.rooms.length} rooms · ${fmt(result.conditionedAreaFt2)} ft²`
      case 'results':
        return `${fmt(result.heatingBtuh)} / ${fmt(result.coolingTotalBtuh)} Btu/h`
      case 'equipment':
        return `${fmtTons(active.systems.heatPump.coolingCapacityBtuh)} ton candidate`
      case 'report':
        return 'print or save as PDF'
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="pilae" aria-hidden="true">
          <i style={{ background: 'var(--ember)', height: 18 }} />
          <i style={{ background: '#ff9a5c', height: 13 }} />
          <i style={{ background: '#9fb6a8', height: 9 }} />
          <i style={{ background: 'var(--frigid)', height: 6 }} />
        </div>
        <div className="wordmark">
          <b>Hypocaust</b>
          <span>load, balance point, and what the season costs</span>
        </div>

        <div className="topbar-spacer" />

        <select
          className="control"
          style={{ width: 'auto', maxWidth: 220 }}
          value={activeId}
          onChange={(e) => setActiveId(e.target.value)}
          aria-label="Choose a job"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className="project-name"
          value={active.name}
          onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
          aria-label="Job name"
        />
        <button className="btn small" onClick={addProject}>
          New
        </button>
        <button className="btn small" onClick={() => void share()}>
          Copy link
        </button>
        <button className="btn small" onClick={() => downloadJson(active)}>
          Export
        </button>
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          Open
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importFile(f)
            e.target.value = ''
          }}
        />
        {projects.length > 1 ? (
          <button
            className="btn small danger"
            onClick={() => {
              const rest = projects.filter((p) => p.id !== activeId)
              setProjects(rest)
              setActiveId(rest[0].id)
            }}
          >
            Delete
          </button>
        ) : null}
      </header>

      <div className="main">
        <nav className="rail">
          <div className="rail-heading">Each step feeds the next</div>
          {STAGES.map((s, i) => (
            <button
              key={s.id}
              className={`stage${stage === s.id ? ' is-active' : ''}`}
              onClick={() => setStage(s.id)}
              aria-current={stage === s.id}
            >
              <span className="stage-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="stage-label">{s.label}</span>
              <span className="stage-note">{stageNote(s.id)}</span>
            </button>
          ))}
          <div className="rail-foot">
            Free software under the{' '}
            <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">
              AGPL v3
            </a>
            . Everything runs in this browser; no account, no server, no upload.
            <br />
            <a href="https://github.com/bell-kevin/hypocaust" target="_blank" rel="noreferrer">
              Source code
            </a>
            {' · '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Weather by Open-Meteo
            </a>{' '}
            (CC BY 4.0)
          </div>
        </nav>

        <main className="content">
          <div className="content-inner">
            {toast ? (
              <div className="notice good no-print" role="status">
                {toast}
              </div>
            ) : null}

            {stage === 'site' ? <SitePanel project={active} update={update} /> : null}
            {stage === 'envelope' ? <EnvelopePanel project={active} update={update} /> : null}
            {stage === 'rooms' ? <RoomsPanel project={active} update={update} roomResults={roomResults} /> : null}
            {stage === 'results' ? <ResultsPanel project={active} result={result} /> : null}
            {stage === 'equipment' ? <EquipmentPanel project={active} update={update} result={result} /> : null}
            {stage === 'report' ? <ReportPanel project={active} result={result} /> : null}
          </div>
        </main>
      </div>
    </div>
  )
}
