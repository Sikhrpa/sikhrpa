# SikhRPA Ear & Eye Protection — Affiliate & Authorized Image Setup Guide

The gear directory on `range-ppe.html` is powered by a single file: **`data/ppe-products.json`**. You never need to edit HTML to activate affiliate links or swap in authorized product photos.

---

## 1. Set Up SikhRPA's Amazon Associates Account (10–15 Minutes)

1. Go to [affiliate-program.amazon.com](https://affiliate-program.amazon.com/) and sign up using a SikhRPA officer account (e.g., `president@sikhrpa.org` or `treasurer@sikhrpa.org`).
2. Enter your website: `https://sikhrpa.org` (specifically highlight `https://sikhrpa.org/range-ppe` as educational safety content).
3. Tax & payout setup:
   - Entity: **Sikh Rifle and Pistol Association** (California 501(c)(3) Nonprofit Public Benefit Corporation, Federal EIN: `42-2595402`).
   - Direct deposit into the SikhRPA nonprofit bank account.
4. Pick a clean Store ID, such as `sikhrpa-20`.
5. **180-Day Qualification Rule:** Amazon grants immediate provisional access to links, then reviews your site after **3 qualifying sales within 180 days** (note: your own personal purchases do not count toward the 3 sales). Once approved, you also unlock **Amazon Creators API / PA-API** for authorized Amazon product images.

### Turn On All Amazon Links in 1 Line
Open `data/ppe-products.json` and fill in your Store ID:

```json
"affiliate_config": {
  "amazon_tag": "sikhrpa-20",
  "enable_amazon_search_fallback": true,
  "amazon_disclosure": "As an Amazon Associate I earn from qualifying purchases.",
  "nonprofit_disclosure": "Some links below are affiliate links. Qualifying purchases help fund SikhRPA's free California 501(c)(3) firearm safety education programs at no extra cost to you."
}
```

The moment `amazon_tag` is non-empty, `range-ppe.html` automatically:
- Switches the top banner to the mandatory **Amazon Associates + FTC disclosure**.
- Adds an amber **"Check Price on Amazon"** button (`rel="sponsored noopener noreferrer"`) above the **"Official Specs"** button on every Amazon-eligible product card.
- Updates the **"Build Your Range PPE Setup"** recommender pills to use the affiliate links.
- *(Optional)* To link straight to a specific product listing instead of a tagged Amazon search, paste the 10-character ASIN (from Amazon SiteStripe or the `/dp/XXXXXXXXXX` URL) into `"amazon_asin"` for each item.

---

## 2. Optional Higher-Commission Affiliate Networks

Because ear and eye protection are PPE (not firearms/ammo), you can also join:
- **AvantLink** ([avantlink.com](https://www.avantlink.com/)) — Covers major shooting/outdoor retailers (OpticsPlanet, Brownells, MidwayUSA, Primary Arms) with typically higher commissions (4–8%) and **authorized product image feeds**.
- **CJ Affiliate** ([cj.com](https://www.cj.com/)) — Covers **Zenni Optical** (for the ANSI Z87+ prescription safety glasses card).
- **Direct Brand Programs:**
  - Decibullz: [decibullz.com/pages/collab](https://decibullz.com/pages/collab)
  - Wiley X: [wileyx.com/pages/ambassador-program](https://www.wileyx.com/pages/ambassador-program)

To use a non-Amazon affiliate link on any card, fill in `"affiliate_url"` and `"affiliate_label"` (e.g., `"Shop at OpticsPlanet"` or `"Order Rx at Zenni"`) in `data/ppe-products.json`—it automatically overrides Amazon for that card.

---

## 3. Adding Authorized Product Images

Each product in `data/ppe-products.json` has an `"image_url"` field (currently blank, which displays clean built-in technical illustrations). Once you have authorized images, paste either:
- An **authorized affiliate feed / Amazon Creators API image URL** (`https://...`), **or**
- A **manufacturer press-kit photo** (or original SikhRPA range photo) saved under `assets/ppe/<id>.webp` (e.g., `"image_url": "assets/ppe/sordin-neckband.webp"`).

### Important Rules
- **Never download and re-host Amazon product images** in GitHub—Amazon's Operating Agreement prohibits storing Amazon images locally and requires serving them via Amazon's API/SiteStripe.
- **Keep original manufacturer press-kit authorization emails** in your SikhRPA Google Drive folder.

### Quick Press-Kit Request Email Template (for Brands)
> **Subject:** Press Kit / Authorized Product Image Request — SikhRPA 501(c)(3) Safety Guide
>
> Hello [Brand] Media/Marketing Team,
>
> I'm reaching out from the Sikh Rifle and Pistol Association (SikhRPA), a California 501(c)(3) educational nonprofit (https://sikhrpa.org). We recently published a free Ear & Eye Protection guide tailored for Dastar and Patka wearers (https://sikhrpa.org/range-ppe) featuring your [Product Name].
>
> Could you share an authorized product photo (or link to your press/media kit) that we have permission to display alongside our link to your product page?
>
> Thank you,  
> [Name], SikhRPA

---

## 4. Compliance & 501(c)(3) Checklist
- **Disclosure:** Keep `"As an Amazon Associate I earn from qualifying purchases."` visible above the product grid (handled automatically by `range-ppe.html`).
- **No Static Dollar Prices:** Keep `$`–`$$$$` price tiers rather than hardcoded dollar amounts (required by Amazon).
- **No Cloaking / Offline Amazon Links:** Do not put Amazon affiliate links inside PDFs, emails, or shortened redirect domains.
- **Nonprofit Tax Note (UBIT):** Review affiliate revenue with SikhRPA's treasurer/CPA annually. Generally, IRS Form 990-T is only required if gross unrelated business income reaches **$1,000 or more** in a tax year.
