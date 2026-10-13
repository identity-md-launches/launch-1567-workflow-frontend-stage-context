import type { ReactNode } from 'react'
import type { TxStatus } from '../hooks/useTx'
import { explorerTx } from '../lib/format'

export function Card({ children, className = '', id, title, subtitle }: { children: ReactNode; className?: string; id?: string; title?: string; subtitle?: string }) {
  return (
    <section id={id} className={`paper p-4 sm:p-5 ${className}`} aria-labelledby={title && id ? `${id}-h` : undefined}>
      {title && (
        <header className="mb-3">
          <h2 id={id ? `${id}-h` : undefined} className="text-lg">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="num text-lg break-words">{value}</dd>
      {hint && <dd className="text-xs text-ink-soft">{hint}</dd>}
    </div>
  )
}

export function TxStatusLine({ status, explorer, onDismiss }: { status: TxStatus; explorer?: string; onDismiss?: () => void }) {
  if (status.kind === 'idle') return null
  const base = 'mt-3 text-sm'
  if (status.kind === 'error')
    return (
      <div role="alert" className={`${base} text-bad`}>
        {status.message}
        {onDismiss && (
          <button type="button" className="ml-2 underline" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
    )
  const text =
    status.kind === 'simulating'
      ? 'Checking the transaction…'
      : status.kind === 'signing'
        ? 'Confirm in your wallet…'
        : status.kind === 'pending'
          ? 'Waiting for confirmation…'
          : 'Confirmed.'
  const hash = 'hash' in status ? status.hash : undefined
  return (
    <div role="status" aria-live="polite" className={`${base} ${status.kind === 'success' ? 'text-ok' : 'text-ink-soft'}`}>
      {text}{' '}
      {hash && explorer && (
        <a className="underline" href={explorerTx(explorer, hash)} target="_blank" rel="noreferrer">
          View transaction
        </a>
      )}
    </div>
  )
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'bad' | 'ok' }) {
  const color = tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-ink-soft'
  return <p className={`text-sm ${color}`}>{children}</p>
}

export function Field({ label, children, hint, id }: { label: string; children: ReactNode; hint?: ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-ink-soft">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  )
}
