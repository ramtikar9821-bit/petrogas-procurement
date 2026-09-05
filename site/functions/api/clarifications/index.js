import { getSessionUser, json } from "../../_lib/auth.js";
import { newId } from "../../_lib/db.js";

function assemble(rows) {
  return rows.map(c => ({
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
    responses: []
  }));
}

async function attachResponses(env, clarifications) {
  if (clarifications.length === 0) return clarifications;
  const ids = clarifications.map(c => c.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT * FROM clarification_responses WHERE clarification_id IN (${placeholders}) ORDER BY responded_on`
  ).bind(...ids).all();
  clarifications.forEach(c => {
    c.responses = results
      .filter(r => r.clarification_id === c.id)
      .map(r => ({
        respondedBy: r.responded_by,
        text: r.text,
        respondedOn: r.responded_on,
        deliveryMethod: r.delivery_method,
        sentConfirmed: !!r.sent_confirmed
      }));
  });
  return clarifications;
}

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });

  const { results } = await env.DB.prepare(`
    SELECT c.*, u1.name as created_by_name, u2.name as assigned_user_name
    FROM clarifications c
    LEFT JOIN users u1 ON u1.id = c.logged_by
    LEFT JOIN users u2 ON u2.id = c.assigned_person
    ORDER BY c.submitted_on DESC
  `).all();

  return json({ clarifications: await attachResponses(env, assemble(results)) });
}

// Any authenticated user can log a clarification — the creator assigns it
// directly to another user account (no more role-gated logging/routing, since
// roles are Admin-configurable now and can't be relied on as fixed gates).
export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const {
    tenderRef, articleSectionRef, category, costImpact, question,
    originatorType, originatorName, externalAuthority, externalAuthorityOtherName,
    assignedUserId, slaDays
  } = body;

  if (!tenderRef || !question || !originatorType || !originatorName || !assignedUserId) {
    return json({ error: "tenderRef, question, originatorType, originatorName, and assignedUserId are required." }, { status: 400 });
  }

  const assignee = await env.DB.prepare("SELECT id, name FROM users WHERE id = ? AND status = 'active'").bind(assignedUserId).first();
  if (!assignee) return json({ error: "Selected assignee is not a valid, active user." }, { status: 400 });

  const id = newId("CLR");
  const today = new Date().toISOString().slice(0, 10);
  const sla = Math.max(1, parseInt(slaDays, 10) || 5);
  const due = new Date();
  due.setDate(due.getDate() + sla);
  const dueDate = due.toISOString().slice(0, 10);

  await env.DB.prepare(`
    INSERT INTO clarifications (
      id, tender_ref, article_section_ref, category, cost_impact, question,
      originator_type, originator_name, external_authority, external_authority_other_name,
      logged_by, submitted_on, status, assigned_person, assigned_by, assigned_on,
      sla_days, response_due_date, escalated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Routed', ?, ?, ?, ?, ?, 0)
  `).bind(
    id, tenderRef, articleSectionRef || "", category || "", costImpact || "N", question,
    originatorType, originatorName, externalAuthority || "", externalAuthorityOtherName || "",
    user.id, today, assignedUserId, user.id, today, sla, dueDate
  ).run();

  return json({
    id, tenderRef, articleSectionRef, category, costImpact: costImpact || "N", question,
    originatorType, originatorName, externalAuthority, externalAuthorityOtherName,
    createdBy: user.id, createdByName: user.name, submittedOn: today, status: "Routed",
    assignedUserId, assignedUserName: assignee.name, assignedOn: today,
    slaDays: sla, responseDueDate: dueDate, escalated: false, escalatedAt: null, responses: []
  }, { status: 201 });
}
