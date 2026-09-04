// One-time bootstrap: creates the first user as Admin. Locks itself once any
// user exists, so there's no hardcoded password hash to ship in the migration.
import { hashPassword, newId, createSession, sessionCookie, json } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  if (count > 0) {
    return json({ error: "Setup already completed." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { name, email, password } = body;
  if (!name || !email || !password || password.length < 8) {
    return json({ error: "name, email, and a password of at least 8 characters are required." }, { status: 400 });
  }

  const id = newId();
  const passwordHash = await hashPassword(password);
  await env.DB.prepare(
    "INSERT INTO users (id, name, email, password_hash, role, status, created_by) VALUES (?, ?, ?, ?, 'Admin', 'active', ?)"
  ).bind(id, name, email.toLowerCase(), passwordHash, id).run();

  const { token, maxAgeSeconds } = await createSession(env, id);
  return json(
    { id, name, email: email.toLowerCase(), role: "Admin" },
    { headers: { "Set-Cookie": sessionCookie(token, maxAgeSeconds) } }
  );
}
