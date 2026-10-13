import { formatUnits, parseUnits, type Address } from 'viem'

/** Format a token amount with grouping, trimming to a sensible number of decimals. */
export function fmt(amount: bigint | undefined, decimals = 18, maxFraction = 2): string {
  if (amount === undefined) return '…'
  const s = formatUnits(amount, decimals)
  const [int, frac = ''] = s.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const f = frac.slice(0, maxFraction).replace(/0+$/, '')
  return f ? `${grouped}.${f}` : grouped
}

export function parseAmount(text: string, decimals = 18): bigint | null {
  const t = text.trim().replace(/,/g, '')
  if (!/^\d*(\.\d*)?$/.test(t) || t === '' || t === '.') return null
  try {
    return parseUnits(t, decimals)
  } catch {
    return null
  }
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function percent(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0
  return Number((part * 10000n) / whole) / 100
}

export function explorerAddress(explorer: string, a: Address): string {
  return `${explorer.replace(/\/$/, '')}/address/${a}`
}

export function explorerTx(explorer: string, h: string): string {
  return `${explorer.replace(/\/$/, '')}/tx/${h}`
}

/** Turn a viem/wagmi error into one line a visitor can act on. */
export function errorMessage(e: unknown): string {
  if (!e) return 'Unknown error'
  const err = e as { shortMessage?: string; message?: string; cause?: unknown; name?: string; data?: { errorName?: string } }
  const named = findErrorName(e)
  if (named) return `${CONTRACT_ERRORS[named] ?? named}`
  if (/User rejected|user rejected|denied/i.test(err.shortMessage ?? err.message ?? '')) return 'You rejected the request in your wallet.'
  return err.shortMessage ?? err.message ?? String(e)
}

function findErrorName(e: unknown, depth = 0): string | undefined {
  if (!e || depth > 6) return undefined
  const err = e as { data?: { errorName?: string }; cause?: unknown; name?: string; message?: string }
  if (err.data?.errorName) return err.data.errorName
  const m = /reverted with the following reason:\s*(\w+)|Error: (\w+)\(/.exec(err.message ?? '')
  if (m) return m[1] ?? m[2]
  return findErrorName(err.cause, depth + 1)
}

export const CONTRACT_ERRORS: Record<string, string> = {
  VoucherSignerNotConfigured: 'Claims are not open yet: the owner has not set the game server signer.',
  NotFunded: 'The reward pool is NOT FUNDED yet, so claims cannot pay out.',
  NotVoucherPlayer: 'This voucher names a different player. Connect that wallet to claim it.',
  InvalidMissionAmount: 'Mission rewards must be between 500 and 2,000 MOON.',
  WrongDay: 'This voucher is for a different UTC day. Ask the game for a new one.',
  VoucherExpired: 'This voucher has expired. Ask the game for a new one.',
  NonceAlreadyUsed: 'This voucher was already paid.',
  InvalidSignature: 'The signature does not match the current game server signer.',
  PostOfficeUnavailable: 'The post office could not be checked. Try again later.',
  PostOfficeRequired: 'Open a post office in Courier World before claiming.',
  WalletDailyCapExceeded: 'This claim would pass your 20,000 MOON daily cap. Try again after midnight UTC.',
  GlobalDailyCapExceeded: 'Today’s 1,000,000 MOON cap for everyone is reached. Try again after midnight UTC.',
  InsufficientRewards: 'The reward pool does not hold enough MOON for this claim.',
  EnforcedPause: 'Claims are paused by the owner.',
  ExpectedPause: 'Claims are not paused.',
  ItemNotFound: 'This item does not exist.',
  ItemDisabled: 'This item is not on sale.',
  PriceTooHigh: 'The price is above the maximum you set.',
  SupplyExceeded: 'Not enough supply left.',
  WalletLimitExceeded: 'You have reached the per-wallet limit for this item.',
  OwnableUnauthorizedAccount: 'Only the owner can do this.',
}
