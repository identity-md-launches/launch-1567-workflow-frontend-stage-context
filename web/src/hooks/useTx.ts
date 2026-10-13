import { useCallback, useState } from 'react'
import { useConfig } from 'wagmi'
import { simulateContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions'
import type { Abi, Address, Hex } from 'viem'
import { errorMessage } from '../lib/format'

export type TxStatus =
  | { kind: 'idle' }
  | { kind: 'simulating' }
  | { kind: 'signing' }
  | { kind: 'pending'; hash: Hex }
  | { kind: 'success'; hash: Hex }
  | { kind: 'error'; message: string }

/**
 * One transaction lifecycle: simulate (so a revert reason shows before the wallet opens),
 * ask the wallet to sign, wait for the receipt. Each step is visible to the visitor.
 */
export function useTx() {
  const config = useConfig()
  const [status, setStatus] = useState<TxStatus>({ kind: 'idle' })

  const send = useCallback(
    async (req: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint; account: Address; chainId: number }) => {
      try {
        setStatus({ kind: 'simulating' })
        const sim = await simulateContract(config, {
          address: req.address,
          abi: req.abi,
          functionName: req.functionName,
          args: req.args as never,
          value: req.value,
          account: req.account,
          chainId: req.chainId,
        })
        setStatus({ kind: 'signing' })
        const hash = await writeContract(config, sim.request as never)
        setStatus({ kind: 'pending', hash })
        await waitForTransactionReceipt(config, { hash, chainId: req.chainId })
        setStatus({ kind: 'success', hash })
        return hash
      } catch (e) {
        setStatus({ kind: 'error', message: errorMessage(e) })
        return undefined
      }
    },
    [config],
  )

  const reset = useCallback(() => setStatus({ kind: 'idle' }), [])
  return { status, send, reset, busy: status.kind === 'simulating' || status.kind === 'signing' || status.kind === 'pending' }
}
