import { getSessionUser, requireAdmin, json } from "../../_lib/auth.js";
import { newId } from "../../_lib/db.js";

async function loadWithNames(env, id) {
  return env.DB.prepare(`
    SELECT c.*, u1.name as created_by_name, u2.name as assigned_user_name
    FROM clarifications c
    LEFT JOIN users u1 ON u1.id = c.logged_by
    LEFT JOIN users u2 ON u2.id = c.assigned_person
    WHERE c.id = ?
  `).bind(id).first();
}

async function assembleOne(env, c) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM clarification_responses WHERE clarification_id = ? ORDER BY responded_on"
  ).bind(c.id).all();
  return {
    id: c.id,
    tenderRef: c.tender_ref,
    articleSectionRef: c.article_section_ref,
    category: c.category,
    costImpact: c.cost_impact,
    question: c.question,
    originatorType: c.originator_type,
    originatorName: c.originator_name,
    externalAuthority: c.external_authority,
    externalAuthorityOtherName: c.external_authority_other_name,
    createdBy: c.logged_by,
    createdByName: c.created_by_name,
    submittedOn: c.submitted_on,
    status: c.status,
    assignedUserId: c.assigned_person,
    assignedUserName: c.assigned_user_name,
    assignedOn: c.assigned_on,
    slaDays: c.sla_days,
    responseDueDate: c.response_due_date,
    escalated: !!c.escalated,
    escalatedAt: c.escalated_at,
    responses: results.map(r => ({
      respondedBy: r.responded_by,
      text: r.text,
      respondedOn: r.responded_on,
      deliveryMethod: r.delivery_method,
      sentConfirmed: !!r.sent_confirmed
    }))
  };
}

// Single PUT covering the two actions a clarification's assignee/creator can
// take: submit a response (assignee or Admin only), or close it once answered
// (assignee, original creator, or Admin). Kept as one endpoint since both are
// simple state transitions on the same record.
export async function onRequestPut({ request, env, params }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });

  const item = await loadWithNames(env, params.id);
  if (!item) return json({ error: "Clarification not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const isAdmin = requireAdmin(user);
  const isAssignee = item.assigned_person === user.id;
  const isCreator = item.logged_by === user.id;

  if (body.action === "close") {
    if (item.status !== "Answered") return json({ error: "Only an Answered clarification can be closed." }, { status: 400 });
    if (!isAdmin && !isAssignee && !isCreator) {
      return json({ error: "Only the assignee, the person who logged this, or an Admin can close it." }, { status: 403 });
    }
    await env.DB.prepare("UPDATE clarifications SET status = 'Closed' WHERE id = ?").bind(params.id).run();
    return json(await assembleOne(env, await loadWithNames(env, params.id)));
  }

  // Otherwise: submit a response.
  if (!isAdmin && !isAssignee) {
    return json({ error: "Only the assigned user or an Admin can respond to this clarification." }, { status: 403 });
  }
  if (item.status === "Answered" || item.status === "Closed") {
    return json({ error: "This clarification has already been answered." }, { status: 400 });
  }
  const text = String(body.text || "").trim();
  if (!text) return json({ error: "A response is required." }, { status: 400 });

  const external = item.originator_type !== "Internal Stakeholder";
  if (external && !body.sentConfirmed) {
    return json({ error: `Confirm you've sent this response by email before submitting — ${item.originator_type} has no system access.` }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(`
    INSERT INTO clarification_responses (response_id, clarification_id, responded_by, text, responded_on, delivery_method, sent_confirmed)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newId("RSP"), params.id, user.name, text, today,
    external ? "Email sent externally" : "In-system notification", external ? 1 : 0
  ).run();

  await env.DB.prepare("UPDATE clarifications SET status = 'Answered' WHERE id = ?").bind(params.id).run();

  return json(await assembleOne(env, await loadWithNames(env, params.id)));
}

export async function onRequestDelete({ request, env, params }) {
  const user = await getSessionUser(request, env);
  if (!requireAdmin(user)) return json({ error: "Admin access required." }, { status: 403 });

  const item = await env.DB.prepare("SELECT id FROM clarifications WHERE id = ?").bind(params.id).first();
  if (!item) return json({ error: "Clarification not found." }, { status: 404 });

  await env.DB.prepare("DELETE FROM clarification_responses WHERE clarification_id = ?").bind(params.id).run();
  await env.DB.prepare("DELETE FROM clarifications WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
}
