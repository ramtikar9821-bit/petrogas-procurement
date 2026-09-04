import { readCookie, destroySession, clearSessionCookie, SESSION_COOKIE, json } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const token = readCookie(request, SESSION_COOKIE);
  await destroySession(env, token);
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
