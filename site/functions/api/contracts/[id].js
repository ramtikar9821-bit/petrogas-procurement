import { getSessionUser, json } from "../../_lib/auth.js";
import { runBatch, requireRole, newId } from "../../_lib/db.js";
import { PERMISSIONS } from "../../_lib/roles.js";

// Logs a renewal decision (buildspec Section 6.1): inserts a contract_renewals
// row and, unless "Do Not Renew", a contract_amendments row + updates the
// contract's end_date — same fan-out the frontend used to do against its
// in-memory array, now as one D1 batch.
export async function onRequestPut({ request, env, params }) {
  const user = await getSessionUser(request, env);
  const denied = requireRole(user, PERMISSIONS.contracts);
  if (denied) return denied;

  const contract = await env.DB.prepare("SELECT * FROM contracts WHERE id = ?").bind(params.id).first();
  if (!contract) return json({ error: "Contract not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const { decision, new_end_date } = body;
  if (!decision) return json({ error: "decision is required." }, { status: 400 });
  if (decision !== "Do Not Renew" && !new_end_date) {
    return json({ error: "new_end_date is required unless decision is 'Do Not Renew'." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const statements = [
    env.DB.prepare(
      "INSERT INTO contract_renewals (renewal_id, contract_id, decision, new_end_date, approved_by, approval_date) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(newId("REN"), params.id, decision, decision === "Do Not Renew" ? "" : new_end_date, user.role, today)
  ];

  if (decision !== "Do Not Renew") {
    statements.push(env.DB.prepare(
      "INSERT INTO contract_amendments (amendment_id, contract_id, amendment_type, old_value, new_value, changed_by, changed_at) VALUES (?, ?, 'term_extension', ?, ?, ?, ?)"
    ).bind(newId("AMD"), params.id, contract.end_date, new_end_date, user.role, today));
    statements.push(env.DB.prepare("UPDATE contracts SET end_date = ? WHERE id = ?").bind(new_end_date, params.id));
  }

  await runBatch(env, statements);

  const [{ results: renewalRows }, { results: amendmentRows }, updated] = await Promise.all([
    env.DB.prepare("SELECT * FROM contract_renewals WHERE contract_id = ? ORDER BY approval_date").bind(params.id).all(),
    env.DB.prepare("SELECT * FROM contract_amendments WHERE contract_id = ? ORDER BY changed_at").bind(params.id).all(),
    env.DB.prepare("SELECT * FROM contracts WHERE id = ?").bind(params.id).first()
  ]);

  return json({
    ...updated,
    startDate: updated.start_date,
    endDate: updated.end_date,
    renewals: renewalRows.map(r => ({ decision: r.decision, new_end_date: r.new_end_date, approved_by: r.approved_by, approval_date: r.approval_date })),
    amendments: amendmentRows.map(a => ({ amendment_type: a.amendment_type, old_value: a.old_value, new_value: a.new_value, changed_by: a.changed_by, changed_at: a.changed_at }))
  });
}
