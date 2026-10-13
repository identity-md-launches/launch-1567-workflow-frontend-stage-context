# Frontend validation record

Worker-side evidence for the MOON website (`web/`, export in `dist/`). This is the worker's
report, not an independent certification. Companion files: `frontend-browser-report.json`
(mocked-wallet browser walk), `frontend-taste.json` (design probe output),
`frontend-screenshots/` (Chromium captures of the final export), `../web/DESIGN.md`.

## 1. Scope and assumptions

- One route, `dist/index.html`, built with Vite 8 / React 19 / TypeScript 7 / Tailwind 4 /
  wagmi 3 / viem 2 at `base: './'`. Served in checks under a `/preview/` subpath to prove relative
  assets work from a gateway path.
- Runtime configuration is `dist/imd-deployment.json`, written by `web/scripts/manifest.mjs`
  from `.imd/reads/deployment.json`, `.imd/reads/network.json` and `docs/abi/*.json`. The three
  handoff ABIs re-hash (canonical sorted-key JSON, keccak256) to the handoff's `abiHash` values;
  the build fails otherwise. `poolKey`, `network` and `walletAddChain` are copied unchanged. The
  manifest has exactly the ten allowed top-level keys and no other address or URL.
- Inferred choices: Tailwind utility classes with hand-written components in the shadcn style
  rather than the shadcn/ui package (fewer dependencies, same button/field/card patterns);
  Three.js skipped (the brief marks it optional); shop catalog discovery by probing item ids
  0..63 plus a manual id lookup, because both public RPCs refuse wide `eth_getLogs` ranges
  (publicnode: "Archive requests require a personal token"; robinhood: 10,000,000-block cap).
  The deployment block is deliberately not stored anywhere in the app.
- `DESIGN.md` is at `web/DESIGN.md`: the repository root is outside this assignment's write scope.
- Not exercised: a real signed transaction on Robinhood Chain (no funds, no authorization), a
  real voucher from the game server, a real browser wallet extension, WebKit/Safari, a
  physical device, a screen reader, native 200% zoom.

## 2. Commands and results

| Command (from `web/`) | Result |
| --- | --- |
| `npm ci` equivalent install | 0 vulnerabilities |
| `npm run typecheck` (`tsc -b`) | exit 0, no errors |
| `npm run build` (`tsc -b && vite build && node scripts/manifest.mjs`) | exit 0; `dist/` 13 assets, 963.7 KiB; manifest written, every ABI hash verified |
| `npm test` (vitest) | 3 files, 15 tests passed: Uniswap v4 `execute` encoding (six-field and five-field tuples, settle/take, native value), slippage, currency sorting; manifest validation, ABI hash binding and SHA-256 of every asset, byte equality with the handoff and chain table, path traversal rejection; voucher parsing; amount formatting, custom-error mapping, 4902 detection |
| `node test/scratch/verify.mjs` (Playwright Chromium, own static server) | report below, 0 console errors, 0 failed requests |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 14 of 16 checks passed on the final export (see section 5) |

Live RPC probes during the build: `eth_chainId` on `robinhood-rpc.publicnode.com` returned
`0x1237` (4663) and `eth_getCode` for MoonRewards returned bytecode.

## 3. Browser verification (final export)

Chromium via Playwright, export served at `http://127.0.0.1:<port>/preview/`, live reads against
the configured public RPCs. Screenshots in `frontend-screenshots/`.

| Width | Observed |
| --- | --- |
| 320 | `scrollWidth` 320 (no horizontal scroll). First screen: header with wallet button, headline, the required home sentence, Play / Claim / Shop buttons, the Reward pool title. Fonts Bungee and Patrick Hand loaded. |
| 390 | `scrollWidth` 390. First screen as above plus the pool card top at 460 px with the `NOT FUNDED` badge. `390.png` confirms the product (pool state) and main actions above the fold. |
| 1440 | `scrollWidth` 1440. Hero, three actions, the full pool grid and the claim card on the first screen. |

Live values read at check time: pool balance 0 MOON, `isFunded` false (badge `NOT FUNDED`,
activation needs 700,000,000 MOON), paid today 0 of 1,000,000, total paid 0, burned 0, recycled 0,
creator wallet 700,000,000 MOON (target 0), claims "Not funded", voucher signer unset, shop
catalog empty ("The owner has not added any items yet").

Mocked injected wallet (EIP-1193 shim at 390 wide; reads forwarded to the public RPC, every
`eth_sendTransaction` rejected with code 4001 so nothing is broadcast):

1. Disconnected: "Claim MOON" disabled, hint "Connect a wallet to claim." shown.
2. Connect: `wallet_requestPermissions` then `eth_requestAccounts`; wallet reports chain `0x1`;
   header switches to one control "Switch to Robinhood Chain"; claim stays disabled.
3. Switch: `wallet_switchEthereumChain(0x1237)` rejected with 4902, app sends
   `wallet_addEthereumChain` with the chain table's `walletAddChain` byte for byte, then
   switches again; header shows `0x7221…d566`.
4. Connected as the owner address: "Your MOON 700,000,000", "0 of 20,000 claimed today", the
   Owner setup panel (signer, pause, configure item) renders.
5. Claim: `{"player":"0x12"}` shows "The voucher player must be an address." inline, button
   disabled. A well-formed voucher for today lists "The pool is NOT FUNDED; claims cannot pay
   yet." and "The owner has not set the game server signer yet."; button stays disabled.
