import { encodeAbiParameters, encodePacked, type Address, type Hex } from 'viem'
import type { PoolKey } from '../config'

export const V4_SWAP = 0x10
export const ACTIONS = '0x060c0f' as const // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL

const POOL_KEY_COMPONENTS = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const

export interface SwapPlan {
  commands: Hex
  inputs: Hex[]
  value: bigint
}

/** Which way the pool swaps for a given input currency. */
export function zeroForOne(poolKey: PoolKey, inputCurrency: Address): boolean {
  return inputCurrency.toLowerCase() === poolKey.currency0.toLowerCase()
}

/** Sort two currencies ascending by address; native ETH (zero) always sorts first. */
export function sortCurrencies(a: Address, b: Address): [Address, Address] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a]
}

/**
 * Build the universal router `execute` arguments for an exact-input single-pool v4 swap.
 * `extended` selects the six-field ExactInputSingleParams used by Robinhood Chain's router.
 */
export function buildSwap(opts: {
  poolKey: PoolKey
  inputCurrency: Address
  outputCurrency: Address
  amountIn: bigint
  amountOutMinimum: bigint
  extended: boolean
}): SwapPlan {
  const { poolKey, inputCurrency, outputCurrency, amountIn, amountOutMinimum, extended } = opts
  const z = zeroForOne(poolKey, inputCurrency)
  const key = {
    currency0: poolKey.currency0,
    currency1: poolKey.currency1,
    fee: poolKey.fee,
    tickSpacing: poolKey.tickSpacing,
    hooks: poolKey.hooks,
  }
  const swapParams = extended
    ? encodeAbiParameters(
        [
          {
            type: 'tuple',
            components: [
              { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
              { name: 'zeroForOne', type: 'bool' },
              { name: 'amountIn', type: 'uint128' },
              { name: 'amountOutMinimum', type: 'uint128' },
              { name: 'reserved', type: 'uint256' },
              { name: 'hookData', type: 'bytes' },
            ],
          },
        ],
        [{ poolKey: key, zeroForOne: z, amountIn, amountOutMinimum, reserved: 0n, hookData: '0x' }],
      )
    : encodeAbiParameters(
        [
          {
            type: 'tuple',
            components: [
              { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
              { name: 'zeroForOne', type: 'bool' },
              { name: 'amountIn', type: 'uint128' },
              { name: 'amountOutMinimum', type: 'uint128' },
              { name: 'hookData', type: 'bytes' },
            ],
          },
        ],
        [{ poolKey: key, zeroForOne: z, amountIn, amountOutMinimum, hookData: '0x' }],
      )
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [inputCurrency, amountIn])
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [outputCurrency, amountOutMinimum])
  const input0 = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [ACTIONS, [swapParams, settle, take]])
  const isNativeIn = BigInt(inputCurrency) === 0n
  return {
    commands: encodePacked(['uint8'], [V4_SWAP]),
    inputs: [input0],
    value: isNativeIn ? amountIn : 0n,
  }
}

/** Apply slippage in basis points to a quoted output. */
export function minOut(quoted: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10000, Math.round(slippageBps))))
  return (quoted * (10000n - bps)) / 10000n
}
