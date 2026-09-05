import { getSessionUser, requireAdmin, json } from "../../_lib/auth.js";
import { requireRole, newId } from "../../_lib/db.js";
import { PERMISSIONS } from "../../_lib/roles.js";
import { getValidityConfig, addMonths } from "../../_lib/validityStore.js";

export async function onRequestPut({ request, env, params }) {
  const user = await getSessionUser(request, env);

  const { tenderNumber, bidderId } = params;
  const existing = await env.DB.prepare("SELECT * FROM financial_assessments WHERE bidder_id = ?").bind(bidderId).first();
  if (!existing) return json({ error: "Bidder not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));

  // Admin-only: clears a finalized assessment (used by Supplier Validity's
  // delete-entry action) — a cleanup action, not a financial data edit.
  if (body.clearFinalized) {
    if (!requireAdmin(user)) return json({ error: "Admin access required." }, { status: 403 });
    await env.DB.prepare("UPDATE financial_assessments SET finalized_at = NULL, validity_end_date = NULL WHERE bidder_id = ?").bind(bidderId).run();
    return json({ ok: true });
  }

  const denied = requireRole(user, PERMISSIONS.tendersFinancial);
  if (denied) return denied;

  if (body.statements !== undefined) {
    await env.DB.prepare("DELETE FROM financial_statements WHERE bidder_id = ?").bind(bidderId).run();
    for (const s of body.statements || []) {
      await env.DB.prepare(`
        INSERT INTO financial_statements (statement_id, bidder_id, year, revenue, gross_profit, net_profit_loss, total_assets, total_liabilities, total_equity, current_assets, current_liabilities)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(newId("STM"), bidderId, s.year, s.revenue ?? null, s.gross_profit ?? null, s.net_profit_loss ?? null, s.total_assets ?? null, s.total_liabilities ?? null, s.total_equity ?? null, s.current_assets ?? null, s.current_liabilities ?? null).run();
    }
  }

  if (body.riskFlags !== undefined) {
    await env.DB.prepare("DELETE FROM financial_risk_flags WHERE bidder_id = ?").bind(bidderId).run();
    for (const f of body.riskFlags || []) {
      await env.DB.prepare("INSERT INTO financial_risk_flags (flag_id, bidder_id, flag_type, description) VALUES (?, ?, ?, ?)")
        .bind(newId("FLG"), bidderId, f.flag_type, f.description).run();
    }
  }

  if (body.outcome !== undefined || body.evaluatorComments !== undefined) {
    await env.DB.prepare("UPDATE financial_assessments SET outcome = ?, evaluator_comments = ? WHERE bidder_id = ?")
      .bind(body.outcome !== undefined ? body.outcome : existing.outcome, body.evaluatorComments !== undefined ? body.evaluatorComments : existing.evaluator_comments, bidderId).run();
  }

  if (body.finalize) {
    const bidder = await env.DB.prepare("SELECT vendor_id FROM tender_bidders WHERE bidder_id = ?").bind(bidderId).first();
    if (!bidder || !bidder.vendor_id) {
      return json({ error: "This bidder isn't linked to a vendor — validity tracking needs a vendor link, so it can't be finalized." }, { status: 400 });
    }
    const cfg = await getValidityConfig(env);
    const finalizedAt = new Date().toISOString().slice(0, 10);
    const validityEnd = addMonths(finalizedAt, cfg.financial_validity_months);
    await env.DB.prepare(
      "UPDATE financial_assessments SET finalized_at = ?, validity_end_date = ?, vendor_id = ?, source_tender_number = ? WHERE bidder_id = ?"
    ).bind(finalizedAt, validityEnd, bidder.vendor_id, tenderNumber, bidderId).run();
  }

  const [updated, statementRows, riskFlagRows] = await Promise.all([
    env.DB.prepare("SELECT * FROM financial_assessments WHERE bidder_id = ?").bind(bidderId).first(),
    env.DB.prepare("SELECT * FROM financial_statements WHERE bidder_id = ?").bind(bidderId).all().then(r => r.results),
    env.DB.prepare("SELECT * FROM financial_risk_flags WHERE bidder_id = ?").bind(bidderId).all().then(r => r.results)
  ]);

  return json({
    outcome: updated.outcome, evaluatorComments: updated.evaluator_comments || "",
    vendor_id: updated.vendor_id, source_tender_number: updated.source_tender_number,
    finalized_at: updated.finalized_at, validity_end_date: updated.validity_end_date,
    reusedFromTender: updated.reused_from_tender,
    statements: statementRows.map(s => ({
      year: s.year, revenue: s.revenue, gross_profit: s.gross_profit, net_profit_loss: s.net_profit_loss,
      total_assets: s.total_assets, total_liabilities: s.total_liabilities, total_equity: s.total_equity,
      current_assets: s.current_assets, current_liabilities: s.current_liabilities
    })),
    riskFlags: riskFlagRows.map(f => ({ flag_type: f.flag_type, description: f.description }))
  });
}
