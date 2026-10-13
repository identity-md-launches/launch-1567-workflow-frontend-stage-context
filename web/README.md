# MOON website (Courier World)

Static frontend for the MOON launch on Robinhood Chain: reward pool status, mission claims,
the Courier Companions shop, pool funding, a Uniswap v4 swap and the owner setup panel.
Vite, React 19, TypeScript, Tailwind CSS 4, wagmi and viem. The export is plain files with a
relative base, so it works from an IPFS gateway subpath or an ENS name with no server.

## Layout

| Path | Purpose |
| --- | --- |
| `web/src/config.ts` | Manifest types, loader, shared ABIs (ERC-20, Permit2, router, quoter, PostOffice). No addresses live here. |
| `web/src/wagmi.ts` | Builds the wagmi chain and transports from the manifest's `network` block. |
| `web/src/hooks/` | Deployment provider, live contract reads, transaction lifecycle. |
| `web/src/components/` | Header and wallet button, Overview (first screen), Claim, Shop, Trade, Fund, Owner, Footer. |
| `web/src/lib/` | Amount formatting, error mapping, chain switch/add, Uniswap v4 swap encoding. |
| `web/scripts/manifest.mjs` | Writes `dist/imd-deployment.json` after each build (see below). |
| `web/public/` | ABIs copied from `docs/abi`, bundled fonts, favicon, share image, EIP-712 voucher types. |
| `web/test/` | Vitest unit tests. |
| `dist/` (repository root) | Committed static export plus `imd-deployment.json`. |

## Configuration: one file, read at runtime

The app has no address, chain id, ABI or RPC table of its own. On load it fetches
`./imd-deployment.json` next to `index.html`, validates it, fetches each contract's `abiPath`,
and builds the wagmi config from the manifest's `network.rpcUrls` and `chainId`. Swaps use
`network.uniswapV4.*` and `poolKey` from the same file. If the file is missing the page says so
instead of guessing.

`web/scripts/manifest.mjs` produces that file from read-only inputs:

- `.imd/reads/deployment.json`: launch id, chain id, source commit, attestation hash, contracts
  (name, address, abiHash) and `poolKey`, copied exactly.
- `docs/abi/<Contract>.json`: implementation-derived ABIs; each is re-hashed with canonical
  keccak (sorted keys, no whitespace) and must equal the handoff's `abiHash` or the build fails.
- `.imd/reads/network.json`: `network` and `walletAddChain`, copied unchanged.
- every other exported file, hashed with SHA-256 and listed under `assets`.

When the `.imd` inputs are absent (a rebuild outside the workflow), the script reuses the
identifiers already in the committed manifest and only refreshes the asset inventory.

There are no private credentials. The RPC URLs are the public endpoints from the chain table.
A WalletConnect project id is optional and not configured; browser (injected) wallets work
without one. To add it, set `WALLETCONNECT_PROJECT_ID` in `web/src/config.ts` and add the
`walletConnect` connector in `web/src/wagmi.ts`.

## Install, preview, rebuild

```sh
cd web
npm ci                 # install from the committed lockfile
npm run typecheck      # tsc -b
npm run build          # tsc -b, vite build -> ../dist, then scripts/manifest.mjs
npm run preview        # serve ../dist locally (http://localhost:4173)
npm test               # vitest unit tests (swap encoding, manifest/ABI binding, voucher parsing)
```

`npm run build` always ends by regenerating `dist/imd-deployment.json`. Commit `dist/` together
with source and `package-lock.json`; the publisher pins the committed files without rebuilding.
`vite dev` has no manifest to read; use `npm run build && npm run preview` to work against the
real configuration.

## What the page does

- **Watch without a wallet.** Pool balance, funded state (`NOT FUNDED` until the activation
  balance is reached), paid today against the daily cap, total paid, burned and recycled, and the
  creator wallet's live MOON balance (target 0), all read through the public RPCs every 15 s.
- **Wallet.** Injected wallets (MetaMask, Rabby, Coinbase Wallet and others). On the wrong chain
  the header shows one "Switch to Robinhood Chain" control; if the wallet reports code 4902 the
  app sends `wallet_addEthereumChain` with the chain table's `walletAddChain` and switches again.
- **Claim.** Paste the voucher JSON from the game server. The page pre-checks funding, signer,
  pause, post office, player, day and deadline, then simulates `claim` before the wallet opens.
- **Shop.** Items are discovered by probing `items(id)` for ids 0..63 (the public RPCs refuse
  wide log scans) plus a manual id lookup. Each card shows price, what is left, your count, and a
  Buy button that states half is burned and half returns to the pool. Approval is its own step.
- **Trade.** Quote from the quoter via `simulateContract`, slippage applied, then
  `approve(permit2)`, `permit2.approve(router)` and `execute` as separate steps. Uses the
  six-field `ExactInputSingleParams` because `extendedSwapParams` is true for this chain.
- **Fund.** Approve then `fund(amount)`; permanent.
- **Owner.** Only when the connected wallet is the owner: set voucher signer, pause/resume,
  configure an item.

Every transaction runs `simulateContract` first and shows the contract's custom error in plain
words (`web/src/lib/format.ts`) instead of opening the wallet on a doomed call.

## Validation

See `docs/frontend-validation.md` for build, typecheck, unit test, browser and design-probe
results, and the live-chain behaviour that was not exercised. The design system is documented in
`web/DESIGN.md`.
