import { useMemo, useState } from 'react'
import { useReadContract } from 'wagmi'
import { isAddress, isHex, type Address, type Hex } from 'viem'
import { useDeployment } from '../hooks/useDeployment'
import { usePoolState } from '../hooks/useMoon'
import { useTx } from '../hooks/useTx'
import { postOfficeAbi } from '../config'
import { fmt } from '../lib/format'
import { useWalletGate } from './Header'
import { Card, Field, Notice, TxStatusLine } from './ui'

interface Voucher {
  player: Address
  amount: bigint
  day: bigint
  nonce: bigint
  deadline: bigint
  signature: Hex
}

/** Parse the voucher JSON the game server hands the player. */
export function parseVoucher(text: string): Voucher | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: 'Paste the voucher exactly as the game gave it (JSON).' }
  }
  if (!raw || typeof raw !== 'object') return { error: 'The voucher must be a JSON object.' }
  const o = raw as Record<string, unknown>
  const v = (o.voucher && typeof o.voucher === 'object' ? o.voucher : o) as Record<string, unknown>
  const sig = (o.signature ?? v.signature) as unknown
  const big = (x: unknown) => {
    if (typeof x === 'bigint') return x
    if (typeof x === 'number' && Number.isInteger(x) && x >= 0) return BigInt(x)
    if (typeof x === 'string' && /^\d+$/.test(x)) return BigInt(x)
    return null
  }
  if (typeof v.player !== 'string' || !isAddress(v.player)) return { error: 'The voucher player must be an address.' }
  const amount = big(v.amount)
  const day = big(v.day)
  const nonce = big(v.nonce)
  const deadline = big(v.deadline)
  if (amount === null || day === null || nonce === null || deadline === null) return { error: 'amount, day, nonce and deadline must be whole numbers.' }
  if (typeof sig !== 'string' || !isHex(sig) || sig.length !== 132) return { error: 'The signature must be a 65-byte hex string.' }
  return { player: v.player, amount, day, nonce, deadline, signature: sig }
}

export function Claim() {
  const d = useDeployment()
  const gate = useWalletGate()
  const pool = usePoolState()
  const tx = useTx()
  const [text, setText] = useState('')
  const parsed = useMemo(() => (text.trim() ? parseVoucher(text) : null), [text])
  const voucher = parsed && !('error' in parsed) ? parsed : null
  const rewards = d.contract('MoonRewards')

  const office = useReadContract({
    address: pool.postOffice,
    abi: postOfficeAbi,
    functionName: 'offices',
    args: gate.address ? [gate.address] : undefined,
    query: { enabled: !!gate.address && !!pool.postOffice },
  })
  const officeOpen = office.data ? office.data[0] : undefined

  const signerSet = pool.voucherSigner !== undefined && BigInt(pool.voucherSigner) !== 0n
  const nowDay = BigInt(Math.floor(Date.now() / 86400000))
  const problems: string[] = []
  if (pool.isFunded === false) problems.push('The pool is NOT FUNDED; claims cannot pay yet.')
  if (pool.voucherSigner !== undefined && !signerSet) problems.push('The owner has not set the game server signer yet.')
  if (pool.paused) problems.push('Claims are paused by the owner.')
  if (gate.ready && officeOpen === false) problems.push('Your wallet has no open post office in Courier World.')
  if (voucher && gate.address && voucher.player.toLowerCase() !== gate.address.toLowerCase()) problems.push('This voucher names a different wallet.')
  if (voucher && voucher.day !== nowDay) problems.push(`This voucher is for UTC day ${voucher.day}; today is day ${nowDay}.`)
  if (voucher && voucher.deadline < BigInt(Math.floor(Date.now() / 1000))) problems.push('This voucher has expired.')
  const canSend = gate.ready && !!voucher && problems.length === 0 && !tx.busy

  async function claim() {
    if (!voucher || !gate.address) return
    const hash = await tx.send({
      ...rewards,
      functionName: 'claim',
      args: [{ player: voucher.player, amount: voucher.amount, day: voucher.day, nonce: voucher.nonce, deadline: voucher.deadline }, voucher.signature],
      account: gate.address,
      chainId: gate.chainId,
    })
    if (hash) pool.refetch()
  }

  return (
    <Card id="claim" title="Claim a mission reward" subtitle="Paste the voucher the game server gave you after a delivery. Only the named wallet can claim it, once, on its UTC day.">
      <Field id="voucher" label="Mission voucher (JSON with player, amount, day, nonce, deadline, signature)">
        <textarea
          id="voucher"
          className="field font-mono text-sm"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"player":"0x…","amount":"500000000000000000000","day":"20740","nonce":"1","deadline":"1760400000","signature":"0x…"}'
          aria-describedby="voucher-hint"
          spellCheck={false}
        />
      </Field>
      {parsed && 'error' in parsed && (
        <div className="mt-2">
          <Notice tone="bad">{parsed.error}</Notice>
        </div>
      )}
      {voucher && (
        <p className="num mt-2 text-sm">
          Claims <strong>{fmt(voucher.amount)} MOON</strong> for day {voucher.day.toString()}, nonce {voucher.nonce.toString()}.
        </p>
      )}
      {problems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {problems.map((p) => (
            <li key={p}>
              <Notice tone="warn">{p}</Notice>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-gold" onClick={claim} disabled={!canSend}>
          {tx.busy ? 'Claiming…' : 'Claim MOON'}
        </button>
        {!gate.isConnected && <span className="text-sm text-ink-soft">Connect a wallet to claim.</span>}
        {gate.wrongChain && <span className="text-sm text-ink-soft">Switch to {d.manifest.network?.name ?? 'the launch chain'} first.</span>}
        {gate.ready && officeOpen === true && <span className="text-sm text-ok">Post office open.</span>}
      </div>
      <TxStatusLine status={tx.status} explorer={d.manifest.network?.explorer} onDismiss={tx.reset} />
      <p className="mt-3 text-xs text-ink-soft">
        Caps: 20,000 MOON per wallet and 1,000,000 MOON for everyone per UTC day. A claim over a cap fails and the voucher stays unused. Gas is not refundable.
      </p>
    </Card>
  )
}
