# openmobilehub.org — static site

The live website of [Open Mobile Hub](https://openmobilehub.org), served as plain
static HTML from Vercel. Migrated from WordPress on 2026-07-09; the pages are
the rendered output of the old site (Salient theme markup), kept pixel-identical.

## How this site works

- Every page is a folder with an `index.html` (`/about/index.html` → openmobilehub.org/about/).
- All images/CSS/JS live under `/wp-content/` (paths kept from WordPress so old
  inbound links still work). There is **no WordPress, PHP, or database** — files only.
- Pushing to `main` deploys automatically via Vercel.
- `vercel.json` sets `trailingSlash: true` so `/about` redirects to `/about/`,
  matching the old WordPress URLs.

## Common tasks

### Edit text on a page
1. Open the page's `index.html` (e.g. `faq/index.html`).
2. Search for the sentence you want to change, edit it, save.
3. Commit and push.

### Add a blog post
1. Copy `templates/blog-post.html` to `your-post-slug/index.html` at the repo root.
2. Follow the instructions in the comment at the top of that file.
3. Add the post to the list in `blog/index.html` (copy an existing entry block).
4. Commit and push.

### Add an image
1. Put the file under `wp-content/uploads/<year>/`.
2. Reference it as `/wp-content/uploads/<year>/yourfile.png`.

### Preview locally
```bash
python3 -m http.server 8080   # from the repo root
```
Then open http://localhost:8080.

### Check the site's integrity (after bigger edits)
```bash
python3 tools/check_links.py   # expect "0 missing targets"
```

## The contact form

The form on `/contact-us/` is a HubSpot embed (loads from js.hsforms.net at view
time). It needs no server here. To change the form, edit it in HubSpot
(portal 8112310); the page picks it up automatically.

## One-time: Vercel setup and DNS cutover

1. In Vercel (Pro team — the free Hobby plan can't connect GitHub-organization
   repos): **Add New → Project**, import `openmobilehub/openmobilehub-website`.
   - Framework Preset: **Other**
   - Build Command: **none** (leave empty)
   - Output Directory: **`.`** (repo root)
2. In the project: **Settings → Domains**, add `openmobilehub.org` and
   `www.openmobilehub.org`. Vercel will display the exact DNS records it wants
   (typically an A record `76.76.21.21` for the apex and a CNAME
   `cname.vercel-dns.com` for `www`) — treat the dashboard as authoritative.
3. Send those records to Linux Foundation IT to replace the current
   (Pantheon/WordPress) records for openmobilehub.org.
4. After DNS propagates, Vercel issues the TLS certificate automatically.
   Verify https://openmobilehub.org serves this site and that `/definitely-missing/`
   shows the custom 404 page.
5. Only after a few days of verified serving should the old WordPress (Pantheon)
   instance be retired. GitHub Pages was used during migration and can be
   disabled in the repo settings once Vercel is live.

## Multi-site architecture: other sites under openmobilehub.org/&lt;path&gt;

**The project that owns the domain owns the routing.** This repo's Vercel project
serves `openmobilehub.org`, so its `vercel.json` acts as the traffic director for
the whole domain. Rewrites proxy path prefixes to any HTTPS origin — another
Vercel project (any account or team), a GitHub Pages site, Netlify, anything.
Sub-sites deploy on their own cadence, from their own repos, owned by their own
teams; they do **not** need to live in the openmobilehub GitHub org or on Vercel.

```
                          ┌────────────────────────────────────┐
  openmobilehub.org ────► │ this repo's Vercel project (router)│
                          └────────────────┬───────────────────┘
        /            → serves this repo's static files
        /credentagent/* ──rewrite──► https://credentagent.vercel.app/*
        /otherproject/* ──rewrite──► https://someuser.github.io/otherproject/*
```

### Adding a sub-site

1. Deploy the sub-site anywhere with a public HTTPS URL.
2. Add two lines to `vercel.json` in this repo and merge the PR:

```json
{
  "trailingSlash": true,
  "rewrites": [
    { "source": "/credentagent", "destination": "https://<credentagent-origin>/" },
    { "source": "/credentagent/:path*", "destination": "https://<credentagent-origin>/:path*" }
  ]
}
```

Visitors stay on `openmobilehub.org/credentagent` while content is fetched from
the origin behind the scenes. The PR to this repo doubles as the governance gate
for what appears under the org's domain.

### Requirements on each sub-site

- **Must be path-aware.** Assets and internal links must be relative or prefixed
  with the sub-path, because a root-relative `/static/app.css` in proxied content
  resolves against `openmobilehub.org/static/...` (this marketing site) and 404s.
  In practice: Next.js `basePath: '/credentagent'`, Vite `base`, Jekyll `baseurl`.
  GitHub Pages *project sites* are already subpath-built; if the repo name matches
  the path prefix they proxy almost unmodified.
- **Watch for redirect leaks.** If the origin issues an absolute redirect to
  itself (GitHub Pages does this for directory URLs missing a trailing slash),
  the browser escapes to the origin's domain. Fix with consistent trailing-slash
  links or extra rewrite rules; test each sub-site's deep links.
- **Canonical/SEO tags** in sub-sites should reference
  `openmobilehub.org/<path>/...` if they should be indexed under this domain
  rather than their origin URL.

## Repo tools (`tools/`)

Used during migration; re-usable after content edits. They need only Python 3
(plus `certifi` if your Python lacks system CA certificates):

- `localize.py` — downloads any asset a page references from the old domain.
- `clean.py` — strips WordPress-only tags, makes URLs root-relative.
- `check_links.py` — verifies every internal link/asset resolves.
- `compare_live.py` — (migration-era) text-diff of local pages vs the live site.
- `urls.txt` — the page inventory the tools operate on.

## What changed vs. WordPress

- WordPress site search, RSS feeds, and comment endpoints no longer exist.
- The homepage "Contact" button now links straight to `/contact-us/` (it used to
  rely on a WordPress redirect from `/contact`).
- Author and category archive pages (`/author/…`, `/category/…`) are frozen
  snapshots; they won't list new posts automatically.
