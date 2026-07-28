// SPDX-License-Identifier: AGPL-3.0-only
// Everything a job needs lives in this browser. Projects go to localStorage,
// share links carry the whole model in the URL fragment so nothing has to
// touch a server, and export writes a plain JSON file you own.

import type { Project } from '../types'

const KEY = 'hypocaust.projects.v1'
const ACTIVE_KEY = 'hypocaust.active.v1'

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p) => p && typeof p === 'object' && p.schema === 1)
  } catch {
    return []
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects))
  } catch {
    /* storage full or blocked; the session still works in memory */
  }
}

export function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function saveActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function newId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ------------------------------------------------------------------ transfer

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deflate(text: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(text)
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream
  if (!CS) return input
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new CS('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
  if (!DS) return new TextDecoder().decode(bytes)
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DS('deflate-raw'))
  return new Response(stream).text()
}

/** Strip the cached weather record; it is large and can be refetched. */
function slim(project: Project): Project {
  return { ...project, climate: project.climate ? { ...project.climate, bins: project.climate.bins } : null }
}

export async function encodeShareLink(project: Project): Promise<string> {
  const json = JSON.stringify(slim(project))
  const packed = await deflate(json)
  const base = window.location.origin + window.location.pathname
  return `${base}#j=${toBase64Url(packed)}`
}

export async function decodeShareLink(hash: string): Promise<Project | null> {
  const match = /[#&]j=([A-Za-z0-9_-]+)/.exec(hash)
  if (!match) return null
  try {
    const text = await inflate(fromBase64Url(match[1]))
    const parsed = JSON.parse(text)
    if (parsed && parsed.schema === 1) return parsed as Project
    return null
  } catch {
    return null
  }
}

export function downloadJson(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `${slugify(project.name)}.hypocaust.json`)
}

export function downloadText(filename: string, text: string, mime = 'text/csv'): void {
  triggerDownload(new Blob([text], { type: mime }), filename)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  )
}

export async function readJsonFile(file: File): Promise<Project> {
  const text = await file.text()
  const parsed = JSON.parse(text)
  if (!parsed || parsed.schema !== 1) throw new Error('That file is not a Hypocaust project.')
  return parsed as Project
}
