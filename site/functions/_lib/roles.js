// Canonical role list, kept in sync with PGP.ROLES in assets/app.js. Server-side
// validation lives here so a crafted request can't assign a role the UI doesn't offer.
export const ROLES = [
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

// Vendor / Bidder is external and has no login of its own — excluded from the
// roles an Admin can assign to a user account.
export const ASSIGNABLE_ROLES = ROLES.filter(r => r !== "Vendor / Bidder");

// Server-side mirror of the write-permission arrays in PGP.PERMISSIONS
// (assets/app.js) — the frontend guard is UX, this is the real gate now
// that module data is shared in D1. Only the arrays actually checked by a
// Pages Function live here; keep in sync as more modules move to the API.
export const PERMISSIONS = {
  tenders: ["Procurement Officer", "Contract Engineer"],
  contracts: ["Procurement Officer", "Contract Owner"],
  exceptions: ["Contract Engineer", "Procurement Officer", "Legal Team Member"],
  exceptionsDecide: ["Legal Team Member", "HOD Legal", "Category Manager", "DOA Approver"]
};

// Legal is the only side that can object to a fast-track reuse, act as the
// "Legal" side of a full-review round, or grant reuse-as-precedent consent.
export const LEGAL_ROLES = ["Legal Team Member", "HOD Legal"];
