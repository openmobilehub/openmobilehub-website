# openmobilehub.org — static site

The live website of [Open Mobile Hub](https://openmobilehub.org), served as plain
static HTML from GitHub Pages. Migrated from WordPress on 2026-07-09; the pages are
the rendered output of the old site (Salient theme markup), kept pixel-identical.

## How this site works

- Every page is a folder with an `index.html` (`/about/index.html` → openmobilehub.org/about/).
- All images/CSS/JS live under `/wp-content/` (paths kept from WordPress so old
  inbound links still work). There is **no WordPress, PHP, or database** — files only.
- Pushing to `main` deploys automatically via GitHub Pages.

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

## One-time: pointing the domain at GitHub Pages

1. Push this repo to GitHub and enable **Settings → Pages → Deploy from branch**
   (`main`, `/ (root)`).
2. In **Settings → Pages → Custom domain**, enter `openmobilehub.org`
   (the `CNAME` file in this repo keeps that setting).
3. At the DNS provider for openmobilehub.org, replace the current A records with
   GitHub Pages': `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
   `185.199.111.153` (and AAAA `2606:50c0:8000::153` … `2606:50c0:8003::153` if
   IPv6 is wanted). Point `www` as a CNAME at `<org-or-user>.github.io`.
4. Wait for DNS to propagate, then tick **Enforce HTTPS** on the Pages settings page.
5. Only after verifying the Pages site serves correctly should the old
   WordPress (Pantheon) instance be retired.

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
