import { describe, expect, it } from 'vitest'
import { parseVoucher } from '../src/components/Claim'

const sig = '0x' + 'ab'.repeat(65)

describe('voucher parsing', () => {
  it('accepts the flat voucher shape with string integers', () => {
    const v = parseVoucher(JSON.stringify({ player: '0x7deec126e0bc35b1246129f30b6d6f17a6ec9392', amount: '500000000000000000000', day: '20740', nonce: '1', deadline: '1760400000', signature: sig }))
    expect('error' in v).toBe(false)
    if (!('error' in v)) {
      expect(v.amount).toBe(500n * 10n ** 18n)
      expect(v.day).toBe(20740n)
    }
  })
  it('accepts a nested { voucher, signature } shape', () => {
    const v = parseVoucher(JSON.stringify({ voucher: { player: '0x7deec126e0bc35b1246129f30b6d6f17a6ec9392', amount: 1, day: 2, nonce: 3, deadline: 4 }, signature: sig }))
    expect('error' in v).toBe(false)
  })
  it('rejects bad JSON, bad addresses and short signatures', () => {
    expect(parseVoucher('nope')).toHaveProperty('error')
    expect(parseVoucher(JSON.stringify({ player: '0x12', amount: 1, day: 1, nonce: 1, deadline: 1, signature: sig }))).toHaveProperty('error')
    expect(parseVoucher(JSON.stringify({ player: '0x7deec126e0bc35b1246129f30b6d6f17a6ec9392', amount: 1, day: 1, nonce: 1, deadline: 1, signature: '0x12' }))).toHaveProperty('error')
    expect(parseVoucher(JSON.stringify({ player: '0x7deec126e0bc35b1246129f30b6d6f17a6ec9392', amount: 1.5, day: 1, nonce: 1, deadline: 1, signature: sig }))).toHaveProperty('error')
  })
})
