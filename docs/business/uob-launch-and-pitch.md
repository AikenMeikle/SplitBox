# SplitBox — UoB External Data, UK Regulatory Guardrails & 3-Minute Live Pitch Guide

> **Related Docs:** [24-Hour Sprint Action Plan](../ACTION_PLAN_24H.md) · [Product MVP Spec](../product/mvp-spec.md) · [Full-Stack Technical Blueprint](../architecture/fullstack-blueprint.md) · [Brand & UI System](../design/brand-and-ui.md)

---

## Part 1: External UK Data Sources Matrix (Day-1 `~£0/mo` vs. Scale APIs)

Every external dataset below maps directly onto SplitBox's domain types (`CatalogItem`, `CampusHub`, `WholesalePoLine`, `PickupPass`, and `HallActivityEvent` in [`src/types.ts`](../../src/types.ts) & [`src/data/catalog.ts`](../../src/data/catalog.ts)):

| Domain & Schema Target | Day-1 Scrappy UoB MVP (`~£0/mo` Student Stack) | Multi-Campus UK Scale Stack (Automated APIs) |
| :--- | :--- | :--- |
| **1. Wholesale Case Cost, Stock & VAT (`CatalogItem`, `WholesalePoLine`)** | Weekly CSV/PDF trade portal downloads from **Booker Wholesale Aston Cross (`B6 5RQ`, 4.5 mi from UoB)**, **Dhamecha Smethwick**, and specialist challenger-brand distributors (**Epicurium**, **CLF Distribution**, **Suma Wholefoods**, **Refresh Surplus** for Oatly, Minor Figures, PROPER, Pip & Nut, TREK, Who Gives A Crap) + manual supplier invoice VAT-code verification (`0%` vs `20%`). | **Tradacoms / EDIFACT EDI (`ORDERS`, `DESADV`, `INVOIC` over AS2/VAN)** with Booker, Bestway, Brakes, and Bidfood + **Faire Wholesale API** / SparkLayer B2B brand-direct stock & lead-time feeds. |
| **2. GTIN Barcodes & UK FIR 14-Allergen Inner-Pack Gate (`CatalogItem`)** | Free **Open Food Facts UK REST API** (`world.openfoodfacts.org/api/v2/product/{gtin}`) paired with physical smartphone photo verification of every inner sub-unit wrapper (`isFirCompliantSubpack: true`) prior to Drop listing + free **UK FSA Food Alerts JSON/RSS** (`data.food.gov.uk/food-alerts`). | **Erudus API** (maps UK wholesale codes to outer `GTIN-14` & inner `GTIN-13` + 14 Annex II allergens) + **NielsenIQ Brandbank API** & **GS1 UK `productDNA`** automated batch/lot recall matching. |
| **3. ASA-Verifiable Campus Retail Benchmarks (`retailPriceGbp`, `calcSavingsPercent`)** | Weekly dated shelf-tag photo & receipt audit at named local stores serving UoB students: **Sainsbury's Local (`580 Bristol Rd, B29 6BE`)**, **Tesco Express (`534 Bristol Rd, B29 6BD`)**, **Costcutter Vale Village (`B15 3SZ`)**, plus **Aldi Selly Oak (`560 Bristol Rd, B29 6AE`)** price-floor checks—cross-checked on **Trolley.co.uk** and local **Co-op / Deliveroo** convenience menus. | **Assosia** & **NielsenIQ BrandView API** daily UK convenience/superstore price, `was/now` promo, and Clubcard/Nectar dual-pricing feeds + **ONS `MM23`** grocery item inflation indices. |
| **4. Campus Bed Density, Term/Loan Calendars & Isochrones (`CampusHub`)** | Free **HESA Open Data** (`UKPRN 10006840` — UoB ~38k enrollment split by halls, PBSA, HMO, commuter), **ONS Census 2021 `TS068`** (Nomis REST API student HMO density in `B29`/`B15`), official **UoB Academic Term/Exam `.ics` Calendar** (vacation/Reading Week Drop blackouts), **Student Loans Company (SLC)** Sept/Jan/April loan drop dates (*"Mega Crate Drops"*), **Postcodes.io**, and `@student.bham.ac.uk` Magic Link auth. | **StuRents** PBSA/HMO bed & catering datasets, **Ordnance Survey (`OS Places UPRN` / `OS Open Roads`)** + **OpenRouteService / OpenStreetMap** weight-constrained (`<400m` walk for `3kg+` crates, `covered=yes` shelter tags) pedestrian isochrones, and **Student Beans / UNiDAYS / SheerID** APIs. |
| **5. Weather, Viral Pool Signals & Clean Air Routing (`PickupPass`, `HallActivityEvent`)** | Free **Met Office Weather DataHub** (360 calls/day hourly rain `mm/hr` at `B15 3SZ`) / **Open-Meteo UKV 2km API** (triggers waterproof crate covers, tote-bag SMS alerts, and `+30m → +60m` grace extensions on wet Saturdays), UTM WhatsApp deep links (`?hub=vale&sku=oatly`), and **GOV.UK Clean Air Zone** Euro-6 check (`£8/day` Birmingham CAZ across `A4540` between `B6` Aston & `B15`/`B29`). | **WhatsApp Business Cloud API** automated *"1 slice left to lock Box #2!"* pool nudges, **PostHog / Dub.co** viral velocity scoring 6–12h before cutoff, and live `DESADV` multi-hub van routing. |

