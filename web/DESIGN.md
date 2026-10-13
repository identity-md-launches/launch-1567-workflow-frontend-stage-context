# DESIGN.md: MOON website

Extracted from the final source under `web/` and confirmed in the Chromium screenshots recorded
in `docs/frontend-validation.md`. (The assignment's write scope is `web/`, `dist/` and `docs/`,
so this file lives at `web/DESIGN.md` rather than the repository root.)

## Overview

Audience: Courier World players checking the reward pool, claiming a mission, buying a companion
or trading MOON, mostly on phones. Visual character is the brief's Courier World look: a deep
indigo starry sky, cel-shaded grey moon, warm gold accents, ink outlines and paper cards, set in
Bungee (display) and Patrick Hand (body). The page is one scrolling route. Hierarchy: the gold
Bungee headline is the largest, heaviest type; paper cards hold every task; dark-sky text is only
for the hero line, header, footer and short hints. Density is relaxed (44 px controls, 16 px+ text).

System-wide rules: sky background, paper cards for tasks, gold for the primary action, ink for
outlines and text on paper. One page's arrangement (hero then pool card then task cards) is not a
rule for future pages.

## Colors

Defined once in `web/src/index.css` under `@theme` (Tailwind 4 tokens; use them as `bg-sky-800`,
`text-ink`, `border-ink` and so on).

| Token | Value | Job |
| --- | --- | --- |
| `--color-sky-800` | `#14123a` | page background (with two radial `sky-600`/`sky-700` glows in `body`) |
| `--color-sky-900` / `-700` / `-600` | `#0b0a24` / `#1f1c55` / `#2b2770` | sky depth, glows |
| `--color-sky-text` | `#ece9ff` | text on sky |
| `--color-sky-muted` | `#bdb8e6` | secondary text on sky (footer) |
| `--color-paper` | `#fbf6e9` | card surface |
| `--color-paper-dim` | `#f1e9d2` | disabled fields |
| `--color-paper-line` | `#d9cfb3` | reserved for rules on paper (unused so far) |
| `--color-ink` | `#1b1a2e` | text, outlines, focus on paper |
| `--color-ink-soft` | `#3b3950` | labels and hints on paper |
| `--color-moon` / `--color-moon-dark` | `#d9d7d2` / `#a9a6a0` | moon art, connected-wallet button |
| `--color-gold` / `--color-gold-dark` | `#f5c542` / `#c99a1a` | primary action fill, headline, focus ring on sky |
| `--color-ok` / `--color-warn` / `--color-bad` | `#1f7a3e` / `#a85a00` / `#b3261e` | status text on paper only |

Status is never color alone: each state also has words ("NOT FUNDED", "Paused", an error line).
The probe measured every solid text/background pair at 4.5:1 or better (3:1 large); text over the
sky gradient was not measured by it.

## Typography

Both fonts are bundled in `web/public/fonts/` and declared in `web/src/index.css`; only weight
400 of each is shipped, so the whole site uses one weight.

- `--font-display`: Bungee, fallback Impact/Arial Black. Headings (`h1`-`h3`), buttons, the
  funded badge. Bungee is an all-caps design; DOM text stays sentence case.
- `--font-body`: Patrick Hand, fallback Segoe Print/Comic Sans. Everything else.
- `--font-mono`: system monospace for addresses, hashes and the voucher textarea.

Scale, six sizes, in `@theme`: `--text-xs` 13 px (hints), `--text-sm` 16 px (labels, buttons,
notices), `--text-base` 18 px (body), `--text-lg` 22 px (card titles, stat values), `--text-xl`
28 px (unused reserve), `--text-2xl` 40 px (the one `h1`). Headings use `line-height: 1.1` and
`overflow-wrap: anywhere`; body is 1.4. No letter-spacing anywhere. Numbers use `.num`
(`font-variant-numeric: tabular-nums`).

## Layout

Content width `max-w-5xl` (64 rem) centred with `px-4`. Sections stack in a single column with
`gap-5`; inside cards, fields stack and switch to two columns at `sm` (640 px) via
`sm:grid-cols-2`. The pool stats grid is two columns on phones, four at `sm`. The moon art is 72 px
on phones and 112 px from `sm`. Header: name at the left edge, wallet button at the right edge.
Long values (addresses, hashes) use `break-all`; stat values `break-words`. `html` has
`overflow-x: hidden` as a guard but the probe measured no horizontal scroll at 320, 390 or 1440.

## Elevation and depth

Paper cards (`.paper`) are the only elevated surface: 2 px ink border plus a hard 4 px offset ink
shadow (`--shadow-ink`), the cel-shaded outline the brief asks for. Buttons use the ink border
only and move 1 px on hover/press. Nothing else casts a shadow. The decorative `.stars` layer is
`position: fixed` behind everything (`z-index: 0`); page content sits in `relative z-10`.

## Shapes

`--radius-card` 14 px for cards, 12 px for buttons, 10 px for fields. Borders are always 2 px ink.
The moon and favicon are circles with ink outlines.

## Components

- **Button** `.btn` (`web/src/index.css`): 44 px minimum, Bungee 16 px. Variants `.btn-gold`
  (primary), `.btn-moon` (connected wallet), `.btn-sm` (36 px, inside cards). `:disabled` dims to
  55% and removes the pointer; every transaction button disables while simulating, signing or
  pending and shows its own verb ("Claiming…", "Approving…").
- **Field** `.field` plus `Field` in `web/src/components/ui.tsx`: labelled input with optional
  hint wired through `aria-describedby`.
- **Card** `Card` in `ui.tsx`: `.paper` section with an `h2` title and one-line subtitle.
- **Stat** `Stat` in `ui.tsx`: `dt` label, `dd` tabular value, optional hint, used in the pool `dl`.
- **Notice / TxStatusLine** in `ui.tsx`: plain coloured text (no box) for warnings, errors
  (`role="alert"`) and transaction progress (`role="status"`, `aria-live="polite"`) with an
  explorer link once a hash exists.
- **WalletButton** in `web/src/components/Header.tsx`: Connect / Switch to chain / address
  states; the address button disconnects and carries a visually hidden label.
- **Skip link**: first focusable element, visible on focus.

Focus: `:focus-visible` draws a 3 px gold ring on sky and an ink ring inside `.paper`.

## Do's and don'ts

- Start a new page with `Header`, a `main` of `Card`s inside `mx-auto max-w-5xl px-4`, and `Footer`.
- One `.btn-gold` per task: the action that moves money. Secondary steps (approve, allow) are
  plain `.btn`.
- Put status in words next to the control; colour comes from `ok`/`warn`/`bad` text tokens only.
- Keep the six sizes and single weight. Do not add a font, a weight or tracked capitals.
- Keep addresses, chain id, ABIs and RPCs in `imd-deployment.json`; never add a second table.
- Honour reduced motion: the only animation (`.stars` twinkle) is removed under
  `prefers-reduced-motion`; add nothing that loops.
