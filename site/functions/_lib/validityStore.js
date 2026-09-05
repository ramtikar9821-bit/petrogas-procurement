export const DEFAULT_VALIDITY_CONFIG = {
  qhse_validity_months: 12,
  financial_validity_months: 12,
  reminder_days_before: [90, 60, 30]
};

export async function getValidityConfig(env) {
  const row = await env.DB.prepare("SELECT value FROM app_config WHERE key = 'validity'").first();
  return row ? JSON.parse(row.value) : { ...DEFAULT_VALIDITY_CONFIG };
}

export function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