---

## Part 2: UK Regulatory, Food Safety & Tax Guardrails

### 2.1 Mandatory 28-Day Food Business Registration & Traceability
- **Birmingham City Council EHO Registration (`Reg (EC) 852/2004`):** Storing and distributing 100% unopened, ambient factory-sealed groceries **still legally requires registering as a Food Business Operator (FBO) via GOV.UK (free) at least 28 calendar days before Drop #1**.
- **Clean Dry Staging & Recall Logging (`Reg 178/2002 Art. 18`):** Stage cases in a clean, dry, pest-proof registered room/unit (never a damp domestic garage). During Friday crate pack-out, record `(supplier_invoice, sku, lot_code, best_before) -> drop_id` so any UK FSA allergy/safety alert triggers targeted 15-minute emails to affected Pickup Pass holders.

### 2.2 UK FIR Inner-Pack 14-Allergen Labelling & GB CLP Household Rules
- **Why Sealed Sub-Units Avoid Natasha's Law (PPDS):** Because SplitBox never opens primary packaging or decants loose food, it avoids food-manufacturing EHO fit-outs and Prepacked for Direct Sale (PPDS) preparation rules.
- **The Case-Splitting FIR Trap (`Reg 1169/2011` / Food Information Regulations 2014):** Every individual sub-unit handed to a student (`1 Slice`) **must** carry full English retail labelling on its own wrapper/carton: legal product name, full ingredients list with the **14 Annex II allergens emphasised in bold**, net metric quantity, Best Before date, batch/lot code, and a physical UK/GB FBO address. Wholesale catering inner packs marked *"Not for individual sale — allergens printed on outer carton only"* **must never be split loose** without compliant over-labelling.
- **GB CLP & Cosmetics Compliance:** Household chemical sub-units (`fairy-non-bio-pods` 28-wash tub, `finish-ultimate-tabs` 34-tab pouch, aerosols/toiletries) must retain intact factory **child-resistant closures, tactile hazard triangles, UFI codes, and GB CLP pictograms** on every student share.

### 2.3 HMRC VAT Notice 701/14 (`0%` vs `20%` Audit Across UoB SKUs) & Voluntary Registration
UK cash-and-carry depots (Booker, Dhamecha) quote prices **ex-VAT**, whereas student slice prices are **inc-VAT**. Treating `20%` standard-rated items as `0%` silently wipes out `£74+` on a 59-box campus run:

