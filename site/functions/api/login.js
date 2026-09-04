import { verifyPassword, createSession, sessionCookie, json } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) {
    return json({ error: "email and password are required." }, { status: 400 });
  }

  const user = await env.DB.prepare(
    "SELECT id, name, email, password_hash, role, status FROM users WHERE email = ?"
  ).bind(String(email).toLowerCase()).first();

  if (!user || user.status !== "active" || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: "Invalid email or password." }, { status: 401 });
  }

  const { token, maxAgeSeconds } = await createSession(env, user.id);
  return json(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    { headers: { "Set-Cookie": sessionCookie(token, maxAgeSeconds) } }
  );
}
