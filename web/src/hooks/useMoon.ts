import { useReadContract, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { useDeployment } from './useDeployment'

/** Public reward-pool state, readable without a wallet through the configured public RPCs. */
export function usePoolState() {
  const d = useDeployment()
  const token = d.contract('LaunchToken')
  const rewards = d.contract('MoonRewards')
  const shop = d.contract('MoonShop')
  const q = useReadContracts({
    contracts: [
      { ...token, functionName: 'balanceOf', args: [rewards.address] },
      { ...rewards, functionName: 'isFunded' },
      { ...rewards, functionName: 'activated' },
      { ...rewards, functionName: 'currentDay' },
      { ...rewards, functionName: 'GLOBAL_DAILY_CAP' },
      { ...rewards, functionName: 'WALLET_DAILY_CAP' },
      { ...rewards, functionName: 'totalPaid' },
      { ...rewards, functionName: 'totalFunded' },
      { ...rewards, functionName: 'INITIAL_FUNDING' },
      { ...rewards, functionName: 'paused' },
      { ...rewards, functionName: 'voucherSigner' },
      { ...rewards, functionName: 'owner' },
      { ...rewards, functionName: 'POST_OFFICE' },
      { ...shop, functionName: 'totalBurned' },
      { ...shop, functionName: 'totalRecycled' },
      { ...shop, functionName: 'BURN_ADDRESS' },
      { ...shop, functionName: 'owner' },
      { ...token, functionName: 'totalSupply' },
    ],
    allowFailure: true,
  })
  const r = q.data
  const get = <T,>(i: number): T | undefined => (r?.[i]?.status === 'success' ? (r[i].result as T) : undefined)
  const currentDay = get<bigint>(3)
  const owner = get<Address>(11)
  const dayQ = useReadContract({
    ...rewards,
    functionName: 'dailyPaid',
    args: currentDay !== undefined ? [currentDay] : undefined,
    query: { enabled: currentDay !== undefined },
  })
  const burn = get<Address>(15)
  const ownerBalQ = useReadContracts({
    contracts: [
      { ...token, functionName: 'balanceOf', args: owner ? [owner] : undefined },
      { ...token, functionName: 'balanceOf', args: burn ? [burn] : undefined },
    ],
    query: { enabled: !!owner && !!burn },
    allowFailure: true,
  })
  return {
    loading: q.isLoading,
    error: q.error,
    poolBalance: get<bigint>(0),
    isFunded: get<boolean>(1),
    activated: get<boolean>(2),
    currentDay,
    globalCap: get<bigint>(4),
    walletCap: get<bigint>(5),
    totalPaid: get<bigint>(6),
    totalFunded: get<bigint>(7),
    initialFunding: get<bigint>(8),
    paused: get<boolean>(9),
    voucherSigner: get<Address>(10),
    owner,
    postOffice: get<Address>(12),
    totalBurned: get<bigint>(13),
    totalRecycled: get<bigint>(14),
    burnAddress: burn,
    shopOwner: get<Address>(16),
    totalSupply: get<bigint>(17),
    paidToday: dayQ.data as bigint | undefined,
    creatorBalance: ownerBalQ.data?.[0]?.status === 'success' ? (ownerBalQ.data[0].result as bigint) : undefined,
    burnBalance: ownerBalQ.data?.[1]?.status === 'success' ? (ownerBalQ.data[1].result as bigint) : undefined,
    refetch: () => {
      void q.refetch()
      void dayQ.refetch()
      void ownerBalQ.refetch()
    },
  }
}

/** Connected player's MOON balance, allowances and daily usage. */
export function usePlayerState(address: Address | undefined, currentDay: bigint | undefined) {
  const d = useDeployment()
  const token = d.contract('LaunchToken')
  const rewards = d.contract('MoonRewards')
  const shop = d.contract('MoonShop')
  const q = useReadContracts({
    contracts: [
      { ...token, functionName: 'balanceOf', args: address ? [address] : undefined },
      { ...token, functionName: 'allowance', args: address ? [address, shop.address] : undefined },
      { ...token, functionName: 'allowance', args: address ? [address, rewards.address] : undefined },
      { ...rewards, functionName: 'walletDailyPaid', args: address && currentDay !== undefined ? [address, currentDay] : undefined },
    ],
    query: { enabled: !!address },
    allowFailure: true,
  })
  const get = <T,>(i: number): T | undefined => (q.data?.[i]?.status === 'success' ? (q.data[i].result as T) : undefined)
  return {
    balance: get<bigint>(0),
    shopAllowance: get<bigint>(1),
    rewardsAllowance: get<bigint>(2),
    paidToday: get<bigint>(3),
    refetch: () => void q.refetch(),
  }
}
