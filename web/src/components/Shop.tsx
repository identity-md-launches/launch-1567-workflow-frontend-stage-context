import { useMemo, useState } from 'react'
import { usePublicClient, useReadContracts } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useDeployment } from '../hooks/useDeployment'
import { usePlayerState, usePoolState } from '../hooks/useMoon'
import { useTx } from '../hooks/useTx'
import { fmt } from '../lib/format'
import { useWalletGate } from './Header'
import { Card, Notice, TxStatusLine } from './ui'

interface Item {
  id: bigint
  price: bigint
  maxSupply: bigint
  perWalletLimit: bigint
  minted: bigint
  enabled: boolean
  exists: boolean
  uri: string
}

/** How many item ids (starting at 0) are probed for the catalog. */
export const CATALOG_PROBE_IDS = 64

/**
 * Catalog ids: the configured public RPCs refuse wide eth_getLogs ranges (archive gating), so
 * instead of scanning ItemConfigured logs the shop probes `items(id).exists` for ids
 * 0..CATALOG_PROBE_IDS-1 in one batched request. Items with higher ids can be looked up by
 * number below the grid.
 */
function useCatalogIds(extra: bigint[]) {
  const d = useDeployment()
  const client = usePublicClient()
  const shop = d.contract('MoonShop')
  return useQuery({
    queryKey: ['catalog-ids', shop.address, extra.map(String).join(',')],
    enabled: !!client,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!client) return [] as bigint[]
      const probe = Array.from({ length: CATALOG_PROBE_IDS }, (_, i) => BigInt(i))
      // Individual eth_call reads; the http transport batches them into one JSON-RPC request.
      const res = await Promise.all(
        probe.map((id) =>
          client.readContract({ ...shop, functionName: 'items', args: [id] }).then(
            (r) => r as readonly [bigint, bigint, bigint, bigint, boolean, boolean],
            () => undefined,
          ),
        ),
      )
      const ids = new Set<string>()
      res.forEach((row, i) => {
        if (row?.[5]) ids.add(probe[i].toString())
      })
      for (const e of extra) ids.add(e.toString())
      return [...ids].map((s) => BigInt(s)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    },
  })
}

export function useItems(ids: bigint[] | undefined, buyer: Address | undefined) {
  const d = useDeployment()
  const shop = d.contract('MoonShop')
  const q = useReadContracts({
    contracts: (ids ?? []).flatMap((id) => [
      { ...shop, functionName: 'items', args: [id] },
      { ...shop, functionName: 'uri', args: [id] },
      { ...shop, functionName: 'balanceOf', args: [buyer ?? shop.address, id] },
      { ...shop, functionName: 'purchased', args: [buyer ?? shop.address, id] },
    ]),
    query: { enabled: !!ids && ids.length > 0 },
    allowFailure: true,
  })
  const items = useMemo(() => {
    if (ids && ids.length === 0) return []
    if (!ids || !q.data) return undefined
    return ids.map((id, i) => {
      const it = q.data[i * 4]?.status === 'success' ? (q.data[i * 4].result as readonly [bigint, bigint, bigint, bigint, boolean, boolean]) : undefined
      const uri = q.data[i * 4 + 1]?.status === 'success' ? (q.data[i * 4 + 1].result as string) : ''
      const owned = buyer && q.data[i * 4 + 2]?.status === 'success' ? (q.data[i * 4 + 2].result as bigint) : 0n
      const purchased = buyer && q.data[i * 4 + 3]?.status === 'success' ? (q.data[i * 4 + 3].result as bigint) : 0n
      const item: Item & { owned: bigint; purchased: bigint } = {
        id,
        price: it?.[0] ?? 0n,
        maxSupply: it?.[1] ?? 0n,
        perWalletLimit: it?.[2] ?? 0n,
        minted: it?.[3] ?? 0n,
        enabled: it?.[4] ?? false,
        exists: it?.[5] ?? false,
        uri,
        owned,
        purchased,
      }
      return item
    })
  }, [ids, q.data, buyer])
  return { items, refetch: () => void q.refetch(), loading: q.isLoading }
}

