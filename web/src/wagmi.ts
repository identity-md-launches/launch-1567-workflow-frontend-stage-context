import { createConfig, fallback, http, type Config } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain, type Chain } from 'viem'
import type { DeploymentManifest } from './config'

/** Define the chain from the manifest's network block; nothing is hard-coded here. */
export function chainFromManifest(m: DeploymentManifest): Chain {
  const n = m.network
  if (!n) {
    // Chain not vetted by the network: reads still work through the wallet provider only.
    return defineChain({
      id: m.chainId,
      name: `Chain ${m.chainId}`,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [] } },
    })
  }
  return defineChain({
    id: n.chainId,
    name: n.name,
    testnet: n.testnet,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: 'Explorer', url: n.explorer } },
  })
}

export function makeWagmiConfig(m: DeploymentManifest): Config {
  const chain = chainFromManifest(m)
  const urls = m.network?.rpcUrls ?? []
  return createConfig({
    chains: [chain],
    connectors: [injected()],
    transports: {
      [chain.id]: urls.length > 0 ? fallback(urls.map((u) => http(u, { batch: true }))) : http(),
    },
    multiInjectedProviderDiscovery: true,
  })
}
