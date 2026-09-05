import { getSessionUser, json } from "../../_lib/auth.js";

// Lightweight user picker for assigning records (e.g. Clarifications) to a
// real account. Open to any authenticated user, unlike GET /api/users (which
// is Admin-only and returns full account management fields).
export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });

  const { results } = await env.DB.prepare(
    "SELECT id, name, role FROM users WHERE status = 'active' ORDER BY name"
  ).all();
  return json({ users: results });
}
