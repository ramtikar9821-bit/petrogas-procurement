import { getSessionUser, requireAdmin, hashPassword, newId, randomTempPassword, json } from "../../_lib/auth.js";
import { ASSIGNABLE_ROLES } from "../../_lib/roles.js";

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!requireAdmin(user)) return json({ error: "Admin access required." }, { status: 403 });

  const { results } = await env.DB.prepare(
    "SELECT id, name, email, role, status, template_admin, created_at FROM users ORDER BY created_at DESC"
  ).all();
  return json({ users: results });
}

export async function onRequestPost({ request, env }) {
  const admin = await getSessionUser(request, env);
  if (!requireAdmin(admin)) return json({ error: "Admin access required." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { name, email, role } = body;
  if (!name || !email || !role) {
    return json({ error: "name, email, and role are required." }, { status: 400 });
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return json({ error: `Unknown role: ${role}` }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email.toLowerCase()).first();
  if (existing) {
    return json({ error: "A user with this email already exists." }, { status: 409 });
  }

  const id = newId();
  const tempPassword = randomTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await env.DB.prepare(
    "INSERT INTO users (id, name, email, password_hash, role, status, created_by) VALUES (?, ?, ?, ?, ?, 'active', ?)"
  ).bind(id, name, email.toLowerCase(), passwordHash, role, admin.id).run();

  return json({ id, name, email: email.toLowerCase(), role, tempPassword }, { status: 201 });
}
