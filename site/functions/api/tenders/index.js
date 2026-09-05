import { getSessionUser, json } from "../../_lib/auth.js";
import { requireRole } from "../../_lib/db.js";
import { PERMISSIONS } from "../../_lib/roles.js";

// Assembles the fully-nested shape the frontend has always worked with
// (assets/app.js -> PGP.TenderEval reads tender.financialThreshold,
// bidder.complianceResponses, bidder.qhse.ratings, bidder.financial.statements/
// riskFlags, bidder.icv.*) from the normalized D1 tables in
// migrations/0002_module_data.sql. Field names are kept exactly as the
// frontend already expects (some camelCase, some snake_case) so page logic
// doesn't need to change, only where it fetches/persists from.
async function assembleTenders(env) {
  const [
    tendersRows, criteriaRows, biddersRows, complianceRows,
    qhseRows, qhseRatingRows, financialRows, statementRows, riskFlagRows, icvRows
  ] = await Promise.all([
    env.DB.prepare("SELECT * FROM tenders ORDER BY created_at DESC").all().then(r => r.results),
    env.DB.prepare("SELECT * FROM criteria ORDER BY sequence_no").all().then(r => r.results),
    env.DB.prepare("SELECT * FROM tender_bidders").all().then(r => r.results),
    env.DB.prepare("SELECT * FROM compliance_responses").all().then(r => r.results),
    env.DB.prepare("SELECT * FROM qhse_assessments").all().then(r => r.results),
    env.DB.prepare("SELECT * FROM qhse_ratings").all().then(r => r.results),
    env.DB.prepare("SELECT * FROM financial_assessments").all().then(r => r.results),
    env.DB.prepare("SELECT * FROM financial_statements").all().then(r => r.results),
    env.DB.prepare("SELECT * FROM financial_risk_flags").all().then(r => r.results),
    env.DB.prepare("SELECT * FROM icv_submissions").all().then(r => r.results)
  ]);

  function buildBidder(row) {
    const qhseRow = qhseRows.find(q => q.bidder_id === row.bidder_id);
    const ratings = {};
    qhseRatingRows.filter(r => r.bidder_id === row.bidder_id).forEach(r => { ratings[r.question_no] = r.rating; });

    const financialRow = financialRows.find(f => f.bidder_id === row.bidder_id);
    const statements = statementRows
      .filter(s => s.bidder_id === row.bidder_id)
      .map(s => ({
        year: s.year, revenue: s.revenue, gross_profit: s.gross_profit, net_profit_loss: s.net_profit_loss,
        total_assets: s.total_assets, total_liabilities: s.total_liabilities, total_equity: s.total_equity,
        current_assets: s.current_assets, current_liabilities: s.current_liabilities
      }));
    const riskFlags = riskFlagRows
      .filter(f => f.bidder_id === row.bidder_id)
      .map(f => ({ flag_type: f.flag_type, description: f.description }));

    const icvRow = icvRows.find(i => i.bidder_id === row.bidder_id);
    const complianceResponses = {};
    complianceRows.filter(c => c.bidder_id === row.bidder_id).forEach(c => { complianceResponses[c.criterion_id] = c.response; });

    return {
      bidder_id: row.bidder_id,
      name: row.name,
      vendor_id: row.vendor_id,
      finalRecommendation: row.final_recommendation || "",
      complianceResponses,
      qhse: qhseRow ? {
        contractor_name: qhseRow.contractor_name, contractor_address: qhseRow.contractor_address,
        contract_title: qhseRow.contract_title, contractor_representative: qhseRow.contractor_representative,
        submission_date: qhseRow.submission_date, contract_holder_name: qhseRow.contract_holder_name,
        contract_holder_signoff_date: qhseRow.contract_holder_signoff_date, qhse_advisor_name: qhseRow.qhse_advisor_name,
        qhse_advisor_signoff_date: qhseRow.qhse_advisor_signoff_date, justifications: qhseRow.justifications,
        vendor_id: qhseRow.vendor_id, source_tender_number: qhseRow.source_tender_number,
        finalized_at: qhseRow.finalized_at, validity_end_date: qhseRow.validity_end_date,
        reusedFromTender: qhseRow.reused_from_tender, ratings
      } : { ratings: {} },
      financial: financialRow ? {
        outcome: financialRow.outcome, evaluatorComments: financialRow.evaluator_comments || "",
        vendor_id: financialRow.vendor_id, source_tender_number: financialRow.source_tender_number,
        finalized_at: financialRow.finalized_at, validity_end_date: financialRow.validity_end_date,
        reusedFromTender: financialRow.reused_from_tender, statements, riskFlags
      } : { statements: [], riskFlags: [], outcome: "", evaluatorComments: "" },
      icv: icvRow ? {
        icv_certificate_ref: icvRow.icv_certificate_ref, icv_score_pct: icvRow.icv_score_pct,
        omanised_roles_confirmed: !!icvRow.omanised_roles_confirmed, min_icv_threshold: icvRow.min_icv_threshold
      } : { icv_certificate_ref: "", icv_score_pct: null, omanised_roles_confirmed: false, min_icv_threshold: 60 }
    };
  }

  return tendersRows.map(t => ({
    tender_number: t.tender_number,
    tender_title: t.tender_title,
    issuance_date: t.issuance_date,
    bid_closing_date: t.bid_closing_date,
    category: t.category,
    status: t.status,
    approvalStatus: t.approval_status,
    financialThreshold: t.financial_threshold ? JSON.parse(t.financial_threshold) : {},
    evaluators: t.evaluators ? JSON.parse(t.evaluators) : [],
    criteria: criteriaRows.filter(c => c.tender_number === t.tender_number),
    bidders: biddersRows.filter(b => b.tender_number === t.tender_number).map(buildBidder)
  }));
}

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });
  return json({ tenders: await assembleTenders(env) });
}

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  const denied = requireRole(user, PERMISSIONS.tenders);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const { tender_number, tender_title, issuance_date, bid_closing_date, category } = body;
  if (!tender_number || !tender_title) {
    return json({ error: "tender_number and tender_title are required." }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT tender_number FROM tenders WHERE tender_number = ?").bind(tender_number).first();
  if (existing) return json({ error: `Tender ${tender_number} already exists.` }, { status: 409 });

  const financialThreshold = { min_current_ratio: 1.0, max_debt_to_equity: 2.0, min_net_profit_margin_pct: 0 };
  await env.DB.prepare(`
    INSERT INTO tenders (tender_number, tender_title, issuance_date, bid_closing_date, category, status, approval_status, financial_threshold, evaluators)
    VALUES (?, ?, ?, ?, ?, 'Draft Criteria', 'Not Started', ?, '[]')
  `).bind(tender_number, tender_title, issuance_date || "", bid_closing_date || "", category || "", JSON.stringify(financialThreshold)).run();

  return json({
    tender_number, tender_title, issuance_date, bid_closing_date, category,
    status: "Draft Criteria", approvalStatus: "Not Started", financialThreshold,
    evaluators: [], criteria: [], bidders: []
  }, { status: 201 });
}
