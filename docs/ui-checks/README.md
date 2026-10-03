# UI checks (Phase F, task F-21)

Screenshots of key pages at 375 px (phone) and 1440 px (desktop), taken from the production build with mock data.
Full-page JPEGs. They show the state on the day of the check, not a design spec.

How the checks were run (repeat after UI changes):

1. `pnpm build && pnpm start -p 3111`
2. For each of the 57 routes (dynamic routes use a sample id) at 375, 768, 1024 and 1440 px: axe-core 4.13 with the
   `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `best-practice` rule sets; page width equals the window
   (no sideways scroll); exactly one `h1` and one `main`; a page title.
3. Keyboard walk: press Tab through every stop on 14 key pages at 375 and 1440 px. Each stop must show a focus
   ring and must not sit under a sticky bar or banner.
4. Reduced motion: the stylesheet turns animations and transitions off under `prefers-reduced-motion: reduce`.

Results are in the Progress log row for F-21 in `TODO.md`.
