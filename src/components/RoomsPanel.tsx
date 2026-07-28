// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react'
import type {
  Boundary,
  DoorSurface,
  InteriorShade,
  Orientation,
  Project,
  Room,
  RoomResult,
  WallSurface,
  WindowSurface,
} from '../types'
import { ORIENTATIONS } from '../types'
import { assembliesFor, GLAZING_TYPES, SHADE_LABEL } from '../lib/assemblies'
import { newId } from '../lib/storage'
import { fmt } from '../lib/sample'
import { NumberInput, Select } from './ui'

const ORIENTATION_OPTIONS = ORIENTATIONS.map((o) => ({ value: o, label: o }))

const WALL_BOUNDARIES: { value: Boundary; label: string }[] = [
  { value: 'outdoor', label: 'Outdoors' },
  { value: 'garage', label: 'Garage' },
  { value: 'unconditioned-basement', label: 'Unconditioned basement' },
  { value: 'conditioned', label: 'Conditioned space' },
]

const CEILING_BOUNDARIES: { value: Boundary; label: string }[] = [
  { value: 'attic', label: 'Vented attic above' },
  { value: 'outdoor', label: 'Roof deck directly above' },
  { value: 'garage', label: 'Garage above' },
  { value: 'conditioned', label: 'Conditioned space above' },
]

const FLOOR_BOUNDARIES: { value: Boundary; label: string }[] = [
  { value: 'vented-crawl', label: 'Vented crawl space below' },
  { value: 'unconditioned-basement', label: 'Unconditioned basement below' },
  { value: 'garage', label: 'Garage below' },
  { value: 'outdoor', label: 'Open to outdoors below' },
  { value: 'conditioned', label: 'Conditioned space below' },
]

const ABSORPTANCE = [
  { value: '0.4', label: 'Light — white or pale' },
  { value: '0.7', label: 'Medium — most colours' },
  { value: '0.9', label: 'Dark — brown, charcoal, black' },
]

