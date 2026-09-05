import { getSessionUser, requireAdmin, json } from "../../_lib/auth.js";

// Admin-only: cascades through every child table since D1 doesn't enforce
// ON DELETE CASCADE on these foreign keys.
export async function onRequestDelete({ request, env, params }) {
  const user = await getSessionUser(request, env);
  if (!requireAdmin(user)) return json({ error: "Admin access required." }, { status: 403 });

  const tn = params.tenderNumber;
  const existing = await env.DB.prepare("SELECT tender_number FROM tenders WHERE tender_number = ?").bind(tn).first();
  if (!existing) return json({ error: "Tender not found." }, { status: 404 });

  const { results: bidderRows } = await env.DB.prepare("SELECT bidder_id FROM tender_bidders WHERE tender_number = ?").bind(tn).all();
  const bidderIds = bidderRows.map(b => b.bidder_id);

  const statements = [];
  if (bidderIds.length > 0) {
    const placeholders = bidderIds.map(() => "?").join(",");
    statements.push(
      env.DB.prepare(`DELETE FROM compliance_responses WHERE bidder_id IN (${placeholders})`).bind(...bidderIds),
      env.DB.prepare(`DELETE FROM qhse_ratings WHERE bidder_id IN (${placeholders})`).bind(...bidderIds),
      env.DB.prepare(`DELETE FROM qhse_assessments WHERE bidder_id IN (${placeholders})`).bind(...bidderIds),
      env.DB.prepare(`DELETE FROM financial_statements WHERE bidder_id IN (${placeholders})`).bind(...bidderIds),
      env.DB.prepare(`DELETE FROM financial_risk_flags WHERE bidder_id IN (${placeholders})`).bind(...bidderIds),
      env.DB.prepare(`DELETE FROM financial_assessments WHERE bidder_id IN (${placeholders})`).bind(...bidderIds),
      env.DB.prepare(`DELETE FROM icv_submissions WHERE bidder_id IN (${placeholders})`).bind(...bidderIds)
    );
  }
  statements.push(
    env.DB.prepare("DELETE FROM tender_bidders WHERE tender_number = ?").bind(tn),
    env.DB.prepare("DELETE FROM criteria WHERE tender_number = ?").bind(tn),
    env.DB.prepare("DELETE FROM tenders WHERE tender_number = ?").bind(tn)
  );
  await env.DB.batch(statements);

  return json({ ok: true });
}
