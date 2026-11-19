# Divly — Complete Setup Guide & Real-World Launch Costs (`£` GBP)

Written for a **1st-year Computer Science student launching Divly at the University of Birmingham in 2 weeks**.

This guide has two parts:
1. **[Part 1: Every Penny It Costs to Launch & Run Divly (`£` GBP)](#part-1--complete-itemized-cost-breakdown--gbp)** — Honest side-by-side numbers comparing the **`£0.00/month` Proxmox Home-Server Option** and the **`~£4.00/month` Railway Cloud Option**, plus statutory UK registrations and Saturday hub supplies.
2. **[Part 2: Exact 30-Minute Production Setup Checklist](#part-2--30-minute-setup-checklist-before-taking-real-student-money)** — Copy-paste commands and click-by-click setup for `.env` secrets, Stripe UK (Apple Pay, Google Pay & auto-refunds), Resend `@student.bham.ac.uk` OTPs, live deployment, and your final 5-minute pre-launch test.

> **Related Launch Guides:**
> - **[`LAUNCH_IN_14_DAYS.md`](./LAUNCH_IN_14_DAYS.md)** — Day-by-day 2-week UoB execution plan (hall flyers, WhatsApp seeding, Wednesday cutoff, Saturday pickup).
> - **[`STUDENT_DEV_GUIDE.md`](./STUDENT_DEV_GUIDE.md)** — Plain-English codebase tour, SQLite WAL & Bayesian math walkthroughs, and customization recipes.

---

## Part 1 — Complete Itemized Cost Breakdown (`£` GBP)

Divly was engineered specifically for a student budget: **Node.js 22's built-in `node:sqlite` (WAL mode)** eliminates `$15–$25/month` managed Postgres bills, **Resend's free tier** covers university login codes, and **Open Food Facts UK v2** gives you live barcode search for free.

### Quick Comparison: Bootstrapper (`£0/mo`) vs Managed Cloud (`~£4/mo`)

| Cost Category | Service / Provider | Option A: Home Proxmox Bootstrapper | Option B: Managed Cloud (Railway / Render) | When You Pay |
| :--- | :--- | :--- | :--- | :--- |
| **1. Web + SQLite Hosting** | Proxmox Docker + Cloudflare Tunnel *or* Railway Hobby | **`£0.00 / mo`** *(~£1–£2 electricity)* | **`~£4.00 / mo`** *($5 Railway)* or `~£5.60 / mo` *($7 Render)* | Monthly |
| **2. Custom UK Domain** | Cloudflare Registrar / Porkbun (`.co.uk`) *or* GitHub Student Pack (`.me`/`.tech`) | **`£0.00` Yr 1** *(Student Pack)* or **`~£5.50 / yr`** (`.co.uk`) | **`~£5.50–£7.50 / yr`** (`.co.uk` / `.uk`) | Yearly |
| **3. Card, Apple Pay & Google Pay** | **Stripe UK** (Sole Trader) | **`£0.00 / mo`** (`1.5% + £0.20` per UK card order) | **`£0.00 / mo`** (`1.5% + £0.20` per UK card order) | Per paid order only |
| **4. `@student.bham.ac.uk` OTP Emails** | **Resend** (`3,000` emails/mo free tier) | **`£0.00 / mo`** | **`£0.00 / mo`** | Free up to 3,000/mo |
| **5. Live UK Barcode & Product API** | **Open Food Facts UK v2** | **`£0.00 / mo`** *(zero API key required)* | **`£0.00 / mo`** *(zero API key required)* | 100% Free |
| **6. Wholesale Trade Accounts** | **Qogita UK / Booker Aston / Bestway** | **`£0.00 / mo`** *(free trade signup)* | **`£0.00 / mo`** *(free trade signup)* | 100% Free |
| **7a. Council Food Registration** | **Birmingham City Council** (`gov.uk`) | **`£0.00`** *(100% free statutory form)* | **`£0.00`** *(100% free statutory form)* | Free |
| **7b. UK GDPR Data Protection Fee** | **Information Commissioner's Office (ICO)** | **`£35.00 / yr`** *(Direct Debit; £40 card)* | **`£35.00 / yr`** *(Direct Debit; £40 card)* | Yearly statutory fee |
| **7c. Public/Product Liability Insurance** | *Optional* (only if Guild/halls request stall cover) | *Optional:* `£0` (doorstep handover) or `~£5–£8 / mo` | *Optional:* `£0` (doorstep handover) or `~£5–£8 / mo` | Optional |
| **8. Saturday Hub Supplies (Drop #1)** | 100× Kraft carrier bags + UoB Library A4 flyers | **`~£2.50` flyers** *(+ `~£12–£15` for 100 bags)* | **`~£2.50` flyers** *(+ `~£12–£15` for 100 bags)* | As used (~12p/order) |
| **Fixed Monthly Software Bill** | | **`£0.00 / month`** | **`~£4.00 / month`** | |
| **Bottom-Line Day-1 Cash to Launch** | | **`~£37.50 – £44.00` total** | **`~£41.50 – £48.00` total** | **Under `£45` to start!** |

---

### Detailed Line-by-Line Cost Breakdown & Student Recommendations

#### 1. Web & Database Hosting (Node.js 22 + Built-In SQLite WAL)
Divly packages the React storefront, Express API, Server-Sent Events (`/api/events`), printable flyer (`/flyer.html`), and SQLite database (`data/divly.sqlite`) inside a single lightweight Docker container using under `120 MB` of RAM.
- **Option A — Your Home Proxmox PC (`£0.00/month`):**
  - Run `docker compose up -d --build` inside an Ubuntu/Debian VM or LXC on your existing Proxmox machine and expose port `3000` securely via a free **Cloudflare Tunnel (`cloudflared`)**.
  - **Cost:** **`£0.00/month`** subscription (adds roughly `~£1–£2/month` in idle electricity). Bonus: no router port-forwarding needed, works cleanly behind university/residential NAT, and includes free Cloudflare HTTPS + DDoS protection.
- **Option B — Managed Cloud (`~£4.00/month`):**
  - **Railway Hobby (`$5/mo` ≈ `£4.00/month`):** Includes `$5` of monthly compute + persistent `/app/data` Volume usage (`railway.json` is already configured in this repo). Best "set-and-forget" option if your home Wi-Fi or power ever drops during Wednesday `23:59` cutoff!
  - **Render Starter (`$7/mo` ≈ `£5.60/month`):** Uses `render.yaml` Blueprint in this repo with a `1 GB` persistent disk mounted at `/app/data` (note: Render's `$0` free tier wipes local disks on restart, so always use a persistent disk/volume for SQLite!).
  - **Fly.io (`~£2.00–£4.00/month`):** Single shared-CPU Amsterdam/London (`lhr`) machine + `1 GB` persistent volume.

#### 2. Custom Domain Name (`£0.00` Year 1 or `~£5.00–£7.50/year`)
- **Clean UK Brand (`.co.uk` / `.uk`):** **`~£5.00–£7.50/year`** via **Cloudflare Registrar** (at-cost wholesale pricing, zero renewal markup) or **Porkbun** — e.g. `divly.co.uk` or `uobdivly.co.uk`.
- **Free Year-1 Student Hack (`£0.00`):** Verify your `@student.bham.ac.uk` address on the **[GitHub Student Developer Pack](https://education.github.com/pack)** to claim a **`£0.00` first-year `.me` or `.tech` domain** (e.g. `divly.me` or `getdivly.tech`) via Namecheap / `.TECH` Domains!

#### 3. Card, Apple Pay & Google Pay Processing — Stripe UK (`£0.00/month`)
- **Monthly Fee:** **`£0.00/month`**. You never pay a penny unless a student actually completes payment.
- **Per-Transaction Fee:**
  - **UK Visa, Mastercard, Apple Pay & Google Pay:** **`1.5% + £0.20`** per successful checkout (e.g. on a typical `£10.00` student basket, Stripe takes `£0.35` and deposits `£9.65` straight into your UK bank account).
  - **International Cards (EU / Non-UK international students):** **`2.5% + £0.20`** (`+2%` only if currency conversion is required).
- **How Refunds & Small-Order Fees Protect Your Margin:**
  - **Auto-Refunds:** Stripe charges **no extra refund fee** when Divly issues an automatic partial or full refund at the Wednesday cutoff (Stripe simply keeps the original `1.5% + 20p` processing fee, which is why Divly's **Almost-Full Closer Bonus** and **Smart Buy-Ahead Predictor** focus traffic into locking full boxes!).
  - **Built-In `20p` Fee Shield:** Divly charges a configurable **`£0.50` small-order hub fee** on baskets under **`£8.00`** (`smallOrderFeePence = 50`, `freeDeliveryThresholdPence = 800`). That `50p` fee **automatically covers Stripe's `£0.20` fixed charge** and leaves `+30p` toward your Kraft bag — so a student testing Divly with a single `£3.20` noodle pack never makes you lose money!

#### 4. University Email Verification OTPs — Resend (`£0.00/month`)
- **Free Tier (`£0.00/month`):** **`3,000` emails/month** (`100` emails/day).
- Because Divly keeps verified students signed in for **30 days** via secure hashed session tokens, students don't request an OTP every time they open the page — `3,000` emails/month easily supports **hundreds of UoB orders per week** for free.
- **Paid Pro (`$20/mo` ≈ `£16/month`):** Only needed once you outgrow `3,000` login emails/month (at which point Divly is already generating hundreds of pounds in weekly gross profit).

#### 5. Live UK Product & Barcode Catalog API — Open Food Facts UK v2 (`£0.00/month`)
- **`£0.00/month`** — 100% free, open-data UK grocery & EAN-13 barcode API (`uk.openfoodfacts.org/api/v2/search`). Zero API key, zero rate-limit bill, works immediately inside **Admin → Products → Import from Live UK Wholesale / Barcode API**.

#### 6. Wholesale Bulk Purchasing Accounts (`£0.00/month`)
- **Qogita UK (`qogita.com`):** **`£0.00/month`** free B2B buyer registration (delivered wholesale cases/pallets to your storage address + optional free `QOGITA_API_KEY` integration).
- **Booker Wholesale Aston** (*Lichfield Rd, Birmingham B6 5RQ* — ~15 mins from campus) & **Bestway Wholesale Birmingham:** **`£0.00/month`** free trade cash-and-carry membership (register online as a Sole Trader with photo ID + bank statement/council registration confirmation).
- **Costco Trade Membership *(Optional)*:** **`£26.40/year` inc. VAT** (`£22 + VAT`). **Skip this on Day 1** — Booker, Bestway, and Qogita cost `£0` to join and stock all core ambient student staples.

#### 7. UK Legal & Statutory Registrations
- **Birmingham City Council Food Business Registration:** **`£0.00` (100% free statutory online form)** at [gov.uk/food-business-registration](https://www.gov.uk/food-business-registration). Because you only distribute **100% factory-sealed, pre-packed ambient manufacturer multipacks** (zero open food handling, zero decanting, zero chilled/frozen food), compliance is minimal and completely free.
- **UK ICO Data Protection Fee (UK GDPR):** **`£40.00/year`** — reduced to **`£35.00/year` if paid by Direct Debit** at [ico.org.uk/for-organisations/data-protection-fee](https://ico.org.uk/for-organisations/data-protection-fee/). Any UK business storing customer names, `@student.bham.ac.uk` emails, and order records commercially pays the Tier 1 micro-business statutory fee.
- **Public & Product Liability Insurance *(Optional at Launch)*:** **`~£5.00–£8.00/month`** (`~£60–£95/year` via UK market-trader / micro-retailer insurers like CMTIA or Simply Business). Not legally mandatory for private pre-arranged hall forecourt handovers, **unless** the UoB Guild of Students or University accommodation team specifically requests a £2m–£5m certificate to host an official campus stall.

#### 8. Physical Saturday Hub Supplies + Week-1 Cashflow Tip
- **Brown Kraft Paper Carrier Bags (Twisted Handles):** **`~£0.12–£0.15 per bag`** (`~£12–£15` for a pack of 100 medium strong Kraft bags on Amazon UK or Nisbets). You don't even need to buy 100 bags before Wednesday's cutoff — wait until your first orders lock, or grab a 25-pack first!
- **A4 Hall Kitchen Flyers (`/flyer.html`):** **`~£2.00–£5.00`** printed in colour at the UoB Main Library print stations (`30–50` sheets for Shackleton, Chamberlain, Maple Bank, Tennis Courts & Selly Oak kitchens).
- **Important Week-1 Stripe Payout Timing Tip:** Students pay **upfront before Wednesday `23:59`**, so your wholesale shopping run is 100% backed by confirmed student orders. However, **Stripe's very first payout on a brand-new UK account takes 7 calendar days** to clear into your bank account (after Week 1, UK payouts drop to **3 business days**). Keep **`~£60–£100` of temporary working float** in your personal account on Thursday of Week 1 to pay Booker/Bestway at the till while Stripe's first payout is in transit!

> ### Bottom Line: Day-1 Cash Needed to Launch = **Under `£45` Total**
> - **Bootstrapper (`£0/mo` Proxmox + Free GitHub Student Domain + `£35` ICO Direct Debit + `£3` Library Flyers + first 25 Kraft bags `~£5`):** **`~£43.00` Day-1 cash**, **`£0.00/month` fixed software cost**.
> - **Managed Cloud (`£4/mo` Railway + `£5.50` `.co.uk` Domain + `£35` ICO Direct Debit):** **`~£44.50` Day-1 cash** (or ~`£57` once you order a bulk 100-pack of Kraft bags for Thursday packing).

---

## Part 2 — 30-Minute Setup Checklist Before Taking Real Student Money

Follow these **5 exact steps** in order before sharing your live link in UoB WhatsApp chats. Total setup time is **~30 minutes**.

---

### Step 1: Generate Your Production Secrets (`.env`) — *5 Minutes*

Never use development defaults on the public internet. In fact, when `NODE_ENV=production`, **Divly's backend automatically blocks the default `uob-admin-2026` dev PIN with a `503` security error** until you configure a real `ADMIN_PIN`!

1. Open your terminal and generate a cryptographically random 64-character `QR_HMAC_SECRET` (this signs every student's `DV1.<orderId>.<nonce>.<sig>` Saturday pickup QR pass and hashes 6-digit OTPs):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Copy `.env.example` to `.env` (or prepare these exact variables for Railway / Render) and fill in your production values:
   ```dotenv
   NODE_ENV=production
   PORT=3000
   SQLITE_PATH=/app/data/divly.sqlite

   # Your live HTTPS domain (locks CORS in production & sets Stripe return URLs — no trailing slash!)
   PUBLIC_BASE_URL=https://yourdomain.co.uk

   # Strong 12+ character passphrase for Admin -> PIN Login (NEVER leave as uob-admin-2026!)
   ADMIN_PIN=change-me-to-a-strong-16-char-passphrase

   # Comma-separated emails automatically granted Admin access on OTP login
   ADMIN_EMAILS=your.name@student.bham.ac.uk

   # Paste the 64-char hex output from the `node -e` command above
   QR_HMAC_SECRET=paste_your_64_char_random_hex_here

   # CRITICAL: Must be `false` so 1-click Demo Login & simulated test checkout are strictly disabled!
   ALLOW_DEV_LOGIN=false

   # Filled in Step 2 (Stripe UK) & Step 3 (Resend) below:
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   RESEND_API_KEY=re_...
   EMAIL_FROM="Divly UoB <login@yourdomain.co.uk>"
   ```

---

### Step 2: Connect Stripe UK (Cards, Apple Pay, Google Pay & Auto-Refunds) — *10 Minutes*

Apple Pay on iPhone and Google Pay on Android convert **3× faster** in student kitchens than typing 16-digit debit card numbers.

1. **Activate Your Stripe UK Account:**
   - Sign up at [dashboard.stripe.com](https://dashboard.stripe.com) and complete **Activate payments** choosing **Individual / Sole Trader** (United Kingdom).
   - Enter your UK sort code + account number, your student address, and verify your passport/driving licence (takes ~3 minutes). Make sure the top-right **Test mode** toggle is switched **OFF** once verified.
2. **Copy Your Live Secret Key (`STRIPE_SECRET_KEY`):**
   - Go to **Developers → API keys** → click **Reveal live key** next to *Secret key* (`sk_live_...`) and paste it into `STRIPE_SECRET_KEY`.
3. **Add the Checkout Webhook (`STRIPE_WEBHOOK_SECRET`):**
   - Go to **Developers → Webhooks → Add endpoint**.
   - **Endpoint URL:** `https://yourdomain.co.uk/api/webhooks/stripe`
   - Click **Select events** → search and tick **`checkout.session.completed`** → click **Add endpoint**.
   - On the newly created webhook page, click **Reveal** under **Signing secret** (`whsec_...`) and paste it into `STRIPE_WEBHOOK_SECRET`.
4. **Enable Apple Pay & Google Pay in 2 Clicks:**
   - Go to **Settings → Payment methods** → verify **Cards**, **Apple Pay**, and **Google Pay** all say **Active**.
   - Go to **Settings → Payment method domains → Add a new domain** → enter `yourdomain.co.uk` → click **Add and verify** (Stripe Checkout hosts the payment page, and verifying your domain ensures smooth wallet handoffs).
   - *Note on Auto-Refunds:* You don't need any extra setup for cutoff refunds — Divly automatically calls `stripe.refunds.create()` using `STRIPE_SECRET_KEY` whenever an overflow slot is refunded at cutoff!

---

### Step 3: Connect Resend for `@student.bham.ac.uk` OTP Emails — *5 Minutes*

University of Birmingham student mailboxes (`@student.bham.ac.uk`) run on **Microsoft 365 (Outlook)**, which quarantines unverified sender domains. Setting `SPF` + `DKIM` makes your 6-digit login codes land in Primary inbox in **under 3 seconds**.

1. Create a free account at [resend.com](https://resend.com) → go to **Domains → Add Domain** → enter `yourdomain.co.uk` (choose **EU `eu-west-1` Ireland** region for lowest UK latency).
2. Copy the DNS records Resend shows (`SPF` `TXT`, `DKIM` `TXT`, and `MX` bounce record) into your **Cloudflare / Porkbun DNS** tab (*keep Cloudflare's orange proxy cloud switched **OFF / DNS Only** on email records*), then click **Verify DNS Records** in Resend until status turns green **`Verified`**.
3. Go to **API Keys → Create API Key** (*Permission: Sending access*, restricted to `yourdomain.co.uk`), copy `re_...` into `RESEND_API_KEY`, and set:
   ```dotenv
   EMAIL_FROM="Divly UoB <login@yourdomain.co.uk>"
   ```

---

### Step 4: Deploy Live (Pick Option A or Option B) — *5 Minutes*

> **Golden Rule of SQLite in Production:** Always mount `/app/data` to a persistent volume so `divly.sqlite` (your users, live pools, wallet credits & orders) stays intact whenever you push code updates!

#### Option A: Railway 1-Click Cloud Deploy (`~£4/month`)
1. Push this repository to a **private** GitHub repo.
2. Open [railway.com](https://railway.com) → **New Project → Deploy from GitHub repo** → select your repo (`railway.json` automatically configures the `Dockerfile` build and `/api/state` healthcheck).
3. **Attach Persistent SQLite Storage:** Right-click your Divly service card on the Railway canvas → **Attach Volume** → set **Mount Path** to **`/app/data`**.
4. Open the **Variables** tab → click **RAW Editor** → paste your production `.env` variables from Step 1.
5. Open **Settings → Networking → Custom Domain** → enter `yourdomain.co.uk` and add the `CNAME` record in your DNS provider. Wait ~60 seconds for automatic SSL!
   *(Prefer Render? Go to `dashboard.render.com/blueprints`, connect your repo, and `render.yaml` automatically provisions Docker + a `1 GB` disk at `/app/data`.)*

#### Option B: Home Proxmox PC + Free Cloudflare Tunnel (`£0/month`)
1. SSH into an Ubuntu/Debian VM (or Docker-enabled LXC) on your Proxmox server, clone your private GitHub repo, and create `.env` with your Step 1 secrets:
   ```bash
   git clone https://github.com/YOUR_USERNAME/divly.git && cd divly
   nano .env                  # Paste your production .env from Step 1
   docker compose up -d --build
   ```
   *(Look at `docker-compose.yml` — it already mounts the persistent `divly_sqlite_data:/app/data` named volume and sets `restart: unless-stopped`!)*
2. Connect your domain for `£0` via **Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel (`Cloudflared`)**:
   - Install the 1-line `cloudflared service install <TOKEN>` command on your VM.
   - Add a **Public Hostname**: `yourdomain.co.uk` → Service **`HTTP`** → URL **`localhost:3000`**.
   - Your Proxmox server is now live worldwide over HTTPS with zero home port-forwarding!

---

### Step 5: Pre-Launch Admin Setup & `£1` Live Smoke Test — *5 Minutes in Browser*

Before posting your referral link or pinning flyers in Shackleton, spend 5 minutes verifying everything end-to-end:

- [ ] **1. Verify Production Lockdown:** Open `https://yourdomain.co.uk` in an incognito window. Confirm there are **no** `Demo Student / Demo Admin` buttons in the navbar (`ALLOW_DEV_LOGIN=false`).
- [ ] **2. Log Into Admin:** Click **Sign In → Admin PIN** (or navigate to the **Admin** tab after logging in with your `ADMIN_EMAILS` address) and sign in with your new strong `ADMIN_PIN`.
- [ ] **3. Curate 6–8 Drop #1 Essentials:** In **Admin → Products**, keep **only 6–8 ultra-high-demand items** active for Drop #1 (e.g. *Shin Ramyun 5-packs, Indomie 10-packs, 5kg Basmati Rice, Oatly Barista 3×1L, Monster Ultra 6-packs, 9-roll Toilet Tissue, Fairy Non-Bio*). Fewer SKUs = faster `100%` locked boxes in Week 1!
- [ ] **4. Set Your First Cutoff & Hub Window:** In **Admin → Hub & Fee Settings**, set your pickup location (e.g. *The Vale · Shackleton Forecourt*), pickup window (*Sat 12:00–15:00*), and set `cutoffAtIso` to this coming **Wednesday at `23:59`**. Click **Save Settings**.
- [ ] **5. Run 1 Real `£1` Live Order + QR Scan Test:**
  1. Temporarily create or edit a test item at `£1.00` (with free pickup or normal fee), open `https://yourdomain.co.uk` on your phone, and sign in with your `@student.bham.ac.uk` email to confirm your Resend 6-digit OTP arrives cleanly.
  2. Pay via **Apple Pay / Google Pay** on Stripe Checkout and confirm you land back on Divly with an active **`DV1...` QR Pickup Pass** + 6-digit PIN under **My Orders** (`paid_pooling`).
  3. Open **Admin → Pickup Scanner** on your laptop/phone, tap **📷 Start Camera QR Scan**, and scan your phone's QR pass to confirm instant `HMAC-SHA256` verification works! *(Refund your `£1` test order in the Stripe Dashboard afterwards and hide the test item.)*
- [ ] **6. Test 1-Click Backup & Print Your Flyers:**
  1. In **Admin**, click **💾 Download DB Backup** once so you know where your weekly Wednesday pre-cutoff JSON snapshots save.
  2. Open **`https://yourdomain.co.uk/flyer.html`** in Chrome, press `Ctrl+P` / `Cmd+P` (*Destination: Print / Save as PDF, Paper size: A4, Background graphics: ON*), and print 30–50 posters at the UoB Main Library!

You are now **100% ready to take real student orders** at the University of Birmingham. Next stop: follow Days 7–14 in **[`LAUNCH_IN_14_DAYS.md`](./LAUNCH_IN_14_DAYS.md)**!
