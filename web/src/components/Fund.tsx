import { useState } from 'react'
import { useDeployment } from '../hooks/useDeployment'
import { usePlayerState, usePoolState } from '../hooks/useMoon'
import { useTx } from '../hooks/useTx'
import { fmt, parseAmount } from '../lib/format'
import { useWalletGate } from './Header'
import { Card, Field, Notice, TxStatusLine } from './ui'

/** Permanent deposits into MoonRewards: approve, then fund. */
export function Fund() {
  const d = useDeployment()
  const gate = useWalletGate()
  const pool = usePoolState()
  const me = usePlayerState(gate.address, pool.currentDay)
  const approveTx = useTx()
  const fundTx = useTx()
  const [text, setText] = useState('')
  const amount = parseAmount(text)
  const token = d.contract('LaunchToken')
  const rewards = d.contract('MoonRewards')
  const needsApproval = amount !== null && amount > 0n && (me.rewardsAllowance ?? 0n) < amount
  const tooMuch = amount !== null && me.balance !== undefined && amount > me.balance

  async function approve() {
    if (!amount || !gate.address) return
    const h = await approveTx.send({ ...token, functionName: 'approve', args: [rewards.address, amount], account: gate.address, chainId: gate.chainId })
    if (h) me.refetch()
  }
  async function fund() {
    if (!amount || !gate.address) return
    const h = await fundTx.send({ ...rewards, functionName: 'fund', args: [amount], account: gate.address, chainId: gate.chainId })
    if (h) {
      me.refetch()
      pool.refetch()
      setText('')
    }
  }

  return (
    <Card id="fund" title="Fund the reward pool" subtitle="Anyone can deposit MOON. Deposits are permanent: nobody, including the owner, can withdraw them.">
      <Field id="fund-amount" label="Amount in MOON" hint={gate.address ? `You hold ${fmt(me.balance)} MOON` : undefined}>
        <input id="fund-amount" className="field num" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="1000" aria-describedby="fund-amount-hint" />
      </Field>
      {tooMuch && (
        <div className="mt-2">
          <Notice tone="warn">That is more MOON than this wallet holds.</Notice>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={approve} disabled={!gate.ready || !amount || !needsApproval || approveTx.busy || tooMuch}>
          {approveTx.busy ? 'Approving…' : needsApproval ? '1. Approve MOON' : '1. Approved'}
        </button>
        <button type="button" className="btn btn-gold" onClick={fund} disabled={!gate.ready || !amount || needsApproval || fundTx.busy || tooMuch}>
          {fundTx.busy ? 'Depositing…' : '2. Deposit permanently'}
        </button>
        {!gate.isConnected && <span className="text-sm text-ink-soft">Connect a wallet to deposit.</span>}
      </div>
      <TxStatusLine status={approveTx.status} explorer={d.manifest.network?.explorer} onDismiss={approveTx.reset} />
      <TxStatusLine status={fundTx.status} explorer={d.manifest.network?.explorer} onDismiss={fundTx.reset} />
    </Card>
  )
}
