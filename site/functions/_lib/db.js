// Shared D1 helpers for module-data Pages Functions.
import { json } from "./auth.js";

// Runs multiple prepared statements as one D1 batch (transactional — all or
// nothing). Pass an array of `env.DB.prepare(sql).bind(...)` statements.
async function runBatch(env, statements) {
  if (statements.length === 0) return [];
  return env.DB.batch(statements);
}

// 403s unless the user's role is in allowedRoles. Returns a Response to
// return immediately, or null if the check passed.
function requireRole(user, allowedRoles) {
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });
  if (!allowedRoles.includes(user.role)) {
    return json({ error: `Requires one of: ${allowedRoles.join(", ")}.` }, { status: 403 });
  }
  return null;
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export { runBatch, requireRole, newId };
