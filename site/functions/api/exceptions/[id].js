import { getSessionUser, requireAdmin, json } from "../../_lib/auth.js";
import { requireRole, newId } from "../../_lib/db.js";
import { PERMISSIONS, LEGAL_ROLES } from "../../_lib/roles.js";

function isLegal(user) {
  return !!user && LEGAL_ROLES.includes(user.role);
}

async function loadOne(env, id) {
  const e = await env.DB.prepare("SELECT * FROM exceptions WHERE id = ?").bind(id).first();
  if (!e) return null;
  const { results } = await env.DB.prepare(
    "SELECT * FROM exception_negotiation_rounds WHERE exception_id = ? ORDER BY round_no"
  ).bind(id).all();
  return {
    id: e.id, tender_number: e.tender_number, tender_title: e.tender_title, tender_category: e.tender_category,
    bidder_name: e.bidder_name, tender_issuance_date: e.tender_issuance_date, bid_closing_date: e.bid_closing_date,
    contract_document_ref: e.contract_document_ref, clause_article_ref: e.clause_article_ref,
    original_clause_wording: e.original_clause_wording, initial_proposed_wording: e.initial_proposed_wording,
    is_fast_track: !!e.is_fast_track, referenced_precedent_id: e.referenced_precedent_id,
    fast_track_legal_notified_at: e.fast_track_legal_notified_at, fast_track_auto_approve_deadline: e.fast_track_auto_approve_deadline,
    fast_track_legal_objected: !!e.fast_track_legal_objected, approval_status: e.approval_status,
    approved_by: e.approved_by, approval_date: e.approval_date, negotiation_status: e.negotiation_status,
    legal_consent_given: !!e.legal_consent_given, legal_consent_date: e.legal_consent_date, reuse_scope: e.reuse_scope,
    loggedBy: e.logged_by,
    negotiation_rounds: results.map(r => ({ round_no: r.round_no, proposed_by: r.proposed_by, wording_text: r.wording_text, date: r.date, communicated_by: r.communicated_by }))
  };
}

// One PUT covering every state-changing action on an exception record —
// approval/negotiation decision, fast-track objection, negotiation rounds,
// and Legal's reuse-as-precedent consent — each gated on the same permission
// its corresponding UI control already enforces client-side.
export async function onRequestPut({ request, env, params }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });

  const existing = await env.DB.prepare("SELECT * FROM exceptions WHERE id = ?").bind(params.id).first();
  if (!existing) return json({ error: "Exception not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const today = new Date().toISOString().slice(0, 10);

  if (body.action === "objectFastTrack") {
    if (!isLegal(user)) return json({ error: `Only ${LEGAL_ROLES.join(", ")} can object to a fast-track reuse.` }, { status: 403 });
    await env.DB.prepare(
      "UPDATE exceptions SET fast_track_legal_objected = 1, is_fast_track = 0, negotiation_status = 'Open' WHERE id = ?"
    ).bind(params.id).run();
    return json(await loadOne(env, params.id));
  }

  if (body.action === "addRound") {
    const allowed = requireRole(user, PERMISSIONS.exceptions) === null || isLegal(user);
    if (!allowed) return json({ error: `Requires one of: ${PERMISSIONS.exceptions.join(", ")}, or Legal.` }, { status: 403 });
    if (existing.negotiation_status !== "Open") return json({ error: "Negotiation is closed for this exception." }, { status: 400 });
    const wording = String(body.wording_text || "").trim();
    if (!wording) return json({ error: "wording_text is required." }, { status: 400 });

    const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM exception_negotiation_rounds WHERE exception_id = ?").bind(params.id).first();
    await env.DB.prepare(
      "INSERT INTO exception_negotiation_rounds (round_id, exception_id, round_no, proposed_by, wording_text, date, communicated_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(newId("RND"), params.id, count + 1, body.proposed_by || "Legal", wording, today, user.name).run();
    return json(await loadOne(env, params.id));
  }

  if (body.approval_status !== undefined) {
    const denied = requireRole(user, PERMISSIONS.exceptionsDecide);
    if (denied) return denied;
    if (!["Pending", "Accepted", "Rejected", "Countered"].includes(body.approval_status)) {
      return json({ error: "Invalid approval_status." }, { status: 400 });
    }
    if (body.approval_status === "Pending") {
      await env.DB.prepare("UPDATE exceptions SET approval_status = 'Pending', approved_by = '', approval_date = '' WHERE id = ?").bind(params.id).run();
    } else {
      await env.DB.prepare("UPDATE exceptions SET approval_status = ?, approved_by = ?, approval_date = ? WHERE id = ?")
        .bind(body.approval_status, user.role, today, params.id).run();
    }
  }

  if (body.negotiation_status !== undefined) {
    const denied = requireRole(user, PERMISSIONS.exceptionsDecide);
    if (denied) return denied;
    if (!["Open", "Closed"].includes(body.negotiation_status)) return json({ error: "Invalid negotiation_status." }, { status: 400 });
    await env.DB.prepare("UPDATE exceptions SET negotiation_status = ? WHERE id = ?").bind(body.negotiation_status, params.id).run();
  }

  if (body.legal_consent_given !== undefined) {
    if (!isLegal(user)) return json({ error: `Only ${LEGAL_ROLES.join(", ")} can grant reuse consent.` }, { status: 403 });
    const given = !!body.legal_consent_given;
    await env.DB.prepare(
      "UPDATE exceptions SET legal_consent_given = ?, legal_consent_date = ?, reuse_scope = ? WHERE id = ?"
    ).bind(given ? 1 : 0, given ? today : "", given ? (existing.reuse_scope || "Any Bidder") : null, params.id).run();
  }

  if (body.reuse_scope !== undefined && body.legal_consent_given === undefined) {
    if (!isLegal(user)) return json({ error: `Only ${LEGAL_ROLES.join(", ")} can set reuse scope.` }, { status: 403 });
    if (!["Any Bidder", "Same Bidder Only", "Same Tender Category"].includes(body.reuse_scope)) {
      return json({ error: "Invalid reuse_scope." }, { status: 400 });
    }
    await env.DB.prepare("UPDATE exceptions SET reuse_scope = ? WHERE id = ?").bind(body.reuse_scope, params.id).run();
  }

  return json(await loadOne(env, params.id));
}

export async function onRequestDelete({ request, env, params }) {
  const user = await getSessionUser(request, env);
  if (!requireAdmin(user)) return json({ error: "Admin access required." }, { status: 403 });

  const existing = await env.DB.prepare("SELECT id FROM exceptions WHERE id = ?").bind(params.id).first();
  if (!existing) return json({ error: "Exception not found." }, { status: 404 });

  await env.DB.prepare("DELETE FROM exception_negotiation_rounds WHERE exception_id = ?").bind(params.id).run();
  await env.DB.prepare("DELETE FROM exceptions WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
}
