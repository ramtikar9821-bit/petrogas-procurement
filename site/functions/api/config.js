import { getSessionUser, json } from "../_lib/auth.js";
import { requireRole } from "../_lib/db.js";
import { PERMISSIONS } from "../_lib/roles.js";

const DEFAULT_VALIDITY_CONFIG = {
  qhse_validity_months: 12,
  financial_validity_months: 12,
  reminder_days_before: [90, 60, 30]
};

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });
  const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'validity'").first();
  return json(row ? JSON.parse(row.value) : DEFAULT_VALIDITY_CONFIG);
}

// Shared validity/reminder config (buildspec Section 6.2) — same authority
// tier as contract admin, since the spec doesn't name an explicit owner.
export async function onRequestPut({ request, env }) {
  const user = await getSessionUser(request, env);
  const denied = requireRole(user, [...PERMISSIONS.contracts, "Category Manager"]);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const cfg = {
    qhse_validity_months: Math.max(1, parseInt(body.qhse_validity_months, 10) || DEFAULT_VALIDITY_CONFIG.qhse_validity_months),
    financial_validity_months: Math.max(1, parseInt(body.financial_validity_months, 10) || DEFAULT_VALIDITY_CONFIG.financial_validity_months),
    reminder_days_before: Array.isArray(body.reminder_days_before) && body.reminder_days_before.length
      ? body.reminder_days_before.map(Number).filter(n => !isNaN(n) && n > 0).sort((a, b) => b - a)
      : DEFAULT_VALIDITY_CONFIG.reminder_days_before
  };

  await env.DB.prepare(
    "INSERT INTO app_config (key, value) VALUES ('validity', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(JSON.stringify(cfg)).run();

  return json(cfg);
}
