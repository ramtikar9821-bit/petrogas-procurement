import { getSessionUser, json } from "../../_lib/auth.js";
import { requireRole, newId } from "../../_lib/db.js";
import { PERMISSIONS } from "../../_lib/roles.js";

export async function onRequestPut({ request, env, params }) {
  const user = await getSessionUser(request, env);
  const denied = requireRole(user, PERMISSIONS.tendersCompliance);
  if (denied) return denied;

  const { bidderId } = params;
  const body = await request.json().catch(() => ({}));
  const { criterion_id, response } = body;
  if (!criterion_id) return json({ error: "criterion_id is required." }, { status: 400 });

  const existing = await env.DB.prepare(
    "SELECT response_id FROM compliance_responses WHERE bidder_id = ? AND criterion_id = ?"
  ).bind(bidderId, criterion_id).first();

  if (!response) {
    if (existing) await env.DB.prepare("DELETE FROM compliance_responses WHERE response_id = ?").bind(existing.response_id).run();
  } else if (existing) {
    await env.DB.prepare("UPDATE compliance_responses SET response = ? WHERE response_id = ?").bind(response, existing.response_id).run();
  } else {
    await env.DB.prepare("INSERT INTO compliance_responses (response_id, bidder_id, criterion_id, response) VALUES (?, ?, ?, ?)")
      .bind(newId("RSP"), bidderId, criterion_id, response).run();
  }

  const { results } = await env.DB.prepare("SELECT * FROM compliance_responses WHERE bidder_id = ?").bind(bidderId).all();
  const complianceResponses = {};
  results.forEach(r => { complianceResponses[r.criterion_id] = r.response; });
  return json({ complianceResponses });
}
