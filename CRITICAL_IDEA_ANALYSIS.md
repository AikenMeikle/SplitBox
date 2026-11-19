# Divly — Critical Commercial, Economic & Operational Viability Analysis

**Prepared:** November 2026  
**Target Market Audited:** University of Birmingham (Edgbaston, The Vale Village & Selly Oak)  
**Codebase & Playbook Audited:** Live `Divly` stack ([server/seed.ts](file:///home/hacksday/Documents/project/server/seed.ts), [server/db.ts](file:///home/hacksday/Documents/project/server/db.ts), [server/services/poolAllocator.ts](file:///home/hacksday/Documents/project/server/services/poolAllocator.ts), [server/services/stripeService.ts](file:///home/hacksday/Documents/project/server/services/stripeService.ts), [server/services/settlement.ts](file:///home/hacksday/Documents/project/server/services/settlement.ts)) alongside [LAUNCH_IN_14_DAYS.md](file:///home/hacksday/Documents/project/LAUNCH_IN_14_DAYS.md), [FOUNDER_BUSINESS_PLAYBOOK.md](file:///home/hacksday/Documents/project/FOUNDER_BUSINESS_PLAYBOOK.md), and [LEGAL_COMPLIANCE_REPORT.md](file:///home/hacksday/Documents/project/LEGAL_COMPLIANCE_REPORT.md).

---

## Executive Verdict: Will Divly Succeed, and How Successful Will It Be?

| Dimension | Realistic Probability | Projected Ceiling (Current Model) | Honest Verdict |
| :--- | :---: | :---: | :--- |
| **As a Portfolio / CV / Campus Grant Project** | **85–90%** | Top-1% undergraduate CS & entrepreneurship showcase (`£500–£2,500` UoB *B-Enterprising* grant contender) | **Outstanding.** Clean full-stack architecture, atomic SQLite slot locking, HMAC QR passes, and real-world domain modelling. |
| **As a Bootstrapped Campus Micro-Business (1 Hub)** | **45–55%** *(only after fixing 4 margin bugs below)* | **`£2,500–£7,500` / academic year** (`~22–24` active trading weeks) *before* counting founder labour | **Fragile lifestyle side-hustle.** Viable for modest student pocket money only if you treat ~14 hrs/week of physical haulage and packing as `£0/hr` sweat equity. |
| **As a Venture-Scalable Multi-Campus Startup** | **<10%** | Unlikely to clear UK minimum-wage unit economics once staff, vans, storage, and VAT are paid at market rates | **Structurally unviable without a pivot.** Western grocery group-buying faces brutal incumbent retail efficiency, cold-chain basket splitting, and negative small-basket unit economics. |

### Bottom-Line Summary
Divly solves a real annoyance (**car-free students dislike carrying heavy multipacks and overpaying at convenience stores**), and the software engineering in this repository is impressively well-crafted. **However, as a commercial grocery business, Divly is caught in a structural pincer:**
1. **Top-down pincer (Price & Convenience):** UK supermarket loyalty pricing (`Tesco Clubcard` / `Sainsbury's Nectar`), discount own-brands (`Aldi Selly Oak`), specialist local stores (`Seoul Plaza` on Bristol Road), and shared `£1/month/person` supermarket delivery vans erase half of Divly's advertised `"15–35% savings"` while delivering chilled food straight to kitchen doors.
2. **Bottom-up pincer (Unit Economics & Codebase Margin Bleed):** In the live codebase, stacking the **Closer Bonus (`-6%` to `-10%`)**, **automatic small-order fee waivers**, **immediate-capture Stripe fees (`1.5%–3.15% + 20p`) on refunded pools**, and **`£1.50` referral subsidies** causes many real-world student orders to **lose money on a cash basis before you even pay for petrol or bags**.

---

## 1. Macro Evidence: Why Group-Buying Groceries Fails Outside China

Divly's core mechanic—strangers pooling orders to unlock wholesale case prices (`社交拼团` / *Team Purchase*)—was popularized in China by **Pinduoduo**, *Xingsheng Youxuan*, and *Meituan Select*. Over the last decade, dozens of heavily funded startups attempted to transplant bulk/group grocery buying to Europe, the Americas, and the UK. Almost every single one collapsed:

- **Boxed.com (US — "Digital Bulk/Costco for Millennials & Students"):** Raised hundreds of millions and went public via SPAC at a ~$900M valuation selling bulk ambient groceries (toilet roll, snacks, rice, detergent) without membership fees. **Result:** Filed for Chapter 11 bankruptcy in 2023; gross margins on branded ambient cases could not cover customer acquisition costs (CAC), payment fees, and heavy parcel/fulfilment logistics.
- **Facily (Brazil — "Latin America's Pinduoduo"):** Raised >$350M to run hyper-local neighbourhood pickup hubs for pooled bulk groceries. **Result:** Imploded amid massive subsidy burn, missed pickup windows, overwhelmed collection hosts, and vanishing retention once promotional credits stopped.
- **UK Rapid & Micro-Hub Grocery (*Getir*, *Gorillas*, *Weezy*, *Fancy*):** Targeted high-density UK student cities (including Birmingham, Manchester, Nottingham, and Bristol) with heavy campus voucher ambassadors. **Result:** All exited the UK or folded between 2022 and 2024 because `£10–£15` student baskets at `~20%` gross grocery margin yield `£2.00–£3.00` gross profit—impossible to sustain against UK statutory wages and fulfilment overhead.

### Why China's Pinduoduo Worked Where the UK Market Breaks
1. **Super-App Distribution (`0p` Payment & Sharing Friction):** Pinduoduo lived natively inside **WeChat** with integrated **WeChat Pay** (`~0.1%–0.6%` merchant fees vs. Stripe UK's **`1.5%–3.15% + 20p`**). Sharing a `3/4` pool link in the UK requires jumping from Safari -> WhatsApp -> Email OTP (`@student.bham.ac.uk` Outlook quarantine lag) -> Card checkout.
2. **Supply-Chain Fragmentation vs. UK Grocery Hyper-Consolidation:** Chinese group-buying bypassed 4–5 layers of rural wholesale middlemen. The UK has the most consolidated, price-aggressive supermarket sector in the Western world: **Tesco** (which *owns* Booker Wholesale!), **Sainsbury's**, **Asda**, **Aldi**, and **Lidl** operate on `2%–4%` net operating margins and buy directly from manufacturers (`Oatly`, `Nongshim`, `P&G`) at pallet-train prices **30%–40% below** what Booker or Bestway charge small cash-and-carry trade cardholders.
3. **Labour Cost Physics:** Community group leaders (*tuanzhang*) in Tier-3 Chinese apartment compounds earned pennies per parcel alongside existing shopkeeping. In the UK, the statutory **National Living Wage (`21+`) hit `£12.21/hr` in April 2025 and `£12.71/hr` in April 2026** (`£10.85/hr` for 18–20s), plus compulsory Employers' Liability insurance the day you hire a single campus marshal.

---

## 2. Live Price Audit: Are You Actually `15–35%` Cheaper Than Student Alternatives?

Divly's core pitch (`AGENTS.md` & `StorefrontView`) promises **15–35% savings vs UK supermarkets**. We audited the seeded catalogue in [server/seed.ts](file:///home/hacksday/Documents/project/server/seed.ts#L29-L222) against **real 2025–2026 UK retail prices** available to University of Birmingham students in Selly Oak (`Aldi B29`, `Sainsbury's Chapel Lane`, `Seoul Plaza Bristol Rd`, `Tesco Clubcard`, and `Costco Nechells`):

| Seeded SKU ([server/seed.ts](file:///home/hacksday/Documents/project/server/seed.ts)) | Divly Share Price | Divly Claimed Benchmark (`aldiPricePence`) | **Real Verified UK Retail Price (2025–2026)** | **True Student Saving vs Smart Retail** | Critical Commercial Reality Check |
| :--- | :---: | :---: | :--- | :---: | :--- |
| **Tilda / Royal Umbrella Basmati (`5kg`)** | **`£6.45`** *(Wholesale listed: `£22` / 20kg)* | `£8.49` (`-24%`) | **Tilda 5kg:** `£12.00` Clubcard/Nectar (`£16` std)<br>**Aldi Basmati 5kg equiv.:** `~£6.75–£7.45` | **Wholesale cost error** *(or `~4–13%` vs Aldi own-brand)* | **Unrealistic COGS:** Genuine *Tilda* or *Royal Umbrella* costs `£10.50–£13.50` per 5kg at wholesale, **not** `£5.50`! Only unbranded economy broken/long-grain rice costs `£22/20kg`. Comparing economy catering rice to branded retail breaches **DMCC Act 2024** pricing rules. |
| **Nongshim Shin Ramyun (`5 × 120g`)** | **`£3.95`** | `£5.75` (`-31%`) | **Tesco Clubcard:** `£4.20` (`£5.20` std)<br>**Morrisons:** `£4.50`<br>**Seoul Plaza (Selly Oak):** `~£4.25–£4.50` | **`£0.25` (`6%`)** vs Clubcard | **Seoul Plaza & Hang Sing Hong** sit right on Bristol Road in Selly Oak. Students will not wait 5 days until Saturday afternoon to save **25p**. |
| **Indomie Mi Goreng (`10 × 85g`)** | **`£3.45`** *(`£13.80`/40pk)* | `£4.90` (`-30%`) | **Costco UK (40pk):** `£11.49–£13.99` (`£2.87–£3.50`/10)<br>**Selly Oak Asian grocers:** `~£3.80–£4.00`/10 | **`£0.35–£0.55` (`9–14%`)** | Wholesale cost in `seed.ts` (`£11.80` for 40pk) leaves only `£0.50` gross margin per share before Stripe fees (`25p–31p`) wipe out half of it. |
| **Monster Ultra White (`6 × 500ml`)** | **`£5.49`** (`91.5p`/can) | `£7.49` (`-27%`) | **Asda Rollback (`9pk`):** `£9.50` (`£1.05`/can -> `£6.33`/6)<br>**Tesco/Sainsbury's (`9pk` Clubcard/Nectar):** `£10.00` (`£1.11`/can -> `£6.66`/6)<br>**Aldi Dark Thunder Ultra clone:** `~£0.85`/can | **`£0.84–£1.17` (`13–17%`)** vs 9pk loyalty | Monster carries **20% UK VAT**. A 24-can tray at Booker/Bestway inc-VAT frequently costs `£19.20–£21.50`, leaving razor-thin margin for hauling `3.2kg` of cans per share. |
| **Oatly Barista (`3 × 1L`)** | **`£4.35`** (`£1.45`/L) | `£5.85` (`-26%`) | **Tesco Clubcard ("2 for £3.40"):** `£1.70/L` (`£5.10`/3L)<br>**Aldi Actileaf Barista Oat:** **`£1.25/L` (`£3.75`/3L!)** | **`£0.75` (`15%`)** vs Clubcard; **`-16%` MORE EXPENSIVE** than Aldi | Brand-loyal Oatly drinkers save `75p` over Clubcard promos, **but** budget-conscious students shopping at Aldi Selly Oak pay `£3.75` (`60p` *less* than Divly). |
| **Mutti Polpa (`4 × 400g`)** | **`£2.99`** | `£3.99` (`-25%`) | **Sainsbury's Nectar (`4pk`):** `£3.75` (`£5.95` std)<br>**Aldi Chopped Tomatoes (`4×400g`):** **`£1.72` (`43p`/tin!)** | **`£0.76` (`20%`)** vs Nectar; **`-74%` MORE EXPENSIVE** than Aldi | Almost no student on a tight budget buys `£1.50/tin` imported Mutti tomatoes when Aldi/Sainsbury's Stamford Street tins cost **`43p–49p`**. |
| **Fairy Non-Bio Pods (`27-wash`)** | **`£4.85`** (`18p`/wash) | `£6.49` (`-25%`) | **Tesco Clubcard (`33w`):** `£7.50` (`22.7p`/w -> `£6.13` equiv.)<br>**Savers / B&M / Home Bargains:** `~17p–20p`/wash | **`~0%–20%`** *( negligible vs Savers/B&M)* | Furthermore, Vale hall students use **Circuit Laundry** infrequently (`1` wash every `10–14` days = `1` tub lasts **6+ months** -> zero weekly repeat orders). |
| **Finish Ultimate Tabs (`50-pk`)** | **`£5.25`** *(Wholesale listed: `£13.80` for 150 tabs)* | `£6.99` (`-25%`) | **Tesco/Sainsbury's Finish Ultimate 50pk:** `£9.00–£11.00` Clubcard | **Wholesale cost error + Wrong audience** | 1) Wholesale Finish *Ultimate* 150-tabs costs `£22–£28 inc-VAT` (`20%` VAT), **not** `£13.80`! 2) **Shackleton, Maple Bank & Tennis Court hall kitchens DO NOT HAVE DISHWASHERS.** |

### The "Shared Supermarket Delivery Pass" Killer Competitor
Neither `FOUNDER_BUSINESS_PLAYBOOK.md` nor `LAUNCH_IN_14_DAYS.md` models Divly's true #1 competitor: **4 flatmates sharing a supermarket delivery pass**.
- **Tesco Delivery Saver** starts at **`£2.49/month` (Midweek)** or **`£3.99/month` (Anytime)** (`£4.00/month` Midweek at Sainsbury's). Split across a 4–6 person flat, delivery costs **`£0.42–£1.00` per student per month (`~15p` per week!)**.
- A shared Tesco/Sainsbury's van delivers **chilled chicken, milk, eggs, fresh veg, frozen pizza, AND heavy 5kg rice / multipack cans** directly to the flat door at Clubcard/Nectar prices—with **zero pooling failure risk** and **zero rainy Saturday walks**.

---

## 3. Four Undiscovered Economic & Technical Flaws Inside Your Live Codebase

Auditing your live TypeScript server uncovered **four severe unit-economics leaks and logic bugs** where your actual code contradicts your business assumptions:

### Flaw 3.1 — Codebase Contradicts Playbook on Stripe Pre-Auth (`stripeService.ts`)
In [FOUNDER_BUSINESS_PLAYBOOK.md](file:///home/hacksday/Documents/project/FOUNDER_BUSINESS_PLAYBOOK.md#L149-L150), your financial model explicitly warns:
> *"Stripe NEVER Refunds Processing Fees on Captured Refunds — Use `capture_method: 'manual'`... Capturing upfront and refunding unfilled pools permanently loses £0.26–£0.31 per refund."*

**Yet in your actual `Divly` backend** ([server/services/stripeService.ts](file:///home/hacksday/Documents/project/server/services/stripeService.ts#L33-L43) and [L127-L154](file:///home/hacksday/Documents/project/server/services/stripeService.ts#L127-L154)), Checkout runs `mode: 'payment'` (**immediate card capture** without `payment_intent_data[capture_method]=manual`) and fires `POST /v1/refunds` at cutoff!
- **Why this hurts badly at UoB:** Official HESA/UoB demographics show **26%–30% of UoB's ~40,000 students (`~12,000+` students) are international**, predominantly from non-EEA domiciles (China, India, Middle East, North America).
- Stripe UK charges **`1.5% + 20p`** on standard UK consumer cards, **`2.5% + 20p`** on EEA cards, and **`3.15% + 20p`** on non-EEA international cards (plus `+2%` if currency conversion triggers).
- Every time a Chinese or Indian postgrad joins a `£3.95` Shin Ramyun pool that fails to fill and auto-refunds on Wednesday night, **you permanently lose `£0.32` in unrecoverable Stripe fees for `£0.00` of revenue**.

### Flaw 3.2 — The "Closer Bonus + Fee Waiver" Negative-Margin Death Spiral (`server/db.ts`)
Inspect [server/db.ts](file:///home/hacksday/Documents/project/server/db.ts#L398-L420):
```ts
const isAlmostFull =
  dropStatus === 'open' &&
  openCaseClaimedSlots > 0 &&
  (openCaseRemainingSlots <= 2 || fillRatio >= 0.5);
```
9 of your 12 seeded products have `caseSize <= 4` (`2`, `3`, or `4`). That means:
- For `caseSize = 2` (`Oatly`): **50% of all shares** (`1/2`) trigger `-10%` Closer Discount + **free small-order fee waiver**!
- For `caseSize = 3` (`Mutti`, `Finish`): **67% of all shares** (`1/3` and `2/3`) trigger `-6%` and `-10%` Closer Discounts + **free small-order fee waiver**!
- For `caseSize = 4` (`Rice`, `Shin Ramyun`, `Indomie`, `Monster`, `TREK`, `Fairy`): **50% of all shares** (`2/4` and `3/4`) trigger `-6%` and `-10%` Closer Discounts + **free small-order fee waiver**!

**Worked Cash P&L on a Real Single-Item "Closer" Checkout (`Indomie 10pk`, Base `£3.45`, Wholesale `£2.95`):**
1. Pool sits at `3/4`. Student clicks `"⚡ CLOSER BONUS: -10% + FREE PICKUP"`.
2. `minFloorPence = 295 + 10 = 305p` (`£3.05`). Candidate `-10%` price = `311p` (`£3.11`).
3. `waivesSmallOrderFee = true` ([poolAllocator.ts](file:///home/hacksday/Documents/project/server/services/poolAllocator.ts#L99-L102)) → Student pays **`£3.11` total (`£0.00` small-order fee!)**.
4. Subtract Wholesale COGS (`-£2.95`) = **`+£0.16` gross product margin**.
5. Subtract Stripe fee (`-£0.25` UK card / `-£0.30` Intl card) + Kraft bag (`-£0.12`) = **`-£0.21` to `-£0.26` NET CASH LOSS** on the order—**before** counting `£1.50` referral credits, van fuel, or hub costs!

### Flaw 3.3 — Multi-Quantity Closer Discount Exploit (`poolAllocator.ts`)
Look at [server/services/poolAllocator.ts](file:///home/hacksday/Documents/project/server/services/poolAllocator.ts#L75-L96):
```ts
const chargedSharePence = p.effectiveSharePricePence;
subtotalPence += chargedSharePence * quantity;
```
When a pool has **1 spot remaining (`3/4`)**, `p.effectiveSharePricePence` applies the `-10%` Closer Bonus. Because `createPendingOrder` multiplies `effectiveSharePricePence * quantity` (allowing up to `quantity = 50`!), a student or flat buying **`8` shares** when only `1` share was needed to close Box #1 receives the **`-10%` Closer Discount on all 8 shares across Boxes #1, #2, and #3**—destroying your box margin across every subsequent case in that transaction.

### Flaw 3.4 — Promotional Referral Credit "Cash-Out" Asymmetry (`settlement.ts`)
Look at [server/services/settlement.ts](file:///home/hacksday/Documents/project/server/services/settlement.ts#L123-L128) during partial order refunds:
```ts
// Refund cash up to `totalPaidPence`; restore any remaining auto-refund value to wallet credit!
refundedPence = Math.min(totalPaidPence, autoRefundedSharesPence);
netChargedPence = totalPaidPence - refundedPence;
creditRestoredPence = Math.max(0, autoRefundedSharesPence - refundedPence);
```
Because Divly refunds **real Stripe cash first** (`Math.min(totalPaidPence, autoRefundedSharesPence)`) instead of restoring non-cashable promotional wallet credit first, a user with `£1.50` of referral credits who buys 1 locked item (`£3.95`) + 1 unlikely `1/6` item (`£2.85`) pays `£5.30` cash + `£1.50` credit; when the `£2.85` item auto-refunds at cutoff, they receive **`£2.85` back in real bank cash**, effectively converting promotional store credit into real GBP cash at your expense while you eat the full Stripe fee! Additionally, `Give £0.50, Get £1.00` (`£1.50` total CAC) has **zero minimum basket threshold**—a referred friend can buy a single `£2.75` loo roll (`£2.25` cash paid), costing you `£1.50` in subsidy on an item that only had `£0.45` gross margin (`-£1.33` instant loss).

---

## 4. Eight Real-World Problems You Have Not Accounted For

Beyond the legal compliance points already documented in `LEGAL_COMPLIANCE_REPORT.md`, eight operational and behavioural realities at the University of Birmingham threaten Divly's traction:

### 1. The UoB "Student Living Plus" (Meal Plan) & Campus Geography Mismatch
- [LAUNCH_IN_14_DAYS.md](file:///home/hacksday/Documents/project/LAUNCH_IN_14_DAYS.md#L54) centres Drop #1 on **`The Vale · Shackleton Forecourt`**, targeting Shackleton, Chamberlain, Maple Bank, Mason, and Tennis Court (`~3,500` total beds across The Vale).
- **What you missed:** **Shackleton Hall** is UoB's primary **Student Living Plus (Food Fellows Meal Plan)** residence, and substantial portions of **Chamberlain, Mason, and Maple Bank** are also on Meal Plans—meaning those students already have weekly food allowances pre-loaded onto their student ID cards to spend at campus dining outlets and Shackleton's on-site convenience store! Meal-plan freshers rarely cook 5kg sacks of raw rice or 4-packs of tinned tomatoes.
- Meanwhile, **~70% of UoB's 40,000 students (`~28,000` self-catered students) live in Selly Oak**, which is a **25–30 minute walk (`1.2–1.5 miles`) away** on the *opposite* side of Edgbaston campus. Zero Selly Oak students will walk 30 minutes to Shackleton on Saturday to haul `8kg` of groceries 30 minutes back to Selly Oak when Aldi and Sainsbury's are 5 minutes from their front door.

### 2. The "Cold-Chain Basket Split" Behavioural Barrier
- Save the Student and NatWest Student Living Index surveys (2024–2025) show the average UK student spends **`£33–£36/week` (`£144–£147/month`)** on supermarket groceries.
- Over **60% of weekly shopping trips** are anchored by **chilled and fresh essentials**: fresh milk, eggs, chicken/meat, cheese, bread, and fresh veg.
- Because Divly only sells ambient goods (for valid food-safety reasons), **ordering from Divly saves the student ZERO supermarket trips.** They *still* have to walk to Aldi or Sainsbury's every week for milk, eggs, and chicken. Once a student is already standing inside Aldi or ordering a shared Tesco delivery, adding rice, pasta, or loo roll to that trolley requires **zero extra effort**, whereas Divly adds a *second*, separate Saturday errand.

### 3. Pantry Stockpiling & The Week-2 Retention Cliff
- Ambient bulk shares have ultra-low repurchase velocity for single students in tiny hall rooms with one cupboard shelf:
  - `5kg Basmati Rice` = `~65–80` servings (**3–5 months** supply for 1 student).
  - `27 Fairy Laundry Pods` = **5–7 months** supply at typical student laundry frequency (`1` load every `7–10` days).
  - `500ml Soy Sauce` = **4–6 months** supply.
  - `9 Toilet Rolls` = **6–10 weeks** supply.
- Even if 40 students buy in Drop #1, **70% of them will not need rice, laundry pods, soy sauce, or toilet roll in Drop #2 or Drop #3.** Without high-frequency weekly consumables (drinks, snacks, instant meals), you face exhausting **treadmill acquisition**—needing 30 brand-new first-time buyers every week just to replace full-cupboard customers.

### 4. Saturday `12:00–15:00` No-Show Chaos (Student Shifts, Sport & Sleep-Ins)
- Over **55%–60% of UK university students now work part-time jobs** to cover maintenance loan shortfalls (Save the Student National Student Money Survey), and **Saturday `12:00–15:00` is the single busiest retail/hospitality shift window of the week**, alongside weekend trips home and hangover sleep-ins.
- If just **`20%` (`10` out of `50` students)** miss Saturday `12:00–15:00`, you cannot leave food unattended on Shackleton Forecourt. You have to reload `50–80kg` of awkward Kraft bags into a car, store them in your room, spend Sunday/Monday chasing 10 students via WhatsApp/email, or issue refunds minus restocking fees—generating angry reviews in hall group chats.

### 5. "Uncertain Grocery Syndrome" & Bank Refund Latency (`5–10` Business Days)
- Imagine a student on a strict `£35/week` budget spends `£14` on Monday across 4 Divly pools. At Wednesday `23:59`, two of those pools (`Oatly` and `Rice`) sit at `2/4` and `auto_refund`.
- **Two painful things happen:** (a) Their meal plan for next week is now missing half its ingredients, forcing an emergency supermarket run; and (b) Stripe card refunds take **5–10 business days** to clear back into UK student debit accounts, temporarily freezing `£7–£10` of their weekly food money! Students who experience even *one* failed pool + 7-day refund wait rarely trust the platform with weekly grocery money again.
- Conversely, if you use `buyAheadPredictor.ts` to buy incomplete cases yourself so students aren't refunded, you quietly break your "zero-inventory" thesis and tie up working capital in unsold bedroom stock.

### 6. The 22-Week Academic Year Reality & Annual 100% Vale Churn
- `FOUNDER_BUSINESS_PLAYBOOK.md` projects **30 full trading weeks/year**. In practice at UoB:
  - Autumn Term (`11` wks) loses Freshers' Week setup + Week 11 December departures = **`~9` strong weeks**.
  - Winter Holiday (`4` wks) = **`0` weeks**.
  - Spring Term (`11` wks) loses January exam week + Week 11 Easter departures = **`~9` strong weeks**.
  - Easter Holiday (`4` wks) = **`0` weeks**.
  - Summer Term: May/June exams + mass hall move-outs by mid-June = **`~4–5` viable weeks** (followed by **15 dead summer weeks**).
- Realistic active trading year: **`22–23` weeks/year**. Worse, **100% of first-year Vale hall residents move out every June** into scattered Selly Oak houses—meaning every September/October you lose your entire Vale pickup density and must rebuild customer acquisition from zero.

### 7. Wholesale Cash-and-Carry Stock-Outs & Multipack Split Reality
- Booker Stirchley (`B30 2YT`) and Aston (`B6 5RQ`) frequently experience **Thursday morning stock-outs** on promotional branded lines (`Oatly Barista`, `Monster Ultra`, `Shin Ramyun`) or swap SKUs to **Price-Marked Packs (`PMP`, e.g., `"£1.65"` printed in giant yellow font on cans)** or **unlabelled catering inner bags** (*"Not for individual sale — see outer case for allergens"*).
- Because `Divly` captures money upfront at checkout rather than after Thursday depot picking, a Booker stock-out forces you to either drive across Birmingham for 2 extra hours hunting alternative depots (`Costco`, `Wing Yip`, `Bestway`)—destroying fuel and time economics—or refund students and eat the Stripe processing fees.

### 8. True Founder Hourly Wage Math (The Sweat-Equity Illusion)
Let's run an honest **50-order weekly P&L** using Divly's *actual* codebase parameters (`£10.50` realistic student AOV = ~3 shares/order, `21%` base gross margin before Closer discounts, `30%` international student cards):

| Weekly Line Item (`50` Fulfilled Orders, `£525.00` Gross GMV) | Realistic Cash Impact | Notes |
| :--- | :---: | :--- |
| **Gross Wholesale Product Spread (`~21.0%` base)** | `+£110.25` | Assumes zero wholesale price hikes or stock-out substitutions |
| **Closer Bonus Bleed (`-6%` to `-10%` on ~45% of slots)** | `-£18.90` | Built directly into `server/db.ts` (`isAlmostFull`) |
| **Small-Order Fees Collected (`<£8` non-Closer baskets)** | `+£4.50` | Most `<£8` baskets waive the `50p` fee via Closer items |
| **Stripe Fees (`~2.0%` blended UK/Intl + `20p` × 50 + failed pool bleed)** | `-£23.50` | Includes ~8 auto-refunded/failed checkout fee burns |
| **Referral Credit Burn (`6` referred first-orders × `£1.50`)** | `-£9.00` | `£0.50` welcome + `£1.00` referrer reward |
| **Packaging (`50` Kraft bags + chemical barrier bags + labels)** | `-£8.50` | `~17p`/order compliant separated food/chemical packing |
| **Transport (`3.5h` commercial van club OR Class-1 car fuel + ins.)** | `-£42.00` | Enterprise Car Club van + fuel (or amortized commercial policy) |
| **Compliant Storage / Venue / Insurance (`£5M` PLI + ICO + FBO)** | `-£18.00` | Amortized across 23 active trading weeks (`~£415/yr` fixed) |
| **NET WEEKLY PROFIT BEFORE FOUNDER LABOUR** | **`-£5.15` to `+£12.00` / wk** | **Effectively break-even (`~£0.00–£0.85/hr` across `14` hrs work!)** |
| **Opportunity Cost (`14 hrs` × `£12.71/hr` Apr 2026 UK NLW)** | *(`-£177.94/wk`)* | Two 7-hour student shifts at Tesco/Guild bar pay **`£178/wk` risk-free** |

> **Key Takeaway:** Even if you double volume to **100 orders/week** (`£1,050` GMV, requiring a paid Saturday helper at `£12.71/hr` + Employers' Liability insurance and a larger van/storage unit), net weekly cash profit only reaches **`~£75–£110/week` (`~£1,800–£2,500/year`)** unless you fundamentally change the basket size, pricing mechanics, and product mix.

---

## 5. Repo Split-Brain Risk: `PalletCut` Docs vs. `Divly` Code

Right now, your repository contains two conflicting blueprints:
1. [FOUNDER_BUSINESS_PLAYBOOK.md](file:///home/hacksday/Documents/project/FOUNDER_BUSINESS_PLAYBOOK.md) describes an earlier iteration (**PalletCut / SplitBox**): Stripe `capture_method: 'manual'` pre-authorisation holds, `£9.00` free-crate threshold, `£0.39` micro-crate fee, zero Kraft bags (Euro-crate table sorting), and 14 SKUs.
2. [AGENTS.md](file:///home/hacksday/Documents/project/AGENTS.md), [LAUNCH_IN_14_DAYS.md](file:///home/hacksday/Documents/project/LAUNCH_IN_14_DAYS.md), and `server/*` implement **Divly**: immediate Stripe `mode: 'payment'` capture + fee-losing refunds, `£8.00` threshold bypassed by Closer fee waivers, `£1.50` referral giveaways, Kraft bag packing, and 12 SKUs (including 2-week perishable `Warburtons Bagels` and `Finish Dishwasher Tablets` pitched to halls without dishwashers).

Following `LAUNCH_IN_14_DAYS.md` while relying on the profit math in `FOUNDER_BUSINESS_PLAYBOOK.md` will blindside you on Week 1 because **Divly's live code lacks the exact Stripe pre-auth and fee-floor protections that made PalletCut's spreadsheet profitable.**

---

## 6. How to Fix Divly: 5 Concrete Pivots to Make It Actually Work

If your goal is **maximising career/CV value + winning `£1,000–£5,000` in UoB *B-Enterprising* / Santander Universities equity-free grants + running a genuinely profitable 20-week campus pilot**, make these five high-leverage changes before launching:

### 1. Patch the 4 Margin-Killing Code Bugs Before Taking `£1`
- **Switch Stripe to Manual Pre-Auth Holds (or Enforce Strict `6`-SKU High-Lock Pools):** Pass `payment_intent_data[capture_method]=manual` on Stripe sessions (valid up to 7 days on standard cards) so unfilled Wednesday pools cancel for **`£0.00` Stripe fee**, *and* students don't wait 10 business days for bank refunds.
- **Cap Closer Discounts to Remaining Open-Box Slots Only:** In [poolAllocator.ts](file:///home/hacksday/Documents/project/server/services/poolAllocator.ts#L81-L85), apply `effectiveSharePricePence` **only** to `Math.min(quantity, p.openCaseRemainingSlots)` shares, charging regular `sharePricePence` on spillover shares into new boxes.
- **Stop Waiving the Small-Order Fee Below `£8.00`:** Charge `£0.59` (not `£0.00`) on any basket under `£10.00`, even if it contains a Closer item, so fixed `20p` Stripe fees never turn 1-item checkouts negative.
- **Gate Referrals & Fix Refund Order:** Require a **`£12.00+` net settled first order** before unlocking the `£0.50` / `£1.00` referral credits, and change [settlement.ts](file:///home/hacksday/Documents/project/server/services/settlement.ts#L124-L126) so partial auto-refunds restore **wallet credit first** (`creditRestoredPence = Math.min(creditAppliedPence, autoRefundedSharesPence)`) before refunding cash.

### 2. Ditch Generic Supermarket Lines — Pivot to "Heavy Asian/World Bulk & Gym Cases"
Stop competing with Aldi `43p` chopped tomatoes, dishwasher tablets (in halls without dishwashers), and `2-week` Warburtons bagels. Focus 100% on **high-AOV, heavy/bulky specialist items** where UoB's `12,000+` international students and society/gym communities have massive willingness-to-pay and genuine haulage pain:
- **Asian Wholesale Cartons (sourced from Wing Yip Nechells `B7 5NT` — 20 mins away):** `Samyang Buldak` 5-pack/10-pack bundles, `Nongshim` gourmet variety crates, `5kg/10kg AAA Jasmine Rice` (`Royal Umbrella` / `Golden Phoenix`), `Lao Gan Ma` / Japanese curry multi-blocks, bubble-tea/matcha multipacks.
- **Gym & Study Fuel Multipacks:** Bulk `Monster Ultra` / `Red Bull Sugarfree` **12-can half-trays** (raises share price from `£5.49` to `£10.49`, doubling net profit per Stripe transaction!), `Barebells` / `Grenade` / `TREK` protein bar half-boxes (`6` or `12` bars), and `Oatly Barista 6×1L` full cases (`caseSize = 1` or `2`!).

### 3. Move Pickup From Meal-Plan Shackleton to a Selly Oak Partner Venue (Thursday `17:00–19:00`)
- Instead of Saturday `12:00–15:00` at Shackleton Forecourt (requiring UoB Estates approval, battling Meal Plan low demand, and losing 20% to Saturday work shifts/hangovers), partner with an independent café, bubble-tea shop, barber, or society venue on **Bristol Road / Dawlish Road in Selly Oak** (`28,000` self-catered students!) or **Tennis Court / Pritchatts Park**.
- Run pickup **Thursday `17:00–19:00`** (same day as your morning wholesale run!):
  1. **Zero residential storage:** Buy Thursday morning -> pack Thursday afternoon -> hand out Thursday evening as students walk home from campus lectures!
  2. **Host wins free footfall:** 60 students walking into an independent Selly Oak café at 5:30pm Thursday buys coffees/boba, so the venue hosts your 2-table pickup corner for `£0` rent.

### 4. Add "Whole-Flat & Student Society Case Drops" (`£35–£150` AOV)
- UoB has **300+ Guild of Students societies and sports clubs** running weekly socials, hackathons (CSS, BrumHack!), run clubs, and cultural nights—all currently sending committee members on painful Uber trips to Costco or paying Tesco Express markups out of society budgets.
- Add a **"Full Case / Society & Flat Drop (`Instant Lock — No Waiting for Strangers`)"** button on every product (`caseSize` shares at `-5%` full-case discount). One CSS or Badminton Society snacks order (`£80–£150` AOV) generates **more net contribution profit in a single QR scan than 25 individual `£3.95` noodle orders combined**, with zero incomplete-box risk.

### 5. Leverage UoB Non-Dilutive Funding & Brand Sampling Early
- Apply to **UoB B-Enterprising Ideas / Start-Up Fund** (`£500–£2,500` equity-free grants) and **Santander X UK University Awards** positioning Divly around **campus food affordability & scope-3 delivery emission reduction** (1 consolidated wholesale van vs. 50 individual courier/car trips).
- Once clearing `60+` weekly bags, pitch UK student challenger brands (*Oatly*, *Jimmy's Iced Coffee*, *Liquid Death*, *Huel*, *Hip Pop*, *Candy Kittens*) **`£150–£300`/drop** to slip 1 chilled/ambient sample can into every verified `@student.bham.ac.uk` bag—100% pure-margin revenue that subsidises your wholesale van run.

---

## Sources & Verified Market Data Referenced
1. **Student Grocery Spend & Employment:** *Save the Student National Student Money Survey (2024–2025)* & *NatWest Student Living Index (2024–2025)* — UK student average supermarket spend `£144–£146.76/month` (`£33–£36/week`); `55%+` working part-time during term.
2. **University of Birmingham & Housing Demographics:** *University of Birmingham Accommodation Services & HESA Student Records* — `~40,000` total students; `26%–30%` (`~12,000+`) international students; `~3,500` beds at The Vale Village (*Shackleton*, *Chamberlain*, *Mason*, *Maple Bank* offering *Student Living Plus / Food Fellows* meal plans; *Tennis Court* predominantly self-catered); `~70%` of student body residing in Selly Oak (`1.2–1.5 miles` / `25–30 min` walk from The Vale).
3. **UK Supermarket, Loyalty, Discount & Wholesale Pricing (2025–2026):** Live shelf & online pricing across *Tesco (Clubcard & Delivery Saver)*, *Sainsbury's (Nectar & Delivery Pass)*, *Asda Rollback*, *Morrisons*, *Aldi UK*, *Costco UK (Nechells B7)*, *Booker Wholesale*, and *Seoul Plaza (Bristol Rd, Selly Oak)*.
4. **Payment & Statutory Wage Economics:** *Stripe UK Standard Pricing Schedule (2025–2026)* (`1.5% + 20p` domestic consumer, `2.5% + 20p` EEA, `3.15% + 20p` non-EEA international, non-refundable processing fees on captured refunds) & *UK Low Pay Commission Statutory Minimum Wage Rates* (`£12.21/hr` April 2025 -> `£12.71/hr` April 2026 NLW; `£10.85/hr` 18–20 rate).
5. **Comparable Industry Post-Mortems:** *Boxed Inc. Chapter 11 filings (2023)*, *Facily Latin America restructuring*, and *UK Quick-Commerce exits (Getir, Gorillas, Weezy, 2022–2024)*.
