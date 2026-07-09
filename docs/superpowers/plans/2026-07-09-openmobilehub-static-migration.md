# openmobilehub.org Static Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture openmobilehub.org as fully self-contained static HTML in this repo, cleaned of WordPress runtime dependencies, ready to host on GitHub Pages.

**Architecture:** Fetch the 13 rendered pages with curl into a URL-preserving directory layout, then run three small repo-resident Python tools: `localize.py` (fixpoint-downloads every referenced asset), `clean.py` (strips WP-only head tags, rewrites URLs root-relative), `check_links.py` (proves integrity). Verify with a live-vs-local text-parity check before handing off for DNS cutover.

**Tech Stack:** curl, Python 3 stdlib only (no pip installs), git, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-07-09-openmobilehub-static-migration-design.md`

---

### Task 1: Repo scaffolding

**Files:**
- Create: `tools/urls.txt`
- Create: `.nojekyll` (empty)
- Create: `CNAME`
- Create: `.gitignore`

- [ ] **Step 1: Write `tools/urls.txt`** — the complete page inventory (7 nav pages + home + blog index + 4 posts):

```
https://openmobilehub.org/
https://openmobilehub.org/about/
https://openmobilehub.org/sdk/
https://openmobilehub.org/community/
https://openmobilehub.org/faq/
https://openmobilehub.org/showcase/
https://openmobilehub.org/supporting-organizations/
https://openmobilehub.org/contact-us/
https://openmobilehub.org/blog/
https://openmobilehub.org/introducing-the-omh-cloud-storage-module/
https://openmobilehub.org/fixing-challenges-with-mobile-app-development-across-platforms/
https://openmobilehub.org/92-2/
https://openmobilehub.org/amaze-omh-bringing-the-power-of-open-source-and-open-mobile-ecosystem-to-users-globally/
```

- [ ] **Step 2: Write `.nojekyll`** (empty file), `CNAME` containing exactly `openmobilehub.org`, and `.gitignore` containing:

```
.DS_Store
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: scaffold static-site repo (page inventory, GitHub Pages config)"
```

---

### Task 2: Capture rendered HTML pages + 404

**Files:**
- Create: `index.html`, `<slug>/index.html` for each of the 12 non-home URLs
- Create: `404.html`

**Why curl, not `wget --mirror`:** wget saves query-stringed assets as literal `style.css?ver=x` filenames, which GitHub Pages can never serve, and it misses `srcset`/lazy-load attributes anyway. We fetch only the pages here; Task 3's `localize.py` handles every asset uniformly.

- [ ] **Step 1: Fetch every page into its URL-preserving path**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
while read -r url; do
  path="${url#https://openmobilehub.org/}"
  dest="${path:+$path}index.html"
  mkdir -p "$(dirname "$dest")"
  code=$(curl -s -A "$UA" -w '%{http_code}' -o "$dest" "$url")
  echo "$code  $url"
done < tools/urls.txt
```

Expected: thirteen `200` lines. If any URL prints a non-200, remove it from `tools/urls.txt`, delete its file, and note the removal in the final report.

- [ ] **Step 2: Capture the themed 404 page**

```bash
curl -s -A "$UA" https://openmobilehub.org/omh-static-migration-404-probe/ -o 404.html
grep -c -i "404\|not found" 404.html
```

Expected: count ≥ 1 (themed "page not found" content present).

- [ ] **Step 3: Sanity-check page sizes**

```bash
find . -name index.html -not -path './.git/*' | xargs wc -c | sort -n
```