6. Fund: amount 1 enables "1. Approve MOON", keeps "2. Deposit permanently" disabled; clicking
   approve simulates, asks the wallet, and the rejection renders "You rejected the request in
   your wallet." with Dismiss; the button re-enables.
7. Trade: 1 IMD quoted through `quoteExactInputSingle` by `simulateContract` on the chain
   table's quoter: about 209,899 MOON, minimum after 1% slippage shown, rate line shown; the
   three steps (approve to Permit2, allow router, swap) are gated in order.
8. Reduced motion: `.stars` computed `animation-name` is `none`.

Keyboard: the skip link is the first tab stop by source order; a focused-state screenshot was
not captured (limitation).

## 4. Better Interface review (six domains)

Guide read: `better-interface` workflow, core principles of all six domains, plus the forms,
hit-area, motion, disabled-state and document-web-design sections. Without-a-browser checks were
done on source; with-a-browser checks on the export in Chromium only.

| Domain | Status | Evidence / unperformed subchecks |
| --- | --- | --- |
| Accessibility | Checked | Native `button`/`a`/`input`/`textarea`/`label` everywhere; every field labelled with `htmlFor`, hints via `aria-describedby`; `role="alert"` for errors, `role="status"` + `aria-live` for progress; `:focus-visible` rings on both surfaces (`web/src/index.css:92-99`); skip link; 44 px controls (probe: 23 controls all at or above 24 px, 11 under 44 px are the in-card `.btn-sm` at 36 px and inline links); reduced motion verified. Unperformed: screen reader, native zoom, WebKit, focus ring screenshots over every background. |
| Layout | Checked | Single column, cards grouped by space; controls inset from edges; no overflow at 320/390/1440 (probe + own measurement); long addresses `break-all`. Unperformed: widths between 640 and 1440 other than the probe's three. |
| Writing | Checked | Verb-first buttons ("Claim MOON", "Buy: half burned, half to pool", "Set signer"); errors next to the control with a fix ("Open a post office in Courier World before claiming"); empty catalog state points forward; the brief's exact home sentence used verbatim. |
| Typography | Checked | Six-size scale, one weight, headline largest (probe: 4 sizes in use, 1 weight); tabular numerals for amounts; `overflow-wrap: anywhere` on headings. |
| Colors | Checked | Tokens in `@theme`; status never colour-only; probe measured all solid pairs at or above 4.5:1 (3:1 large). Unperformed: contrast of text over the sky gradient (36 boxes the probe did not measure; the sky is near-solid `#14123a` behind `#ece9ff` text but no ratio was measured there). |
| UI | Checked | One surface treatment (paper + ink outline), buttons without shadow, no nested cards, no `transition: all`, one looping animation that stops under reduced motion; every transaction button has its own pending label and disables; approvals are separate steps. |

### Findings and fixes

| Sev | Source | Finding | Fix | Recheck |
| --- | --- | --- | --- | --- |
| High | `web/src/components/Shop.tsx` (catalog query) | `client.multicall` threw because the chain definition has no Multicall3, so the shop showed an error instead of the catalog. | Replaced with batched individual `readContract` calls. | Shop renders the empty-catalog notice, 0 console errors. |
| Medium | `web/src/components/Shop.tsx` (same query) | Best-effort `eth_getLogs` produced an HTTP 403 from publicnode on every load. | Removed the log scan; id probe plus manual lookup remain. | 0 failed requests. |
| Medium | `web/src/index.css` `.btn` | Border plus hard shadow on every button (probe `chrome`: 11 elements). | Buttons keep the ink border only; cards keep the cel-shaded outline. | Probe count fell to the 5 paper cards (see below). |
| Medium | `web/src/index.css` `--text-sm` | Buttons at 15 px read as kicker labels above headings (probe `eyebrows`: 3). | Scale changed to 13/16/18/22/28/40; buttons and the funded badge at 16 px. | `eyebrows` passes. |
| Low | `web/src/components/ui.tsx` `Notice`, `TxStatusLine` | Boxed notices inside cards (probe: card inside card). | Plain coloured text. | passes. |
| Low | `web/src/components/Shop.tsx` `useItems` | Empty catalog rendered nothing (neither loading nor empty state). | Return `[]` for an empty id list. | Empty state shown. |

### Brief-driven deviations kept (probe still reports them)

- `casing`: the badge text `NOT FUNDED` (`web/src/components/Overview.tsx`) is all caps because
  the brief says "the website shows NOT FUNDED". Kept.
- `chrome`: the five `.paper` cards carry a 2 px ink border and a hard 4 px offset shadow. The
  brief asks for "ink outlines, paper cards" in a cel-shaded look; the offset shadow is that
  outline style. Kept on cards only.

## 5. taste@1 probe

Final run on the final `dist/`: 14 of 16 passed. Passed: render (no script errors, no missing
local files), layout, targets, contrast, tracking, eyebrows, type-sizes, type-faces, glyphs,
slogans, repetition, copy-budget (39 words of prose on the first screen at 390), motion, share
(title, favicon, og:title, og:image, description). Failed: casing and chrome, both the
brief-driven items above. Full output in `frontend-taste.json`.

## 6. Completion

Complete for the stated scope, with these limitations: no real transaction was sent (claims,
buys, funding, swaps and owner actions were validated through `simulateContract` behaviour,
wallet rejection handling and unit-tested encoding, not on-chain receipts); no real voucher
exists yet because the owner has not set the signer; no items exist in the shop yet; WebKit,
screen-reader and physical-device checks were not run. `og:image` is a relative path until the
site has a hosted address. Publication checks (CID, hashes, RPC chain id and code) run after
submission and do not replace these.
