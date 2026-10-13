import { useDeployment } from '../hooks/useDeployment'
import { usePoolState } from '../hooks/useMoon'
import { explorerAddress } from '../lib/format'

export function Footer() {
  const { manifest } = useDeployment()
  const pool = usePoolState()
  const explorer = manifest.network?.explorer
  const rows = [...manifest.contracts.map((c) => ({ name: c.name, address: c.address }))]
  if (pool.postOffice) rows.push({ name: 'PostOffice', address: pool.postOffice })
  return (
    <footer className="relative z-10 mx-auto max-w-5xl px-4 pb-10 pt-4 text-sm text-sky-muted">
      <h2 className="text-base text-sky-text">Contracts on {manifest.network?.name ?? `chain ${manifest.chainId}`}</h2>
      <ul className="mt-2 space-y-1">
        {rows.map((c) => (
          <li key={c.name} className="flex flex-wrap gap-x-2">
            <span className="text-sky-text">{c.name}</span>
            {explorer ? (
              <a className="break-all font-mono text-xs underline" href={explorerAddress(explorer, c.address)} target="_blank" rel="noreferrer">
                {c.address}
              </a>
            ) : (
              <span className="break-all font-mono text-xs">{c.address}</span>
            )}
          </li>
        ))}
      </ul>
      {manifest.poolKey && (
        <p className="mt-2 break-all text-xs">
          Pool: {manifest.poolKey.currency0} / {manifest.poolKey.currency1}, fee {manifest.poolKey.fee}, tick spacing {manifest.poolKey.tickSpacing}, hooks {manifest.poolKey.hooks}
        </p>
      )}
      <p className="mt-3">
        Nobody can mint MOON or withdraw the reward pool. The owner can only rotate the game server signer and pause claims. An owner who installs a signer they control could still authorize claims within the same daily caps and post office rule.
      </p>
      <p className="mt-2 text-xs">
        Chain id {manifest.chainId}. Source commit <span className="font-mono">{manifest.sourceCommit.slice(0, 12)}</span>.{' '}
        <a className="underline" href="./voucher-types.json">EIP-712 voucher types</a> ·{' '}
        <a className="underline" href="./imd-deployment.json">deployment configuration</a>
      </p>
    </footer>
  )
}
