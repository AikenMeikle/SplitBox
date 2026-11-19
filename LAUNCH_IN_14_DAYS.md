# Divly — Launch at the University of Birmingham in 14 Days

> **💷 Before Taking Real Student Payments — Read First:**
> See **[SETUP_AND_COSTS.md](./SETUP_AND_COSTS.md)** for the **complete itemized `£` GBP cost breakdown** (`£0.00/month` Proxmox + Cloudflare Tunnel vs `~£4.00/month` Railway Cloud, **under `£45` Day-1 cash needed**) and the **exact 30-minute technical setup checklist** (`.env` production secrets, Stripe UK Apple Pay/Google Pay webhooks, Resend `@student.bham.ac.uk` DNS, and live smoke test).

This is your practical, day-by-day execution manual to take **Divly** from code on your laptop to paying University of Birmingham students collecting their first bulk grocery bags at The Vale in **14 days**.

---

## Days 1–3: Legal Clearance, Payments & Campus Email Setup

### Day 1 — Free Birmingham City Council Food Business Registration (10 mins)
- [ ] Register online (100% free) via [gov.uk/food-business-registration](https://www.gov.uk/food-business-registration) selecting **Birmingham City Council** as your local authority.
- [ ] **Keep your scope 100% low-risk:** State clearly on the form that you operate an **online pre-order collection club distributing 100% factory-sealed, pre-packed ambient goods** (rice sacks, sealed noodle multipacks, UHT oat milk, sealed toiletries/laundry) with **zero food preparation, zero repacking/decanting of open food, and zero chilled/frozen storage**.
- [ ] Because every share handed to a student is an intact, factory-labelled manufacturer pack (e.g. a sealed 5kg inner bag or sealed 5-pack bundle), full UK Food Information Regulations 2014 (FIR) ingredient and allergen labels are already printed on every unit.

### Day 2 — Stripe UK Sole Trader + Apple Pay / Google Pay (30 mins)
- [ ] Open a UK **Stripe** account as an Individual / Sole Trader at [dashboard.stripe.com](https://dashboard.stripe.com) (all you need is your UK bank sort code/account number and student ID/passport).
- [ ] Under *Settings -> Payment methods*, enable **Cards**, **Apple Pay**, and **Google Pay** (Apple Pay on iPhone converts 3x faster than typing 16-digit card numbers in hall kitchens!).
- [ ] Purchase a clean UK domain (`divly.co.uk` or `getdivly.co.uk`, ~£6/yr on Cloudflare/Porkbun) and add it under *Stripe -> Settings -> Payment method domains* so Apple Pay works on Safari.
- [ ] Create a live webhook pointing to `https://yourdomain.co.uk/api/webhooks/stripe` listening to **`checkout.session.completed`**, and save `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.

### Day 3 — Resend Domain DNS (`SPF` / `DKIM`) for `@student.bham.ac.uk` OTPs (20 mins)
- [ ] Create a free account at [resend.com](https://resend.com) (3,000 emails/month free).
- [ ] Add your domain and paste the `SPF` (`TXT`), `DKIM` (`TXT`), and `DMARC` (`TXT`) records into Cloudflare DNS so Microsoft Outlook (`@student.bham.ac.uk` uses Microsoft 365!) delivers your 6-digit login codes straight to the Primary inbox, never Junk.
- [ ] Test sending an OTP to your own `@student.bham.ac.uk` address and verify it arrives in under 5 seconds.

---

## Days 4–6: Cloud Deployment, Backups & Wholesale Accounts

### Day 4 — Deploy Production Server + Persistent SQLite Volume (20 mins)
- [ ] Deploy this repo to **Railway**, **Render**, or your **home Proxmox VM** (follow Recipe 5 in [`STUDENT_DEV_GUIDE.md`](./STUDENT_DEV_GUIDE.md)).
- [ ] **Double-check these 4 production environment variables before sharing any link:**
  - `ALLOW_DEV_LOGIN=false` (hides local dev test buttons!)
  - `ADMIN_PIN=<a strong 12+ char passphrase>`
  - `QR_HMAC_SECRET=<fresh 64-char random hex>`
  - `SQLITE_PATH=/app/data/divly.sqlite` (mounted to a persistent volume/disk so deploys never wipe orders!)
- [ ] Log into **Admin** on your live domain and click **💾 Download DB Backup** (`GET /api/admin/backup`) once to verify 1-click JSON backups work cleanly.

### Day 5 — Open UK Wholesale Accounts (Local Birmingham + Online B2B)
- [ ] **Booker Wholesale Aston** (*lichfield Rd / Aston Cross, Birmingham B6 5RQ* — ~15 mins from campus) or **Bestway Wholesale Birmingham**: Register free online with Sole Trader proof (bank statement + utility/council letter) for same-day cash-and-carry runs.
- [ ] **Qogita (`qogita.com`):** Sign up as a UK buyer for pallet/case delivery straight to your storage address (optional: paste `QOGITA_API_KEY` into `.env` for 1-click PO submission).

### Day 6 — Curate Drop #1 down to 6–8 Ultra-High-Demand SKUs!
- [ ] **Golden Rule of Drop #1:** Do *not* launch with 40 products — if 24 early students spread across 24 items, zero boxes lock!
- [ ] In **Admin -> Products**, keep **6–8 everyday student essentials** active (e.g. *Shin Ramyun 5-packs, Indomie Mi Goreng 10-packs, Tilda/Royal Umbrella 5kg Basmati, Oatly Barista 3×1L, Monster Ultra 6-packs, Cushelle/Nicky 9-roll toilet tissue, Fairy Non-Bio laundry*).
- [ ] Verify every public label uses neutral supermarket comparisons (`"Supermarket equiv."`, never naming competing supermarkets in student-facing UI).
- [ ] Set your Drop #1 cutoff in **Admin -> Hub & Fee Settings** to **Wednesday 23:59** and Saturday pickup to **Sat 12:00–15:00** (e.g. *The Vale · Shackleton Forecourt* or *Selly Oak Hub*).

---

## Days 7–10: Campus Seeding, Hall Flyers & Viral Referral Loop

### Day 7 — Print 50 A4 Kitchen Posters via `/flyer.html`
- [ ] Open **`https://yourdomain.co.uk/flyer.html`** in Chrome, press `Ctrl+P` / `Cmd+P` (*Save as PDF / Print A4, Background Graphics ON*), and print 50 crisp colour posters at the UoB Main Library print stations.
- [ ] Pin posters on noticeboards and communal kitchen doors in **Shackleton, Chamberlain, Maple Bank, Tennis Courts, and Aitken** (ask flatmates in each block to pop one on their fridge door!).

### Days 8–9 — Seed 3 Hall & Society WhatsApp Chats with `£0.50` Welcome Links
- [ ] Sign in as a student on your live site and copy your **`🎁 Give £0.50, Get £1`** referral link (`https://yourdomain.co.uk/?ref=UOB-XXXXXX`).
- [ ] **Pre-fill 2 boxes to `75%` yourself or with 2 flatmates first!** Seeing `"3 of 4 students chipped in — ⚡ CLOSER BONUS: -10% + FREE PICKUP"` converts dramatically better than `"0 of 4"`.
- [ ] Drop a friendly message in 3 flat/hall/society WhatsApp chats:
  > *"Hey everyone — built a UoB bulk grocery splitter called Divly so we can split wholesale cases of Shin Ramyun, Oatly, Basmati rice & toilet roll 25% under supermarket prices without hauling 20kg sacks back from Selly Oak. There's 1 spot left to lock our first Shin Ramyun box (gives extra 10% off + free Saturday pickup at Shackleton) + £0.50 welcome credit here: https://yourdomain.co.uk/?ref=UOB-XXXXXX"*

### Day 10 — Drive Drop #2 Hype with the Student Request Board
- [ ] Tell hallmates they can scroll to **"Suggest & Upvote Next Week's Drop"** at the bottom of the storefront to vote on what wholesale cases you stock next week.
- [ ] Watch **Admin -> Products** as upvotes climb — top-voted items already have guaranteed buyers waiting for Drop #2!

---

## Days 11–14: First Cutoff, Wholesale Run, Packing & Hub Day

### Day 11 (Wednesday `23:59`) — Smart Cutoff & Buy-Ahead Underwriting
- [ ] At `23:59` Wednesday, open **Admin -> Wholesale & Drop Controls** and click **💾 Download DB Backup** first (good Friday-night insurance!).
- [ ] Check the **🧠 Smart Incomplete-Box Buy-Ahead Predictor**:
  - If a 52-week shelf-stable item (like Basmati Rice or Shin Ramyun) is **`3/4` full** (`SAFE TO BUY AHEAD`), leave its checkbox **ticked**! You'll front just £2–£5 of float, delight those 3 students on Saturday instead of refunding them, and carry the 1 remaining share (`✓ Instant Stock Held at Hub`) into Drop #2.
  - Leave risky or short-shelf-life `1/6` pools **unticked** so Divly automatically refunds those shares to the penny.
- [ ] Click **Trigger Weekly Cutoff & Auto-Refunds**.

### Day 12 (Thursday / Friday) — Wholesale Purchase & Kraft Bag Packing
- [ ] Click **🚚 Place Wholesale Bulk Order** (or **Export CSV**) in Admin and buy the exact count of `100%` locked + underwritten cases at Booker Aston / Bestway / Qogita.
- [ ] In **Admin -> Pickup Scanner**, click **🏷️ Print Saturday Bag Labels** (`window.print()`).
- [ ] Pack each student's sealed multipacks into a brown Kraft carrier bag (`~12p` each in bulk), tick off every line item on their printed slip, and staple/tape the `UOB-XXXXXX` label to the front handle so Saturday handover takes **under 10 seconds per student**.

### Days 13–14 (Saturday `12:00–15:00` + Sunday Reset) — Hub Handover & Drop #2!
- [ ] Arrive 10 minutes early at your pickup spot with the pre-labelled Kraft bags sorted alphabetically by `UOB-XXXXXX` code, open **Admin -> Pickup Scanner** on your phone, and tap **📷 Start Camera QR Scan**.
- [ ] Scan each student's phone QR pass (or type their 6-digit backup PIN if their screen brightness is low), hand over their bag, tap **Mark Collected ✅**, and remind them: *"Share your £1 referral link in your flat chat before Wednesday's drop!"*
- [ ] **Sunday evening:** Stock the #1 student-upvoted item from **Admin -> Student Requests**, click **Start New Weekly Drop** (`Cycle #2` begins automatically with any leftover Buy-Ahead stock pre-loaded!), and post a quick photo of Saturday's stacked cases in the WhatsApp chat. Repeat weekly!