- **`0%` Zero-Rated Ambient Food & Milk/Tea Staples (Drop #1 Priority):**
  - Pantry & cooking staples (`mutti-chopped-tomatoes`, `tilda-basmati-rice` / `laila-basmati-rice-bulk`, `nongshim-shin-ramyun` / `indomie-mi-goreng-bulk`, `garofalo-penne-rigate`, `pip-nut-peanut-butter`, `myprotein-rolled-oats-surplus`, `trs-spice-trio-bulk`). *(Note: exclude fresh `easy-peeler-clementines` in Drop #1 due to 48h bruising/mould risk and thin `£0.37` gross margin.)*
  - **`oatly-barista` (`0%`):** Plant-based milk alternatives are zero-rated under HMRC VAT Notice 701/14.
  - **`proper-lentil-chips` (`0%` Pulse/Legume Exception, Notice 701/14 §3.8):** Made from lentil flour (`29%`, non-potato base) → **`0%` zero-rated**, unlike potato crisps (`20%`).
  - **`minor-figures-chai` / oat cold-brew cans (`0%`–verify invoice):** Tea/coffee preparations and dairy milk drinks (`jimmys-iced-coffee-cans` at `62%` semi-skimmed milk = **`0%`** under Notice 701/14 §3.7), whereas carbonated/sweetened non-dairy RTDs like `monster-ultra-zero-surplus` carry **`20%` VAT**.
- **Confirmed `20%` Standard-Rated Margin Traps (Require `vatRate: 0.20` Pricing):**
  1. **Household & Toiletries (`20%` VAT):** `who-gives-a-crap-bamboo` (`£3.75` ex-VAT cost vs `£4.80` inc-VAT = `£4.00` ex-VAT rev → net margin drops from `£1.05` to **`£0.25`/slice**), `fairy-non-bio-pods` (`£1.35 → £0.37`), `finish-ultimate-tabs` (`£1.20 → £0.33`), `colgate-triple-action`, `dove-bodywash-deo`.
  2. **Chocolate-Coated / Sports Protein Bars (`20%` Confectionery Trap, Notice 701/14 §3.4):** `trek-protein-flapjacks` (13% dark chocolate flavour topping + soya protein crispies → margin collapses from `£0.60` to **`£0.13`/slice** unless priced VAT-inclusively!) and `grenade-protein-clearance` (20% milk chocolate coating = `20%` VAT).
- **Day-1 Voluntary UK VAT Registration Advantage:** Even below the `£90,000` compulsory threshold, voluntarily registering for UK VAT from Day 1 makes SplitBox a **net HMRC VAT repayment business**: ~75–85% of Drop #1 sales are `0%` zero-rated output VAT, while SplitBox reclaims `20%` input VAT on van hire, reusable crates, printing, storage, and standard-rated wholesale stock.

### 2.4 FCA Pre-Auth Rules, CCR 2013 Cooling-Off, ASA Pricing & UK GDPR
1. **FCA PSR 2017 / EMR 2011 (Card Pre-Auth Hold vs. Unregulated "Escrow"):** SplitBox buys cases from wholesalers and sells slices as **first-party Principal Retailer (Merchant of Record)**—so marketplace commercial-agent exemptions do not apply, and holding pooled customer cash in "escrow" requires FCA authorisation. Use **Stripe `PaymentIntents` (`capture_method: 'manual'`)** so funds stay ring-fenced at the student's bank, enforce the 72–96h Sun `18:00` → Wed `23:59` → Thu `09:00` capture window (<7 days), and strictly label holds **"Card Pre-Authorisation Hold (£0.00 Captured Until Box Locks)"**.
2. **CCR 2013 Reg 28 & CRA 2015 s.62 (Uncollected Ambient Orders):** Unopened ambient groceries and household items are **not** exempt from the UK statutory 14-day cancellation right. Never enforce `"100% forfeiture 30 minutes after pickup"` on non-perishables: pair **1-click "Delegate Pass to a Flatmate"** with next-Drop rollover or refund minus a transparent **`£2.00` restocking fee**.
3. **ASA CAP Code Rules 3.33–3.40, DMCC Act 2024 & Price Marking Order:** Cite real, dated local stores (`Sainsbury's Local, 580 Bristol Rd B29 6BE`, `Tesco Express, 534 Bristol Rd B29 6BD`, or `Aldi Selly Oak, B29 6AE`), disclose regular vs Clubcard/Nectar loyalty prices, show metric unit pricing (`£1.40/L`, `£0.95/L`), and never strike through fictitious delivery fees.
4. **UK GDPR, PECR & Campus Liability:** Pay the **`£40/yr` ICO Data Protection Fee**; anonymise live activity tickers to hub/village level (`"Student at Vale Hub"`, never kitchen/flat numbers); keep SMS/email pickup alerts strictly transactional under PECR; secure UoB Estates / **UoB Elevate** / Guild approval + **£5M Public & Product Liability Insurance** (plus **Employers' Liability** the day paid Hub Marshalls are hired).

---

## Part 3: Corrected 3-Minute UoB Live Pitch Script & Investor / Estates FAQ

**Pre-Stage Setup (`30s`):** Run `npm run dev` on `localhost:5173` (Offline Demo Mode boots automatically with zero Wi-Fi dependency). Open the top **Demo Controls** bar, click **Reset**, and confirm **`Vale · Shackleton`** (`Sat 11:00–14:00`) is active.

### Beat 1: The UoB Convenience Tax & Storefront (`0:00 – 0:45`)
*Action: Show the **Browse Drop** storefront for `Vale · Shackleton`. Point to the Oatly Barista crate card and radial `<SliceMeter />`.*

> "Hi, I'm [Name], a CS student here at UoB. Every week, students in The Vale and Selly Oak pay a 35–40% convenience markup on Bristol Road because we don't have cars, trade cards, or cupboard space for 12-litre wholesale cases—and nobody wants to chase four flatmates on Splitwise for toilet roll.
>
> **SplitBox** lets UoB students split factory-sealed wholesale cases anonymously with hallmates at the same campus pickup hub.
>
> Here is our live **Vale · Shackleton** storefront. Look at **Oatly Barista**: 1 SplitBox Slice is **3 × 1L sealed ambient cartons for `£4.20`—just `£1.40/L`**—versus **`£6.60` (`£2.20/L`)** across convenience singles on Bristol Road (`SAVE 36%`). Crates `£9.00+` have **`£0.00` pickup fees**."

### Beat 2: Sequential Cross-Box Allocation & Card Pre-Auth Hold (`0:45 – 1:30`)
*Action: On Oatly Barista (currently `3/4` claimed), add **`2` slices** (`+1` pantry item if showing `£9.00+` free crate), open the **Crate Drawer** to highlight the FCFS allocation pills, and click **Place Pre-Auth Hold**.*

> "Watch the pooling math when a box sits at **`3/4` slices claimed** by anonymous students at Shackleton, and I add **`2` slices**:
>
> - **Slice 1** fills Slot `4/4` of **Box #1**—locking that wholesale case at `100%` for Saturday's Shackleton Drop.
> - **Slice 2** automatically opens **Box #2 at `1/4`**, pooling with the rest of The Vale.
>
> When I check out, Stripe places a **Card Pre-Authorisation Hold**—**`£0.00` is captured** until a box locks, and students can edit one weekly crate right up to **Wednesday `23:59`**."

### Beat 3: Wednesday `23:59` Cutoff, Thursday `09:00` Booker Pick & Partial Capture (`1:30 – 2:15`)
*Action: In the top **Demo Controls** bar, click **Trigger Cutoff** (which resolves pools and opens **My Orders / Pass** to show the perforated GBP Settlement Receipt).*

> "Our weekly Drop opens **Sunday `18:00`** and closes **Wednesday `23:59`**. Thursday morning at `06:30`, we pick the exact `100%` locked cases at **Booker Wholesale Aston Cross**, and at **Thursday `09:00`** our settlement engine executes a one-shot Stripe capture:
>
> - **Box #1 (`4/4` Full)** is **Fulfilled** and captured (`£4.20`).
> - **Box #2 (`1/4` Partial)** never ships—its uncaptured pre-auth hold is automatically released at **`£0.00` Stripe refund cost**, keeping the rest of the student's locked crate intact.
>
> Zero half-empty cases, zero unsold inventory risk, and zero refund fee bleed."

### Beat 4: Saturday Shackleton Pickup Pass & Hub Marshall Scanner (`2:15 – 3:00`)
*Action: Show the offline `<QRCodeSVG />` Pickup Pass + Check-In / Flatmate Proxy PIN on **My Orders / Pass**, then open **Hub Ops View** (via **Test Scan** on the pass card or **Beat 3: Cutoff & PO** in the top Demo Controls bar).*

> "On **Saturday (`11:00–14:00`)**, students walk two minutes down to Shackleton Forecourt with their **Pickup Pass**—a cryptographically signed, offline-verifiable QR code plus a fallback PIN and 1-click **Delegate to a Flatmate** option.
>
> On our **Hub Ops** scanner, we verify the pass in under 50 milliseconds even on patchy courtyard 4G, hand over sealed UK allergen-labelled multipacks from reusable folding crates, and load the empty crates straight back into the van. Zero clogged hall receptions, zero loose cardboard waste, and profitable unit economics from Drop #1."

---

## Top 6 Investor & UoB Estates FAQ

### 1. How do unit economics work on `£0.00` fees without getting eaten by Stripe's `1.5% + 20p` card fee?
**Answer:** "Three guardrails locked into the product: First, we earn a **21–26% wholesale spread** on `0%`-VAT ambient staples (and voluntarily register for UK VAT on Day 1 so input VAT on operations is reclaimed). Second, crates **`£9.00+` get `£0.00` fees**—where Stripe's `1.5% + 20p` (`~£0.38` on a `£12` crate) is under `15%` of gross margin—while sub-`£9` single-item grabs pay a transparent **`£0.39` card-cover fee**. Third, students edit **one active weekly pledge** before Wednesday `23:59`, so we pay one `20p` capture fee per student per week, with `£0` hired wage cost at our single Drop #1 launch hub."

### 2. Do you need FCA authorisation to hold funds in "escrow", and what if boxes miss cutoff?
**Answer:** "No FCA licensing required. SplitBox trades as first-party Principal Retailer using **Stripe `PaymentIntents` with `capture_method: 'manual'`**. Funds stay ring-fenced as a standard card pre-authorisation hold at the student's bank. Because our Drop opens Sunday `18:00`, closes Wednesday `23:59`, and settles Thursday `09:00` right after Booker pick confirmation (`~3.6` days), we stay well inside Visa and Mastercard's 7-day hold window—and releasing unfilled overflow slices costs us **`£0.00` in Stripe fees**."

### 3. Will crates clog UoB hall receptions or leave cardboard waste? *(UoB Estates / Accommodation)*
**Answer:** "Never. Hall receptions touch zero parcels. We operate a scheduled Saturday pop-up handover at a designated outdoor/concourse bay like **Shackleton Forecourt**. Students scan their QR pass, put sealed sub-units directly into their backpack or tote bag, and every reusable folding crate goes back in our Euro-6 van when the window closes—leaving zero cardboard and zero campus footprint."

### 4. What about food safety, Natasha's Law, allergens, and council Environmental Health?
**Answer:** "100% ambient, unopened factory-sealed retail sub-units—zero cold chain, zero prepared food, and zero loose decanting. We register as a Food Business Operator with **Birmingham City Council Environmental Health 28 days pre-launch**, verify every inner sub-unit carries full **UK FIR 14-allergen English labelling** (and GB CLP tactile safety caps on household lines), and log wholesale batch/lot codes per Drop for 15-minute recall traceability."

### 5. What happens if a student sleeps through Saturday pickup?
**Answer:** "Automated `T-24h`, `T-2h`, and `T-30m` alerts include a **1-click Delegate Pass to a Flatmate** PIN so a hallmate can collect on their behalf. And to stay 100% compliant with **UK Consumer Contracts Regulations 2013** and prevent chargebacks on non-perishable goods, uncollected ambient orders roll over to next week's Drop or refund minus a transparent **`£2.00` restocking fee**."

### 6. How do you acquire UoB students with `£0` paid marketing?
**Answer:** "Structural pool-completion virality. Whenever a box sits at `3/4` at Vale Hub, the student who claimed Slice 3 has an immediate financial incentive to tap **Share Pool** into their flat or course WhatsApp chat: *'1 slice of Oatly left at £1.40/L so Box #1 locks for Saturday!'* Every open box turns buyers into campus liquidity drivers."
