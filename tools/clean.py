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
    r"<script[^>]+id=[\"']wp-emoji-settings[\"'][^>]*>.*?</script>\s*",
    r"<script[^>]+type=[\"']module[\"'][^>]*>(?:(?!</script>).)*?wp-emoji-settings(?:(?!</script>).)*?</script>\s*",
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
