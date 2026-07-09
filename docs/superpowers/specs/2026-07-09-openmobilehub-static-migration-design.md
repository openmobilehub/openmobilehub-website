# openmobilehub.org → Static HTML Migration — Design

**Date:** 2026-07-09
**Status:** Approved (design discussed and accepted in session)
**Goal:** Replace the WordPress site at openmobilehub.org with self-contained static
HTML pages that can be maintained directly (edit → git push), hosted on GitHub Pages,
with zero visible change for visitors.

## Decisions (made with user)

| Decision | Choice |
|---|---|
| Visual fidelity | Keep current look pixel-identical (mirror rendered site) |
| Hosting | GitHub Pages with custom domain openmobilehub.org |
| Blog workflow | Plain HTML; new posts by copying a template file by hand |
| Approach | Mirror + scripted cleanup (Approach A; simplification rejected as riskier) |

## Site inventory (from WordPress REST API)

- **Live pages (migrate):** Home (`/`), About, SDKs, Community, FAQ,
  AI Agent Showcase (`/showcase/`), Supporting Organizations, Contact Us, Blog index.
  Exact canonical set confirmed against the live nav menu during capture.
- **Blog posts (migrate, at original slugs):**
  - `/introducing-the-omh-cloud-storage-module/`
  - `/fixing-challenges-with-mobile-app-development-across-platforms/`
  - `/92-2/` (OMH <> React Native: React Conf 2024)
  - `/amaze-omh-bringing-the-power-of-open-source-and-open-mobile-ecosystem-to-users-globally/`
- **Excluded:** stale WordPress duplicates `home-new`, `sdks-new`, `technical` (empty),
  and one of `sdk`/`sdks-new` (whichever is not linked from the live nav).
- **Contact form:** HubSpot client-side embed (js.hsforms.net, portalId 8112310) —
  works on a static site unchanged; keep it.

## Architecture

1. **Capture:** `wget --mirror --page-requisites --convert-links --adjust-extension`
   against https://openmobilehub.org to get rendered HTML + theme CSS/JS + images + fonts.
2. **Asset audit:** post-pass that finds and fetches what wget misses — `srcset`
   variants, `url(...)` references inside CSS (fonts, background images), and any
   remaining absolute `openmobilehub.org` asset URLs — then rewrites them to local
   relative paths, iterating until the site is fully self-contained.
3. **Cleanup (scripted, repeatable):** a Python script (`tools/clean.py`, kept in the
   repo) that strips WordPress-only markup from every page:
   - REST API discovery `<link>`s, RSD/EditURI, shortlink, oEmbed discovery
   - `generator` meta tags, emoji detection script/styles, feed `<link>`s
   - normalizes internal links to relative paths
   Kept: theme CSS/JS bundles (they define the look), jQuery, HubSpot embed.
4. **Verification:** serve locally (`python3 -m http.server`), screenshot every page
   vs. its live counterpart for visual parity, run a link check over the local site,
   and grep to prove no remaining runtime requests to WordPress endpoints.

## Repo layout

```
/index.html                      # Home
/about/index.html                # ... one folder per page, URLs preserved
/blog/index.html                 # blog index (frozen HTML, hand-edited per new post)
/<post-slug>/index.html          # blog posts at original root-level slugs
/wp-content/uploads/...          # images kept at original paths (external hotlinks keep working)
/wp-content/themes/...           # theme CSS/JS as captured
/404.html                        # GitHub Pages custom 404
/CNAME                           # "openmobilehub.org"
/.nojekyll                       # serve files as-is, no Jekyll processing
/templates/blog-post.html        # starter file for future posts
/tools/clean.py                  # the cleanup script (repeatable)
/README.md                       # maintenance guide (see below)
/docs/superpowers/specs/...      # this design doc
```

## Maintenance guide (README contents)

- Edit any page: open its `index.html`, change the text, commit, push.
- Add a blog post: copy `templates/blog-post.html` to `/<new-slug>/index.html`,
  fill in title/date/body, add one entry to `/blog/index.html`, push.
- Add images: drop files under `/wp-content/uploads/<year>/` and reference them.
- Preview locally: `python3 -m http.server` from the repo root.
- One-time DNS cutover instructions: GitHub Pages A/AAAA records (or CNAME for www),
  enable custom domain + HTTPS in repo settings. Cutover is user-initiated.

## Error handling & known trade-offs

- **Lost WordPress features:** site search and RSS feeds disappear (neither is in the
  site nav). Comments are already closed on all posts.
- **Blog index is static:** adding a post requires a hand edit of `/blog/index.html`
  (accepted as part of the chosen workflow).
- **Verbose markup:** page-builder `<div>` nesting is kept as-is; text edits are easy,
  layout restructuring is clumsy. Individual pages can be hand-simplified later,
  verified against screenshots.
- **Capture misses:** any asset still loading from the live domain after cutover would
  break when WordPress is retired — this is exactly what the asset-audit grep gate
  prevents; the gate is "zero absolute references to openmobilehub.org in HTML/CSS
  except intentional canonical/og meta tags".
- **DNS cutover risk:** the only irreversible-ish step; performed manually by the user
  after reviewing the deployed GitHub Pages preview URL.

## Testing

- Visual parity: per-page screenshot comparison (local static vs. live WordPress).
- Integrity: link checker over the local server (no 404s for internal links/assets).
- Self-containment: grep gate described above.
- Form: HubSpot form renders and submits from the static Contact Us page.
