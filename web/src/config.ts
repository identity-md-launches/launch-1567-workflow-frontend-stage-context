/**
 * Single source of runtime deployment configuration.
 *
 * Addresses, chain id, ABIs and public RPC URLs all come from `imd-deployment.json`,
 * which `scripts/manifest.mjs` writes next to the export after every build from the
 * validated deployment handoff and the chain table. Nothing here hard-codes an address.
 * There are no private credentials; every RPC URL is a public endpoint.
 */
import type { Abi, Address, Hex } from 'viem'

export const DEPLOYMENT_URL = './imd-deployment.json'

export interface DeploymentContract {
  name: string
  address: Address
  abiHash: string
  abiPath: string
}

export interface PoolKey {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

export interface UniswapV4Addresses {
  poolManager: Address
  universalRouter: Address
  quoter: Address
  stateView: Address
  positionManager: Address
  permit2: Address
  extendedSwapParams?: boolean
}

export interface NetworkBlock {
  chainId: number
  name: string
  testnet: boolean
  rpcUrls: string[]
  explorer: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  faucets: string[]
  uniswapV4: UniswapV4Addresses
  pairToken?: { address: Address; symbol: string; name: string; decimals: number }
  otherPairTokens?: { address: Address; symbol: string; name: string; decimals: number }[]
}

export interface WalletAddChain {
  chainId: Hex
  chainName: string
  rpcUrls: string[]
  nativeCurrency: { name: string; symbol: string; decimals: number }
  blockExplorerUrls: string[]
}

export interface DeploymentManifest {
  version: 1
  launchId: string
  chainId: number
  sourceCommit: string
  attestationHash: string
  contracts: DeploymentContract[]
  assets: { path: string; sha256: string }[]
  poolKey?: PoolKey
  network?: NetworkBlock
  walletAddChain?: WalletAddChain
}

/** Resolved configuration the app runs on: manifest plus the ABIs it references. */
export interface Deployment {
  manifest: DeploymentManifest
  abis: Record<string, Abi>
  /** Convenience lookup by contract name. */
  contract(name: 'LaunchToken' | 'MoonRewards' | 'MoonShop'): { address: Address; abi: Abi }
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const RELATIVE_PATH_RE = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))(?![a-z]+:)[^\s]+$/

export function assertManifest(value: unknown): DeploymentManifest {
  if (!value || typeof value !== 'object') throw new Error('imd-deployment.json is not an object')
  const m = value as Record<string, unknown>
  if (m.version !== 1) throw new Error('imd-deployment.json version must be 1')
  if (typeof m.chainId !== 'number') throw new Error('chainId missing')
  if (typeof m.launchId !== 'string' || typeof m.sourceCommit !== 'string' || typeof m.attestationHash !== 'string')
    throw new Error('launch identifiers missing')
  if (!Array.isArray(m.contracts) || m.contracts.length === 0) throw new Error('contracts missing')
  for (const c of m.contracts as DeploymentContract[]) {
    if (!ADDRESS_RE.test(c.address)) throw new Error(`bad address for ${c.name}`)
    if (!RELATIVE_PATH_RE.test(c.abiPath)) throw new Error(`abiPath must be relative: ${c.abiPath}`)
  }
  if (m.network !== undefined) {
    const n = m.network as NetworkBlock
    if (n.chainId !== m.chainId) throw new Error('network.chainId disagrees with chainId')
    if (!Array.isArray(n.rpcUrls) || n.rpcUrls.length === 0) throw new Error('network.rpcUrls missing')
  }
  return value as DeploymentManifest
}

/** Fetch the manifest and every ABI it references, relative to the page. */
export async function loadDeployment(baseUrl: string = DEPLOYMENT_URL): Promise<Deployment> {
  const res = await fetch(baseUrl, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Could not load ${baseUrl}: HTTP ${res.status}`)
  const manifest = assertManifest(await res.json())
  const base = baseUrl.replace(/[^/]*$/, '')
  const abis: Record<string, Abi> = {}
  await Promise.all(
    manifest.contracts.map(async (c) => {
      const r = await fetch(base + c.abiPath, { cache: 'no-cache' })
      if (!r.ok) throw new Error(`Could not load ABI ${c.abiPath}: HTTP ${r.status}`)
      const abi = (await r.json()) as unknown
      if (!Array.isArray(abi)) throw new Error(`ABI ${c.abiPath} is not an array`)
      abis[c.name] = abi as Abi
    }),
  )
  return makeDeployment(manifest, abis)
}

export function makeDeployment(manifest: DeploymentManifest, abis: Record<string, Abi>): Deployment {
  return {
    manifest,
    abis,
    contract(name) {
      const c = manifest.contracts.find((x) => x.name === name)
      const abi = abis[name]
      if (!c || !abi) throw new Error(`Contract ${name} is not in the deployment`)
      return { address: c.address, abi }
    },
  }
}

/** Minimal ABI for the PostOffice `offices(player)` read; only the first word (`open`) matters. */
export const postOfficeAbi = [
  {
    type: 'function',
    name: 'offices',
    stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [
      { name: 'open', type: 'bool' },
      { name: 'tier', type: 'uint8' },
      { name: 'onDuty', type: 'bool' },
      { name: 'routesUsed', type: 'uint32' },
      { name: 'lastUpgrade', type: 'uint64' },
      { name: 'referrer', type: 'address' },
      { name: 'power', type: 'uint256' },
      { name: 'rewardDebt', type: 'uint256' },
      { name: 'pending', type: 'uint256' },
    ],
  },
] as const

/** Shared ERC-20 subset used for the paired token and Permit2 allowances. */
export const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const

export const permit2Abi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }],
    outputs: [],
  },
] as const

export const universalRouterAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [{ name: 'commands', type: 'bytes' }, { name: 'inputs', type: 'bytes[]' }, { name: 'deadline', type: 'uint256' }],
    outputs: [],
  },
] as const

export const quoterAbi = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
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
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'gasEstimate', type: 'uint256' }],
  },
] as const

/** Optional WalletConnect project id. Not supplied for this launch; browser wallets work without it. */
export const WALLETCONNECT_PROJECT_ID: string | undefined = undefined

export const PLAY_URL = 'https://courierworld.fun'
