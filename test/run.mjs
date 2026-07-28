// SPDX-License-Identifier: AGPL-3.0-only
// Bundles each test file with the esbuild that ships inside vite, then runs it.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { readdirSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const out = mkdtempSync(path.join(tmpdir(), 'hypocaust-test-'))
let failed = 0

for (const file of readdirSync(here).filter((f) => f.endsWith('.test.ts')).sort()) {
  const bundle = path.join(out, file.replace('.ts', '.mjs'))
  await build({
    entryPoints: [path.join(here, file)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'error',
  })
  console.log(`\n═══ ${file} ${'═'.repeat(Math.max(0, 50 - file.length))}`)
  const res = spawnSync(process.execPath, [bundle], { stdio: 'inherit' })
  if (res.status !== 0) failed++
}

rmSync(out, { recursive: true, force: true })
process.exit(failed === 0 ? 0 : 1)
