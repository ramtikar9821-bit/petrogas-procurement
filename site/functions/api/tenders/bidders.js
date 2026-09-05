import { getSessionUser, json } from "../../_lib/auth.js";
import { requireRole, newId, runBatch } from "../../_lib/db.js";
import { PERMISSIONS } from "../../_lib/roles.js";

// Accepts the bidder's initial qhse/financial blocks as-is from the client —
// either freshly blank, or a deep copy of a still-valid prior assessment the
// user confirmed reusing (buildspec Section 3.0). The confirm-to-reuse UX
// and the "which vendor has a valid assessment" lookup both stay client-side
// (pure UI decisions); this endpoint only persists whatever block it's given.
export async function onRequestPost({ request, env, params }) {
  const user = await getSessionUser(request, env);
  const denied = requireRole(user, PERMISSIONS.tenders);
  if (denied) return denied;

  const tn = params.tenderNumber;
  const tender = await env.DB.prepare("SELECT tender_title FROM tenders WHERE tender_number = ?").bind(tn).first();
  if (!tender) return json({ error: "Tender not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return json({ error: "name is required." }, { status: 400 });
  const vendorId = body.vendor_id || null;

  const qhse = body.qhse || {};
  const financial = body.financial || {};
  const bidderId = newId("BID");

  const statements = [
    env.DB.prepare("INSERT INTO tender_bidders (bidder_id, tender_number, vendor_id, name, final_recommendation) VALUES (?, ?, ?, ?, '')")
      .bind(bidderId, tn, vendorId, name),
    env.DB.prepare(`
      INSERT INTO qhse_assessments (
        bidder_id, contractor_name, contractor_address, contract_title, contractor_representative, submission_date,
        contract_holder_name, contract_holder_signoff_date, qhse_advisor_name, qhse_advisor_signoff_date, justifications,
        vendor_id, source_tender_number, finalized_at, validity_end_date, reused_from_tender
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      bidderId, qhse.contractor_name || name, qhse.contractor_address || "", qhse.contract_title || tender.tender_title,
      qhse.contractor_representative || "", qhse.submission_date || "", qhse.contract_holder_name || "",
      qhse.contract_holder_signoff_date || "", qhse.qhse_advisor_name || "", qhse.qhse_advisor_signoff_date || "",
      qhse.justifications || "", qhse.vendor_id || null, qhse.source_tender_number || null,
      qhse.finalized_at || null, qhse.validity_end_date || null, qhse.reusedFromTender || null
    ),
    env.DB.prepare(`
      INSERT INTO financial_assessments (bidder_id, outcome, evaluator_comments, vendor_id, source_tender_number, finalized_at, validity_end_date, reused_from_tender)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      bidderId, financial.outcome || "", financial.evaluatorComments || "", financial.vendor_id || null,
      financial.source_tender_number || null, financial.finalized_at || null, financial.validity_end_date || null,
      financial.reusedFromTender || null
    ),
    env.DB.prepare(
      "INSERT INTO icv_submissions (bidder_id, icv_certificate_ref, icv_score_pct, omanised_roles_confirmed, min_icv_threshold) VALUES (?, '', NULL, 0, 60)"
    ).bind(bidderId)
  ];

  Object.entries(qhse.ratings || {}).forEach(([qNo, rating]) => {
    statements.push(env.DB.prepare("INSERT INTO qhse_ratings (bidder_id, question_no, rating) VALUES (?, ?, ?)").bind(bidderId, qNo, Number(rating)));
  });
  (financial.statements || []).forEach(s => {
    statements.push(env.DB.prepare(`
      INSERT INTO financial_statements (statement_id, bidder_id, year, revenue, gross_profit, net_profit_loss, total_assets, total_liabilities, total_equity, current_assets, current_liabilities)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(newId("STM"), bidderId, s.year, s.revenue ?? null, s.gross_profit ?? null, s.net_profit_loss ?? null, s.total_assets ?? null, s.total_liabilities ?? null, s.total_equity ?? null, s.current_assets ?? null, s.current_liabilities ?? null));
  });
  (financial.riskFlags || []).forEach(f => {
    statements.push(env.DB.prepare("INSERT INTO financial_risk_flags (flag_id, bidder_id, flag_type, description) VALUES (?, ?, ?, ?)")
      .bind(newId("FLG"), bidderId, f.flag_type, f.description));
  });

  await runBatch(env, statements);

  return json({
    bidder_id: bidderId, name, vendor_id: vendorId, finalRecommendation: "",
    complianceResponses: {},
    qhse: { ...qhse, ratings: qhse.ratings || {} },
    financial: { statements: financial.statements || [], riskFlags: financial.riskFlags || [], outcome: financial.outcome || "", evaluatorComments: financial.evaluatorComments || "", ...financial },
    icv: { icv_certificate_ref: "", icv_score_pct: null, omanised_roles_confirmed: false, min_icv_threshold: 60 }
  }, { status: 201 });
}
