import type { EIP1193Provider } from 'viem'
import type { WalletAddChain } from '../config'

/**
 * Switch the wallet to the launch chain. When the wallet does not know the chain
 * (code 4902 or an "unrecognized chain" message) offer wallet_addEthereumChain with the
 * exact parameters from the chain table, then switch again.
 */
export async function switchOrAddChain(provider: EIP1193Provider, chainId: number, add?: WalletAddChain): Promise<void> {
  const hexId = `0x${chainId.toString(16)}` as `0x${string}`
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
    return
  } catch (e) {
    if (!isUnknownChain(e) || !add) throw e
  }
  await provider.request({ method: 'wallet_addEthereumChain', params: [add] })
  await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
}

export function isUnknownChain(e: unknown): boolean {
  const err = e as { code?: number; message?: string; data?: { originalError?: { code?: number } }; cause?: unknown }
  if (err?.code === 4902 || err?.data?.originalError?.code === 4902) return true
  if (/unrecognized chain|unknown chain|not been added|Unrecognized chain ID|does not exist/i.test(err?.message ?? '')) return true
  if (err?.cause) return isUnknownChain(err.cause)
  return false
}
