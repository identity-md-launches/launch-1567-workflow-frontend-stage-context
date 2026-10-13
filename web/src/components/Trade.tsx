import { useEffect, useMemo, useState } from 'react'
import { useConfig, useReadContracts } from 'wagmi'
import { simulateContract } from 'wagmi/actions'
import type { Address } from 'viem'
import { erc20Abi, permit2Abi, quoterAbi, universalRouterAbi } from '../config'
import { useDeployment } from '../hooks/useDeployment'
import { useTx } from '../hooks/useTx'
import { errorMessage, fmt, parseAmount } from '../lib/format'
import { buildSwap, minOut, zeroForOne } from '../lib/swap'
import { useWalletGate } from './Header'
import { Card, Field, Notice, TxStatusLine } from './ui'

const MAX_UINT160 = (1n << 160n) - 1n

/**
 * Swap MOON against its paired currency in the launch's Uniswap v4 pool.
 * Every router, quoter and Permit2 address comes from the manifest's network block and the
 * pool key from the deployment handoff. Nothing is hard-coded.
 */
export function Trade() {
  const d = useDeployment()
  const gate = useWalletGate()
  const config = useConfig()
  const net = d.manifest.network
  const poolKey = d.manifest.poolKey
  const moon = d.contract('LaunchToken')
  const approveTx = useTx()
  const permitTx = useTx()
  const swapTx = useTx()

  const [direction, setDirection] = useState<'buy' | 'sell'>('buy')
  const [text, setText] = useState('')
  const [slippage, setSlippage] = useState('1')
  const [quote, setQuote] = useState<{ out?: bigint; error?: string; loading: boolean }>({ loading: false })

  const paired: Address | undefined = useMemo(() => {
    if (!poolKey) return undefined
    return poolKey.currency0.toLowerCase() === moon.address.toLowerCase() ? poolKey.currency1 : poolKey.currency0
  }, [poolKey, moon.address])
  const pairedIsNative = paired !== undefined && BigInt(paired) === 0n
  const pairedMeta = net?.pairToken && paired && net.pairToken.address.toLowerCase() === paired.toLowerCase()
    ? net.pairToken
    : net?.otherPairTokens?.find((t) => paired && t.address.toLowerCase() === paired.toLowerCase())
  const pairedSymbol = pairedIsNative ? (net?.nativeCurrency.symbol ?? 'ETH') : (pairedMeta?.symbol ?? 'paired token')
  const pairedDecimals = pairedIsNative ? 18 : (pairedMeta?.decimals ?? 18)

  const inputCurrency = direction === 'buy' ? paired : moon.address
  const outputCurrency = direction === 'buy' ? moon.address : paired
  const inDecimals = direction === 'buy' ? pairedDecimals : 18
  const outDecimals = direction === 'buy' ? 18 : pairedDecimals
  const inSymbol = direction === 'buy' ? pairedSymbol : 'MOON'
  const outSymbol = direction === 'buy' ? 'MOON' : pairedSymbol
  const amountIn = parseAmount(text, inDecimals)
  const slippageBps = Math.round((Number(slippage) || 0) * 100)
  const inputIsErc20 = inputCurrency !== undefined && BigInt(inputCurrency) !== 0n

  const allowances = useReadContracts({
    contracts: [
      { address: inputCurrency ?? moon.address, abi: erc20Abi, functionName: 'allowance', args: gate.address && net ? [gate.address, net.uniswapV4.permit2] : undefined },
      { address: net?.uniswapV4.permit2 ?? moon.address, abi: permit2Abi, functionName: 'allowance', args: gate.address && net && inputCurrency ? [gate.address, inputCurrency, net.uniswapV4.universalRouter] : undefined },
      { address: inputCurrency ?? moon.address, abi: erc20Abi, functionName: 'balanceOf', args: gate.address ? [gate.address] : undefined },
    ],
    query: { enabled: !!gate.address && !!net && inputIsErc20 },
    allowFailure: true,
  })
  const tokenAllowance = allowances.data?.[0]?.status === 'success' ? (allowances.data[0].result as bigint) : undefined
  const p2 = allowances.data?.[1]?.status === 'success' ? (allowances.data[1].result as readonly [bigint, number, number]) : undefined
  const balance = allowances.data?.[2]?.status === 'success' ? (allowances.data[2].result as bigint) : undefined
  const nowSec = Math.floor(Date.now() / 1000)
  const needsTokenApproval = inputIsErc20 && amountIn !== null && (tokenAllowance ?? 0n) < amountIn
  const needsPermit2 = inputIsErc20 && amountIn !== null && (p2 === undefined || p2[0] < amountIn || p2[1] <= nowSec)

  // Quote through the quoter with simulateContract; never a transaction.
  useEffect(() => {
    if (!net || !poolKey || !inputCurrency || amountIn === null || amountIn === 0n) {
      setQuote({ loading: false })
      return
    }
    let alive = true
    setQuote({ loading: true })
    const t = setTimeout(async () => {
      try {
        const sim = await simulateContract(config, {
          address: net.uniswapV4.quoter,
          abi: quoterAbi,
          functionName: 'quoteExactInputSingle',
          args: [{ poolKey, zeroForOne: zeroForOne(poolKey, inputCurrency), exactAmount: amountIn, hookData: '0x' }],
          chainId: net.chainId,
        })
        if (alive) setQuote({ loading: false, out: sim.result[0] })
      } catch (e) {
        if (alive) setQuote({ loading: false, error: errorMessage(e) })
      }
    }, 400)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [config, net, poolKey, inputCurrency, amountIn])

  if (!net || !poolKey) {
    return (
      <Card id="trade" title="Trade MOON">
        <Notice tone="warn">
          {!net
            ? 'This chain is not in the vetted chain table, so swaps are disabled. You can still read balances and use the shop.'
            : 'The deployment handoff has no pool key, so swaps are disabled.'}
        </Notice>
      </Card>
    )
  }

  const out = quote.out
  const minimum = out !== undefined ? minOut(out, slippageBps) : undefined
  const insufficient = balance !== undefined && amountIn !== null && amountIn > balance

  async function approveToken() {
    if (!gate.address || !inputCurrency || amountIn === null) return
    const h = await approveTx.send({ address: inputCurrency, abi: erc20Abi, functionName: 'approve', args: [net!.uniswapV4.permit2, amountIn], account: gate.address, chainId: net!.chainId })
    if (h) void allowances.refetch()
  }
  async function approvePermit2() {
    if (!gate.address || !inputCurrency || amountIn === null) return
    const expiration = nowSec + 30 * 24 * 3600
    const h = await permitTx.send({
      address: net!.uniswapV4.permit2,
      abi: permit2Abi,
      functionName: 'approve',
      args: [inputCurrency, net!.uniswapV4.universalRouter, amountIn > MAX_UINT160 ? MAX_UINT160 : amountIn, expiration],
      account: gate.address,
      chainId: net!.chainId,
    })
    if (h) void allowances.refetch()
  }
  async function swap() {
    if (!gate.address || !inputCurrency || !outputCurrency || amountIn === null || minimum === undefined) return
    const plan = buildSwap({ poolKey: poolKey!, inputCurrency, outputCurrency, amountIn, amountOutMinimum: minimum, extended: net!.uniswapV4.extendedSwapParams === true })
    const deadline = BigInt(nowSec + 20 * 60)
    const h = await swapTx.send({
      address: net!.uniswapV4.universalRouter,
      abi: universalRouterAbi,
      functionName: 'execute',
      args: [plan.commands, plan.inputs, deadline],
      value: plan.value,
      account: gate.address,
      chainId: net!.chainId,
    })
    if (h) {
      void allowances.refetch()
      setText('')
    }
  }

  const stepsReady = gate.ready && amountIn !== null && amountIn > 0n && !insufficient
  return (
    <Card id="trade" title="Trade MOON" subtitle={`Swap in the launch pool on Uniswap v4 (MOON / ${pairedSymbol}, ${poolKey.fee / 10000}% fee). Quotes come from the chain; set your slippage before swapping.`}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Direction">
        <button type="button" className={`btn btn-sm ${direction === 'buy' ? 'btn-gold' : ''}`} aria-pressed={direction === 'buy'} onClick={() => setDirection('buy')}>
          Buy MOON with {pairedSymbol}
        </button>
        <button type="button" className={`btn btn-sm ${direction === 'sell' ? 'btn-gold' : ''}`} aria-pressed={direction === 'sell'} onClick={() => setDirection('sell')}>
          Sell MOON for {pairedSymbol}
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field id="swap-in" label={`You pay (${inSymbol})`} hint={gate.address && balance !== undefined ? `Balance ${fmt(balance, inDecimals, 4)} ${inSymbol}` : undefined}>
          <input id="swap-in" className="field num" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="0.0" aria-describedby="swap-in-hint" />
        </Field>
        <Field id="slippage" label="Slippage %">
          <input id="slippage" className="field num" inputMode="decimal" value={slippage} onChange={(e) => setSlippage(e.target.value)} />
        </Field>
      </div>
      <p className="num mt-2 text-sm" aria-live="polite">
        {quote.loading
          ? 'Fetching quote…'
          : quote.error
            ? `Quote failed: ${quote.error}`
            : out !== undefined && amountIn
              ? `You receive about ${fmt(out, outDecimals, 4)} ${outSymbol} (minimum ${fmt(minimum, outDecimals, 4)} after ${slippage}% slippage). Rate: 1 ${inSymbol} ≈ ${fmt((out * 10n ** BigInt(inDecimals)) / amountIn, outDecimals, 4)} ${outSymbol}.`
              : 'Enter an amount to see a quote.'}
      </p>
      {insufficient && <Notice tone="warn">That is more {inSymbol} than this wallet holds.</Notice>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {inputIsErc20 && (
          <button type="button" className="btn btn-sm" onClick={approveToken} disabled={!stepsReady || !needsTokenApproval || approveTx.busy}>
            {approveTx.busy ? 'Approving…' : needsTokenApproval ? `1. Approve ${inSymbol} to Permit2` : '1. Permit2 approved'}
          </button>
        )}
        {inputIsErc20 && (
          <button type="button" className="btn btn-sm" onClick={approvePermit2} disabled={!stepsReady || needsTokenApproval || !needsPermit2 || permitTx.busy}>
            {permitTx.busy ? 'Allowing…' : needsPermit2 ? '2. Allow the router' : '2. Router allowed'}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-gold" onClick={swap} disabled={!stepsReady || needsTokenApproval || needsPermit2 || minimum === undefined || swapTx.busy}>
          {swapTx.busy ? 'Swapping…' : `${inputIsErc20 ? '3. ' : ''}Swap`}
        </button>
        {!gate.isConnected && <span className="text-sm text-ink-soft">Connect a wallet to swap.</span>}
      </div>
      <TxStatusLine status={approveTx.status} explorer={net.explorer} onDismiss={approveTx.reset} />
      <TxStatusLine status={permitTx.status} explorer={net.explorer} onDismiss={permitTx.reset} />
      <TxStatusLine status={swapTx.status} explorer={net.explorer} onDismiss={swapTx.reset} />
      <p className="mt-3 text-xs text-ink-soft">MOON is a game currency, not an investment. Prices move with the pool and nothing here promises any value.</p>
    </Card>
  )
}
