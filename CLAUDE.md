# spif.amsterdam — Claude notes

## Location

This repo lives **inside** the `2026-vox-arboris-show` workspace at
`/Users/spif/Sites/2026-vox-arboris-show/spif.amsterdam/`. It has its
own git history and remote (`github.com/stefanfountain/spif.amsterdam`);
the outer workspace gitignores this folder so commits stay isolated.

## Deploy

Hosted on **Cloudflare Pages** — project `spif-amsterdam`. **There is no Git integration.** A `git push` does *not* redeploy the site. You must deploy explicitly via wrangler:

```sh
wrangler pages deploy . --project-name=spif-amsterdam --branch=main --commit-dirty=true
```

Run from this repo's root (`spif.amsterdam/`), after committing. Live site updates in ~30 seconds.

Wrangler is installed globally (`/opt/homebrew/bin/wrangler`) and authenticated via OAuth as `stefan.j.fountain@gmail.com` (`pages:write` scope is present).

## Cloudflare zone info

- Zone: `spif.amsterdam`
- Zone ID: `ea57ce46cef5a018a068fc904e0c39d5`
- Cache purge via the OAuth token will **fail** (token lacks `Zone:Cache Purge` scope). For programmatic purge, generate a dedicated API token at https://dash.cloudflare.com/profile/api-tokens with `Zone > Cache Purge > Purge` on the spif.amsterdam zone.

## Workflow when shipping a change

1. Edit + verify locally.
2. `git add` specific files + commit. Push to GitHub for source-of-truth history.
3. `wrangler pages deploy . --project-name=spif-amsterdam --branch=main --commit-dirty=true`.
4. Verify with `curl -s "https://spif.amsterdam/?probe=$(date +%s)" | grep <expected-token>`.
