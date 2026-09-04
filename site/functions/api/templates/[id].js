import { getSessionUser, json } from "../../_lib/auth.js";
import { newId } from "../../_lib/db.js";

// Logging usage against a tender/contract is open to any authenticated
// staff member (it's a byproduct of using the template, not an admin
// action); only template_admin can change status.
export async function onRequestPut({ request, env, params }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });

  const template = await env.DB.prepare("SELECT * FROM templates WHERE id = ?").bind(params.id).first();
  if (!template) return json({ error: "Template not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));

  if (body.status !== undefined) {
    if (!user.template_admin) return json({ error: "Requires the template_admin flag." }, { status: 403 });
    if (!["Active", "Archived"].includes(body.status)) return json({ error: "status must be Active or Archived." }, { status: 400 });
    await env.DB.prepare("UPDATE templates SET status = ? WHERE id = ?").bind(body.status, params.id).run();
  }

  if (body.used_in_ref) {
    await env.DB.prepare(
      "INSERT INTO template_usage_log (usage_id, template_id, used_in_ref, used_at) VALUES (?, ?, ?, ?)"
    ).bind(newId("USE"), params.id, body.used_in_ref, new Date().toISOString().slice(0, 10)).run();
  }

  const updated = await env.DB.prepare("SELECT * FROM templates WHERE id = ?").bind(params.id).first();
  const { results: usageRows } = await env.DB.prepare(
    "SELECT * FROM template_usage_log WHERE template_id = ? ORDER BY used_at"
  ).bind(params.id).all();
  return json({
    ...updated,
    uploadedBy: updated.uploaded_by,
    documentNumber: updated.document_number,
    revisionDate: updated.revision_date,
    usageLog: usageRows.map(u => ({ used_in_ref: u.used_in_ref, used_at: u.used_at }))
  });
}
