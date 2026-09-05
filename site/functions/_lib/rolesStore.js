// Admin-managed role list, stored in app_config so it survives redeploys.
// Falls back to the original hardcoded ROLES (roles.js) until an Admin
// changes anything, so no migration/seed step is needed for existing DBs.
import { ROLES as DEFAULT_ROLES } from "./roles.js";

export async function getRolesList(env) {
  const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'roles'").first();
  return row ? JSON.parse(row.value) : [...DEFAULT_ROLES];
}

export async function saveRolesList(env, roles) {
  await env.DB.prepare(
    "INSERT INTO app_config (key, value) VALUES ('roles', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(JSON.stringify(roles)).run();
}
