import { getSessionUser, requireAdmin, json } from "../../_lib/auth.js";

export async function onRequestDelete({ request, env, params }) {
  const user = await getSessionUser(request, env);
  if (!requireAdmin(user)) return json({ error: "Admin access required." }, { status: 403 });

  const existing = await env.DB.prepare("SELECT entry_id FROM vendor_validity_entries WHERE entry_id = ?").bind(params.id).first();
  if (!existing) return json({ error: "Entry not found." }, { status: 404 });

  await env.DB.prepare("DELETE FROM vendor_validity_entries WHERE entry_id = ?").bind(params.id).run();
  return json({ ok: true });
}