export function Shop() {
  const gate = useWalletGate()
  const pool = usePoolState()
  const me = usePlayerState(gate.address, pool.currentDay)
  const [extra, setExtra] = useState<bigint[]>([])
  const [lookup, setLookup] = useState('')
  const idsQ = useCatalogIds(extra)
  const { items, refetch, loading } = useItems(idsQ.data, gate.address)
  const companions = items?.filter((i) => i.owned > 0n) ?? []
  const shown = items?.filter((i) => i.exists) ?? []

  return (
    <Card id="shop" title="Courier Companions shop" subtitle="Pets, companions and other items sold for MOON. Half of every payment is burned and half returns to the reward pool. Nothing goes to the owner.">
      {gate.address && (
        <p className="mb-3 text-sm">
          Your companions:{' '}
          {companions.length === 0 ? 'none yet' : companions.map((c) => `#${c.id.toString()} ×${c.owned.toString()}`).join(', ')}
        </p>
      )}
      {idsQ.isError && <Notice tone="bad">Could not read the catalog from the chain. Reload to try again.</Notice>}
      {(idsQ.isLoading || loading) && <p className="text-sm text-ink-soft">Loading catalog…</p>}
      {items && shown.length === 0 && !loading && <Notice>The shop catalog is empty. The owner has not added any items yet.</Notice>}
      {shown.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((it) => (
            <li key={it.id.toString()}>
              <ItemCard item={it} balance={me.balance} allowance={me.shopAllowance} onBought={() => {
                refetch()
                me.refetch()
                pool.refetch()
              }} />
            </li>
          ))}
        </ul>
      )}
      {!gate.isConnected && shown.length > 0 && <p className="mt-3 text-sm text-ink-soft">Connect a wallet to buy.</p>}
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (/^\d+$/.test(lookup.trim())) setExtra((x) => [...x, BigInt(lookup.trim())])
        }}
      >
        <div>
          <label htmlFor="item-lookup" className="block text-sm text-ink-soft">
            Look up an item id above {CATALOG_PROBE_IDS - 1}
          </label>
          <input id="item-lookup" className="field w-36" inputMode="numeric" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="e.g. 120" />
        </div>
        <button type="submit" className="btn btn-sm" disabled={!/^\d+$/.test(lookup.trim())}>
          Show item
        </button>
      </form>
    </Card>
  )
}

function ItemCard({ item, balance, allowance, onBought }: { item: Item & { owned: bigint; purchased: bigint }; balance?: bigint; allowance?: bigint; onBought: () => void }) {
  const d = useDeployment()
  const gate = useWalletGate()
  const approveTx = useTx()
  const buyTx = useTx()
  const [qty, setQty] = useState(1)
  const token = d.contract('LaunchToken')
  const shop = d.contract('MoonShop')
  const q = BigInt(Math.max(1, Math.floor(qty || 1)))
  const total = item.price * q
  const half = total / 2n
  const left = item.maxSupply === 0n ? undefined : item.maxSupply > item.minted ? item.maxSupply - item.minted : 0n
  const walletLeft = item.perWalletLimit === 0n ? undefined : item.perWalletLimit > item.purchased ? item.perWalletLimit - item.purchased : 0n
  const needsApproval = (allowance ?? 0n) < total
  const soldOut = left !== undefined && left === 0n
  const reasons: string[] = []
  if (!item.enabled) reasons.push('Not on sale right now.')
  if (soldOut) reasons.push('Sold out.')
  if (left !== undefined && left > 0n && q > left) reasons.push(`Only ${left.toString()} left.`)
  if (walletLeft !== undefined && walletLeft === 0n) reasons.push('You reached the per-wallet limit.')
  if (walletLeft !== undefined && walletLeft > 0n && q > walletLeft) reasons.push(`You can buy ${walletLeft.toString()} more.`)
  if (balance !== undefined && balance < total) reasons.push('Not enough MOON.')
  const blocked = reasons.length > 0

  async function approve() {
    if (!gate.address) return
    await approveTx.send({ ...token, functionName: 'approve', args: [shop.address, total], account: gate.address, chainId: gate.chainId })
    onBought()
  }
  async function buy() {
    if (!gate.address) return
    const h = await buyTx.send({ ...shop, functionName: 'buy', args: [item.id, q, total], account: gate.address, chainId: gate.chainId })
    if (h) onBought()
  }

  return (
    <article className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base">Item #{item.id.toString()}</h3>
        {gate.address && item.owned > 0n && <span className="text-xs text-ink-soft">You own {item.owned.toString()}</span>}
      </div>
      <p className="num text-lg">{fmt(item.price)} MOON</p>
      <p className="text-sm text-ink-soft">
        {left === undefined ? 'Unlimited supply' : `${left.toString()} left of ${item.maxSupply.toString()}`}
        {item.perWalletLimit > 0n ? ` · ${item.perWalletLimit.toString()} per wallet` : ''}
        {!item.enabled ? ' · off sale' : ''}
      </p>
      {item.uri && (
        <a className="mt-1 break-all text-xs underline" href={item.uri} target="_blank" rel="noreferrer">
          Metadata
        </a>
      )}
      <div className="mt-2 flex items-center gap-2">
        <label htmlFor={`qty-${item.id}`} className="text-sm text-ink-soft">
          Quantity
        </label>
        <input id={`qty-${item.id}`} type="number" min={1} step={1} className="field w-24" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      </div>
      <p className="num mt-2 text-sm">
        Pay {fmt(total)} MOON: {fmt(half)} burned, {fmt(total - half)} back to the pool.
      </p>
      {gate.ready && blocked && <p className="mt-1 text-sm text-warn">{reasons.join(' ')}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        {needsApproval && (
          <button type="button" className="btn btn-sm" onClick={approve} disabled={!gate.ready || blocked || approveTx.busy}>
            {approveTx.busy ? 'Approving…' : 'Approve MOON'}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-gold" onClick={buy} disabled={!gate.ready || blocked || needsApproval || buyTx.busy}>
          {buyTx.busy ? 'Buying…' : 'Buy: half burned, half to pool'}
        </button>
      </div>
      <TxStatusLine status={approveTx.status} explorer={d.manifest.network?.explorer} onDismiss={approveTx.reset} />
      <TxStatusLine status={buyTx.status} explorer={d.manifest.network?.explorer} onDismiss={buyTx.reset} />
    </article>
  )
}
