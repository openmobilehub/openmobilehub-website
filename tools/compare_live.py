#!/usr/bin/env python3
"""Compare visible text of each local page against its live counterpart.
Proves the capture didn't lose content. Run while WordPress is still up."""
import difflib
import os
import re
import sys
import urllib.request

try:  # macOS python.org builds ship without CA certs; certifi fills the gap
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
except ImportError:
    pass

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
