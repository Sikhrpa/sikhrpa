#!/usr/bin/env python3
"""
SikhRPA Automated Site Audit & Regression Verification Script
Validates JSON, JSON-LD, XML sitemap, robots.txt, HTML structure, Tailwind v3 classes,
Gurmukhi lang="pa" coverage, heading hierarchy, internal links, JS syntax, and Python syntax.
"""

import glob
import json
import os
import py_compile
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO_ROOT)

errors = []


def check(condition: bool, message: str):
    if condition:
        print(f"PASS: {message}")
    else:
        errors.append(message)
        print(f"FAIL: {message}", file=sys.stderr)


class GurmukhiLangAuditor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.issues = []

    def handle_starttag(self, tag, attrs):
        attr_map = dict(attrs)
        self.stack.append((tag, attr_map.get("lang")))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                self.stack.pop(i)
                break

    def handle_data(self, data):
        if re.search(r"[\u0A00-\u0A7F]", data):
            if any(t in ("script", "style", "title") for t, _ in self.stack):
                return
            if not any(lang == "pa" for _, lang in self.stack):
                self.issues.append((self.getpos()[0], data.strip()[:60]))


def main():
    # 1. JSON files
    for jf in [
        "data/news.json",
        "data/news-latest.json",
        "data/ppe-products.json",
        "data/handgun_database.json",
        "data/handgun_manifest.json",
    ]:
        try:
            with open(jf, encoding="utf-8") as fh:
                json.load(fh)
            check(True, f"Valid JSON: {jf}")
        except Exception as exc:
            check(False, f"Invalid JSON {jf}: {exc}")

    # Validate PPE catalog schema & URLs
    try:
        ppe = json.load(open("data/ppe-products.json", encoding="utf-8"))
        prods = ppe.get("products", [])
        check(len(prods) >= 10, f"data/ppe-products.json has {len(prods)} products")
        bad_ppe_urls = []
        for p in prods:
            for k in ("official_url", "affiliate_url"):
                val = (p.get(k) or "").strip()
                if val and not val.startswith("https://"):
                    bad_ppe_urls.append(f"{p.get('id')}.{k}={val}")
            img = (p.get("image_url") or "").strip()
            if img and not (img.startswith("https://") or img.startswith("assets/ppe/")):
                bad_ppe_urls.append(f"{p.get('id')}.image_url={img}")
        check(len(bad_ppe_urls) == 0, f"data/ppe-products.json URLs valid ({bad_ppe_urls})")
    except Exception as exc:
        check(False, f"data/ppe-products.json validation failed: {exc}")

    latest_size = os.path.getsize("data/news-latest.json")
    check(latest_size < 2048, f"data/news-latest.json < 2 KB ({latest_size} bytes)")

    # 2. Sitemap 0.9 XML
    try:
        tree = ET.parse("sitemap.xml")
        root = tree.getroot()
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        urls = root.findall("sm:url", ns)
        valid_freq = {"always", "hourly", "daily", "weekly", "monthly", "yearly", "never"}
        locs = [u.find("sm:loc", ns).text for u in urls if u.find("sm:loc", ns) is not None]
        freqs = [u.find("sm:changefreq", ns).text for u in urls if u.find("sm:changefreq", ns) is not None]
        check(len(locs) > 0, f"sitemap.xml valid XML with {len(locs)} URLs")
        check(all(f in valid_freq for f in freqs), "All sitemap.xml <changefreq> values are valid Sitemap 0.9")
        check(
            all("admin" not in l and "404" not in l and "handgun-compare" not in l for l in locs),
            "sitemap.xml excludes /admin, /404, and unpublished /handgun-compare",
        )
    except Exception as exc:
        check(False, f"Invalid sitemap.xml: {exc}")

    # 3. robots.txt
    robots = open("robots.txt", encoding="utf-8").read()
    check("Disallow: /admin" in robots, "robots.txt disallows /admin")
    check("Sitemap: https://sikhrpa.org/sitemap.xml" in robots, "robots.txt declares sitemap.xml")

    # 4. Prebuilt Tailwind CSS
    check(
        os.path.exists("assets/styles.css") and os.path.getsize("assets/styles.css") > 1000,
        "Prebuilt static assets/styles.css exists",
    )

    # 5. HTML checks across all pages
    html_files = sorted(glob.glob("*.html"))
    non_public = {"admin.html", "404.html", "handgun-compare.html"}
    existing_slugs = {os.path.splitext(f)[0] for f in html_files} | set(html_files) | {"", "./", "/"}

    for f in html_files:
        txt = open(f, encoding="utf-8").read()

        # No Tailwind Play CDN or unpinned lucide@latest
        check("cdn.tailwindcss.com" not in txt, f"{f}: uses prebuilt CSS instead of cdn.tailwindcss.com")
        check("unpkg.com/lucide@latest" not in txt, f"{f}: Lucide CDN is version-pinned")
        check("integrity=\"sha384-" in txt, f"{f}: Lucide script includes SHA-384 SRI integrity hash")

        # Invalid Tailwind v3 classes
        bad_tw = re.findall(r"\b(?:xs:[^\s\"'<>]+|shadow-2xs|bg-white/98|p-4\.5|sm:p-4\.5)\b", txt)
        check(len(bad_tw) == 0, f"{f}: zero invalid Tailwind v3 classes ({bad_tw})")

        # Gurmukhi lang="pa"
        auditor = GurmukhiLangAuditor()
        auditor.feed(txt)
        check(len(auditor.issues) == 0, f"{f}: all Gurmukhi blocks have lang='pa' ({auditor.issues[:3]})")

        # Heading hierarchy (no skipped levels)
        headings = [int(lvl) for lvl in re.findall(r"<h([1-6])\b", txt)]
        skips = [(headings[i], headings[i + 1]) for i in range(len(headings) - 1) if headings[i + 1] > headings[i] + 1]
        check(len(skips) == 0, f"{f}: zero heading hierarchy skips ({skips})")

        # target="_blank" links include rel="noopener"
        missing_noopener = []
        for m in re.finditer(r"<a\b[^>]*target=\"_blank\"[^>]*>", txt, re.S):
            if "noopener" not in m.group(0):
                missing_noopener.append(txt[: m.start()].count("\n") + 1)
        check(len(missing_noopener) == 0, f"{f}: all target=_blank links have rel=noopener ({missing_noopener})")

        # Internal static hrefs resolve
        broken_links = []
        for href in re.findall(r'href="([^"]+)"', txt):
            if href.startswith(("http://", "https://", "mailto:", "tel:", "#", "${")):
                continue
            base = href.lstrip("./").lstrip("/").split("#")[0].split("?")[0]
            if base and base not in existing_slugs and not os.path.exists(base):
                broken_links.append(href)
        check(len(broken_links) == 0, f"{f}: zero broken internal links ({broken_links})")

        # Public page SEO tags
        if f not in non_public:
            check('rel="canonical"' in txt, f"{f}: has rel=canonical")
            check('content="https://sikhrpa.org/og-card.png"' in txt, f"{f}: has absolute og-card.png")
            check(
                'name="twitter:image" content="https://sikhrpa.org/og-card.png"' in txt,
                f"{f}: has twitter:image og-card.png",
            )
            check("favicon.ico" in txt and "apple-touch-icon.png" in txt, f"{f}: has favicon & apple-touch-icon")

    # 6. JSON-LD validation on index.html & donate.html
    for f in ["index.html", "donate.html"]:
        txt = open(f, encoding="utf-8").read()
        m = re.search(r'<script type="application/ld\+json">(.*?)</script>', txt, re.S)
        check(m is not None, f"{f}: has JSON-LD block")
        if m:
            ld = json.loads(m.group(1))
            check(ld.get("@type") == "NGO", f"{f}: JSON-LD @type is NGO")
            check(
                ld.get("nonprofitStatus") == "https://schema.org/Nonprofit501c3",
                f"{f}: JSON-LD nonprofitStatus is Nonprofit501c3",
            )
            check(
                "https://dvn.org/organizations/sikh-rifle-and-pistol-association" in ld.get("sameAs", []),
                f"{f}: JSON-LD sameAs includes Dasvandh Network",
            )

    # 7. Admin security & noindex checks
    adm = open("admin.html", encoding="utf-8").read()
    check('<meta name="robots" content="noindex, nofollow"' in adm, "admin.html has noindex, nofollow")
    check("Math.random" not in adm and "crypto.getRandomValues" in adm, "admin.html uses CSPRNG receipt IDs")

    # 8. JavaScript syntax checks (scripts/update_news.js + all inline <script> blocks)
    js_check = subprocess.run(["node", "--check", "scripts/update_news.js"], capture_output=True, text=True)
    check(js_check.returncode == 0, f"scripts/update_news.js syntax valid ({js_check.stderr.strip()})")

    inline_js_validator = r"""
const fs = require('fs');
const vm = require('vm');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html')).sort();
let count = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const body = (m[2] || '').trim();
    if (!body || /application\/ld\+json/i.test(attrs) || /\bsrc\s*=/i.test(attrs)) continue;
    i++; count++;
    new vm.Script(body, { filename: `${file}:script#${i}` });
  }
}
console.log(`Validated ${count} inline scripts across ${files.length} HTML files`);
"""
    inline_res = subprocess.run(["node", "-e", inline_js_validator], capture_output=True, text=True)
    check(
        inline_res.returncode == 0,
        f"Inline JS syntax check: {inline_res.stdout.strip() or inline_res.stderr.strip()}",
    )

    # 9. Python script syntax check
    try:
        py_compile.compile("scripts/process_handgun_assets.py", doraise=True)
        check(True, "scripts/process_handgun_assets.py compiles cleanly")
    except Exception as exc:
        check(False, f"scripts/process_handgun_assets.py syntax error: {exc}")

    if errors:
        print(f"\nVerification failed with {len(errors)} error(s).", file=sys.stderr)
        sys.exit(1)
    print("\nAll site audit verification checks passed!")


if __name__ == "__main__":
    main()
