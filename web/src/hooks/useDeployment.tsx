import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { WagmiProvider, type Config } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { loadDeployment, type Deployment } from '../config'
import { makeWagmiConfig } from '../wagmi'

const DeploymentContext = createContext<Deployment | null>(null)

export function useDeployment(): Deployment {
  const d = useContext(DeploymentContext)
  if (!d) throw new Error('useDeployment outside provider')
  return d
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchInterval: 15_000, staleTime: 5_000, retry: 1 } },
})

/**
 * Loads imd-deployment.json (the only runtime deployment configuration) and the ABIs it
 * references, then mounts wagmi with a chain built from the manifest's network block.
 */
export function DeploymentProvider({ children, preloaded, config }: { children: ReactNode; preloaded?: Deployment; config?: Config }) {
  const [state, setState] = useState<{ deployment?: Deployment; config?: Config; error?: string }>(() =>
    preloaded ? { deployment: preloaded, config: config ?? makeWagmiConfig(preloaded.manifest) } : {},
  )

  useEffect(() => {
    if (preloaded) return
    let alive = true
    loadDeployment()
      .then((d) => alive && setState({ deployment: d, config: makeWagmiConfig(d.manifest) }))
      .catch((e: unknown) => alive && setState({ error: e instanceof Error ? e.message : String(e) }))
    return () => {
      alive = false
    }
  }, [preloaded])

  if (state.error) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <div className="paper p-5" role="alert">
          <h2 className="text-lg">Deployment configuration failed to load</h2>
          <p className="mt-2">{state.error}</p>
          <p className="mt-2 text-sm">
            The site reads <code className="font-mono">imd-deployment.json</code> next to this page. Rebuild the export so the file exists.
          </p>
        </div>
      </main>
    )
  }
  if (!state.deployment || !state.config) {
    return (
      <main className="mx-auto max-w-lg p-6" aria-busy="true">
        <p className="text-sky-muted">Loading deployment configuration…</p>
      </main>
    )
  }
  return (
    <DeploymentContext.Provider value={state.deployment}>
      <WagmiProvider config={state.config}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    </DeploymentContext.Provider>
  )
}
