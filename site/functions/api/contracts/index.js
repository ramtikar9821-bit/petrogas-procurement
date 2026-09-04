import { getSessionUser, json } from "../../_lib/auth.js";
import { requireRole, newId } from "../../_lib/db.js";
import { PERMISSIONS } from "../../_lib/roles.js";

async function assembleContracts(env, rows) {
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const [{ results: renewalRows }, { results: amendmentRows }] = await Promise.all([
    env.DB.prepare(`SELECT * FROM contract_renewals WHERE contract_id IN (${placeholders}) ORDER BY approval_date`).bind(...ids).all(),
    env.DB.prepare(`SELECT * FROM contract_amendments WHERE contract_id IN (${placeholders}) ORDER BY changed_at`).bind(...ids).all()
  ]);
  return rows.map(c => ({
    ...c,
    startDate: c.start_date,
    endDate: c.end_date,
    renewals: renewalRows.filter(r => r.contract_id === c.id).map(r => ({ decision: r.decision, new_end_date: r.new_end_date, approved_by: r.approved_by, approval_date: r.approval_date })),
    amendments: amendmentRows.filter(a => a.contract_id === c.id).map(a => ({ amendment_type: a.amendment_type, old_value: a.old_value, new_value: a.new_value, changed_by: a.changed_by, changed_at: a.changed_at }))
  }));
}

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });
  const { results } = await env.DB.prepare("SELECT * FROM contracts").all();
  return json({ contracts: await assembleContracts(env, results) });
}

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  const denied = requireRole(user, PERMISSIONS.contracts);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const { id, title, vendor, vendor_id, category, value, currency, startDate, endDate, owner, criticality } = body;
  if (!id || !title || !vendor || !startDate || !endDate || !owner) {
    return json({ error: "id, title, vendor, startDate, endDate, and owner are required." }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT id FROM contracts WHERE id = ?").bind(id).first();
  if (existing) return json({ error: `Contract ${id} already exists.` }, { status: 409 });

  await env.DB.prepare(
    `INSERT INTO contracts (id, title, vendor, vendor_id, category, value, currency, start_date, end_date, owner, criticality)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, title, vendor, vendor_id || null, category || "", Number(value) || 0, currency || "USD", startDate, endDate, owner, criticality || "Low").run();

  return json({ id, title, vendor, vendor_id, category, value: Number(value) || 0, currency: currency || "USD", startDate, endDate, owner, criticality: criticality || "Low", renewals: [], amendments: [] }, { status: 201 });
}
