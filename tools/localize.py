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

try:  # macOS python.org builds ship without CA certs; certifi fills the gap
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
except ImportError:
    pass

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
