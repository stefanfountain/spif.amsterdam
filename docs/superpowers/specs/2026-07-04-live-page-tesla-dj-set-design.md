# spif.amsterdam — Live-set (Tesla coil) landing + SoundCloud

**Date:** 2026-07-04
**Status:** Approved design — building
**Scope:** Repoint spif.amsterdam so a live electronic DJ set built around the Thundermouse Tesla coil is the primary face of the site, add a SoundCloud slot, relocate the existing installation portfolio.

## Goal

Make "Spif — live" (a modular live set with a Tesla-coil communal ritual) the main thing at
`spif.amsterdam`. Add a prominent SoundCloud block for a set recorded this weekend. Preserve the
existing installation portfolio, moved one click away.

## Decisions (locked with the user)

1. **Split into two pages.** Live page and portfolio are separate documents.
2. **Live set becomes root.** `index.html` = live page. Portfolio relocates to `/works`.
3. **Framing: "Spif — live"** — the artist as live electronic performer/DJ, not a single named piece.
4. **SoundCloud: brand new / none yet.** Design an intentional placeholder now; swap the real
   iframe embed in after the set is uploaded this weekend.
5. **Aesthetic: darker/louder, same DNA.** Reuse the type system (Cormorant Garamond + IBM Plex
   Mono/Sans) and plate/figure/caption/sidenav components, but a near-black, saturated variant.
   Accents: electric blue (coil arc) + warm orange (tent practicals).
6. **Hero:** static image first (`IMG_0842`). A muted, looping, `playsinline` clip (from `IMG_0878`)
   is the motion element — MP4 + WebM, no audio (the "silent gif").

## Architecture

- `index.html` — new live page (dark variant).
- `works.html` — the current portfolio moved verbatim, served at `/works` via Cloudflare Pages clean
  URLs. Its own hero/nav gain a "← Live" link back to root.
- `_redirects` — map legacy deep paths if needed; plus a tiny inline script on root that bounces
  legacy hash links (`/#vox-arboris` → `/works#vox-arboris`).
- Styling: extend `styles.css` with a `body.live` (or `data-mood="night"`) dark variant. No new
  framework, no build step — hand-authored HTML/CSS, consistent with the current repo.
- Images: selected HEIC stills + video frames → optimized web JP/WebP in `img/live/`. ~8–10 picks.

## Live page sections (top → bottom)

1. **Hero** — full-bleed dark. `SPIF` + tagline "Live electronic set · Tesla-coil ritual." +
   Amsterdam location pill. Static poster `IMG_0842`; silent looping clip layered in.
2. **The Set** — centrepiece directly under hero. SoundCloud block. Until upload: intentional
   placeholder card ("New live set — dropping this weekend. Follow on SoundCloud."). Real embed is a
   one-block swap.
3. **The ritual** — dark gallery: crowd arcing tubes (`IMG_0852`), altar/headdress shots
   (`IMG_0856/0869/0870/0871`), performer-at-rig frames, long-exposure light-trails
   (`IMG_0841/0843`) as full-bleed dividers. Plate/caption styling, dark.
4. **What it is** — short prose: a live modular set around the Thundermouse coil; the audience holds
   fluorescent tubes to it and becomes part of the instrument. Booking facts (duration, space,
   power) in the existing `dl` meta style.
5. **Book** — "Available for festivals, ceremonies, private events." Instagram (@elspif) + email,
   reusing the contact-banner component.
6. **Footer** — cross-link: "Spif also builds installations → The works" (`/works`).

## Explicitly out of scope (YAGNI)

- No CMS, no build tooling.
- **Recording/uploading the SoundCloud set** is a separate task (Bitwig export, loudness, cover art)
  — helped with after the page ships.

## Deploy

Per repo convention: commit + `git push` **and** `wrangler pages deploy . --project-name=spif-amsterdam
--branch=main --commit-dirty=true`. Verify live with a `curl` probe.
