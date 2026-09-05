import { getSessionUser, requireAdmin, json } from "../_lib/auth.js";
import { getRolesList, saveRolesList } from "../_lib/rolesStore.js";

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });
  return json({ roles: await getRolesList(env) });
}

// Add a role (default) or delete one (body.action === "delete"). Kept as one
// endpoint so a role name with spaces/slashes never has to round-trip through
// a URL path segment.
export async function onRequestPost({ request, env }) {
  const admin = await getSessionUser(request, env);
  if (!requireAdmin(admin)) return json({ error: "Admin access required." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const role = String(body.role || "").trim();
  if (!role) return json({ error: "role is required." }, { status: 400 });

  const roles = await getRolesList(env);

  if (body.action === "delete") {
    if (role === "Admin") return json({ error: "The Admin role can't be deleted." }, { status: 400 });
    if (!roles.includes(role)) return json({ error: "Role not found." }, { status: 404 });

    const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = ?").bind(role).first();
    if (count > 0) {
      return json({ error: `${count} user(s) still have the "${role}" role — reassign them before deleting it.` }, { status: 409 });
    }

    const next = roles.filter(r => r !== role);
    await saveRolesList(env, next);
    return json({ roles: next });
  }

  if (roles.includes(role)) return json({ error: "This role already exists." }, { status: 409 });
  const next = [...roles, role];
  await saveRolesList(env, next);
  return json({ roles: next }, { status: 201 });
}