Expected: every page > 20 KB (rendered theme pages are large). Investigate anything tiny.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: capture rendered HTML for all 13 pages plus 404"
```

---

### Task 3: `tools/localize.py` — make the site self-contained

**Files:**
- Create: `tools/localize.py`

Downloads every asset referenced by the captured files from openmobilehub.org into the matching local path (query strings stripped), including assets referenced *relatively inside CSS* (fonts, background images), iterating until fixpoint. Idempotent: also scans root-relative `/wp-*` refs so it can re-verify after `clean.py` rewrites URLs.

- [ ] **Step 1: Write `tools/localize.py`**

```python
#!/usr/bin/env python3
"""Make the captured site self-contained.

Scans all .html/.css/.js files for asset references to openmobilehub.org
(absolute or root-relative /wp-*) and, inside CSS, for relative url(...) refs.
Downloads anything missing into the matching local path (query strings
stripped). Repeats until no new references appear. Safe to re-run.
"""
import os
import posixpath
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = r"png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|eot|otf|mp4|webm|pdf"
ABS_RE = re.compile(
    r"(?:https?:)?//(?:www\.)?openmobilehub\.org(/[^\"'\s\\)<>]+?\.(?:%s))" % EXT, re.I
)
REL_RE = re.compile(r"[\"'(,\s](/wp-[^\"'\s\\)<>,]+?\.(?:%s))" % EXT, re.I)
CSS_URL_RE = re.compile(r"url\(\s*[\"']?([^\"')\s]+?)[\"']?\s*\)", re.I)
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
SKIP_DIRS = {".git", "tools", "docs", "templates"}


def local_path(urlpath):
    return os.path.join(ROOT, *urllib.parse.unquote(urlpath).lstrip("/").split("/"))


def wanted_paths():
    paths = set()
    for dirpath, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if not fn.endswith((".html", ".css", ".js")):
                continue
            text = open(os.path.join(dirpath, fn), encoding="utf-8", errors="replace").read()
            paths.update(m.group(1) for m in ABS_RE.finditer(text))
            paths.update(m.group(1) for m in REL_RE.finditer(text))
            if fn.endswith(".css"):
                base = "/" + os.path.relpath(dirpath, ROOT).replace(os.sep, "/")
                for m in CSS_URL_RE.finditer(text):
                    u = m.group(1).split("?")[0].split("#")[0]
                    if u.startswith(("data:", "http", "//", "#")) or not u:
                        continue
                    if u.startswith("/"):
                        paths.add(u)
                    else:
                        paths.add(posixpath.normpath(posixpath.join(base, u)))
    return {p.split("?")[0] for p in paths}


def fetch(urlpath):
    dest = local_path(urlpath)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    url = "https://openmobilehub.org" + urllib.parse.quote(urllib.parse.unquote(urlpath))
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp, open(dest, "wb") as out:
        out.write(resp.read())


