import { getSessionUser, json } from "../../_lib/auth.js";
import { requireRole } from "../../_lib/db.js";
import { PERMISSIONS } from "../../_lib/roles.js";

export async function onRequestPut({ request, env, params }) {
  const user = await getSessionUser(request, env);
  const denied = requireRole(user, PERMISSIONS.tendersICV);
  if (denied) return denied;

  const { bidderId } = params;
  const existing = await env.DB.prepare("SELECT * FROM icv_submissions WHERE bidder_id = ?").bind(bidderId).first();
  if (!existing) return json({ error: "Bidder not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const next = {
    icv_certificate_ref: body.icv_certificate_ref !== undefined ? body.icv_certificate_ref : existing.icv_certificate_ref,
    icv_score_pct: body.icv_score_pct !== undefined ? body.icv_score_pct : existing.icv_score_pct,
    omanised_roles_confirmed: body.omanised_roles_confirmed !== undefined ? (body.omanised_roles_confirmed ? 1 : 0) : existing.omanised_roles_confirmed,
    min_icv_threshold: body.min_icv_threshold !== undefined ? body.min_icv_threshold : existing.min_icv_threshold
  };

  await env.DB.prepare(
    "UPDATE icv_submissions SET icv_certificate_ref = ?, icv_score_pct = ?, omanised_roles_confirmed = ?, min_icv_threshold = ? WHERE bidder_id = ?"
  ).bind(next.icv_certificate_ref, next.icv_score_pct, next.omanised_roles_confirmed, next.min_icv_threshold, bidderId).run();

  return json({
    icv_certificate_ref: next.icv_certificate_ref, icv_score_pct: next.icv_score_pct,
    omanised_roles_confirmed: !!next.omanised_roles_confirmed, min_icv_threshold: next.min_icv_threshold
  });
}
