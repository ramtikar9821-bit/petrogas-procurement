import { getSessionUser, json } from "../../_lib/auth.js";
import { requireRole, newId } from "../../_lib/db.js";
import { PERMISSIONS } from "../../_lib/roles.js";

export async function onRequestPost({ request, env, params }) {
  const user = await getSessionUser(request, env);
  const denied = requireRole(user, PERMISSIONS.tenders);
  if (denied) return denied;

  const tn = params.tenderNumber;
  const tender = await env.DB.prepare("SELECT tender_number FROM tenders WHERE tender_number = ?").bind(tn).first();
  if (!tender) return json({ error: "Tender not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const { criteria_type, requirement_description } = body;
  if (!criteria_type || !requirement_description) {
    return json({ error: "criteria_type and requirement_description are required." }, { status: 400 });
  }

  const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM criteria WHERE tender_number = ?").bind(tn).first();
  const criterion = {
    criterion_id: newId("CRT"),
    tender_number: tn,
    criteria_type,
    sequence_no: String(count + 1),
    requirement_description,
    end_user_notes: ""
  };
  await env.DB.prepare(
    "INSERT INTO criteria (criterion_id, tender_number, criteria_type, sequence_no, requirement_description, end_user_notes) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(criterion.criterion_id, criterion.tender_number, criterion.criteria_type, criterion.sequence_no, criterion.requirement_description, criterion.end_user_notes).run();

  return json(criterion, { status: 201 });
}