def main():
    attempted, downloaded, failed = set(), 0, []
    for _ in range(10):
        missing = sorted(
            p for p in wanted_paths()
            if p not in attempted and not os.path.exists(local_path(p))
        )
        if not missing:
            break
        for p in missing:
            attempted.add(p)
            try:
                fetch(p)
                downloaded += 1
                print("fetched", p)
            except Exception as e:  # noqa: BLE001 - report and continue
                failed.append(p)
                print("FAILED", p, e, file=sys.stderr)
    print(f"{downloaded} assets downloaded, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run to fixpoint**

```bash
python3 tools/localize.py
python3 tools/localize.py
```

Expected: first run prints many `fetched ...` lines and ends `N assets downloaded, 0 failed`; second run ends `0 assets downloaded, 0 failed`. If a small number fail with HTTP 404, they are references to assets that are already broken on the live site — record them in the final report and move on; any other failure mode must be fixed.

- [ ] **Step 3: Spot-check the theme's CSS/fonts landed**

```bash
find wp-content -type d | head -20 && find wp-content -name "*.woff*" | head -5 && du -sh wp-content
```

Expected: `wp-content/themes/...`, `wp-content/uploads/...` directories exist; at least one font file found.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: localize all theme/upload assets (tools/localize.py)"
```

---

### Task 4: `tools/clean.py` — strip WordPress cruft, normalize URLs

**Files:**
- Create: `tools/clean.py`

- [ ] **Step 1: Write `tools/clean.py`**

```python
#!/usr/bin/env python3
"""Strip WordPress-only tags from every captured HTML file and rewrite
openmobilehub.org URLs to root-relative. Idempotent; re-run any time.

Kept intentionally absolute: rel=canonical, og:/twitter: meta, and JSON-LD
structured data (crawlers want absolute URLs there, and the domain will
point at this static site after cutover, so they stay correct).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "tools", "docs", "templates"}

HEAD_CRUFT = [
    r"<link[^>]+rel=[\"']https://api\.w\.org/[\"'][^>]*>\s*",
    r"<link[^>]+rel=[\"']EditURI[\"'][^>]*>\s*",
    r"<link[^>]+rel=[\"']wlwmanifest[\"'][^>]*>\s*",
    r"<link[^>]+rel=[\"']shortlink[\"'][^>]*>\s*",
    r"<link[^>]+rel=[\"']pingback[\"'][^>]*>\s*",
    r"<link[^>]+type=[\"']application/json\+oembed[\"'][^>]*>\s*",
    r"<link[^>]+type=[\"']text/xml\+oembed[\"'][^>]*>\s*",
    r"<link[^>]+type=[\"']application/rss\+xml[\"'][^>]*>\s*",
    r"<meta[^>]+name=[\"']generator[\"'][^>]*>\s*",
    r"<link[^>]+rel=[\"']dns-prefetch[\"'][^>]+s\.w\.org[^>]*>\s*",
    r"<script[^>]*>\s*window\._wpemojiSettings.*?</script>\s*",
    r"<style[^>]+id=[\"']wp-emoji-styles-inline-css[\"'][^>]*>.*?</style>\s*",
]

PROTECT_RE = re.compile(
    r"<link[^>]+rel=[\"']canonical[\"'][^>]*>"
    r"|<meta[^>]+(?:property=[\"']og:|name=[\"']twitter:)[^>]*>"
    r"|<script[^>]+application/ld\+json[^>]*>.*?</script>",
    re.I | re.S,
)
URL_DIR_RE = re.compile(r"(?:https?:)?//(?:www\.)?openmobilehub\.org/", re.I)
URL_BARE_RE = re.compile(r"(?:https?:)?//(?:www\.)?openmobilehub\.org(?=[\"'])", re.I)


def process(text):
    for pat in HEAD_CRUFT:
        text = re.sub(pat, "", text, flags=re.I | re.S)
    vault = []

    def stash(m):
        vault.append(m.group(0))
        return "\x00%d\x00" % (len(vault) - 1)

    text = PROTECT_RE.sub(stash, text)
    text = URL_DIR_RE.sub("/", text)
    text = URL_BARE_RE.sub("/", text)
    return re.sub(r"\x00(\d+)\x00", lambda m: vault[int(m.group(1))], text)


def main():
    changed = 0
    for dirpath, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if not fn.endswith(".html"):
                continue
            fp = os.path.join(dirpath, fn)
            before = open(fp, encoding="utf-8", errors="replace").read()
            after = process(before)
            if after != before:
                open(fp, "w", encoding="utf-8").write(after)
                changed += 1
                print("cleaned", os.path.relpath(fp, ROOT))
    print(f"{changed} files changed")


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run it, then confirm idempotence**

```bash
python3 tools/clean.py    # expect: "cleaned ..." for every page, "14 files changed"
python3 tools/clean.py    # expect: "0 files changed"
```

- [ ] **Step 3: Grep gate — no WordPress runtime references remain**

```bash
grep -rE "(https?:)?//(www\.)?openmobilehub\.org" --include="*.html" . \
  | grep -viE "canonical|og:|twitter:|ld\+json|@context|@graph" | wc -l
grep -rE "wp-json|xmlrpc|wlwmanifest|wpemoji" --include="*.html" . | wc -l
```

Expected: both `0`. (Absolute self-domain URLs inside canonical/og/JSON-LD are the allowed exceptions and are filtered by the first command; the second must be unconditionally zero.)

- [ ] **Step 4: Re-run localize to catch any root-relative refs not yet on disk**

```bash
python3 tools/localize.py
```

Expected: `0 assets downloaded, 0 failed` (or a handful of fetches then zero on re-run).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: strip WordPress runtime tags, normalize URLs root-relative (tools/clean.py)"
```

---

### Task 5: `tools/check_links.py` — internal integrity gate

**Files:**
- Create: `tools/check_links.py`

- [ ] **Step 1: Write `tools/check_links.py`**

```python
#!/usr/bin/env python3
"""Verify every root-relative href/src/srcset/url() target in the site's HTML
resolves to a file in this repo. Exit 1 if anything is missing."""
import os
import re
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "tools", "docs", "templates"}
ATTR_RE = re.compile(r"(?:href|src)=[\"'](/[^\"']*)[\"']", re.I)
SRCSET_RE = re.compile(r"srcset=[\"']([^\"']+)[\"']", re.I)
CSSURL_RE = re.compile(r"url\(\s*[\"']?(/[^\"')\s]+?)[\"']?\s*\)", re.I)


def exists(target):
    path = urllib.parse.unquote(target.split("#")[0].split("?")[0])
    if not path or path == "/":
        return True
    full = os.path.join(ROOT, *path.lstrip("/").split("/"))
    return os.path.exists(full) or os.path.exists(os.path.join(full, "index.html"))


def targets(text):
    for m in ATTR_RE.finditer(text):
        yield m.group(1)
    for m in CSSURL_RE.finditer(text):
        yield m.group(1)
    for m in SRCSET_RE.finditer(text):
        for part in m.group(1).split(","):
            u = part.strip().split(" ")[0]
            if u.startswith("/"):
                yield u


def main():
    missing = []
    for dirpath, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if not fn.endswith(".html"):
                continue
            fp = os.path.join(dirpath, fn)
            rel = os.path.relpath(fp, ROOT)
            text = open(fp, encoding="utf-8", errors="replace").read()
            for t in targets(text):
                if not exists(t):
                    missing.append(f"{rel}: {t}")
    for line in sorted(set(missing)):
        print("MISSING", line)
    print(f"{len(set(missing))} missing targets")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run it**

```bash
python3 tools/check_links.py
```

Expected: `0 missing targets`, exit 0. If targets are missing, they are either (a) assets `localize.py` should fetch — re-run it — or (b) links to WordPress-only endpoints (e.g. `/feed/`, `/comments/feed/`) that `clean.py`'s cruft list should have removed; extend the cruft list, re-run, re-check.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add internal link/asset integrity checker"
```

---

### Task 6: Serve locally and smoke-test

**Files:** none (verification only)

- [ ] **Step 1: Serve and probe every page**

```bash
python3 -m http.server 8080 &
sleep 1
while read -r url; do
  path="/${url#https://openmobilehub.org/}"
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8080$path")
  echo "$code  $path"
done < tools/urls.txt
kill %1
```

Expected: thirteen `200` lines.

- [ ] **Step 2: Verify zero live-domain requests would be made at runtime** — re-run the Task 4 Step 3 grep gate one more time after all rewrites. Expected: `0` / `0`.

---

### Task 7: `tools/compare_live.py` — text parity vs live WordPress

**Files:**
- Create: `tools/compare_live.py`

- [ ] **Step 1: Write `tools/compare_live.py`**

```python
#!/usr/bin/env python3
"""Compare visible text of each local page against its live counterpart.
Proves the capture didn't lose content. Run while WordPress is still up."""
import difflib
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}


