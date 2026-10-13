import { useState } from 'react'
import { useAccount, useChainId, useConnect, useDisconnect } from 'wagmi'
import type { EIP1193Provider } from 'viem'
import { useDeployment } from '../hooks/useDeployment'
import { switchOrAddChain } from '../lib/chain'
import { errorMessage, shortAddress } from '../lib/format'

export function MoonMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="22" fill="#d9d7d2" stroke="#1b1a2e" strokeWidth="3" />
      <circle cx="23" cy="25" r="5" fill="#a9a6a0" stroke="#1b1a2e" strokeWidth="2" />
      <circle cx="38" cy="38" r="7" fill="#a9a6a0" stroke="#1b1a2e" strokeWidth="2" />
      <circle cx="41" cy="22" r="3" fill="#a9a6a0" stroke="#1b1a2e" strokeWidth="2" />
    </svg>
  )
}

/** Header: name at the left edge, wallet utility at the right edge. */
export function Header() {
  return (
    <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
      <a href="#top" className="flex items-center gap-2 text-sky-text no-underline">
        <MoonMark className="h-9 w-9" />
        <span className="font-display text-lg">MOON</span>
      </a>
      <WalletButton />
    </header>
  )
}

export function WalletButton() {
  const { manifest } = useDeployment()
  const { address, isConnected, chainId: walletChain, connector } = useAccount()
  const configuredChain = useChainId()
  const { connectors, connectAsync, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  const wrongChain = isConnected && walletChain !== configuredChain
  const chainName = manifest.network?.name ?? `chain ${manifest.chainId}`

  async function connect() {
    setError(null)
    const connector = connectors[0]
    if (!connector) {
      setError('No browser wallet found. Install one such as MetaMask or Rabby, then reload.')
      return
    }
    try {
      await connectAsync({ connector })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function switchChain() {
    setError(null)
    setSwitching(true)
    try {
      const p = (await connector?.getProvider()) as EIP1193Provider | undefined
      if (!p) throw new Error('Wallet provider unavailable')
      await switchOrAddChain(p, manifest.chainId, manifest.walletAddChain)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {!isConnected ? (
        <button type="button" className="btn btn-gold" onClick={connect} disabled={isPending}>
          {isPending ? 'Connecting…' : 'Connect wallet'}
        </button>
      ) : wrongChain ? (
        <button type="button" className="btn btn-gold" onClick={switchChain} disabled={switching}>
          {switching ? 'Switching…' : `Switch to ${chainName}`}
        </button>
      ) : (
        <button type="button" className="btn btn-moon" onClick={() => disconnect()} title="Disconnect">
          <span className="font-mono text-sm">{address ? shortAddress(address) : ''}</span>
          <span className="sr-only">Connected. Disconnect</span>
        </button>
      )}
      {error && (
        <p role="alert" className="max-w-[16rem] text-right text-xs text-gold">
          {error}
        </p>
      )}
    </div>
  )
}

/** Hook used by action panels to decide whether transactions may be offered. */
export function useWalletGate() {
  const { address, isConnected, chainId: walletChain } = useAccount()
  const configuredChain = useChainId()
  const wrongChain = isConnected && walletChain !== configuredChain
  return { address, isConnected, wrongChain, ready: isConnected && !wrongChain && !!address, chainId: configuredChain }
}
