import { getSessionUser, json } from "../../_lib/auth.js";
import { newId } from "../../_lib/db.js";

function assemble(rows) {
  return rows.map(e => ({
    id: e.id,
    tender_number: e.tender_number,
    tender_title: e.tender_title,
    tender_category: e.tender_category,
    bidder_name: e.bidder_name,
    tender_issuance_date: e.tender_issuance_date,
    bid_closing_date: e.bid_closing_date,
    contract_document_ref: e.contract_document_ref,
    clause_article_ref: e.clause_article_ref,
    original_clause_wording: e.original_clause_wording,
    initial_proposed_wording: e.initial_proposed_wording,
    is_fast_track: !!e.is_fast_track,
    referenced_precedent_id: e.referenced_precedent_id,
    fast_track_legal_notified_at: e.fast_track_legal_notified_at,
    fast_track_auto_approve_deadline: e.fast_track_auto_approve_deadline,
    fast_track_legal_objected: !!e.fast_track_legal_objected,
    approval_status: e.approval_status,
    approved_by: e.approved_by,
    approval_date: e.approval_date,
    negotiation_status: e.negotiation_status,
    legal_consent_given: !!e.legal_consent_given,
    legal_consent_date: e.legal_consent_date,
    reuse_scope: e.reuse_scope,
    loggedBy: e.logged_by,
    negotiation_rounds: []
  }));
}

async function attachRounds(env, exceptions) {
  if (exceptions.length === 0) return exceptions;
  const ids = exceptions.map(e => e.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT * FROM exception_negotiation_rounds WHERE exception_id IN (${placeholders}) ORDER BY round_no`
  ).bind(...ids).all();
  exceptions.forEach(e => {
    e.negotiation_rounds = results
      .filter(r => r.exception_id === e.id)
      .map(r => ({ round_no: r.round_no, proposed_by: r.proposed_by, wording_text: r.wording_text, date: r.date, communicated_by: r.communicated_by }));
  });
  return exceptions;
}

// Auto-resolves a pending fast-track once its objection window has passed
// with no Legal objection (buildspec: no action within the window -> system
// auto-accepts). No background job here, so it's applied lazily on every
// list read, same as the old client-side check used to run on every render.
async function autoApproveExpiredFastTracks(env) {
  await env.DB.prepare(`
    UPDATE exceptions
    SET approval_status = 'Accepted', approved_by = 'System (auto-approved)', approval_date = date('now')
    WHERE is_fast_track = 1 AND fast_track_legal_objected = 0 AND approval_status = 'Pending'
      AND fast_track_auto_approve_deadline IS NOT NULL AND fast_track_auto_approve_deadline < date('now')
  `).run();
}

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });

  await autoApproveExpiredFastTracks(env);
  const { results } = await env.DB.prepare("SELECT * FROM exceptions ORDER BY id DESC").all();
  return json({ exceptions: await attachRounds(env, assemble(results)) });
}

const FAST_TRACK_WINDOW_DAYS = 2;

// Logging a new exception is open to any authenticated user — same
// reasoning as Clarification: roles are Admin-configurable now, so gating
// creation on specific hardcoded role names is fragile (and broke once
// already when Procurement Officer was deleted). The decide/negotiate/
// consent actions in [id].js stay role-gated since those really are
// segregation-of-duties steps, not just a logging permission.
export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const {
    tender_number, tender_title, tender_category, bidder_name, tender_issuance_date, bid_closing_date,
    contract_document_ref, clause_article_ref, original_clause_wording, initial_proposed_wording,
    referenced_precedent_id
  } = body;

  if (!tender_number || !bidder_name || !clause_article_ref || !original_clause_wording || !initial_proposed_wording) {
    return json({ error: "tender_number, bidder_name, clause_article_ref, original_clause_wording, and initial_proposed_wording are required." }, { status: 400 });
  }

  const isFastTrack = !!referenced_precedent_id;
  const today = new Date().toISOString().slice(0, 10);
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + FAST_TRACK_WINDOW_DAYS);
  const id = newId("EXC");

  await env.DB.prepare(`
    INSERT INTO exceptions (
      id, tender_number, tender_title, tender_category, bidder_name, tender_issuance_date, bid_closing_date,
      contract_document_ref, clause_article_ref, original_clause_wording, initial_proposed_wording,
      is_fast_track, referenced_precedent_id, fast_track_legal_notified_at, fast_track_auto_approve_deadline,
      fast_track_legal_objected, approval_status, negotiation_status, legal_consent_given, logged_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Pending', ?, 0, ?)
  `).bind(
    id, tender_number, tender_title || "", tender_category || "", bidder_name, tender_issuance_date || "", bid_closing_date || "",
    contract_document_ref || "", clause_article_ref, original_clause_wording, initial_proposed_wording,
    isFastTrack ? 1 : 0, isFastTrack ? referenced_precedent_id : null,
    isFastTrack ? today : "", isFastTrack ? deadline.toISOString().slice(0, 10) : "",
    isFastTrack ? "Closed" : "Open", user.name
  ).run();

  return json({
    id, tender_number, tender_title, tender_category, bidder_name, tender_issuance_date, bid_closing_date,
    contract_document_ref, clause_article_ref, original_clause_wording, initial_proposed_wording,
    is_fast_track: isFastTrack, referenced_precedent_id: isFastTrack ? referenced_precedent_id : null,
    fast_track_legal_notified_at: isFastTrack ? today : "", fast_track_auto_approve_deadline: isFastTrack ? deadline.toISOString().slice(0, 10) : "",
    fast_track_legal_objected: false, approval_status: "Pending", approved_by: "", approval_date: "",
    negotiation_status: isFastTrack ? "Closed" : "Open", legal_consent_given: false, legal_consent_date: "",
    reuse_scope: null, loggedBy: user.name, negotiation_rounds: []
  }, { status: 201 });
}
