import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { keccak256, toBytes } from 'viem'
import { assertManifest, makeDeployment } from '../src/config'
import { chainFromManifest } from '../src/wagmi'
import { fmt, parseAmount, errorMessage } from '../src/lib/format'
import { isUnknownChain } from '../src/lib/chain'

const repo = path.resolve(import.meta.dirname, '..', '..')
const distManifest = path.join(repo, 'dist', 'imd-deployment.json')

function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (v && typeof v === 'object')
    return '{' + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}'
  return JSON.stringify(v)
}

describe('runtime deployment configuration', () => {
  const has = fs.existsSync(distManifest)
  it.skipIf(!has)('dist/imd-deployment.json validates and binds every ABI by hash', () => {
    const raw = JSON.parse(fs.readFileSync(distManifest, 'utf8'))
    const m = assertManifest(raw)
    expect(Object.keys(raw).sort()).toEqual(['assets', 'attestationHash', 'chainId', 'contracts', 'launchId', 'network', 'poolKey', 'sourceCommit', 'version', 'walletAddChain'])
    expect(m.contracts.map((c) => c.name).sort()).toEqual(['LaunchToken', 'MoonRewards', 'MoonShop'])
    for (const c of m.contracts) {
      const abi = JSON.parse(fs.readFileSync(path.join(repo, 'dist', c.abiPath), 'utf8'))
      expect(keccak256(toBytes(canonical(abi))).slice(2)).toBe(c.abiHash)
      expect(m.assets.some((a) => a.path === c.abiPath)).toBe(true)
    }
    expect(m.assets.some((a) => a.path === 'index.html')).toBe(true)
    expect(m.assets.some((a) => a.path === 'imd-deployment.json')).toBe(false)
    for (const a of m.assets) {
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
      const bytes = fs.readFileSync(path.join(repo, 'dist', a.path))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha256)
    }
    expect(m.network?.chainId).toBe(m.chainId)
    expect(m.walletAddChain?.chainId).toBe(`0x${m.chainId.toString(16)}`)
    const chain = chainFromManifest(m)
    expect(chain.id).toBe(m.chainId)
    expect(chain.rpcUrls.default.http).toEqual(m.network?.rpcUrls)
  })

  it.skipIf(!fs.existsSync(path.join(repo, '.imd', 'reads', 'deployment.json')))('matches the handoff and chain table byte for byte', () => {
    const handoff = JSON.parse(fs.readFileSync(path.join(repo, '.imd', 'reads', 'deployment.json'), 'utf8'))
    const net = JSON.parse(fs.readFileSync(path.join(repo, '.imd', 'reads', 'network.json'), 'utf8'))
    const m = JSON.parse(fs.readFileSync(distManifest, 'utf8'))
    expect(m.launchId).toBe(handoff.launchId)
    expect(m.chainId).toBe(handoff.chainId)
    expect(m.sourceCommit).toBe(handoff.sourceCommit)
    expect(m.attestationHash).toBe(handoff.attestationHash)
    expect(m.poolKey).toEqual(handoff.poolKey)
    expect(m.network).toEqual(net.network)
    expect(m.walletAddChain).toEqual(net.walletAddChain)
    for (const c of handoff.contracts) {
      const mine = m.contracts.find((x: { name: string }) => x.name === c.name)
      expect(mine.address).toBe(c.address)
      expect(mine.abiHash).toBe(c.abiHash)
    }
  })

  it('rejects manifests with traversal or absolute ABI paths', () => {
    const base = { version: 1, launchId: 'x', chainId: 1, sourceCommit: 'c', attestationHash: 'a', assets: [] }
    expect(() => assertManifest({ ...base, contracts: [{ name: 'A', address: '0x' + '1'.repeat(40), abiHash: '', abiPath: '../abi/A.json' }] })).toThrow()
    expect(() => assertManifest({ ...base, contracts: [{ name: 'A', address: '0x' + '1'.repeat(40), abiHash: '', abiPath: 'https://x/A.json' }] })).toThrow()
    expect(() => assertManifest({ ...base, contracts: [{ name: 'A', address: '0x' + '1'.repeat(40), abiHash: '', abiPath: 'abi/A.json' }] })).not.toThrow()
  })

  it('exposes contracts by name', () => {
    const m = assertManifest({ version: 1, launchId: 'x', chainId: 1, sourceCommit: 'c', attestationHash: 'a', assets: [], contracts: [{ name: 'LaunchToken', address: '0x' + '1'.repeat(40), abiHash: '', abiPath: 'abi/LaunchToken.json' }] })
    const d = makeDeployment(m, { LaunchToken: [] })
    expect(d.contract('LaunchToken').address).toBe('0x' + '1'.repeat(40))
    expect(() => d.contract('MoonShop')).toThrow()
  })
})

describe('formatting and errors', () => {
  it('formats amounts with grouping and trimmed decimals', () => {
    expect(fmt(700_000_000n * 10n ** 18n, 18, 0)).toBe('700,000,000')
    expect(fmt(1234567n * 10n ** 16n)).toBe('12,345.67')
    expect(fmt(undefined)).toBe('…')
    expect(parseAmount('1,000.5')).toBe(10005n * 10n ** 17n)
    expect(parseAmount('abc')).toBeNull()
  })
  it('maps contract custom errors to plain language', () => {
    expect(errorMessage({ data: { errorName: 'NotFunded' } })).toMatch(/NOT FUNDED/)
    expect(errorMessage({ message: 'x', cause: { data: { errorName: 'PostOfficeRequired' } } })).toMatch(/post office/)
    expect(errorMessage({ shortMessage: 'User rejected the request.' })).toMatch(/rejected/)
  })
  it('detects unknown-chain wallet errors', () => {
    expect(isUnknownChain({ code: 4902 })).toBe(true)
    expect(isUnknownChain({ message: 'Unrecognized chain ID "0x1237"' })).toBe(true)
    expect(isUnknownChain({ code: 4001 })).toBe(false)
  })
})
