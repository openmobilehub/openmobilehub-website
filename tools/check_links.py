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
    if target.startswith("//"):  # protocol-relative external URL
        return True
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
