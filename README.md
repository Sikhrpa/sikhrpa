Sikh Rifle and Pistol Association (SikhRPA) | Official Repository

Official web platform and automated treasury repository for the Sikh Rifle and Pistol Association (SikhRPA), a California 501(c)(3) nonprofit public benefit corporation (Federal EIN: 42-2595402).

Our mission is to provide rigorous public education on firearm safety, proper handling and maintenance, California statutory compliance, and safe home storage.

🚀 Live Platform Architecture

Official Domain: sikhrpa.org

Tech Stack: Tailwind CSS (CDN), Vanilla ES6 JavaScript, Lucide Icons, Google Apps Script (Apps Script V8 Engine), and Google Sheets Backend.

📂 Repository Structure

├── index.html                   # Main landing page with bilingual tenets & daily legal watch teaser
├── buyer-guide.html             # First-time California firearm buyer roadmap & counter readiness
├── guide-pdf.html               # Printable 2-page bilingual (English & Gurmukhi) PDF handbook
├── trifold-brochure.html        # Double-sided printable tri-fold event flyer
├── fsc-quiz.html                # Interactive 30-question CA Firearm Safety Certificate practice test
├── trauma-safety.html           # Bilingual "Stop the Bleed" & Range Emergency Trauma Guide
├── heritage.html                # Historical & philosophical roots: Miri-Piri & Sant-Sipahi doctrine
├── news.html                    # Permanent archive tracking CA legislation, DOJ notices & court rulings
├── donate.html                  # Tax-deductible 501(c)(3) donation portal with PayPal & Zelle links
├── receipt.html                 # Public portal for IRS § 170 tax receipts and expense reimbursements
├── admin.html                   # Secure officer portal (President & Treasurer) for receipt/reimbursement approval
├── data/
│   └── news.json                # Automated legal intelligence daily digest cache
├── scripts/
│   └── update_news.js           # Gemini AI legal news scraper with Google Search Grounding
└── .github/
    └── workflows/
        └── update_news.yml      # Automated daily GitHub Action workflow for legal watch dispatches


✨ Key Features & Interactive Tools

1. Interactive CA FSC Practice Exam (fsc-quiz.html)

30-Question Diagnostic Engine: Replicates official California Department of Justice Firearm Safety Certificate standards.

Smart Shuffling & Modes: Full 30-question exam or 15-question quick mode with optional answer randomization.

Statutory Explanations: Instant feedback referencing specific California Penal Codes (e.g., PC § 25100 safe storage, PC § 26815 waiting periods).

Telemetry & Local History: Records session accuracy to Google Sheets and stores recent local test scores in browser storage.

2. Range Emergency Trauma & Stop the Bleed Guide (trauma-safety.html)

Bilingual Life-Safety Triage: Step-by-step instructions (with Gurmukhi translations) for tourniquet application (CAT Gen 7 / SOFTT-W), Z-fold wound packing, chest seals, and hypothermia prevention.

Interactive IFAK Auditor: Real-time range bag trauma kit readiness scoring.

Remote 911 Geolocation Tool: Fetches device GPS coordinates for emergency dispatchers in remote BLM and National Forest shooting areas.

3. Automated Treasury & IRS Receipt Engine (admin.html & receipt.html)

IRS § 170(f)(8) Compliance: Donors and volunteers can request formal written acknowledgment letters for tax deductions.

PDF Letterhead Generator: Google Apps Script automatically compiles and emails formal PDF tax receipts signed by the active officer.

Officer Portal: Secured sign-in for the President and Treasurer to review claims, view uploaded store receipts, dispatch PDF letters, or record bank reimbursements.

4. Automated Daily Legal Watch (news.html)

AI-Powered Grounding: Daily GitHub Actions workflow queries Gemini with Google Search Grounding to index recent 9th Circuit rulings, CA DOJ bulletins, and chaptered bills.

Permanent Archive: Searchable, filterable news feed keeping California families informed of changing regulatory requirements.

🛡️ Security & Compliance Highlights

CSPRNG Compliant: All session identifiers use the Web Crypto API (crypto.randomUUID() / crypto.getRandomValues()), satisfying CodeQL js/insecure-randomness standards.

Zero Clear-Text Storage: Officer authentication credentials and passwords are never written to localStorage or sessionStorage; sessions reside securely in volatile heap memory.

Strict 501(c)(3) Governance: All donations and expenditures are transparently reconciled through dedicated spreadsheet ledgers.

🛠️ Local Development & Deployment

Clone the repository:

git clone https://github.com/sikhrpa/sikhrpa.github.io.git
cd sikhrpa.github.io


Serve locally using any static HTTP server (e.g., Node http-server, Python http.server, or Live Server in VS Code).

Push changes to main to deploy instantly via GitHub Pages.

📄 License & Copyright

© 2026 Sikh Rifle and Pistol Association. All rights reserved. Organized exclusively for educational and charitable purposes under Section 501(c)(3) of the Internal Revenue Code.