def visible_text(html):
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<[^>]+>", " ", html)
    return " ".join(html.split())


def main():
    urls = open(os.path.join(ROOT, "tools", "urls.txt")).read().split()
    worst = 1.0
    for url in urls:
        slug = url[len("https://openmobilehub.org/"):]
        local = os.path.join(ROOT, *slug.split("/"), "index.html") if slug else os.path.join(ROOT, "index.html")
        req = urllib.request.Request(url, headers=UA)
        live = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
        mine = open(local, encoding="utf-8", errors="replace").read()
        ratio = difflib.SequenceMatcher(
            None, visible_text(live), visible_text(mine)
        ).ratio()
        worst = min(worst, ratio)
        print(f"{ratio:.3f}  /{slug}")
    print(f"worst: {worst:.3f}")
    return 0 if worst >= 0.97 else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run it**

```bash
python3 tools/compare_live.py
```

Expected: every page ≥ 0.97, exit 0. Lower ratios usually mean the live page changed between capture and now (re-capture that page) or dynamic content (investigate before accepting).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add live-vs-local text parity checker"
```

---

### Task 8: Blog post template

**Files:**
- Create: `templates/blog-post.html`

- [ ] **Step 1: Copy the simplest captured post as the starting point**

```bash
mkdir -p templates
cp introducing-the-omh-cloud-storage-module/index.html templates/blog-post.html
```

- [ ] **Step 2: Mark the editable regions.** Open `templates/blog-post.html` and:
  1. Find the `<title>` tag and the post's `<h1>` heading — replace the post title text with `NEW POST TITLE`.
  2. Find the published-date markup (a `<span>`/`<time>` near the heading containing "October 15, 2024" or similar) — replace the date text with `MONTH DAY, YEAR`.
  3. Find the post body (the element containing the article paragraphs) — replace its inner paragraphs with `<p class="wp-block-paragraph">YOUR POST CONTENT HERE. Copy this paragraph block for each additional paragraph.</p>`.
  4. Find canonical/og meta tags in `<head>` — replace the post URL slug with `NEW-POST-SLUG` and title/description content with the same `NEW POST TITLE` placeholder.
  5. Immediately after `<!DOCTYPE html>` (or the opening `<html>` tag), insert:

```html
<!-- BLOG POST TEMPLATE
  To publish a new post:
  1. Copy this file to /your-post-slug/index.html at the repo root.
  2. Replace every NEW POST TITLE, MONTH DAY, YEAR, NEW-POST-SLUG,
     and YOUR POST CONTENT placeholder below.
  3. Add a link to the new post in /blog/index.html (copy an existing
     entry block there and edit title/date/URL).
  4. Commit and push. Done.
