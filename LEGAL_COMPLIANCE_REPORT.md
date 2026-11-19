# Divly — Comprehensive UK Legal & Regulatory Compliance Report

**Jurisdiction:** England & Wales (Local Authority: **Birmingham City Council** · Campus Context: **University of Birmingham, Edgbaston & Selly Oak**)  
**Business Model Audited:** Online student group bulk-buying platform splitting wholesale cases into factory-sealed ambient food and household shares for scheduled pickup.

> [!IMPORTANT]
> **Legal Disclaimer:** This report provides detailed legal information and operational compliance analysis under England & Wales law tailored to the Divly codebase and business model. It is **not** formal legal advice from a regulated solicitor. Before trading live, verify any edge cases directly with **Birmingham City Council Environmental Health**, **Trading Standards**, or a qualified UK commercial solicitor (or the University of Birmingham **B-Enterprising** startup legal clinic).

---

## Executive Summary: Can You Legally Run Divly?

**Yes — buying food and household goods in bulk from wholesalers and reselling smaller shares at a profit is 100% legal in the UK**, *provided* you operate within strict statutory boundaries. 

Divly's core architecture—acting as the retail seller of **intact, factory-sealed, ambient manufacturer sub-packs**—deliberately avoids the heaviest UK food-law burdens (refrigerated cold-chain regulations, commercial kitchen hygiene rules, and bespoke laboratory nutrition/allergen testing). However, **our audit of the current Divly repository uncovered 6 specific legal traps** across your seeded catalogue, website disclosures, and launch playbook that you must address before taking your first live student payment.

---

## 1. Is It Legal to Buy Food in Bulk and Resell It?

### 1.1 The General Right to Resell (Exhaustion of Rights)
Under UK law (**Trade Marks Act 1994, s.12** — exhaustion of intellectual property rights), once branded goods (`Tilda`, `Nongshim`, `Oatly`, `Monster`, `Fairy`) have been legitimately placed on the UK/EEA market by or with the consent of the brand owner, **you do not need the brand's permission to buy wholesale cases and resell them**.

- **Wholesalers / Cash & Carries (Recommended):** Buying from trade wholesalers (`Booker Wholesale Aston/Stirchley`, `Bestway`, `Costco Trade`, `Dhamecha`, `Wing Yip`, `Qogita`) is explicitly intended for commercial resale and gives you proper **B2B VAT invoices** required for food traceability.
- **Retail Supermarkets (Caution):** While reselling items bought in retail supermarkets is not a crime, retail chains often prohibit bulk commercial purchases in their store terms and **do not issue batch-traceable wholesale invoices**—which weakens your mandatory **Article 18 Food Traceability** compliance (see Section 4.4). Always buy through trade wholesale accounts.

### 1.2 Splitting Wholesale Cases & The *"Multipack — Not to Be Sold Separately"* Rule
A common myth is that printing *"Multipack — not to be sold separately"* on a pack makes splitting it a crime by itself. Under **UK Trading Standards** enforcement and the **Food Information Regulations 2014 (FIR)**, the real legal rule is **labelling completeness**:

| Scenario | Legal Status | Why (UK Law) |
| :--- | :--- | :--- |
| **Wholesale transit case containing factory-sealed retail sub-packs** (e.g., `24 × 500ml` tray split into `6` individually labelled cans, or `4 × 5kg` labelled inner rice bags) | **LEGAL** | Every unit handed to the student is intact, factory-sealed, and carries full individual UK consumer labelling. |
| **Multipack where inner units lack individual ingredient/allergen/date print** (e.g., plain unprinted inner pouches where allergens are printed *only* on the outer cardboard box) | **ILLEGAL** (unless you apply compliant FIR labels to every unit) | Breaches **Assimilated Regulation (EU) No 1169/2011** & **UK Food Information Regulations 2014** (up to unlimited fine / criminal prosecution for missing allergen declarations). |
| **Imported wholesale cases without English inner labels** (common with parallel-import Asian noodles at cash-and-carries where the importer put one English sticker on the outer carton only) | **ILLEGAL** | Mandatory food and allergen particulars **must be in English** on every consumer unit sold (`Article 15, Reg 1169/2011`). |
| **Opening a loose `20kg` sack or `108-pod` tub and scooping/counting into zip-lock bags** | **ILLEGAL** (without full food-packer compliance) | Makes you a **food packer/re-wrapper**: triggers open-food hygiene premises rules, allergen cross-contamination controls, calibrated **Weights & Measures Act 1985** trade scales, full FIR label printing, and breaches **GB CLP** child-safety packaging law for chemicals. |

