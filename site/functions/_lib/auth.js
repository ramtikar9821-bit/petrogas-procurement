// Shared auth helpers for Pages Functions. No external deps: uses the Workers
// runtime's built-in Web Crypto (crypto.subtle / crypto.getRandomValues).

const PBKDF2_ITERATIONS = 100000;
const SESSION_COOKIE = "pgp_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `${toBase64(salt)}:${toBase64(hash)}`;
}

async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = String(stored || "").split(":");
  if (!saltB64 || !hashB64) return false;
  const salt = fromBase64(saltB64);
  const expected = fromBase64(hashB64);
  const actual = await pbkdf2(password, salt);
  if (actual.length !== expected.length) return false;
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function pbkdf2(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function newId() {
  return crypto.randomUUID();
}

function newToken() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}

// Human-typeable temp password: e.g. "K3F7-Q9M2". Admin shares it out-of-band;
// there's no email delivery in this pass, so it must be readable on screen.
function randomTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${part()}-${part()}`;
}

function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function createSession(env, userId) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expiresAt)
    .run();
  return { token, maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000) };
}

async function destroySession(env, token) {
  if (!token) return;
  await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}

// Returns the logged-in user ({id, name, email, role, status}) or null.
async function getSessionUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const session = await env.DB.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?"
  ).bind(token).first();
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    await destroySession(env, token);
    return null;
  }

  const user = await env.DB.prepare(
    "SELECT id, name, email, role, status, template_admin FROM users WHERE id = ?"
  ).bind(session.user_id).first();
  if (!user || user.status !== "active") return null;
  return user;
}

function requireAdmin(user) {
  return !!user && user.role === "Admin";
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) }
  });
}

export {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  newId,
  randomTempPassword,
  sessionCookie,
  clearSessionCookie,
  readCookie,
  createSession,
  destroySession,
  getSessionUser,
  requireAdmin,
  json
};
