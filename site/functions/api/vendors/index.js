import { getSessionUser, json } from "../../_lib/auth.js";
import { requireRole, newId } from "../../_lib/db.js";
import { PERMISSIONS } from "../../_lib/roles.js";

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not authenticated." }, { status: 401 });
  const { results } = await env.DB.prepare("SELECT * FROM vendors ORDER BY vendor_name").all();
  return json({ vendors: results });
}

// Lookup-or-create by CR number — mirrors PGP.upsertVendor's semantics so the
// tender-evaluation "Add Bidder" flow can call this without a separate check.
export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  const denied = requireRole(user, PERMISSIONS.tenders);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const crNumber = String(body.cr_number || "").trim();
  const vendorName = String(body.vendor_name || "").trim();
  if (!crNumber || !vendorName) {
    return json({ error: "cr_number and vendor_name are required." }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT * FROM vendors WHERE cr_number = ?").bind(crNumber).first();
  if (existing) {
    if (existing.vendor_name !== vendorName) {
      await env.DB.prepare("UPDATE vendors SET vendor_name = ? WHERE vendor_id = ?").bind(vendorName, existing.vendor_id).run();
      existing.vendor_name = vendorName;
    }
    return json({ vendor: existing });
  }

  const vendor = { vendor_id: newId("VEN"), cr_number: crNumber, vendor_name: vendorName };
  await env.DB.prepare("INSERT INTO vendors (vendor_id, cr_number, vendor_name) VALUES (?, ?, ?)")
    .bind(vendor.vendor_id, vendor.cr_number, vendor.vendor_name).run();
  return json({ vendor }, { status: 201 });
}
