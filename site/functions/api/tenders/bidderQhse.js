import { getSessionUser, requireAdmin, json } from "../../_lib/auth.js";
import { requireRole } from "../../_lib/db.js";
import { PERMISSIONS } from "../../_lib/roles.js";
import { getValidityConfig, addMonths } from "../../_lib/validityStore.js";

export async function onRequestPut({ request, env, params }) {
  const user = await getSessionUser(request, env);

  const { tenderNumber, bidderId } = params;
  const existing = await env.DB.prepare("SELECT * FROM qhse_assessments WHERE bidder_id = ?").bind(bidderId).first();
  if (!existing) return json({ error: "Bidder not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));

  // Admin-only: clears a finalized assessment (used by Supplier Validity's
  // delete-entry action) — a cleanup action, not a QHSE rating edit.
  if (body.clearFinalized) {
    if (!requireAdmin(user)) return json({ error: "Admin access required." }, { status: 403 });
    await env.DB.prepare("UPDATE qhse_assessments SET finalized_at = NULL, validity_end_date = NULL WHERE bidder_id = ?").bind(bidderId).run();
    return json({ ok: true });
  }

  const denied = requireRole(user, PERMISSIONS.tendersQHSE);
  if (denied) return denied;

  if (body.ratings !== undefined) {
    await env.DB.prepare("DELETE FROM qhse_ratings WHERE bidder_id = ?").bind(bidderId).run();
    const entries = Object.entries(body.ratings || {}).filter(([, v]) => v !== null && v !== "");
    for (const [qNo, rating] of entries) {
      await env.DB.prepare("INSERT INTO qhse_ratings (bidder_id, question_no, rating) VALUES (?, ?, ?)").bind(bidderId, qNo, Number(rating)).run();
    }
  }

  if (body.finalize) {
    const bidder = await env.DB.prepare("SELECT vendor_id FROM tender_bidders WHERE bidder_id = ?").bind(bidderId).first();
    if (!bidder || !bidder.vendor_id) {
      return json({ error: "This bidder isn't linked to a vendor — validity tracking needs a vendor link, so it can't be finalized." }, { status: 400 });
    }
    const cfg = await getValidityConfig(env);
    const finalizedAt = new Date().toISOString().slice(0, 10);
    const validityEnd = addMonths(finalizedAt, cfg.qhse_validity_months);
    await env.DB.prepare(
      "UPDATE qhse_assessments SET finalized_at = ?, validity_end_date = ?, vendor_id = ?, source_tender_number = ? WHERE bidder_id = ?"
    ).bind(finalizedAt, validityEnd, bidder.vendor_id, tenderNumber, bidderId).run();
  }

  const [updated, ratingRows] = await Promise.all([
    env.DB.prepare("SELECT * FROM qhse_assessments WHERE bidder_id = ?").bind(bidderId).first(),
    env.DB.prepare("SELECT * FROM qhse_ratings WHERE bidder_id = ?").bind(bidderId).all().then(r => r.results)
  ]);
  const ratings = {};
  ratingRows.forEach(r => { ratings[r.question_no] = r.rating; });

  return json({
    contractor_name: updated.contractor_name, contractor_address: updated.contractor_address,
    contract_title: updated.contract_title, contractor_representative: updated.contractor_representative,
    submission_date: updated.submission_date, contract_holder_name: updated.contract_holder_name,
    contract_holder_signoff_date: updated.contract_holder_signoff_date, qhse_advisor_name: updated.qhse_advisor_name,
    qhse_advisor_signoff_date: updated.qhse_advisor_signoff_date, justifications: updated.justifications,
    vendor_id: updated.vendor_id, source_tender_number: updated.source_tender_number,
    finalized_at: updated.finalized_at, validity_end_date: updated.validity_end_date,
    reusedFromTender: updated.reused_from_tender, ratings
  });
}
