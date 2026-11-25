# Sikh Rifle and Pistol Association (SikhRPA) — Official Website

Official web platform and automated treasury repository for the **Sikh Rifle and Pistol Association (SikhRPA)**, a California 501(c)(3) nonprofit public benefit corporation (Federal EIN: `42-2595402`).

Our mission is to provide rigorous public education on firearm safety, proper handling and maintenance, California statutory compliance, and safe home storage.

## Live Platform Architecture

- **Official Domain:** [sikhrpa.org](https://sikhrpa.org)
- **Tech Stack:** Prebuilt Tailwind CSS v3 (`assets/styles.css`), Vanilla ES6 JavaScript, Pinned Lucide Icons (`1.79.0` with SHA-384 SRI), Google Apps Script (V8 Engine), Google Sheets Backend, and GitHub Pages.

## Repository Structure

```text
├── index.html                   # Main landing page with bilingual tenets & Legal Watch teaser
├── buyer-guide.html             # First-time California firearm buyer roadmap & counter readiness
├── trifold-brochure.html        # Double-sided printable bilingual (English & Gurmukhi) tri-fold brochure
├── fsc-quiz.html                # Interactive 30-question CA Firearm Safety Certificate practice test
├── zero-optics.html             # Interactive optics zeroing click calculator & shot group plotter
├── shot-diagnosis.html          # Interactive 8-sector pistol shot diagnostic & dry-fire drill guide
├── trauma-safety.html           # Bilingual "Stop the Bleed" & Range Emergency Trauma Guide
├── range-ppe.html               # Dastar-friendly Ear & Eye Protection guide, setup builder & vetted gear links
├── heritage.html                # Historical & philosophical roots: Miri-Piri & Sant-Sipahi doctrine
├── news.html                    # Permanent archive tracking CA legislation, DOJ notices & court rulings
├── donate.html                  # Tax-deductible 501(c)(3) portal (Zelle, Dasvandh Network & PayPal)
├── receipt.html                 # Public portal for IRS § 170 tax receipts and expense reimbursements
├── admin.html                   # Officer portal (President & Treasurer, noindex) for receipt/reimbursement approval
├── 404.html                     # Branded fallback page with quick navigation to core guides
├── robots.txt                   # Search crawler directives (disallows /admin and unpublished tools)
├── sitemap.xml                  # Sitemap 0.9 index of all public pages
├── srpa-logo.png                # Optimized 256x256 emblem asset (EST. 2026)
├── og-card.png                  # 1200x630 Open Graph & Twitter social sharing card
├── favicon.ico                  # Multi-resolution browser favicon
├── apple-touch-icon.png         # 180x180 iOS home screen icon
├── assets/
│   └── styles.css               # Prebuilt minified Tailwind CSS v3 stylesheet (~10 KB gzipped)
├── src/
│   └── input.css                # Tailwind CSS source entrypoint
├── tailwind.config.js           # Tailwind v3 configuration & custom brand colors
├── package.json                 # CSS build (`npm run build:css`) & verification (`npm run verify`) scripts
├── data/
│   ├── news.json                # Automated California Legal Watch permanent archive
│   └── news-latest.json         # Lightweight (<2 KB) latest dispatch payload for index.html teaser
├── scripts/
│   ├── update_news.js           # Hardened Gemini Search Grounding Legal Watch updater (dedup + URL checks)
│   ├── verify_site.py           # Automated JSON/XML/HTML/JS/Tailwind/accessibility verification suite
│   ├── apps_script_auth_upgrade.gs # Reference Google Apps Script POST auth & HMAC session token handler
│   └── process_handgun_assets.py# Handgun silhouette scrubbing & 100 px/in scale calibration pipeline
└── .github/
    └── workflows/
        ├── update_news.yml      # Automated bi-weekly (Tue & Fri) GitHub Actions workflow
        └── site-check.yml       # Automated PR & main branch CI quality/security verification
```

## Key Features & Interactive Tools

### 1. Interactive CA FSC Practice Exam (`fsc-quiz.html`)
- **30-Question Diagnostic Engine:** Replicates official California Department of Justice Firearm Safety Certificate standards.
- **Smart Shuffling & Modes:** Full 30-question exam or 15-question quick mode with optional answer randomization.
- **Statutory Explanations:** Instant feedback referencing specific California Penal Codes (e.g., PC § 25100 safe storage, PC § 26815 waiting periods).

### 2. Marksmanship & Equipment Tools (`zero-optics.html`, `shot-diagnosis.html`)
- **Zeroing Click Calculator:** Interactive shot plotter, group centroid triangulator, and MOA/MIL turret adjustment calculator.
- **Pistol Shot Diagnostic:** 8-sector diagnostic wheel with right/left-handed mirroring and corrective dry-fire drills.

### 3. Range Emergency Trauma & Stop the Bleed Guide (`trauma-safety.html`)
- **Bilingual Life-Safety Triage:** Step-by-step English & Gurmukhi instructions for tourniquet application, Z-fold wound packing, chest seals, and hypothermia prevention.
- **Interactive IFAK Auditor & Remote 911 Geolocation Tool:** Live kit readiness scoring and signed + cardinal GPS coordinate lookup for remote shooting areas.

### 4. Tax-Deductible Giving & Automated IRS Receipt Engine (`donate.html`, `receipt.html`, `admin.html`)
- **3 Donation Channels:** Zero-fee **Zelle®** (`sikhrpa`), zero-platform-fee **Dasvandh Network (dvn.org)** with monthly AutoDasvandh support, and pre-filled **PayPal®** checkout.
- **IRS § 170(f)(8) Compliance:** Donors and volunteers can submit receipt or reimbursement requests (with drag-and-drop file attachment) and receive formal signed PDF acknowledgment letters.
- **Officer Portal (`admin.html`):** Secured sign-in for the President and Treasurer with POST-first authentication (and optional HMAC session tokens via `scripts/apps_script_auth_upgrade.gs`), HTML-escaped rendering, sanitized attachment URLs, strict response validation, and CSPRNG 6-digit receipt IDs.

### 5. Automated Bi-Weekly Legal Watch (`news.html`)
- **AI-Powered Grounding:** Automated Tuesday & Friday GitHub Actions workflow queries Gemini with Google Search Grounding, deduplicates against recent archive entries (fuzzy headline + bill/case/bulletin matching within 14 days), verifies HTTP URL reachability, and publishes both `data/news.json` and lightweight `data/news-latest.json`.

## Security & Compliance Highlights

- **CSPRNG Compliant:** Session and 6-digit receipt identifiers use the Web Crypto API (`crypto.getRandomValues()` / `crypto.randomUUID()`).
- **XSS & URL Hardening:** Dynamic rendering in `admin.html` and `news.html` escapes all interpolated fields and restricts external links to `http:` / `https:`.
- **Supply-Chain Integrity:** Lucide Icons is pinned to `1.79.0` with a verified SHA-384 Subresource Integrity (`integrity`) hash, and Tailwind CSS is compiled statically to `assets/styles.css`.
- **Zero Clear-Text Storage:** Officer authentication credentials are never written to `localStorage` or `sessionStorage`.
- **Strict 501(c)(3) Governance:** All donations and expenditures are reconciled through dedicated treasury ledgers.

## Local Development & Deployment

Clone the repository and rebuild CSS after editing HTML classes:

```bash
git clone https://github.com/Sikhrpa/sikhrpa.git
cd sikhrpa
npm ci
npm run build:css
npm run verify
```

Serve locally using any static HTTP server (e.g. `python3 -m http.server 8000` or `npx http-server`). Push changes via pull request into `main` to run CI checks and deploy via GitHub Pages.

## License & Copyright

© 2026 Sikh Rifle and Pistol Association. All rights reserved. Organized exclusively for educational and charitable purposes under Section 501(c)(3) of the Internal Revenue Code.
