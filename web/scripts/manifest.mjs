#!/usr/bin/env node
/**
 * Write dist/imd-deployment.json after the static export.
 *
 * Sources (read-only):
 *   ../.imd/reads/deployment.json   validated deployment handoff
 *   ../.imd/reads/network.json      vetted chain table (optional)
 *   ../docs/abi/<Contract>.json     implementation-derived ABIs at the pinned source commit
 *
 * When the .imd handoff is absent (for example a later rebuild outside the workflow), the
 * previously committed dist/imd-deployment.json is used as the source for identifiers, contracts,
 * poolKey, network and walletAddChain, and only the asset inventory is regenerated.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { keccak256, toBytes } from 'viem'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const dist = path.join(repo, 'dist')
const abiDir = path.join(dist, 'abi')
const outPath = path.join(dist, 'imd-deployment.json')
const handoffPath = path.join(repo, '.imd', 'reads', 'deployment.json')
const networkPath = path.join(repo, '.imd', 'reads', 'network.json')

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
  return JSON.stringify(v)
}
const canonicalKeccak = (abi) => keccak256(toBytes(canonical(abi))).slice(2)

function walk(dir, base = '') {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html missing: run the Vite build first')
  process.exit(1)
}

let base
if (fs.existsSync(handoffPath)) {
  const handoff = readJson(handoffPath)
  base = {
    version: 1,
    launchId: handoff.launchId,
    chainId: handoff.chainId,
    sourceCommit: handoff.sourceCommit,
    attestationHash: handoff.attestationHash,
    contracts: handoff.contracts.map((c) => ({ name: c.name, address: c.address, abiHash: c.abiHash, abiPath: `abi/${c.name}.json` })),
  }
  if (handoff.poolKey) {
    const { currency0, currency1, fee, tickSpacing, hooks } = handoff.poolKey
    base.poolKey = { currency0, currency1, fee, tickSpacing, hooks }
  }
  // ABIs: copy the implementation-derived export for every handoff contract and verify its hash.
  fs.mkdirSync(abiDir, { recursive: true })
  for (const c of handoff.contracts) {
    const src = path.join(repo, 'docs', 'abi', `${c.name}.json`)
    const abi = readJson(src)
    const h = canonicalKeccak(abi)
    if (h !== c.abiHash) {
      console.error(`ABI hash mismatch for ${c.name}: docs/abi gives ${h}, handoff says ${c.abiHash}`)
      process.exit(1)
    }
    fs.writeFileSync(path.join(abiDir, `${c.name}.json`), JSON.stringify(abi) + '\n')
  }
  if (fs.existsSync(networkPath)) {
    const net = readJson(networkPath)
    if (net.network) base.network = net.network
    if (net.walletAddChain) base.walletAddChain = net.walletAddChain
  }
} else if (fs.existsSync(outPath)) {
  const prev = readJson(outPath)
  base = { ...prev }
  delete base.assets
  console.warn('No .imd handoff found; reusing identifiers from the committed manifest and refreshing assets only')
} else {
  console.error('No deployment handoff and no previous manifest; cannot write imd-deployment.json')
  process.exit(1)
}

// Verify every ABI referenced by the manifest exists in dist and hashes correctly.
for (const c of base.contracts) {
  const p = path.join(dist, c.abiPath)
  if (!fs.existsSync(p)) {
    console.error(`Missing ABI asset ${c.abiPath}`)
    process.exit(1)
  }
  const h = canonicalKeccak(readJson(p))
  if (h !== c.abiHash) {
    console.error(`ABI hash mismatch in dist for ${c.name}`)
    process.exit(1)
  }
}

const files = walk(dist).filter((f) => f !== 'imd-deployment.json')
if (files.length > 128) {
  console.error(`Too many exported files: ${files.length} > 128`)
  process.exit(1)
}
let total = 0
const assets = files.map((f) => {
  const bytes = fs.readFileSync(path.join(dist, f))
  total += bytes.length
  if (bytes.length > 8 * 1024 * 1024) {
    console.error(`${f} exceeds 8 MiB`)
    process.exit(1)
  }
  return { path: f, sha256: createHash('sha256').update(bytes).digest('hex') }
})

const manifest = {
  version: 1,
  launchId: base.launchId,
  chainId: base.chainId,
  sourceCommit: base.sourceCommit,
  attestationHash: base.attestationHash,
  contracts: base.contracts,
  assets,
}
if (base.poolKey) manifest.poolKey = base.poolKey
if (base.network) manifest.network = base.network
if (base.walletAddChain) manifest.walletAddChain = base.walletAddChain

fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Wrote dist/imd-deployment.json: ${assets.length} assets, ${(total / 1024).toFixed(1)} KiB total`)