-->
```

- [ ] **Step 3: Verify no placeholder was missed being marked**

```bash
grep -c "NEW POST TITLE" templates/blog-post.html   # expect >= 2 (title tag + h1 + og metas)
grep -ci "cloud storage module" templates/blog-post.html   # expect 0
```

- [ ] **Step 4: Commit**

```bash
git add templates && git commit -m "feat: add blog post template with editing instructions"
```

---

### Task 9: README maintenance guide

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`:**

```markdown
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
   `185.199.111.153` (and AAAA `2606:50c0:8000::153` … `:8003::153` if IPv6 wanted).
   Point `www` CNAME at `<org>.github.io`.
4. Wait for DNS, then tick **Enforce HTTPS** on the Pages settings page.
5. Only after verifying the Pages site serves correctly should the old
   WordPress/Pantheon instance be retired.

## Repo tools (`tools/`)

Used during migration; re-usable after content edits:
- `localize.py` — downloads any asset a page references from the old domain.
- `clean.py` — strips WordPress-only tags, makes URLs root-relative.
- `check_links.py` — verifies every internal link/asset resolves.
- `compare_live.py` — (migration-era) text-diff of local pages vs the live site.
```

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: add maintenance guide and DNS cutover instructions"
```

---

### Task 10: Final verification & handoff

**Files:** none

- [ ] **Step 1: Run all gates end-to-end**

```bash
python3 tools/localize.py       # expect: 0 assets downloaded, 0 failed
python3 tools/clean.py          # expect: 0 files changed
python3 tools/check_links.py    # expect: 0 missing targets
python3 tools/compare_live.py   # expect: worst >= 0.97
```

- [ ] **Step 2: Serve locally for user visual review**

```bash
python3 -m http.server 8080
```

Ask the user to click through http://localhost:8080 (Home, About, SDKs, Community, FAQ, Showcase, Supporting Organizations, Contact Us — confirm the HubSpot form renders — Blog and one post) and compare against the live site.

- [ ] **Step 3: Report** — summarize: pages captured, assets localized (count/size), anything removed or already broken on the live site, and the remaining user actions (create GitHub repo, push, enable Pages, DNS cutover per README).
