import { getSessionUser, json } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) {
    const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
    return json({ error: "Not authenticated.", setupRequired: count === 0 }, { status: 401 });
  }
  return json({ id: user.id, name: user.name, email: user.email, role: user.role, template_admin: !!user.template_admin });
}
