import { useState } from 'react'
import { isAddress } from 'viem'
import { useDeployment } from '../hooks/useDeployment'
import { usePoolState } from '../hooks/useMoon'
import { useTx } from '../hooks/useTx'
import { parseAmount, shortAddress } from '../lib/format'
import { useWalletGate } from './Header'
import { Card, Field, Notice, TxStatusLine } from './ui'

/** Shown only to the connected owner: one control per owner setting. */
export function Owner() {
  const gate = useWalletGate()
  const pool = usePoolState()
  const isRewardsOwner = !!gate.address && !!pool.owner && gate.address.toLowerCase() === pool.owner.toLowerCase()
  const isShopOwner = !!gate.address && !!pool.shopOwner && gate.address.toLowerCase() === pool.shopOwner.toLowerCase()
  if (!gate.ready || (!isRewardsOwner && !isShopOwner)) return null
  return (
    <Card id="owner" title="Owner setup" subtitle="You are connected as the owner. These are the only owner powers; none of them can move pool tokens.">
      <div className="grid gap-4 md:grid-cols-2">
        {isRewardsOwner && <SignerPanel />}
        {isRewardsOwner && <PausePanel />}
        {isShopOwner && <ItemPanel />}
      </div>
    </Card>
  )
}

function SignerPanel() {
  const d = useDeployment()
  const gate = useWalletGate()
  const pool = usePoolState()
  const tx = useTx()
  const [signer, setSigner] = useState('')
  const rewards = d.contract('MoonRewards')
  const current = pool.voucherSigner && BigInt(pool.voucherSigner) !== 0n ? pool.voucherSigner : undefined
  async function save() {
    if (!gate.address || !isAddress(signer)) return
    const h = await tx.send({ ...rewards, functionName: 'setVoucherSigner', args: [signer], account: gate.address, chainId: gate.chainId })
    if (h) {
      pool.refetch()
      setSigner('')
    }
  }
  return (
    <div>
      <h3 className="text-base">Game server signer</h3>
      <p className="text-sm text-ink-soft">{current ? `Current: ${shortAddress(current)}` : 'Not set: claims revert until a signer is configured.'}</p>
      <Field id="signer" label="New signer address (EOA)">
        <input id="signer" className="field font-mono text-sm" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="0x…" spellCheck={false} />
      </Field>
      <button type="button" className="btn btn-sm btn-gold mt-2" onClick={save} disabled={!isAddress(signer) || tx.busy}>
        {tx.busy ? 'Saving…' : 'Set signer'}
      </button>
      <TxStatusLine status={tx.status} explorer={d.manifest.network?.explorer} onDismiss={tx.reset} />
    </div>
  )
}

function PausePanel() {
  const d = useDeployment()
  const gate = useWalletGate()
  const pool = usePoolState()
  const tx = useTx()
  const rewards = d.contract('MoonRewards')
  async function toggle() {
    if (!gate.address) return
    const h = await tx.send({ ...rewards, functionName: pool.paused ? 'unpause' : 'pause', args: [], account: gate.address, chainId: gate.chainId })
    if (h) pool.refetch()
  }
  return (
    <div>
      <h3 className="text-base">Claims</h3>
      <p className="text-sm text-ink-soft">{pool.paused ? 'Claims are paused. Deposits and shop recycling continue.' : 'Claims are running.'}</p>
      <button type="button" className="btn btn-sm mt-2" onClick={toggle} disabled={pool.paused === undefined || tx.busy}>
        {tx.busy ? 'Sending…' : pool.paused ? 'Resume claims' : 'Pause claims'}
      </button>
      <TxStatusLine status={tx.status} explorer={d.manifest.network?.explorer} onDismiss={tx.reset} />
    </div>
  )
}

function ItemPanel() {
  const d = useDeployment()
  const gate = useWalletGate()
  const tx = useTx()
  const shop = d.contract('MoonShop')
  const [id, setId] = useState('')
  const [price, setPrice] = useState('')
  const [maxSupply, setMaxSupply] = useState('0')
  const [perWallet, setPerWallet] = useState('0')
  const [enabled, setEnabled] = useState(true)
  const [uri, setUri] = useState('')
  const priceWei = parseAmount(price)
  const valid = /^\d+$/.test(id) && priceWei !== null && priceWei > 0n && /^\d+$/.test(maxSupply) && /^\d+$/.test(perWallet) && uri.trim().length > 0
  async function save() {
    if (!gate.address || !valid || priceWei === null) return
    await tx.send({
      ...shop,
      functionName: 'configureItem',
      args: [BigInt(id), priceWei, BigInt(maxSupply), BigInt(perWallet), enabled, uri.trim()],
      account: gate.address,
      chainId: gate.chainId,
    })
  }
  return (
    <div className="md:col-span-2">
      <h3 className="text-base">Add or edit a shop item</h3>
      <p className="text-sm text-ink-soft">0 means unlimited for supply and per-wallet limit. Supply cannot go below what is already minted.</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field id="item-id" label="Item id">
          <input id="item-id" className="field num" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} />
        </Field>
        <Field id="item-price" label="Price in MOON">
          <input id="item-price" className="field num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field id="item-supply" label="Max supply (0 = unlimited)">
          <input id="item-supply" className="field num" inputMode="numeric" value={maxSupply} onChange={(e) => setMaxSupply(e.target.value)} />
        </Field>
        <Field id="item-wallet" label="Per-wallet limit (0 = unlimited)">
          <input id="item-wallet" className="field num" inputMode="numeric" value={perWallet} onChange={(e) => setPerWallet(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field id="item-uri" label="Metadata URI">
            <input id="item-uri" className="field" value={uri} onChange={(e) => setUri(e.target.value)} placeholder="ipfs://…" />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          On sale
        </label>
      </div>
      {!valid && (id || price || uri) && <Notice tone="warn">Needs a whole-number id, a positive price, whole-number limits and a metadata URI.</Notice>}
      <button type="button" className="btn btn-sm btn-gold mt-2" onClick={save} disabled={!valid || tx.busy}>
        {tx.busy ? 'Saving…' : 'Save item'}
      </button>
      <TxStatusLine status={tx.status} explorer={d.manifest.network?.explorer} onDismiss={tx.reset} />
    </div>
  )
}
