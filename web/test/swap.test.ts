import { describe, expect, it } from 'vitest'
import { decodeAbiParameters, type Address } from 'viem'
import { ACTIONS, buildSwap, minOut, sortCurrencies, zeroForOne } from '../src/lib/swap'
import type { PoolKey } from '../src/config'

const MOON = '0x7deec126e0bc35b1246129f30b6d6f17a6ec9392' as Address
const IMD = '0x5f7bb59365ce557c26dbcaa4ee9d39a4b95b7127' as Address
const poolKey: PoolKey = { currency0: IMD, currency1: MOON, fee: 12500, tickSpacing: 60, hooks: '0x19bec7c2e1b2aadaf67b259744751a9960d66000' }

describe('swap encoding', () => {
  it('sorts currencies ascending with native first', () => {
    expect(sortCurrencies(MOON, IMD)).toEqual([IMD, MOON])
    expect(sortCurrencies('0x0000000000000000000000000000000000000000', IMD)[0]).toBe('0x0000000000000000000000000000000000000000')
  })

  it('derives zeroForOne from the input currency', () => {
    expect(zeroForOne(poolKey, IMD)).toBe(true)
    expect(zeroForOne(poolKey, MOON)).toBe(false)
  })

  it('builds V4_SWAP with the six-field extended tuple when extendedSwapParams is true', () => {
    const plan = buildSwap({ poolKey, inputCurrency: IMD, outputCurrency: MOON, amountIn: 1000n, amountOutMinimum: 900n, extended: true })
    expect(plan.commands).toBe('0x10')
    expect(plan.value).toBe(0n)
    expect(plan.inputs).toHaveLength(1)
    const [actions, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], plan.inputs[0])
    expect(actions).toBe(ACTIONS)
    expect(params).toHaveLength(3)
    const [swap] = decodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [
            {
              name: 'poolKey',
              type: 'tuple',
              components: [
                { name: 'currency0', type: 'address' },
                { name: 'currency1', type: 'address' },
                { name: 'fee', type: 'uint24' },
                { name: 'tickSpacing', type: 'int24' },
                { name: 'hooks', type: 'address' },
              ],
            },
            { name: 'zeroForOne', type: 'bool' },
            { name: 'amountIn', type: 'uint128' },
            { name: 'amountOutMinimum', type: 'uint128' },
            { name: 'reserved', type: 'uint256' },
            { name: 'hookData', type: 'bytes' },
          ],
        },
      ],
      params[0],
    )
    expect(swap.zeroForOne).toBe(true)
    expect(swap.amountIn).toBe(1000n)
    expect(swap.amountOutMinimum).toBe(900n)
    expect(swap.reserved).toBe(0n)
    expect(swap.poolKey.hooks.toLowerCase()).toBe(poolKey.hooks)
    const [settleCur, settleAmt] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], params[1])
    expect(settleCur.toLowerCase()).toBe(IMD)
    expect(settleAmt).toBe(1000n)
    const [takeCur, takeAmt] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], params[2])
    expect(takeCur.toLowerCase()).toBe(MOON)
    expect(takeAmt).toBe(900n)
  })

  it('uses the five-field tuple otherwise and sends value for native input', () => {
    const native = '0x0000000000000000000000000000000000000000' as Address
    const key: PoolKey = { ...poolKey, currency0: native, currency1: MOON }
    const plan = buildSwap({ poolKey: key, inputCurrency: native, outputCurrency: MOON, amountIn: 5n, amountOutMinimum: 1n, extended: false })
    expect(plan.value).toBe(5n)
    const [, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], plan.inputs[0])
    // five-field tuple: head + poolKey(5 words) + 3 words + offset + bytes length word = 11 words
    expect((params[0].length - 2) / 64).toBe(11)
  })

  it('applies slippage in basis points', () => {
    expect(minOut(10000n, 100)).toBe(9900n)
    expect(minOut(10000n, 0)).toBe(10000n)
  })
})
