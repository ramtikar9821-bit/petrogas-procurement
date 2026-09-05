import { getSessionUser, newId, json } from "../../_lib/auth.js";

// Standalone validity entries not tied to any tender/bidder (e.g. a
// certification a vendor already holds) — see supplier-validity.html.
// Any authenticated user can add one; the register itself is view-only info.
export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });
  const { results } = await env.DB.prepare("SELECT * FROM vendor_validity_entries ORDER BY created_at DESC").all();
  return json({ entries: results });
}

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { vendor_id, assessment_type, finalized_at, validity_end_date } = body;
  if (!vendor_id || !assessment_type || !finalized_at || !validity_end_date) {
    return json({ error: "vendor_id, assessment_type, finalized_at, and validity_end_date are required." }, { status: 400 });
  }
  if (!["QHSE", "Financial"].includes(assessment_type)) {
    return json({ error: "assessment_type must be QHSE or Financial." }, { status: 400 });
  }

  const vendor = await env.DB.prepare("SELECT vendor_id FROM vendors WHERE vendor_id = ?").bind(vendor_id).first();
  if (!vendor) return json({ error: "Unknown vendor." }, { status: 400 });

  const entry = {
    entry_id: newId(), vendor_id, assessment_type, finalized_at, validity_end_date,
    created_by: user.id, created_at: new Date().toISOString()
  };
  await env.DB.prepare(
    "INSERT INTO vendor_validity_entries (entry_id, vendor_id, assessment_type, finalized_at, validity_end_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(entry.entry_id, entry.vendor_id, entry.assessment_type, entry.finalized_at, entry.validity_end_date, entry.created_by, entry.created_at).run();

  return json(entry, { status: 201 });
}