export function RoomsPanel({
  project,
  update,
  roomResults,
}: {
  project: Project
  update: (fn: (p: Project) => Project) => void
  roomResults: Map<string, RoomResult>
}) {
  const [open, setOpen] = useState<Set<string>>(new Set(project.rooms.slice(0, 1).map((r) => r.id)))

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const patchRoom = (id: string, fn: (r: Room) => Room) =>
    update((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === id ? fn(r) : r)) }))

  const addRoom = () => {
    const id = newId()
    const template = project.rooms[project.rooms.length - 1]
    const fresh: Room = {
      id,
      name: `Room ${project.rooms.length + 1}`,
      floorAreaFt2: 150,
      ceilingHeightFt: template?.ceilingHeightFt ?? 8,
      walls: [
        {
          id: newId(),
          orientation: 'S',
          boundary: 'outdoor',
          grossAreaFt2: 96,
          assemblyId: template?.walls[0]?.assemblyId ?? 'w-2x6-r21',
          absorptance: 0.7,
        },
      ],
      windows: [],
      doors: [],
      ceiling: {
        boundary: template?.ceiling.boundary ?? 'attic',
        areaFt2: 150,
        assemblyId: template?.ceiling.assemblyId ?? 'c-r38',
        absorptance: 0.85,
      },
      floor: {
        kind: template?.floor.kind ?? 'framed',
        boundary: template?.floor.boundary ?? 'vented-crawl',
        areaFt2: 150,
        assemblyId: template?.floor.assemblyId ?? 'f-framed-r19',
        slabPerimeterFt: 0,
      },
      occupants: 1,
      applianceSensibleBtuh: 100,
      applianceLatentBtuh: 0,
    }
    update((p) => ({ ...p, rooms: [...p.rooms, fresh] }))
    setOpen((prev) => new Set(prev).add(id))
  }

  const duplicate = (room: Room) => {
    const copy: Room = {
      ...room,
      id: newId(),
      name: `${room.name} copy`,
      walls: room.walls.map((w) => ({ ...w, id: newId() })),
      windows: room.windows.map((w) => ({ ...w, id: newId() })),
      doors: room.doors.map((d) => ({ ...d, id: newId() })),
    }
    update((p) => ({ ...p, rooms: [...p.rooms, copy] }))
  }

  const totalArea = project.rooms.reduce((a, r) => a + r.floorAreaFt2, 0)

  return (
    <>
      <div className="page-head">
        <h2>Rooms</h2>
        <p>
          Enter gross wall area by direction; windows and doors are subtracted from whichever wall faces the same
          way. Direction matters more than most people expect — the same window earns a heating credit facing
          south and forces a bigger compressor facing west.
        </p>
      </div>

      <div className="btn-row" style={{ marginBottom: 16 }}>
        <button className="btn primary" onClick={addRoom}>
          Add a room
        </button>
        <span className="chip">
          {project.rooms.length} rooms · {fmt(totalArea)} ft²
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <button className="btn ghost small" onClick={() => setOpen(new Set(project.rooms.map((r) => r.id)))}>
            Expand all
          </button>
          <button className="btn ghost small" onClick={() => setOpen(new Set())} style={{ marginLeft: 6 }}>
            Collapse all
          </button>
        </span>
      </div>

      {project.rooms.length === 0 ? (
        <div className="empty">
          No rooms yet. Add one to start building the model.
        </div>
      ) : null}

      {project.rooms.map((room) => {
        const result = roomResults.get(room.id)
        const isOpen = open.has(room.id)
        return (
          <div className="room-card" key={room.id}>
            <div
              className="room-head"
              onClick={(e) => {
                if ((e.target as HTMLElement).tagName !== 'INPUT') toggle(room.id)
              }}
            >
              <span style={{ color: 'var(--ash-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                {isOpen ? '▾' : '▸'}
              </span>
              <input
                value={room.name}
                onChange={(e) => patchRoom(room.id, (r) => ({ ...r, name: e.target.value }))}
                aria-label="Room name"
              />
              <span className="room-stat">{fmt(room.floorAreaFt2)} ft²</span>
              {result ? (
                <>
                  <span className="room-stat num-heat">{fmt(result.heatingBtuh)} Btu/h</span>
                  <span className="room-stat num-cool">{fmt(result.coolingSensibleBtuh)} Btu/h</span>
                  <span className="room-stat">{fmt(result.designCfm)} cfm</span>
                </>
              ) : null}
              <button
                className="icon-btn"
                title="Duplicate room"
                onClick={(e) => {
                  e.stopPropagation()
                  duplicate(room)
                }}
              >
                ⧉
              </button>
              <button
                className="icon-btn"
                title="Delete room"
                onClick={(e) => {
                  e.stopPropagation()
                  update((p) => ({ ...p, rooms: p.rooms.filter((r) => r.id !== room.id) }))
                }}
              >
                ×
              </button>
            </div>

            {isOpen ? (
              <div className="room-body">
                <div className="grid cols-4">
                  <NumberInput
                    label="Floor area"
                    value={room.floorAreaFt2}
                    onChange={(v) =>
                      patchRoom(room.id, (r) => ({
                        ...r,
                        floorAreaFt2: v,
                        ceiling: { ...r.ceiling, areaFt2: r.ceiling.areaFt2 === r.floorAreaFt2 ? v : r.ceiling.areaFt2 },
                        floor: { ...r.floor, areaFt2: r.floor.areaFt2 === r.floorAreaFt2 ? v : r.floor.areaFt2 },
                      }))
                    }
                    suffix="ft²"
                    min={1}
                  />
                  <NumberInput
                    label="Ceiling height"
                    value={room.ceilingHeightFt}
                    onChange={(v) => patchRoom(room.id, (r) => ({ ...r, ceilingHeightFt: v }))}
                    suffix="ft"
                    min={5}
                    max={30}
                  />
                  <NumberInput
                    label="People"
                    value={room.occupants}
                    onChange={(v) => patchRoom(room.id, (r) => ({ ...r, occupants: Math.round(v) }))}
                    min={0}
                    max={40}
                    step={1}
                    hint="230 Btu/h each, plus moisture"
                  />
                  <NumberInput
                    label="Appliance heat"
                    value={room.applianceSensibleBtuh}
                    onChange={(v) => patchRoom(room.id, (r) => ({ ...r, applianceSensibleBtuh: v }))}
                    suffix="Btu/h"
                    min={0}
                    hint="Kitchens run 1200 and up"
                  />
                </div>

                {/* -------------------------------------------------- walls */}
                <div className="subsection">
                  <h4>
                    Walls
                    <button
                      className="btn ghost small"
                      onClick={() =>
                        patchRoom(room.id, (r) => ({
                          ...r,
                          walls: [
                            ...r.walls,
                            {
                              id: newId(),
                              orientation: 'N',
                              boundary: 'outdoor',
                              grossAreaFt2: 96,
                              assemblyId: r.walls[0]?.assemblyId ?? 'w-2x6-r21',
                              absorptance: 0.7,
                            },
                          ],
                        }))
                      }
                    >
                      Add wall
                    </button>
                  </h4>
                  {room.walls.length === 0 ? <p className="field-hint">No exterior walls in this room.</p> : null}
                  {room.walls.map((wall) => (
                    <div className="surface-row wall" key={wall.id}>
                      <Select<Orientation>
                        label="Faces"
                        value={wall.orientation}
                        onChange={(v) => patchWall(patchRoom, room.id, wall.id, { orientation: v })}
                        options={ORIENTATION_OPTIONS}
                      />
                      <Select
                        label="Construction"
                        value={wall.assemblyId}
                        onChange={(v) => patchWall(patchRoom, room.id, wall.id, { assemblyId: v })}
                        options={assembliesFor('wall').map((a) => ({
                          value: a.id,
                          label: `${a.label} · R-${a.rValue}`,
                        }))}
                      />
                      <NumberInput
                        label="Gross area"
                        value={wall.grossAreaFt2}
                        onChange={(v) => patchWall(patchRoom, room.id, wall.id, { grossAreaFt2: v })}
                        suffix="ft²"
                        min={0}
                      />
                      <Select<Boundary>
                        label="Other side"
                        value={wall.boundary}
                        onChange={(v) => patchWall(patchRoom, room.id, wall.id, { boundary: v })}
                        options={WALL_BOUNDARIES}
                      />
                      <Select
                        label="Exterior colour"
                        value={String(wall.absorptance)}
                        onChange={(v) => patchWall(patchRoom, room.id, wall.id, { absorptance: Number(v) })}
                        options={ABSORPTANCE}
                      />
                      <button
                        className="icon-btn"
                        title="Remove wall"
                        onClick={() =>
                          patchRoom(room.id, (r) => ({ ...r, walls: r.walls.filter((w) => w.id !== wall.id) }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {/* -------------------------------------------------- windows */}
                <div className="subsection">
                  <h4>
                    Windows and skylights
                    <button
                      className="btn ghost small"
                      onClick={() =>
                        patchRoom(room.id, (r) => ({
                          ...r,
                          windows: [
                            ...r.windows,
                            {
                              id: newId(),
                              orientation: r.walls[0]?.orientation ?? 'S',
                              areaFt2: 15,
                              heightFt: 4,
                              glazingId: r.windows[0]?.glazingId ?? 'g-double-lowe',
                              shade: 'blinds-light',
                              overhangDepthFt: 0,
                              overhangAboveFt: 0,
                            },
                          ],
                        }))
                      }
                    >
                      Add window
                    </button>
                  </h4>
                  {room.windows.length === 0 ? <p className="field-hint">No glass in this room.</p> : null}
                  {room.windows.map((win) => (
                    <div className="surface-row window" key={win.id}>
                      <Select<Orientation>
                        label="Faces"
                        value={win.orientation}
                        onChange={(v) => patchWindow(patchRoom, room.id, win.id, { orientation: v })}
                        options={ORIENTATION_OPTIONS}
                      />
                      <NumberInput
                        label="Area"
                        value={win.areaFt2}
                        onChange={(v) => patchWindow(patchRoom, room.id, win.id, { areaFt2: v })}
                        suffix="ft²"
                        min={0}
                      />
                      <NumberInput
                        label="Height"
                        value={win.heightFt}
                        onChange={(v) => patchWindow(patchRoom, room.id, win.id, { heightFt: v })}
                        suffix="ft"
                        min={0.5}
                      />
                      <Select
                        label="Glazing"
                        value={win.glazingId}
                        onChange={(v) => patchWindow(patchRoom, room.id, win.id, { glazingId: v })}
                        options={GLAZING_TYPES.map((g) => ({
                          value: g.id,
                          label: `${g.label} · U-${g.uValue} SHGC ${g.shgc}`,
                        }))}
                      />
                      <Select<InteriorShade>
                        label="Covering"
                        value={win.shade}
                        onChange={(v) => patchWindow(patchRoom, room.id, win.id, { shade: v })}
                        options={(Object.keys(SHADE_LABEL) as InteriorShade[]).map((s) => ({
                          value: s,
                          label: SHADE_LABEL[s],
                        }))}
                      />
                      <NumberInput
                        label="Overhang"
                        value={win.overhangDepthFt}
                        onChange={(v) => patchWindow(patchRoom, room.id, win.id, { overhangDepthFt: v })}
                        suffix="ft"
                        min={0}
                      />
                      <NumberInput
                        label="Above glass"
                        value={win.overhangAboveFt}
                        onChange={(v) => patchWindow(patchRoom, room.id, win.id, { overhangAboveFt: v })}
                        suffix="ft"
                        min={0}
                      />
                      <button
                        className="icon-btn"
                        title="Remove window"
                        onClick={() =>
                          patchRoom(room.id, (r) => ({ ...r, windows: r.windows.filter((w) => w.id !== win.id) }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {/* -------------------------------------------------- doors */}
                <div className="subsection">
                  <h4>
                    Doors
                    <button
                      className="btn ghost small"
                      onClick={() =>
                        patchRoom(room.id, (r) => ({
                          ...r,
                          doors: [
                            ...r.doors,
                            {
                              id: newId(),
                              orientation: r.walls[0]?.orientation ?? 'S',
                              boundary: 'outdoor',
                              areaFt2: 21,
                              assemblyId: 'd-steel-foam',
                            },
                          ],
                        }))
                      }
                    >
                      Add door
                    </button>
                  </h4>
                  {room.doors.map((door) => (
                    <div className="surface-row door" key={door.id}>
                      <Select<Orientation>
                        label="Faces"
                        value={door.orientation}
                        onChange={(v) => patchDoor(patchRoom, room.id, door.id, { orientation: v })}
                        options={ORIENTATION_OPTIONS}
                      />
                      <NumberInput
                        label="Area"
                        value={door.areaFt2}
                        onChange={(v) => patchDoor(patchRoom, room.id, door.id, { areaFt2: v })}
                        suffix="ft²"
                        min={0}
                      />
                      <Select
                        label="Type"
                        value={door.assemblyId}
                        onChange={(v) => patchDoor(patchRoom, room.id, door.id, { assemblyId: v })}
                        options={assembliesFor('door').map((a) => ({ value: a.id, label: `${a.label} · R-${a.rValue}` }))}
                      />
                      <button
                        className="icon-btn"
                        title="Remove door"
                        onClick={() =>
                          patchRoom(room.id, (r) => ({ ...r, doors: r.doors.filter((d) => d.id !== door.id) }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {/* -------------------------------------------------- ceiling and floor */}
                <div className="subsection">
                  <h4>Ceiling</h4>
                  <div className="grid cols-4">
                    <Select<Boundary>
                      label="Above this room"
                      value={room.ceiling.boundary}
                      onChange={(v) => patchRoom(room.id, (r) => ({ ...r, ceiling: { ...r.ceiling, boundary: v } }))}
                      options={CEILING_BOUNDARIES}
                    />
                    <Select
                      label="Construction"
                      value={room.ceiling.assemblyId}
                      onChange={(v) => patchRoom(room.id, (r) => ({ ...r, ceiling: { ...r.ceiling, assemblyId: v } }))}
                      options={assembliesFor('ceiling').map((a) => ({ value: a.id, label: `${a.label} · R-${a.rValue}` }))}
                    />
                    <NumberInput
                      label="Area"
                      value={room.ceiling.areaFt2}
                      onChange={(v) => patchRoom(room.id, (r) => ({ ...r, ceiling: { ...r.ceiling, areaFt2: v } }))}
                      suffix="ft²"
                      min={0}
                    />
                    <Select
                      label="Roof colour"
                      value={String(room.ceiling.absorptance)}
                      onChange={(v) =>
                        patchRoom(room.id, (r) => ({ ...r, ceiling: { ...r.ceiling, absorptance: Number(v) } }))
                      }
                      options={ABSORPTANCE}
                    />
                  </div>
                </div>

                <div className="subsection">
                  <h4>Floor</h4>
                  <div className="grid cols-4">
                    <Select
                      label="Floor type"
                      value={room.floor.kind}
                      onChange={(v) =>
                        patchRoom(room.id, (r) => ({
                          ...r,
                          floor: {
                            ...r.floor,
                            kind: v,
                            assemblyId: v === 'slab' ? 'f-slab-r10' : 'f-framed-r19',
                          },
                        }))
                      }
                      options={[
                        { value: 'slab', label: 'Slab on grade' },
                        { value: 'framed', label: 'Framed floor' },
                      ]}
                    />
                    {room.floor.kind === 'framed' ? (
                      <Select<Boundary>
                        label="Below this room"
                        value={room.floor.boundary}
                        onChange={(v) => patchRoom(room.id, (r) => ({ ...r, floor: { ...r.floor, boundary: v } }))}
                        options={FLOOR_BOUNDARIES}
                      />
                    ) : (
                      <NumberInput
                        label="Exposed slab edge"
                        value={room.floor.slabPerimeterFt}
                        onChange={(v) =>
                          patchRoom(room.id, (r) => ({ ...r, floor: { ...r.floor, slabPerimeterFt: v } }))
                        }
                        suffix="ft"
                        min={0}
                        hint="Only the edge that touches outside air"
                      />
                    )}
                    <Select
                      label="Construction"
                      value={room.floor.assemblyId}
                      onChange={(v) => patchRoom(room.id, (r) => ({ ...r, floor: { ...r.floor, assemblyId: v } }))}
                      options={assembliesFor('floor')
                        .filter((a) => (room.floor.kind === 'slab' ? a.fFactor != null : a.fFactor == null))
                        .map((a) => ({
                          value: a.id,
                          label: a.fFactor != null ? `${a.label} · F-${a.fFactor}` : `${a.label} · R-${a.rValue}`,
                        }))}
                    />
                    <NumberInput
                      label="Area"
                      value={room.floor.areaFt2}
                      onChange={(v) => patchRoom(room.id, (r) => ({ ...r, floor: { ...r.floor, areaFt2: v } }))}
                      suffix="ft²"
                      min={0}
                    />
                  </div>
                </div>

                {result ? (
                  <div className="notice" style={{ marginTop: 18, marginBottom: 0 }}>
                    This room peaks at <strong>{hourWord(result.ownPeakHour)}</strong> on its own, carrying{' '}
                    {fmt(result.ownPeakSensibleBtuh)} Btu/h then.
                    {result.ownPeakHour !== -1 ? (
                      <>
                        {' '}
                        It is charged {fmt(result.coolingSensibleBtuh)} Btu/h at the whole-house peak, and needs{' '}
                        {fmt(result.designCfm)} CFM.
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

function hourWord(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const suffix = h < 12 ? 'am' : 'pm'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}${suffix}`
}

type PatchRoom = (id: string, fn: (r: Room) => Room) => void

function patchWall(patchRoom: PatchRoom, roomId: string, wallId: string, patch: Partial<WallSurface>) {
  patchRoom(roomId, (r) => ({ ...r, walls: r.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)) }))
}

function patchWindow(patchRoom: PatchRoom, roomId: string, winId: string, patch: Partial<WindowSurface>) {
  patchRoom(roomId, (r) => ({ ...r, windows: r.windows.map((w) => (w.id === winId ? { ...w, ...patch } : w)) }))
}

function patchDoor(patchRoom: PatchRoom, roomId: string, doorId: string, patch: Partial<DoorSurface>) {
  patchRoom(roomId, (r) => ({ ...r, doors: r.doors.map((d) => (d.id === doorId ? { ...d, ...patch } : d)) }))
}
