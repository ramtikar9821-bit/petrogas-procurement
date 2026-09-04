import { getSessionUser, json } from "../../_lib/auth.js";
import { runBatch, newId } from "../../_lib/db.js";

async function assembleTemplates(env, rows) {
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results: usageRows } = await env.DB.prepare(
    `SELECT * FROM template_usage_log WHERE template_id IN (${placeholders}) ORDER BY used_at`
  ).bind(...ids).all();
  return rows.map(t => ({
    ...t,
    uploadedBy: t.uploaded_by,
    documentNumber: t.document_number,
    revisionDate: t.revision_date,
    usageLog: usageRows.filter(u => u.template_id === t.id).map(u => ({ used_in_ref: u.used_in_ref, used_at: u.used_at }))
  }));
}

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });
  const { results } = await env.DB.prepare("SELECT * FROM templates ORDER BY revision_date DESC").all();
  return json({ templates: await assembleTemplates(env, results) });
}

// Only a user flagged template_admin may upload a new/revised template
// (buildspec Section 7: a narrow permission, independent of functional role).
export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });
  if (!user.template_admin) return json({ error: "Requires the template_admin flag." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { name, category, document_number, revision, owner } = body;
  if (!name || !revision) return json({ error: "name and revision are required." }, { status: 400 });

  const id = newId("TPL");
  const revisionDate = new Date().toISOString().slice(0, 10);
  const statements = [];

  // Archive any existing Active revision of the same document number.
  if (document_number) {
    statements.push(env.DB.prepare(
      "UPDATE templates SET status = 'Archived' WHERE document_number = ? AND status = 'Active'"
    ).bind(document_number));
  }
  statements.push(env.DB.prepare(
    `INSERT INTO templates (id, name, category, document_number, revision, revision_date, status, owner, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, 'Active', ?, ?)`
  ).bind(id, name, category || "", document_number || "", revision, revisionDate, owner || "", user.name));

  await runBatch(env, statements);
  return json({ id, name, category, documentNumber: document_number, revision, revisionDate, status: "Active", owner, uploadedBy: user.name, usageLog: [] }, { status: 201 });
}
