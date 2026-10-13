import { useAccount } from 'wagmi'
import { useDeployment } from '../hooks/useDeployment'
import { usePlayerState, usePoolState } from '../hooks/useMoon'
import { PLAY_URL } from '../config'
import { fmt, percent } from '../lib/format'
import { MoonMark } from './Header'
import { Notice, Stat } from './ui'

/**
 * First screen: what MOON is, the live pool state it acts on, and the main actions
 * (play, claim, connect). Watching needs no wallet.
 */
export function Overview() {
  const d = useDeployment()
  const pool = usePoolState()
  const { address } = useAccount()
  const me = usePlayerState(address, pool.currentDay)
  const explorer = d.manifest.network?.explorer

  const fundedState =
    pool.isFunded === undefined ? undefined : pool.isFunded ? 'Funded' : pool.activated ? 'Pool below activation balance' : 'NOT FUNDED'
  const claimsOpen = pool.isFunded && pool.paused === false && pool.voucherSigner && BigInt(pool.voucherSigner) !== 0n

  return (
    <section id="top" className="relative z-10 mx-auto max-w-5xl px-4 pt-2 pb-6" aria-labelledby="hero-h">
      <div className="flex items-start gap-3 sm:gap-6">
        <MoonMark className="moon-art" />
        <div className="min-w-0">
          <h1 id="hero-h" className="text-2xl text-gold">
            Deliver letters. Earn MOON.
          </h1>
          <p className="mt-2 max-w-xl text-base text-sky-text">
            MOON is earned by playing Courier World. Deliver letters, earn MOON, spend it on companions. A game currency, not an investment.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <a className="btn btn-gold text-base" href={PLAY_URL} target="_blank" rel="noreferrer">
          Play Courier World
        </a>
        <a className="btn" href="#claim">
          Claim a mission
        </a>
        <a className="btn" href="#shop">
          Shop
        </a>
      </div>

      <div className="paper mt-5 p-4 sm:p-5" aria-live="polite" aria-busy={pool.loading}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg">Reward pool</h2>
          {fundedState && (
            <span className={`font-display text-sm ${pool.isFunded ? 'text-ok' : 'text-bad'}`} role="status">
              {fundedState}
            </span>
          )}
        </div>
        {pool.error && !pool.poolBalance && (
          <div className="mt-2">
            <Notice tone="bad">Could not read the chain. Check your connection and retry; nothing here is cached.</Notice>
          </div>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Stat label="Pool balance" value={`${fmt(pool.poolBalance, 18, 0)} MOON`} hint={pool.initialFunding !== undefined ? `Activation needs ${fmt(pool.initialFunding, 18, 0)} MOON` : undefined} />
          <Stat
            label="Paid today"
            value={`${fmt(pool.paidToday, 18, 0)} MOON`}
            hint={pool.globalCap !== undefined && pool.paidToday !== undefined ? `${percent(pool.paidToday, pool.globalCap)}% of the ${fmt(pool.globalCap, 18, 0)} daily cap` : undefined}
          />
          <Stat label="Total paid to players" value={`${fmt(pool.totalPaid, 18, 0)} MOON`} />
          <Stat label="Burned by the shop" value={`${fmt(pool.totalBurned, 18, 0)} MOON`} hint={pool.totalRecycled !== undefined ? `${fmt(pool.totalRecycled, 18, 0)} MOON recycled into the pool` : undefined} />
          <Stat label="Creator wallet MOON" value={`${fmt(pool.creatorBalance, 18, 0)} MOON`} hint="Target: 0" />
          <Stat label="Claims" value={claimsOpen === undefined ? '…' : claimsOpen ? 'Open' : pool.paused ? 'Paused' : !pool.isFunded ? 'Not funded' : 'Signer not set'} />
          {address && <Stat label="Your MOON" value={`${fmt(me.balance)} MOON`} hint={pool.walletCap !== undefined ? `${fmt(me.paidToday ?? 0n, 18, 0)} of ${fmt(pool.walletCap, 18, 0)} claimed today` : undefined} />}
        </dl>
        {explorer && pool.owner && (
          <p className="mt-3 text-xs text-ink-soft">
            Funding transactions appear as transfers into the pool from the creator wallet.{' '}
            <a className="underline" href={`${explorer}/address/${d.contract('MoonRewards').address}#tokentxns`} target="_blank" rel="noreferrer">
              See pool transfers on the explorer
            </a>
          </p>
        )}
      </div>
    </section>
  )
}
