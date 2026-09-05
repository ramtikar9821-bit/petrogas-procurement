/* Shared helpers for the Petrogas Procurement & Contract Governance prototype.
   Static-site only: JSON files are seed data; anything added via the "Add" forms
   is merged in and persisted to localStorage in the browser (no backend). */

const PGP = (() => {
  const NAV_ITEMS = [
    { href: "index.html", label: "Dashboard" },
    { href: "tender-evaluation.html", label: "Tender Evaluation" },
    { href: "scope-clarification.html", label: "Clarification" },
    { href: "exceptions.html", label: "Exception & Clause Register" },
    { href: "contracts.html", label: "Contract Lifecycle" },
    { href: "supplier-validity.html", label: "Supplier Validity" },
    { href: "templates.html", label: "Templates" }
  ];

  // Role set — kept in sync with functions/_lib/roles.js (server-side validation
  // for user creation/role assignment lives there). Admin manages accounts;
  // Vendor / Bidder is data, not an actor — it never logs in. Contract Engineer
  // (or Procurement Officer) always acts on a bidder's behalf, per the spec.
  const DEFAULT_ROLES = [
    "Admin",
    "Procurement Officer",
    "Category Manager",
    "SME",
    "Contract Holder",
    "Contract Engineer",
    "Legal Team Member",
    "HSE Advisor",
    "ICV Coordinator",
    "Finance Evaluator",
    "HOD Finance",
    "HOD HSE",
    "HOD Legal",
    "HOD SCM",
    "DOA Approver",
    "Contract Owner",
    "Vendor / Bidder"
  ];

  // Which roles may create a new record (or edit a Tender Evaluation
  // sub-module) in each area. Everyone can view all modules. The spec
  // doesn't pin every one of these down explicitly — where it's silent,
  // the closest-fit owning role from Section 1 is used. HOD Finance/HSE/SCM
  // aren't named as editors anywhere in the spec, so they get view-only for
  // now (same "documented assumption, swap in the real rule later" pattern
  // as the QHSE/financial logic below).
  const PERMISSIONS = {
    tenders: ["Procurement Officer", "Contract Engineer"],
    // Vendor/Bidder has no system access (per spec: bidders never log in) — a
    // clarification or exception is always logged by an internal user on the
    // bidder's behalf, normally Contract Engineer as the intake point.
    clarifications: ["Contract Engineer", "Procurement Officer"],
    // Routing/closing a clarification is an internal admin action, distinct
    // from who's allowed to log the original request.
    clarificationsRoute: ["Procurement Officer"],
    exceptions: ["Contract Engineer", "Procurement Officer", "Legal Team Member"],
    // Approval chain per the spec (Legal -> Category Manager -> DOA Approver);
    // any of these can record a decision in this prototype rather than
    // enforcing the sequence step-by-step. HOD Legal added as a senior
    // legal escalation point.
    exceptionsDecide: ["Legal Team Member", "HOD Legal", "Category Manager", "DOA Approver"],
    contracts: ["Procurement Officer", "Contract Owner"],
    // Not role-gated — see hasPermission("templates"): it's the per-user
    // template_admin flag instead (buildspec Section 7). Kept here only so
    // guardAddButton/error copy has something human-readable to show.
    templates: ["users flagged Template Admin"],
    // Tender Evaluation sub-modules (edit rights; everyone can view):
    tendersCompliance: ["Procurement Officer", "SME"],
    tendersQHSE: ["HSE Advisor"],
    tendersFinancial: ["SME", "Finance Evaluator"],
    tendersICV: ["ICV Coordinator"],
    // Who can edit the shared validity/reminder config (buildspec Section 6:
    // no explicit owner named, so this defaults to the same authority tier
    // as contract admin).
    supplierValidityConfig: ["Category Manager", "Contract Owner", "Procurement Officer"]
  };

  const ROLE_INFO = {
    "Admin": "Creates user accounts and assigns roles. No module-editing rights of its own.",
    "Procurement Officer": "Day-to-day tender, clarification, and contract administration.",
    "Category Manager": "Owns category strategy; approves exceptions; reviews expiring contracts.",
    "SME": "Scores technical bids; answers clarifications.",
    "Contract Holder": "First routing point for technical/contractual clarifications; issues the QHSE questionnaire.",
    "Contract Engineer": "Commercial routing point for clarifications; administers tender criteria and bidders.",
    "Legal Team Member": "Owns the standard clause library; reviews/approves exceptions.",
    "HSE Advisor": "Rates the QHSE questionnaire; owns HSE clarifications.",
    "ICV Coordinator": "Reviews ICV submissions.",
    "Finance Evaluator": "Scores financial bids (ratios/statements).",
    "HOD Finance": "Head of Finance — senior oversight of financial evaluation.",
    "HOD HSE": "Head of HSE — senior oversight of QHSE evaluation.",
    "HOD Legal": "Head of Legal — senior escalation point for exceptions.",
    "HOD SCM": "Head of SCM — senior oversight of procurement/contracts.",
    "DOA Approver": "Approves per Delegation of Authority thresholds.",
    "Contract Owner": "Accountable for a specific contract's performance and renewal decisions.",
    "Vendor / Bidder": "External: no system access. The Contract Engineer logs and relays clarifications/exception requests on their behalf; responses stay private to whoever asked, never broadcast."
  };

  let currentUser = null;

  function getRole() {
    return currentUser ? currentUser.role : null;
  }

  function getUser() {
    return currentUser;
  }

  function hasPermission(moduleKey) {
    // Templates is a narrow per-user flag (buildspec Section 7:
    // "independent of the person's functional role"), not a role-list check.
    if (moduleKey === "templates") return !!(currentUser && currentUser.template_admin);
    const allowed = PERMISSIONS[moduleKey];
    return !allowed || allowed.includes(getRole());
  }

  // Fetches the logged-in user once and caches it for the rest of the page's
  // getRole()/hasPermission() calls (which stay synchronous). Redirects to
  // login.html if there's no valid session. Call this before renderChrome().
  async function initAuth() {
    const res = await fetch("/api/me", { credentials: "same-origin" });
    if (!res.ok) {
      const here = encodeURIComponent(location.pathname + location.search);
      location.href = `login.html?redirect=${here}`;
      return new Promise(() => {}); // never resolves — we're navigating away
    }
    currentUser = await res.json();
    return currentUser;
  }

  function renderChrome(activeHref) {
    const header = document.createElement("header");
    header.className = "sidebar";
    const navItems = currentUser && currentUser.role === "Admin"
      ? [...NAV_ITEMS, { href: "admin-users.html", label: "Manage Users" }]
      : NAV_ITEMS;
    header.innerHTML = `
      <div class="brand"><span class="dot"></span> Petrogas Procurement &amp; Contract Governance</div>
      <nav class="tabs">
        ${navItems.map(i => `<a href="${i.href}" class="${i.href === activeHref ? 'active' : ''}">${i.label}</a>`).join("")}
      </nav>
      <div class="role-switch">
        <label>Logged in as</label>
        <div class="current-user">${escapeHtml(currentUser?.name || "")}</div>
        <div class="current-role">${escapeHtml(currentUser?.role || "")}</div>
        <button type="button" class="secondary" id="logoutBtn">Log out</button>
      </div>
    `;
    document.body.prepend(header);

    header.querySelector("#logoutBtn").addEventListener("click", async () => {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
      location.href = "login.html";
    });

    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.textContent = "Prototype build — for review only. Not connected to a live ERP.";
    document.body.appendChild(footer);
  }

  // Disables + annotates an "add" button if the current role lacks permission for moduleKey.
  function guardAddButton(moduleKey, buttonEl) {
    if (!buttonEl) return;
    const toolbar = buttonEl.closest(".toolbar");
    const existingNote = toolbar?.nextElementSibling;
    if (existingNote?.classList.contains("role-guard-note")) existingNote.remove();

    buttonEl.disabled = false;
    buttonEl.title = "";
    buttonEl.classList.remove("secondary");

    if (hasPermission(moduleKey)) return;

    buttonEl.disabled = true;
    buttonEl.title = `Your role (${getRole()}) doesn't have permission to add records here. Allowed: ${PERMISSIONS[moduleKey].join(", ")}.`;
    buttonEl.classList.add("secondary");
    const note = document.createElement("div");
    note.className = "note-banner role-guard-note";
    note.textContent = `Logged in as ${getRole()} — read-only in this module. Only ${PERMISSIONS[moduleKey].join(", ")} can add records here.`;
    toolbar?.insertAdjacentElement("afterend", note);
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function formatDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function daysUntil(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  // Shared reminder/validity config (buildspec Section 6.2 — "one shared,
  // admin-editable cadence" used by both Contracts and Supplier Validity),
  // now backed by D1 (functions/api/config.js) instead of localStorage so
  // it's shared across users, not per-browser. qhse/financial validity
  // durations are left unset in the spec ("TBC, no fixed default") — 12
  // months is this prototype's placeholder; confirm real figures with
  // Procurement/QHSE.
  //
  // Cached the same way currentUser is (see initAuth): fetched once via
  // initConfig(), then read synchronously everywhere else (contractStatus()
  // is called from many render loops and can't become async without a much
  // larger ripple). Call PGP.initConfig() during a page's init(), alongside
  // initAuth(), before any render that depends on validity/reminder data.
  const DEFAULT_VALIDITY_CONFIG = {
    qhse_validity_months: 12,
    financial_validity_months: 12,
    reminder_days_before: [90, 60, 30]
  };
  let validityConfigCache = null;

  async function initConfig() {
    const res = await fetch("/api/config", { credentials: "same-origin" });
    validityConfigCache = res.ok ? await res.json() : { ...DEFAULT_VALIDITY_CONFIG };
    return validityConfigCache;
  }

  function getValidityConfig() {
    return validityConfigCache || DEFAULT_VALIDITY_CONFIG;
  }

  // Admin-managed role list (functions/api/roles.js), same cache-once/read-sync
  // pattern as validity config above. Falls back to DEFAULT_ROLES until
  // initRoles() resolves, or if the fetch fails. Call PGP.initRoles() during a
  // page's init(), alongside initAuth(), before any render that lists roles.
  let rolesCache = null;

  async function initRoles() {
    const res = await fetch("/api/roles", { credentials: "same-origin" });
    rolesCache = res.ok ? (await res.json()).roles : [...DEFAULT_ROLES];
    return rolesCache;
  }

  function getRoles() {
    return rolesCache || DEFAULT_ROLES;
  }

  async function addRole(role) {
    const res = await fetch("/api/roles", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Couldn't add role.");
    rolesCache = body.roles;
    return rolesCache;
  }

  async function deleteRole(role) {
    const res = await fetch("/api/roles", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, action: "delete" })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Couldn't delete role.");
    rolesCache = body.roles;
    return rolesCache;
  }

  async function setValidityConfig(cfg) {
    const res = await fetch("/api/config", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg)
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save config.");
    validityConfigCache = await res.json();
    return validityConfigCache;
  }

  function addMonths(dateStr, months) {
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  function contractStatus(endDate) {
    const days = daysUntil(endDate);
    const soonThreshold = Math.max(...getValidityConfig().reminder_days_before);
    if (days < 0) return { label: "Expired", cls: "red" };
    if (days <= soonThreshold) return { label: "Expiring Soon", cls: "amber" };
    return { label: "Active", cls: "green" };
  }

  // --- Generic D1-backed module API (replaces localStorage's loadFullList/
  // saveFullList module by module as each one migrates — see the plan's
  // phased rollout). Each Function assembles/accepts the same nested JSON
  // shape the frontend already works with, so page-level business logic
  // doesn't need to change, only where it fetches/persists from. ---

  async function apiList(module) {
    const res = await fetch(`/api/${module}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Couldn't load ${module}.`);
    const body = await res.json();
    // Each list endpoint wraps its array under the module name (e.g. {vendors:[...]})
    return body[module] || body;
  }

  async function apiCreate(module, record) {
    const res = await fetch(`/api/${module}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Couldn't create ${module} record.`);
    return res.json();
  }

  async function apiUpdate(module, id, patch) {
    const res = await fetch(`/api/${module}/${encodeURIComponent(id)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Couldn't update ${module} record.`);
    return res.json();
  }

  // --- Vendor master (buildspec Section 3.0) — D1-backed ---

  async function loadVendors() {
    const vendors = await apiList("vendors");
    return vendors;
  }

  function findVendorByCr(vendors, crNumber) {
    const cr = String(crNumber || "").trim();
    if (!cr) return null;
    return vendors.find(v => v.cr_number === cr) || null;
  }

  // Looks up a vendor by CR number, or creates one server-side (POST
  // /api/vendors is itself a lookup-or-create) — persists immediately so the
  // new vendor is available to other users right away, and keeps the local
  // `vendors` array in sync for the rest of this page's session.
  async function upsertVendor(vendors, { cr_number, vendor_name }) {
    const { vendor } = await apiCreate("vendors", { cr_number, vendor_name });
    const idx = vendors.findIndex(v => v.vendor_id === vendor.vendor_id);
    if (idx === -1) vendors.push(vendor); else vendors[idx] = vendor;
    return vendor;
  }

  // Derives the Supplier Validity Register (buildspec Section 3.0/6.2): scans
  // every tender's bidders for finalized QHSE/Financial assessments, keeps the
  // latest per (vendor_id, assessment_type), and derives Valid/Expired from
  // validity_end_date. Pure function — same data powers supplier-validity.html
  // and the reuse-confirmation check in tender-evaluation.html.
  function computeSupplierValidityRegister(tenders, vendors, config) {
    const latest = new Map(); // key: `${vendor_id}:${type}` -> entry
    tenders.forEach(t => {
      (t.bidders || []).forEach(b => {
        if (!b.vendor_id) return;
        ["qhse", "financial"].forEach(type => {
          const block = b[type];
          if (!block || !block.finalized_at) return;
          const key = `${b.vendor_id}:${type}`;
          const existing = latest.get(key);
          if (!existing || block.finalized_at > existing.finalized_at) {
            latest.set(key, {
              vendor_id: b.vendor_id,
              assessment_type: type === "qhse" ? "QHSE" : "Financial",
              source_tender_number: block.source_tender_number || t.tender_number,
              finalized_at: block.finalized_at,
              validity_end_date: block.validity_end_date
            });
          }
        });
      });
    });
    return Array.from(latest.values()).map(entry => {
      const vendor = vendors.find(v => v.vendor_id === entry.vendor_id);
      const days = daysUntil(entry.validity_end_date);
      return {
        ...entry,
        vendor_name: vendor ? vendor.vendor_name : entry.vendor_id,
        cr_number: vendor ? vendor.cr_number : "—",
        status: days < 0 ? "Expired" : "Valid",
        days_left: days
      };
    }).sort((a, b) => a.days_left - b.days_left);
  }

  async function loadData(jsonPath, storageKey) {
    const res = await fetch(jsonPath);
    const seed = await res.json();
    const extra = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return [...seed, ...extra];
  }

  function saveExtra(storageKey, record) {
    const extra = JSON.parse(localStorage.getItem(storageKey) || "[]");
    extra.push(record);
    localStorage.setItem(storageKey, JSON.stringify(extra));
  }

  // Full-list persistence: for modules where existing records get mutated in place
  // (e.g. clarification routing/responses), not just appended to. First load seeds
  // from JSON and snapshots it to localStorage; every load after that reads the
  // snapshot, so in-place edits stick within this browser.
  async function loadFullList(jsonPath, storageKey) {
    const stored = localStorage.getItem(storageKey);
    if (stored) return JSON.parse(stored);
    const res = await fetch(jsonPath);
    const seed = await res.json();
    localStorage.setItem(storageKey, JSON.stringify(seed));
    return seed;
  }

  function saveFullList(storageKey, list) {
    localStorage.setItem(storageKey, JSON.stringify(list));
  }

  function openModal(id) {
    document.getElementById(id).classList.add("open");
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove("open");
  }

  function currency(n) {
    if (typeof n !== "number") return n;
    return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  // ---------------------------------------------------------------------
  // Tender Evaluation scoring engine (Compliance / QHSE / Financial / ICV
  // rolling up into a Master Evaluation View). Mirrors the build spec in
  // petrogas_platform_buildspec.txt section 3. Two rules there are marked
  // "confirm with Procurement/QHSE Advisor before build" — this prototype
  // picks a concrete interpretation (documented inline) so the workflow is
  // demoable; treat both as configurable once the real rule is confirmed.
  // ---------------------------------------------------------------------
  const TenderEval = (() => {
    const QHSE_RATING_SCALE = {
      1: "Does not meet requirement",
      2: "Some shortfalls",
      3: "Meets requirement",
      4: "Exceeds requirement"
    };

    const QHSE_CLASS_BANDING = [
      { class: "B", min_pct: 76, max_pct: 100, label: "Good" },
      { class: "C", min_pct: 51, max_pct: 75, label: "Satisfactory" },
      { class: "D", min_pct: 26, max_pct: 50, label: "Needs Improvement" },
      { class: "E", min_pct: 0, max_pct: 25, label: "Not Acceptable" }
    ];

    // Assumption (flagged as TBC in the spec): "qualified" means at least
    // min_c_class_count elements reach C-or-better, and D/E counts stay
    // within their caps.
    const QHSE_ACCEPTANCE = { min_c_class_count: 3, max_e_class_count: 1, max_d_class_count: 6 };

    function classFor(pct) {
      return QHSE_CLASS_BANDING.find(b => pct >= b.min_pct && pct <= b.max_pct) || QHSE_CLASS_BANDING[QHSE_CLASS_BANDING.length - 1];
    }

    // qhseQuestions: master list from data/qhse-questions.json
    // ratings: bidder.qhse.ratings, a flat { "1.1": 3, ... } map
    function qhseElementScores(qhseQuestions, ratings) {
      return qhseQuestions.map(el => {
        const nums = el.questions.map(q => Number(ratings?.[q.question_no]) || 0);
        const answered = nums.filter(n => n > 0);
        const avg = answered.length ? answered.reduce((a, b) => a + b, 0) / answered.length : 0;
        const pct = Math.round((avg / 4) * 1000) / 10;
        const cls = classFor(pct);
        return { element_name: el.element_name, pct, class: cls.class, label: cls.label, answered: answered.length, total: el.questions.length };
      });
    }

    function qhseOverallResult(qhseQuestions, ratings) {
      const elementScores = qhseElementScores(qhseQuestions, ratings);
      const totalAnswered = elementScores.reduce((s, e) => s + e.answered, 0);
      if (totalAnswered === 0) {
        return { elementScores, overall_pct: 0, overall_class: null, counts: { B: 0, C: 0, D: 0, E: 0 }, qualified: false, complete: false };
      }
      const overall_pct = Math.round((elementScores.reduce((s, e) => s + e.pct, 0) / elementScores.length) * 10) / 10;
      const overall_class = classFor(overall_pct);
      const counts = { B: 0, C: 0, D: 0, E: 0 };
      elementScores.forEach(e => counts[e.class]++);
      const qualified =
        counts.E <= QHSE_ACCEPTANCE.max_e_class_count &&
        counts.D <= QHSE_ACCEPTANCE.max_d_class_count &&
        (counts.B + counts.C) >= QHSE_ACCEPTANCE.min_c_class_count;
      const complete = elementScores.every(e => e.answered === e.total);
      return { elementScores, overall_pct, overall_class: overall_class.class, overall_label: overall_class.label, counts, qualified, complete };
    }

    // criteria: tender.criteria; responses: bidder.complianceResponses ({criterion_id: "Comply"|"Not Comply"})
    function complianceStatus(criteria, responses) {
      const essential = criteria.filter(c => c.criteria_type === "Essential");
      const answered = essential.filter(c => responses?.[c.criterion_id]);
      const anyFail = essential.some(c => responses?.[c.criterion_id] === "Not Comply");
      const status = anyFail ? "Disqualify" : "Qualify";
      return { status, essentialTotal: essential.length, essentialAnswered: answered.length, complete: answered.length === essential.length };
    }

    function statusColorFor(response) {
      if (response === "Comply") return "Green";
      if (response === "Not Comply") return "Red";
      return "Yellow";
    }

    // statements: bidder.financial.statements (array, any order) -> ratios for the latest year, with YoY vs prior
    function financialRatios(statements) {
      if (!statements || statements.length === 0) return null;
      const sorted = [...statements].sort((a, b) => b.year - a.year);
      const cur = sorted[0];
      const prior = sorted[1];
      const current_ratio = cur.current_liabilities ? cur.current_assets / cur.current_liabilities : null;
      const debt_to_equity = cur.total_equity ? cur.total_liabilities / cur.total_equity : null;
      const net_profit_margin_pct = cur.revenue ? (cur.net_profit_loss / cur.revenue) * 100 : null;
      const revenue_yoy_growth_pct = prior && prior.revenue ? ((cur.revenue - prior.revenue) / prior.revenue) * 100 : null;
      return { year: cur.year, current_ratio, debt_to_equity, net_profit_margin_pct, revenue_yoy_growth_pct };
    }

    // Suggests an outcome from the core (gating) ratios only; debt-to-equity and
    // any risk flags are informational and can downgrade Pass -> Review even
    // when the core ratios clear the threshold (this mirrors the worked example
    // in the build spec, where covenant/going-concern flags route a
    // threshold-passing bidder to Review rather than an automatic Pass).
    function suggestedFinancialOutcome(ratios, threshold, riskFlags) {
      if (!ratios) return null;
      const t = threshold || {};
      const passesCore =
        (t.min_current_ratio == null || ratios.current_ratio == null || ratios.current_ratio >= t.min_current_ratio) &&
        (t.min_net_profit_margin_pct == null || ratios.net_profit_margin_pct == null || ratios.net_profit_margin_pct >= t.min_net_profit_margin_pct);
      if (!passesCore) return "Fail";
      if (riskFlags && riskFlags.length > 0) return "Review";
      return "Pass";
    }

    // icv: bidder.icv
    function icvStatus(icv) {
      if (!icv || icv.icv_score_pct == null) return null;
      const meetsThreshold = icv.min_icv_threshold == null || icv.icv_score_pct >= icv.min_icv_threshold;
      return meetsThreshold && icv.omanised_roles_confirmed ? "Pass" : "Fail";
    }

    // Rolls up Compliance / QHSE / Financial / ICV into one Master Evaluation
    // View per bidder. overall_status rule per spec: Disqualify if compliance
    // = Disqualify OR QHSE = Not Qualified; Financial "Fail" also
    // disqualifies (Review does not); ICV never gates overall_status on its
    // own, only flags it (spec: "confirm rule with procurement before build").
    function masterEvaluationView(tender, bidder, qhseQuestions) {
      const compliance = complianceStatus(tender.criteria, bidder.complianceResponses);
      const qhse = qhseOverallResult(qhseQuestions, bidder.qhse?.ratings);
      const ratios = financialRatios(bidder.financial?.statements);
      const financialOutcome = bidder.financial?.outcome || suggestedFinancialOutcome(ratios, tender.financialThreshold, bidder.financial?.riskFlags);
      const icv = icvStatus(bidder.icv);

      const overall_status =
        compliance.status === "Disqualify" || (qhse.complete && !qhse.qualified) || financialOutcome === "Fail"
          ? "Disqualify"
          : "Qualify";

      return { compliance, qhse, ratios, financialOutcome, icv, overall_status };
    }

    return {
      QHSE_RATING_SCALE, QHSE_CLASS_BANDING, QHSE_ACCEPTANCE,
      classFor, qhseElementScores, qhseOverallResult,
      complianceStatus, statusColorFor,
      financialRatios, suggestedFinancialOutcome, icvStatus,
      masterEvaluationView
    };
  })();

  return {
    NAV_ITEMS, ROLES: DEFAULT_ROLES, ROLE_INFO, PERMISSIONS,
    getRole, getUser, initAuth, hasPermission, guardAddButton,
    renderChrome, escapeHtml, formatDate, daysUntil, contractStatus,
    loadData, saveExtra, loadFullList, saveFullList, openModal, closeModal, currency,
    initConfig, getValidityConfig, setValidityConfig, addMonths,
    initRoles, getRoles, addRole, deleteRole,
    apiList, apiCreate, apiUpdate,
    loadVendors, findVendorByCr, upsertVendor, computeSupplierValidityRegister,
    TenderEval
  };
})();