### 1.3 Audit of Divly's Seeded Product Catalogue
Inspecting [seed.ts](file:///home/hacksday/Documents/project/server/seed.ts#L29-L222) reveals specific SKU-level rules you must enforce when buying stock:

1. **Basmati Rice (`prod-basmati-5kg` in [seed.ts](file:///home/hacksday/Documents/project/server/seed.ts#L31-L45)):** Listed as `"20kg wholesale sack (4 × 5kg inner bags)"`. Verify at Booker/Bestway that the outer bale genuinely contains **4 separate, factory-sealed, individually FIR-labelled `5kg` bags**—never buy a single `20kg` woven catering sack intending to weigh it out yourself.
2. **Imported Instant Noodles (`prod-shin-ramyun-5pk` & `prod-indomie-10pk` in [seed.ts](file:///home/hacksday/Documents/project/server/seed.ts#L47-L77)):** Physically check the `5-pack` / individual packets inside the `20-pack` or `40-pack` carton at the depot. Ensure every pack handed to a student has **English ingredients, bolded UK 14 allergens (e.g., *Wheat*, *Soya*, *Sesame*), Best Before date, Lot code, and a UK Food Business Operator (FBO) address**.
3. **High-Caffeine Energy Drinks (`prod-monster-ultra-6pk` in [seed.ts](file:///home/hacksday/Documents/project/server/seed.ts#L79-L93)):** Drinks containing `>150mg/L` caffeine must carry the statutory warning *"High caffeine content. Not recommended for children or pregnant or breast-feeding women"* followed by `(mg/100ml)`. Additionally, with UK legislation restricting high-caffeine energy drink sales to **under-16s** (and industry `16+` / `Challenge 25` standards), include a `16+` age confirmation in your Terms (note: nearly all UoB students are `18+`, though rare `17`-year-old foundation/first-year students exist).
4. **Fresh Bakery Items (`prod-fresh-protein-bagels` in [seed.ts](file:///home/hacksday/Documents/project/server/seed.ts#L127-L141)):** Has a 2-week shelf life (`shelfLifeWeeks: 2`), crushes easily, moulds if stored near warm pipes, and cannot safely carry over via Buy-Ahead underwriting. Consider disabling short-life bakery items for Drop #1.
5. **Laundry & Dishwasher Chemicals (`prod-fairy-pods-27pk` & `prod-finish-tabs-50pk` in [seed.ts](file:///home/hacksday/Documents/project/server/seed.ts#L159-L189)):** Regulated under the **GB CLP Regulation** (Classification, Labelling and Packaging of Substances and Mixtures). Soluble laundry capsules **legally require** factory child-impeding outer tubs (`27-wash sealed tub`), tactile hazard triangles where applicable, and bittering agents on film. Only ever supply sealed retail tubs—never split loose capsules/tablets.
6. **Strictly Prohibited Categories (Never Stock Without Specialist Licences):**
   - **Alcohol** (requires a *Premises Licence* + *Personal Licence* under the **Licensing Act 2003** — criminal offence to sell unlicensed).
   - **Medicines / Painkillers** (`Paracetamol`, `Ibuprofen`, hayfever tablets — strict **MHRA** retail pack-size limits and pharmacy rules under the **Human Medicines Regulations 2012**).
   - **Tobacco, Vapes, Knives/Kitchen Blades, or Butane Canisters** (strict criminal age-verification laws).

---

## 2. Where Can You Legally Do This? (Storage & Pickup Locations)

You have **two separate physical activities** in law: **(A) Storing & packing wholesale stock** and **(B) Customer collection / handover**. Different laws govern each.

### 2.1 Storing & Packing Stock at Home / Student Accommodation
- **University Halls of Residence (e.g., UoB Shackleton, Chamberlain, Maple Bank, Pritchatts Park):** Almost all university accommodation licence agreements strictly prohibit **running a commercial trade, storing commercial inventory, or using hall bedrooms/kitchens as a distribution depot**. Doing so breaches your accommodation contract and fire-safety corridor rules.
- **Private Student HMOs / PBSA in Selly Oak:** Standard Assured Shorthold Tenancies (ASTs) almost universally include a covenant to use the property *"as a private residential dwelling only and not to carry on any profession, trade, or business"*. Under **Section 35 of the Small Business, Enterprise and Employment Act 2015**, UK landlords cannot unreasonably refuse a *"home business"*—**however**, "home business" is narrowly defined as laptop/clerical work and **does not force a landlord to permit commercial stock storage, van deliveries, or customer footfall**, which can breach the landlord's buy-to-let mortgage and buildings insurance.
- **Council Planning Permission & Business Rates:** Quietly storing a few ambient crates indoors with **zero customer callers at the house** generally remains ancillary residential use, whereas having `40–100` students queue at a residential house in Selly Oak every Saturday afternoon risks **Birmingham City Council Planning Enforcement** (*material change of use* under the **Town and Country Planning Act 1990**) and Business Rates liability.
- **Safe Alternative for Storage:** Rent a clean, dry ground-floor **commercial self-storage unit** near Selly Oak / Stirchley / Edgbaston (`~£15–£30/week` student deals—check the facility's T&Cs allow food/dry-goods storage and have pest control) or obtain explicit written landlord consent for a private garage/utility room.

### 2.2 Where Can Students Collect Bags on Saturday?

> [!WARNING]
> **Never Trade on Public Pavements or Campus Forecourts Without Permission:** Setting up crates or handing out commercial orders on a public street/pavement (e.g., Bristol Road, Dawlish Road, or public highway outside campus) without a **Birmingham City Council Street Trading Consent** is a **criminal offence** under **Schedule 4 of the Local Government (Miscellaneous Provisions) Act 1982** (fines up to £1,000 per day).

1. **University of Birmingham Campus (`The Vale · Shackleton Forecourt` in [seed.ts](file:///home/hacksday/Documents/project/server/seed.ts#L277-L280)):**
   - UoB Edgbaston campus and The Vale Village are **private land** owned by the University of Birmingham.
   - You **must** obtain written permission from **UoB Estates / Hospitality & Accommodation Services (HAS) / Residence Life** or book an approved **Guild of Students** enterprise/pop-up stall before running Saturday pickups on Shackleton Forecourt.
   - Note on [LAUNCH_IN_14_DAYS.md](file:///home/hacksday/Documents/project/LAUNCH_IN_14_DAYS.md#L51-L55): Pinning commercial flyers in hall kitchens/corridors without Residence Life / Guild approval violates campus postering policies (use approved noticeboards or ask flat residents to display posters inside their own flats with flatmates' agreement).
2. **Private Off-Campus Partner Host in Selly Oak (Fastest Legal Launch Route):**
   - Partner with an existing private commercial business in Selly Oak (`B29`)—such as an independent café, gym, barber, launderette, church hall, or community space—to host a `2-hour` Saturday collection table inside their private premises (either free in exchange for guaranteed student footfall buying coffee, or for £20–£30/session). Because it is **private commercial property** off the public highway, no council Street Trading Licence is required.
3. **Direct Doorstep Delivery:**
   - Delivering pre-ordered bags directly to student houses/hall entrances (like Ocado/Tesco) is completely legal without a Street Trading Licence, provided your vehicle has **Business / Delivery Motor Insurance** (see Section 3.6).

---

## 3. Licences, Registrations, Visas & Insurance Required

### 3.1 Mandatory Food Business Operator (FBO) Registration (`£0.00` — Free)
Under **Article 6 of Assimilated Regulation (EC) No 852/2004** and the **Food Safety and Hygiene (England) Regulations 2013**, anyone storing, distributing, or selling food regularly—**even 100% online and even 100% pre-packed ambient packets**—must register as a **Food Business Operator** with their local council.

- **Where to register:** Online at [gov.uk/food-business-registration](https://www.gov.uk/food-business-registration), routing to **Birmingham City Council Environmental Health** (registering the postcode where you store/pack stock, and declaring mobile/pop-up hub distribution).
- **Cost & Refusal:** **100% free**; councils cannot refuse registration.
- **The 28-Day Statutory Rule (Playbook Correction!):** Notice [LAUNCH_IN_14_DAYS.md](file:///home/hacksday/Documents/project/LAUNCH_IN_14_DAYS.md#L9-L13) suggests registering on Day 1 and launching Drop #1 on Day 13. **Strictly by statute, you must submit your registration at least 28 days before starting food operations.** If you want to trade sooner than 28 days, email Birmingham City Council's Food Safety Team after submitting to confirm they have logged your low-risk ambient pre-packed registration and have no objection to your start date.
- **Do you need "Food Premises Approval" (`853/2004`)?** **No**—Approval is only for businesses manufacturing/repacking meat, dairy, egg, or fish products for other businesses.

### 3.2 Food Hygiene Certificate (Recommended `~£15–£20`)
You do **not** legally need a "licence" to handle food, **but** **Annex II, Chapter XII of Assimilated Regulation (EC) 852/2004** legally requires food handlers to be *"instructed and/or trained in food hygiene matters commensurate with their work activity"*. Completing an accredited **Level 2 Award in Food Safety for Retail** (`2–3 hours` online, `~£15–£20` via CIEH / Highfield) satisfies Environmental Health Officers (EHOs) and University Estates immediately.

### 3.3 UK Student Visa Check (CRITICAL for International Founders!)

> [!CAUTION]
> **Home Office Student Visa Prohibition (`Immigration Rules: Appendix Student, ST 26.5`):** If you or any co-founder are studying at UoB on a **UK Student Visa** (formerly Tier 4), you are **strictly prohibited by law from being self-employed or engaging in "business activity"**—including trading as a Sole Trader, incorporating a UK `Ltd` company where you hold `>=10%` shares or serve as a Director, or operating Divly commercially. Doing so is a serious immigration breach risking visa cancellation. Only founders with **British/Irish citizenship, ILR, EU Settled/Pre-Settled Status, Graduate Visa, Dependant Visa (without business restriction), or Innovator Founder Visa** may legally operate Divly.

### 3.4 Business Structure, HMRC Tax & VAT
- **Sole Trader vs. Private Limited Company (`Ltd`):**
  - **Sole Trader (£0):** Quickest start, *but* you have **unlimited personal liability** if a student suffers an allergic reaction or slips over a crate. Must register for HMRC Self Assessment once gross trading income exceeds the **£1,000/year Trading Allowance** (by 5 October following the end of the tax year).
  - **Private Limited Company (`Ltd`, £50 digital incorporation at Companies House):** Strongly recommended before scaling. Ring-fences personal liability, looks credible to UoB Estates and wholesalers, and requires director identity verification under the **Economic Crime and Corporate Transparency Act 2023 (ECCTA)**.
- **VAT Registration:** Not required until rolling 12-month taxable turnover exceeds **£90,000**. Keep clean SKU records now because UK grocery VAT is split: staple foods (`Rice`, `Noodles`, `Oatly`, `Chopped Tomatoes`, `Bagels`, `Soy Sauce`) are **0% zero-rated**, whereas soft/energy drinks (`Monster Ultra`), confectionery, and household items (`Toilet Tissue`, `Fairy`, `Finish`) carry **20% standard VAT**.

### 3.5 ICO Data Protection Fee (`£52/year`)
Because Divly electronically stores student personal data (`email`, `name`, order history, and IP/auth sessions in `data/divly.sqlite`), UK law (**Data Protection (Charges and Information) Regulations 2018**) requires most trading businesses to register as a Data Controller with the **Information Commissioner's Office (ICO)** and pay the Tier 1 micro-organisation fee (**£52/year**, or **£47/year** by Direct Debit). Trading without paying when non-exempt carries civil monetary penalties.

### 3.6 Insurance Requirements

| Insurance Type | Legally Mandatory? | Why You Need It |
| :--- | :--- | :--- |
| **Motor Insurance: Class 1 Business / "Carriage of Own Goods"** | **YES (Criminal Offence without it)** | Standard student *"Social, Domestic & Pleasure (SD&P) + Commuting"* car insurance **does NOT cover** driving to Booker Cash & Carry or hauling customer stock to a pickup hub. Driving without business-goods cover is uninsured driving under the **Road Traffic Act 1988** (`6–8` penalty points, unlimited fine, vehicle seizure). |
| **Public & Product Liability (`£5M` minimum)** | Commercially mandatory (`~£80–£150/yr`) | Covers physical injury at the pickup hub (e.g., student tripping over a crate) and product injury claims. **UoB Estates / Guild and private venues will require your £5M certificate before granting hub access.** |
| **Employers' Liability (`£5M` minimum)** | **YES — immediately if hiring anyone** | Compulsory under the **Employers' Liability (Compulsory Insurance) Act 1969** (`£2,500/day` fine) the moment you employ staff—including casual students paid wages or guaranteed shift perks (sole-director `Ltd` companies with no employees are exempt). |

---

## 4. Legal Precautions When Handling Food (and Non-Food Chemicals)

Even though you never cook or slice food, you are legally handling food in the supply chain under the **Food Safety Act 1990**, **Assimilated Regulation (EC) No 178/2002**, and **Assimilated Regulation (EC) No 852/2004**.

### 4.1 Your Statutory "Due Diligence" Shield (Food Safety Act 1990, s.21)
Under the **Food Safety Act 1990**, selling unsafe food (s.7/s.8) or contaminated/tainted food (s.14) is a **strict-liability criminal offence**—meaning you can be prosecuted even if the manufacturer made the mistake, **UNLESS** you prove the **Section 21 Due Diligence Defence**: that you took *"all reasonable precautions and exercised all due diligence"* to avoid the offence. Keeping the simple logs below builds that legal shield.

### 4.2 Documented HACCP / Food Safety Management System (Article 5, Reg 852/2004)
You are legally required to keep a written **Food Safety Management System (FSMS)** proportionate to your business. Download the Food Standards Agency's free **Safer Food, Better Business (SFBB) for Retailers** pack and keep a lightweight weekly folder covering:
1. **Approved Suppliers List:** Only purchase from reputable UK-registered wholesalers (`Booker`, `Bestway`, `Costco`, `Qogita`).
2. **Goods-In Inspection Check:** On pickup/delivery, verify outer cases are dry, clean, pest-free, within `Best Before` date, with zero dented/swollen cans (`Mutti Tomatoes`, `Monster`), punctured cartons (`Oatly`), or split bags (`Basmati Rice`). Reject/quarantine any damaged unit—never sell dented tins or punctured UHT cartons (botulism/spoilage risk).
3. **Zero Decanting Rule:** Never open primary packaging. If a shrink-wrapped `5-pack` splits, only supply inner units if each individual packet is sealed and carries complete standalone UK FIR labelling.

### 4.3 Chemical Contamination & Odour Tainting Trap!

> [!WARNING]
> **Playbook Packing Fix Required ([LAUNCH_IN_14_DAYS.md](file:///home/hacksday/Documents/project/LAUNCH_IN_14_DAYS.md#L80)):** Day 12 currently instructs packing all of a student's items into one brown Kraft carrier bag. Under **Annex II of Reg 852/2004** and **Section 14 of the Food Safety Act 1990**, packing heavily perfumed `Fairy Washing Capsules` or `Finish Lemon Dishwasher Tablets` inside the **same bag** directly touching porous items like `Warburtons Bagels` or paper `Basmati Rice` sacks risks **chemical odour taint** (perfume absorbed into food) or detergent leakage!

- **Mandatory Precaution:** Transport household chemicals (`Toiletries & Laundry` category) in a **dedicated `NON-FOOD` crate** in your vehicle, store them on a **separate bottom shelf/zone** away from food, and place chemical tubs in a **separate inner barrier bag or separate carrier bag** at handover.

### 4.4 Allergens & The Online Distance-Selling Law Trap (`Article 14, UK FIR 2014`)

> [!IMPORTANT]
> **Codebase Compliance Fix Needed Before Launch:** Look at [LegalFooter.tsx](file:///home/hacksday/Documents/project/src/components/LegalFooter.tsx#L22-L30), which tells students to check physical product labels upon Saturday collection. While that warning is essential, **Article 14 of Assimilated Regulation (EU) No 1169/2011 (UK FIR 2014)** governs **distance selling of prepacked food** and legally mandates that **all mandatory food information (except Best Before date and lot code)—specifically the full ingredients list and the 14 allergens emphasised (e.g. bolded)—MUST be available to the consumer BEFORE the purchase is concluded online!**

- **How to fix this cleanly in Divly:** Add an `ingredientsAndAllergens` field (or expandable `"Ingredients & Allergens"` accordion on [ProductCard.tsx](file:///home/hacksday/Documents/project/src/components/ProductCard.tsx)) copied verbatim from the UK wholesale pack for every food SKU, alongside the disclaimer: *"Formulations may change; always verify the physical pack label on collection before consuming."*

### 4.5 Mandatory "One Step Back" Traceability & Recall Readiness (`Articles 18 & 19, Reg 178/2002`)
- **Article 18 Traceability:** For every weekly drop (`dropCycleNumber`), save the digital/paper wholesale VAT invoice (`Booker` / `Qogita`) and photograph or log the **Batch/Lot Code** and **Best Before date** of every case bought for that drop.
- **Article 19 Product Recall Duty:** Subscribe free to **FSA Allergy & Food Alerts** (`food.gov.uk/news-alerts`). Because Divly's SQLite database links every `dropCycleNumber` and `productId` to verified `@student.bham.ac.uk` emails, if a batch of noodles or flapjacks is recalled by the FSA, you are legally obligated to immediately halt distribution, notify every student who collected from that drop via email, issue full refunds, and inform Birmingham City Council Environmental Health.

### 4.6 Clean Vehicle & Manual Handling Safety
- **Transport Hygiene (Reg 852/2004, Annex II, Ch. IV):** Car boots / vans used to collect from Booker must be vacuumed, dry, lined with clean wipeable plastic crates, and strictly free of pets, muddy sports gear, engine oil, or loose chemicals.
- **Manual Handling Operations Regulations 1992:** A `20kg` rice bale or `24 × 500ml` Monster tray (`~13kg`) can cause back or crush injuries. Use a folding sack truck (`~£25`), never stack heavy crates above shoulder height at the Saturday pickup hub where they could topple onto queuing students, and keep a 1-page **Risk Assessment & Method Statement (RAMS)** on file.

---

## 5. What Is the Law About Storing Food?

When an **Environmental Health Officer (EHO)** from Birmingham City Council inspects your registered storage address (by appointment or unannounced, awarding your **Food Hygiene Rating Scheme `0–5` score**), they inspect against **Assimilated Regulation (EC) No 852/2004 (Annex II)** and the **Food Safety and Hygiene (England) Regulations 2013**:

1. **Zero Chilled/Frozen Liability (Schedule 4 Temperature Law):**
   - In England, **Schedule 4** requires chilled high-risk foods to be stored and transported at **`<= 8°C`** (industry standard `<= 5°C`) and frozen foods at **`<= -18°C`**, backed by calibrated probe thermometers and daily temperature logs.
   - **Your Golden Rule:** By stocking **100% ambient, shelf-stable goods** (UHT `Oatly` prior to opening, dry rice, tinned tomatoes, cans, dry noodles), Schedule 4 cold-chain law does not apply.
   - **Ambient Storage Duty Still Applies:** You must still follow manufacturer storage instructions (*"Store in a cool, dry place away from direct sunlight"*). Do **not** store `Oatly`, `Cocoa Flapjacks`, or `Soy Sauce` next to a boiler/radiator, in a conservatory baking in direct sun, or in a damp shed subject to frost/mould.
2. **Off-the-Floor Storage:** Food cases must **never** sit directly on concrete garage floors, entryway mats, or bedroom carpets. Use wipe-clean plastic shelving or plastic Euro pallets/dunnage at least `15cm` off the floor and slightly away from walls to prevent rising damp and allow pest inspection.
3. **Pest Proofing & Monitoring:** Storage rooms must have tight-fitting doors/windows, sealed pipe gaps, **zero domestic pets allowed inside**, and a simple weekly visual check log confirming zero mouse droppings, chewed cardboard, or pantry moths (crucial if storing `Basmati Rice` or `Oat Flapjacks` in Selly Oak!).
4. **Physical Chemical Separation:** Store `Fairy` / `Finish` / cleaning supplies in a separate closed plastic tub or dedicated bottom shelf away from all food stock.
5. **Date-Marking Law (`Use By` vs `Best Before`) & Buy-Ahead Stock (`FEFO`):**
   - **`Use By` Date:** Selling, supplying, or displaying food past its **`Use By`** date is an **automatic strict-liability criminal offence** (*Reg 32 / Food Information Regs*). Avoid stocking any item carrying a `Use By` date!
   - **`Best Before` Date:** Ambient staples carry `Best Before` dates (about quality rather than safety). While selling food shortly past `Best Before` is not automatically criminal if still safe and disclosed, **never supply expired stock on Divly**.
   - **Buy-Ahead Rotation ([buyAheadPredictor.ts](file:///home/hacksday/Documents/project/server/services/buyAheadPredictor.ts)):** Whenever Divly underwrites a `3/4` case and holds the `1` spare share for next week's drop, enforce strict **FEFO (First-Expired, First-Out)** rotation and label the held crate with its drop cycle and `Best Before` date.

---

## 6. Six Additional Legal Areas Every Divly Founder Must Know

### 6.1 Online Trader Identity Law (Codebase Fix Required!)
Under **Regulation 6 of the Electronic Commerce (EC Directive) Regulations 2002**, **Regulation 13 / Schedule 2 of the Consumer Contracts Regulations 2013**, and the **Companies Act 2006**:
- Every UK e-commerce website taking consumer payments **must permanently and easily display**:
  1. **Your real legal business name** (e.g., `"[Your Full Name] trading as Divly"` if a Sole Trader, or `"Divly Campus Ltd"` + Companies House registration number and registered office if a `Ltd` company);
  2. **A real UK geographic address** (can be a registered office / virtual office mail-forwarding service in Birmingham `~£15/mo` so you don't publish your student bedroom address!); and
  3. **A working support email address**.
- **Current Gap:** [LegalFooter.tsx](file:///home/hacksday/Documents/project/src/components/LegalFooter.tsx#L60-L112) currently omits a legal trader/company name and geographic address, and lists placeholder `support@divly-uob.co.uk`. Update this before going live!

### 6.2 Consumer Refunds, Uncollected Bags & Cancellation Rights
- **Consumer Rights Act 2015:** Goods must be of satisfactory quality, fit for purpose, and match description. You cannot put up signs saying *"No refunds once collected"*—if a sealed `Oatly` carton is spoiled inside, the student has an unwaivable statutory right to a refund or replacement.
- **Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013:**
  - Online buyers normally get a **14-day cooling-off right** from the day after physical collection to return **unopened, factory-sealed non-perishable items** (`Basmati Rice`, `Toilet Tissue`, `Dishwasher Tabs`, `Cans`) for a refund.
  - **Statutory Exemptions (Reg 28):** There is *no* 14-day change-of-mind cancellation right for (a) goods liable to deteriorate or expire rapidly (e.g., fresh bakery bagels), or (b) sealed goods unsuitable for return due to health protection or hygiene reasons **once unsealed by the student after collection**.
- **Uncollected Saturday Bags:** Clearly state in your Terms what happens if a student misses the `Sat 12:00–15:00` pickup window (e.g., held for 48 hours / rolled once to next Saturday for shelf-stable items, or refunded minus a stated reasonable restocking cost where lawful).

### 6.3 Supermarket Price Comparisons & Unit Pricing (`DMCC Act 2024` & `ASA CAP Code`)
- Divly displays `"Save X% vs Supermarkets"` computed from `aldiPricePence` / `aldiUnitLabel`.
- Following your public copy rule (never naming competing chains on student screens) avoids comparative trade-mark disputes, **but** under the **Digital Markets, Competition and Consumers Act 2024 (DMCC Act)** (which gives the CMA direct civil fining powers for misleading price claims) and the **ASA CAP Code (Rule 3.33–3.39)**:
  - Even generic `"vs Supermarkets"` savings percentages **must be genuine, current, and like-for-like** (same brand and pack weight, or clearly labelled if comparing branded wholesale against a branded supermarket multipack).
  - Keep a simple fortnightly folder of dated screenshots from major UK online supermarkets (`Tesco`, `Sainsbury's`, `Asda`, `Aldi`) proving every `aldiPricePence` benchmark in your database!
- **Unit Pricing (**Price Marking Order 2004**, as amended 2024–2026):** Best practice (and mandatory across standard retail/online grocery) is showing the **unit price** (`£1.29/kg`, `£1.45/L`, `£0.18/wash`) alongside the share price so students can compare value transparently.

### 6.4 Payments, Stripe Refunds & FCA E-Money Boundaries
- **Principal Merchant of Record (Avoiding FCA Licensing):** Under the **Payment Services Regulations 2017 (PSRs)**, holding money in "escrow" between peers requires **FCA authorisation**. Because Divly acts as the **principal retail merchant** selling bulk shares directly to students (taking title to wholesale cases and fulfilling or refunding orders), you do **not** need FCA authorisation—**never** describe Divly on your website or posters as *"holding student funds in escrow"*.
- **Stripe Processing Fee Note ([stripeService.ts](file:///home/hacksday/Documents/project/server/services/stripeService.ts#L127-L154)):** Divly uses `mode: 'payment'` (immediate charge) and triggers `POST /v1/refunds` at Wednesday cutoff for unfilled overflow slots. Be aware financially and legally:
  1. Unfilled cash-paid slots **must be refunded to the student's original payment card** (unless the student actively chooses store credit—you cannot force failed-pool refunds into non-cashable store credit against their will);
  2. Stripe **does not return its initial `1.5% + 20p` card fee** when you issue a refund, so launching with `6–8` high-demand SKUs (plus smart Buy-Ahead underwriting) keeps overflow refunds minimal.
- **Divly Wallet & Referral Credits (`EMRs 2011`):** Store credit (`Give £0.50, Get £1`) redeemable *exclusively* on Divly for groceries falls safely inside the **Electronic Money Regulations 2011 "Limited Network / Single Issuer" exclusion**, provided credits cannot be cashed out or traded peer-to-peer.

### 6.5 Student Data, `UK GDPR`, `PECR` Marketing Rules & Backups
- **Transactional vs. Marketing Emails (**Privacy and Electronic Communications Regulations 2003 — PECR**):**
  - Sending `6-digit` OTP codes, order receipts, QR pickup passes, and automatic refund notices requires **no marketing opt-in** (strictly transactional).
  - Sending weekly *"Drop #2 is Open!"* promotional emails relies on either an explicit checkbox opt-in or the **PECR "Soft Opt-In"** (allowed *only* for existing paying/negotiating customers, if given an opt-out chance at signup AND a 1-click unsubscribe link in every marketing email).
- **Database Backup Hygiene:** `GET /api/admin/backup` exports full student names, `@student.bham.ac.uk` emails, and order histories in plain JSON. Store downloaded backups only on an encrypted laptop drive, never share them in group chats, and verify `ALLOW_DEV_LOGIN=false` in production!

### 6.6 Carrier Bag Law (`10p` Rule) & Commercial Cardboard Waste Law
- **Why Brown Kraft Paper Bags Save You Red Tape:** Under the **Single-Use Carrier Bags Charges (England) Order 2015 (as amended May 2021)**, **every** business in England (even a 1-person student startup!) **must legally charge at least `10p`** for single-use **plastic** carrier bags. However, **uncoated paper bags** (plain brown Kraft grocery bags used in [LAUNCH_IN_14_DAYS.md](file:///home/hacksday/Documents/project/LAUNCH_IN_14_DAYS.md#L80)) are **100% legally exempt** from the statutory carrier bag charge! Stick strictly to uncoated Kraft paper bags or reusable crates.
- **Commercial Waste Duty of Care (**Environmental Protection Act 1990, s.34**):**
  - Once you unpack `30` wholesale cardboard cartons and shrink-wrap bales, **that cardboard is Commercial Trade Waste—NOT household waste**.
  - **Never** dump wholesale boxes into UoB Shackleton hall bins, public litter bins, or your residential council wheelie bin—doing so is a criminal breach of s.34 Duty of Care / fly-tipping (`£300–£1,000+` Fixed Penalty Notice from Birmingham City Council, often traced directly back to you via wholesaler shipping labels on the boxes!).
  - **Legal Solution:** Use a licensed commercial recycling collection, commercial self-storage trade recycling bin (confirm included in your licence + keep the **Waste Transfer Note** for 2 years), or wholesalers that accept clean flattened transit cardboard back from trade members.

### 6.7 University of Birmingham Trade Marks & Domain Naming
- Describing your service truthfully as *"for students at the University of Birmingham"* alongside the explicit disclaimer in [LegalFooter.tsx](file:///home/hacksday/Documents/project/src/components/LegalFooter.tsx#L110) (*"Independent student enterprise — not an official department of the University of Birmingham"*) is lawful descriptive use under **Section 11(2) of the Trade Marks Act 1994**.
- **Domain & Email Warning:** Do **not** use the University crest/shield, and avoid registering domains containing `uob` or `bham` (change placeholder `support@divly-uob.co.uk` in [LegalFooter.tsx](file:///home/hacksday/Documents/project/src/components/LegalFooter.tsx#L46) to `support@getdivly.co.uk` or `support@divly.co.uk`).

---

## 7. Pre-Launch Legal Checklist (Chronological Order)

- [ ] **1. Check Founder Visa Right-to-Work:** Confirm every founder/director has unrestricted UK self-employment / business rights (no Student Visa holders acting as founder/director).
- [ ] **2. Choose Legal Entity & Registered Office:** Incorporate a UK `Ltd` (`£50` at Companies House) or set up as a Sole Trader, and secure a non-residential correspondence/registered office address.
- [ ] **3. Submit Birmingham City Council FBO Registration (`£0`):** File at [gov.uk/food-business-registration](https://www.gov.uk/food-business-registration) declaring *online retail of pre-packed ambient goods only* (respecting the 28-day statutory window or clearing start date with EHO).
- [ ] **4. Register ICO Data Protection Fee (`£52/yr` / `£47` DD):** Complete registration at `ico.org.uk`.
- [ ] **5. Secure Insurance & Venue Permission:** Upgrade car cover to **Class 1 Business / Carriage of Own Goods**, take out **£5M Public & Product Liability Insurance**, and get **written permission** for both your clean/dry storage space and your Saturday pickup hub (UoB Estates/Guild or private Selly Oak partner venue—never public pavements!).
- [ ] **6. Patch the 3 Codebase Legal Gaps Before Live Payments:**
  - Add legal trader/company name + UK geographic address + real `@getdivly.co.uk` email to [LegalFooter.tsx](file:///home/hacksday/Documents/project/src/components/LegalFooter.tsx).
  - Add pre-checkout **UK FIR Article 14** ingredients & bolded **14 allergens** details to food listings in [ProductCard.tsx](file:///home/hacksday/Documents/project/src/components/ProductCard.tsx) (and consider disabling short-life `Warburtons Bagels` in [seed.ts](file:///home/hacksday/Documents/project/server/seed.ts)).
  - Separate `Fairy` / `Finish` chemical tubs from food bags during Thursday/Friday packing ([LAUNCH_IN_14_DAYS.md](file:///home/hacksday/Documents/project/LAUNCH_IN_14_DAYS.md#L80)).
- [ ] **7. Prepare Your Operational Compliance Binder (Digital or Paper):**
  - Level 2 Food Safety in Retail certificate + adapted FSA *Safer Food, Better Business* checklist;
  - Weekly wholesale VAT invoices + Batch/Lot code photos (`Article 18` traceability);
  - Fortnightly supermarket price-check screenshots backing `aldiPricePence` (`DMCC Act 2024`);
  - Commercial cardboard Waste Transfer Note (`EPA 1990 s.34`).
