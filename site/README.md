# Petrogas Procurement & Contract Governance Platform

No-build HTML/CSS/JS front end covering the 5 modules from the URD: Tender Evaluation,
Clarification, Exception & Clause Register, Contract Lifecycle, Standard Templates — backed
by Cloudflare Pages Functions + a fully normalized D1 database (`migrations/0001_init.sql`,
`0002_module_data.sql`). Login/user management, Vendors, Templates, Contracts, and
Clarification are fully D1-backed — real, shared, multi-user data, not per-browser storage.
**Tenders and Exceptions are still on the `localStorage` prototype path** (seeded from
`data/*.json`, saved per-browser) — their D1 migration is the next piece of work; the schema
for both already exists in `0002_module_data.sql`, only the API endpoints + frontend wiring
are pending. Don't treat data in those two modules as durable/shared yet.

Built out per `petrogas_platform_buildspec.txt`:

- **Roles** — Admin, Procurement Officer, Category Manager, SME, Contract Holder, Contract
  Engineer, Legal Team Member, HSE Advisor, ICV Coordinator, Finance Evaluator, HOD Finance,
  HOD HSE, HOD Legal, HOD SCM, DOA Approver, Contract Owner, Vendor/Bidder — driving module-
  and sub-module-level permissions (`assets/app.js` → `PERMISSIONS`, mirrored server-side in
  `functions/_lib/roles.js`). An Admin creates accounts and assigns roles from
  `admin-users.html`; everyone else logs in at `login.html`.
- **Tender Evaluation** — each bidder rolls up Compliance, QHSE (10-element questionnaire,
  live-scored), Financial (ratios computed from entered statement line items), and ICV into
  a Master Evaluation View (`assets/app.js` → `TenderEval`). Bidders are linked to a
  persistent Vendor master (`data/vendors.json`, keyed by CR number) — adding a vendor
  already used on another tender offers to reuse its still-valid finalized QHSE/Financial
  assessment (always a confirm prompt, never silent), instead of re-entering it.
- **Clarification** — queries from an Internal Stakeholder, a Bidder, or an External Authority
  (OQ/PDO/PGEP/Other), logged by any authenticated internal user (bidders have no system
  access) and assigned directly to a real user account at creation time (`functions/api/
  clarifications/`) — no role-based routing gate, since roles are Admin-configurable now. The
  assignee gets a notification on their dashboard (`index.html` → "Clarifications Assigned to
  You") and is the only one (besides Admin) who can submit the response; the assignee, the
  original logger, or Admin can close it once answered. SLA-tracked (due date shown as
  Overdue once past-due, unanswered). A response is private to whoever asked — never
  broadcast or published to other bidders.
- **Exception & Clause Register** — two paths: fast-track (cite a Legal-consented precedent in
  scope — Any Bidder / Same Bidder Only / Same Tender Category — Legal gets a 2-day objection
  window and it auto-approves if untouched) or full review (multi-round negotiation, Legal ⇄
  Contract Engineer ⇄ bidder, every round logged). Independent `approval_status`
  (Accepted/Rejected/Countered/Pending) and `negotiation_status` (Open/Closed); precedent
  search distinguishes fast-track-eligible entries from historical-only ones.
- **Contract Lifecycle** — renewal decisions (Renew/Extend/Do Not Renew) and a full
  amendment history per contract. "Expiring Soon" uses the same configurable reminder
  cadence as Supplier Validity below (`PGP.getValidityConfig().reminder_days_before`).
- **Supplier Validity** (`supplier-validity.html`) — the register of every vendor's finalized
  QHSE/Financial assessments and their validity window (Valid/Expired), derived from whatever
  bidder records have been "Finalized" in Tender Evaluation. Validity durations and the
  reminder cadence are admin-editable on the page itself (12-month default — a placeholder
  per the spec's own open item, not a confirmed figure).
- **Templates** — document number + revision (not a bare version string), with a per-template
  usage log against tenders/contracts. Upload/archive is gated by a per-user `template_admin`
  flag (`admin-users.html`), independent of role — not the `Legal Team Member` role itself.

A few rules the spec itself flags as unconfirmed (QHSE acceptance banding, whether a
Financial "Fail" blocks award, the category→department→role routing default) are implemented
with a documented assumption inline — swap in the real rule once Procurement/QHSE/Legal
confirm it.

## Backend (D1) setup

**One-time setup, per environment:**

```
# from inside the site/ folder — creates the D1 database
npx wrangler d1 create petrogas-procurement-db
```

Copy the `database_id` it prints into `wrangler.toml` (`REPLACE_WITH_D1_DATABASE_ID`), then
apply both migrations (0001 = users/sessions, 0002 = vendors/tenders/clarifications/
exceptions/contracts/templates/config — see the module-status note above for which of these
tables already have live API endpoints):

```
npx wrangler d1 migrations apply DB --local     # for local dev
npx wrangler d1 migrations apply DB --remote     # once deployed, against production
```

Optionally load the sample Vendors/Contracts/Templates data (`seed.sql` — the old
`data/vendors.json`/`contracts.json`/`templates.json` content, now inserted into D1 instead;
those JSON files are no longer read by the app for these three modules):

```
npx wrangler d1 execute DB --local  --file=./seed.sql
npx wrangler d1 execute DB --remote --file=./seed.sql
```

**Run locally** (Pages Functions need `wrangler pages dev`, not a plain static server —
`python -m http.server` / `npx serve` won't run the `/api/*` routes or bind D1):

```
npx wrangler pages dev . --d1 DB=petrogas-procurement-db
# then open http://localhost:8788 — it redirects to login.html
```

Open `login.html`: since the `users` table starts empty, it shows a one-time "Create Admin
account" form instead of the login form. That account becomes the first Admin; from then on,
use `admin-users.html` (linked in the sidebar for Admins) to create the rest of the accounts
— each new user gets a generated temporary password shown once on screen, for the Admin to
share out-of-band.

## Deploy to Cloudflare Pages

1. Push this `site/` folder to a Git repo (GitHub/GitLab), or use direct upload.
2. In Cloudflare dashboard: **Workers & Pages → Create → Pages**.
3. **Connect to Git** (recommended) → select the repo → set:
   - Build command: *(none)*
   - Build output directory: `site` (or `/` if `site/` is the repo root)
4. In the Pages project settings, bind the `DB` D1 database (same binding name as
   `wrangler.toml`) under **Settings → Functions → D1 database bindings**.
5. Deploy, then run both `--remote` migrations above once against the production database if
   you haven't already.

Alternatively, direct upload via Wrangler:

```
npx wrangler pages deploy site --project-name petrogas-procurement
```

## Next steps

- Move Tenders and Exceptions off `localStorage` onto D1 — same pattern as
  Vendors/Templates/Contracts/Clarification (`functions/api/<module>/`, `PGP.apiList`/
  `apiCreate`/`apiUpdate`), schema already in `migrations/0002_module_data.sql`. Tenders is the
  most involved (criteria/bidders/QHSE ratings/financial statements/risk flags/ICV all nested).
- Wire up the approval/notification workflows described in the URD (currently static labels only).
- Email delivery for new-user temp passwords (currently shown on-screen only).
- Audit log across all 5 modules (every edit/approval timestamped + attributable) — today
  each table only tracks what's directly relevant to its own workflow (e.g. `changed_by`/
  `changed_at` on amendments), not a unified cross-module log.
