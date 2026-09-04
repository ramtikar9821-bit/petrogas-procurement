import { getSessionUser, requireAdmin, hashPassword, randomTempPassword, json } from "../../_lib/auth.js";
import { ASSIGNABLE_ROLES } from "../../_lib/roles.js";

export async function onRequestPatch({ request, env, params }) {
  const admin = await getSessionUser(request, env);
  if (!requireAdmin(admin)) return json({ error: "Admin access required." }, { status: 403 });

  const targetId = params.id;
  const body = await request.json().catch(() => ({}));
  const { role, status, template_admin, resetPassword } = body;

  if (resetPassword) {
    const target = await env.DB.prepare("SELECT id, name, email FROM users WHERE id = ?").bind(targetId).first();
    if (!target) return json({ error: "User not found." }, { status: 404 });

    const tempPassword = randomTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, targetId).run();
    // Force re-login everywhere so the old password can't keep an existing session alive.
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();

    return json({ id: target.id, name: target.name, email: target.email, tempPassword });
  }

  if (role !== undefined && !ASSIGNABLE_ROLES.includes(role)) {
    return json({ error: `Unknown role: ${role}` }, { status: 400 });
  }
  if (status !== undefined && status !== "active" && status !== "disabled") {
    return json({ error: "status must be 'active' or 'disabled'." }, { status: 400 });
  }
  if (status === "disabled" && targetId === admin.id) {
    return json({ error: "You can't disable your own account." }, { status: 400 });
  }

  const target = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(targetId).first();
  if (!target) return json({ error: "User not found." }, { status: 404 });

  if (role !== undefined) {
    await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, targetId).run();
  }
  if (status !== undefined) {
    await env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(status, targetId).run();
    if (status === "disabled") {
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
    }
  }
  if (template_admin !== undefined) {
    await env.DB.prepare("UPDATE users SET template_admin = ? WHERE id = ?").bind(template_admin ? 1 : 0, targetId).run();
  }

  const updated = await env.DB.prepare(
    "SELECT id, name, email, role, status, template_admin, created_at FROM users WHERE id = ?"
  ).bind(targetId).first();
  return json({ user: updated });
}
