-- One-time seed for the D1-backed modules (Vendors, Contracts, Templates).
-- Not part of migrations/ (those are schema-only) — run manually:
--   npx wrangler d1 execute DB --local  --file=./seed.sql
--   npx wrangler d1 execute DB --remote --file=./seed.sql
-- Safe to re-run: every INSERT is OR IGNORE against each table's primary key.
-- Tenders/Clarifications/Exceptions aren't seeded here — they're still on
-- the localStorage/data/*.json path pending their own D1 migration.

INSERT OR IGNORE INTO vendors (vendor_id, cr_number, vendor_name) VALUES
  ('VEN-001', '1023456', 'Alpha Oilfield Services'),
  ('VEN-002', '1044821', 'Beta Supply Co.'),
  ('VEN-003', '1067213', 'Gamma Industrial'),
  ('VEN-004', '1098765', 'NextGen IT Solutions'),
  ('VEN-005', '1112233', 'Falcon Tech'),
  ('VEN-006', '1145599', 'CleanCo Facilities');

INSERT OR IGNORE INTO contracts (id, title, vendor, vendor_id, category, value, currency, start_date, end_date, owner, criticality) VALUES
  ('CTR-2201', 'Drilling Consumables Supply Agreement', 'Alpha Oilfield Services', 'VEN-001', 'Drilling & Wellsite', 1250000, 'USD', '2024-09-01', '2026-09-01', 'A. Rahman', 'High'),
  ('CTR-2145', 'IT Managed Services - Field Offices', 'NextGen IT Solutions', 'VEN-004', 'IT & Telecom', 480000, 'USD', '2025-01-15', '2026-10-15', 'T. Yusuf', 'Medium'),
  ('CTR-1998', 'Pipeline Inspection Services', 'Falcon Tech', 'VEN-005', 'Maintenance', 900000, 'USD', '2023-06-01', '2026-08-30', 'R. Nair', 'High'),
  ('CTR-1877', 'Office Facilities Cleaning Services', 'CleanCo Facilities', 'VEN-006', 'Facilities', 60000, 'USD', '2022-04-01', '2026-04-01', 'S. Kumar', 'Low'),
  ('CTR-2310', 'Framework Agreement - Safety Equipment Supply', 'Gamma Industrial', 'VEN-003', 'HSE', 2100000, 'USD', '2025-03-01', '2027-03-01', 'F. Al-Sayed', 'High');

INSERT OR IGNORE INTO contract_renewals (renewal_id, contract_id, decision, new_end_date, approved_by, approval_date) VALUES
  ('REN-SEED-2145', 'CTR-2145', 'Renew', '2026-10-15', 'Contract Owner - T. Yusuf', '2026-03-01'),
  ('REN-SEED-1877', 'CTR-1877', 'Do Not Renew', '', 'Contract Owner - S. Kumar', '2026-03-01');

INSERT OR IGNORE INTO contract_amendments (amendment_id, contract_id, amendment_type, old_value, new_value, changed_by, changed_at) VALUES
  ('AMD-SEED-2145', 'CTR-2145', 'term_extension', '2026-04-15', '2026-10-15', 'T. Yusuf', '2026-03-01');

INSERT OR IGNORE INTO templates (id, name, category, document_number, revision, revision_date, status, owner, uploaded_by) VALUES
  ('TPL-001', 'RFP - Goods Supply Standard Template', 'RFP', 'PGR-PRC-RFP-01', 'Revision-4', '2026-06-12', 'Active', 'Legal / Contracts', 'Legal Team Member'),
  ('TPL-002', 'RFQ - Services Standard Template', 'RFQ', 'PGR-PRC-RFQ-01', 'Revision-3', '2026-05-20', 'Active', 'Legal / Contracts', 'Legal Team Member'),
  ('TPL-003', 'Standard Contract Terms - Goods', 'Contract', 'PGR-LEG-CON-06', 'Revision-5', '2026-07-01', 'Active', 'Legal / Contracts', 'Legal Team Member'),
  ('TPL-004', 'Non-Disclosure Agreement (NDA)', 'NDA', 'PGR-LEG-NDA-02', 'Revision-2', '2026-02-18', 'Active', 'Legal / Contracts', 'Legal Team Member'),
  ('TPL-005', 'Standard Contract Terms - Goods', 'Contract', 'PGR-LEG-CON-06', 'Revision-4', '2025-10-05', 'Archived', 'Legal / Contracts', 'Legal Team Member'),
  ('TPL-006', 'PO Terms & Conditions', 'PO Terms', 'PGR-PRC-POT-01', 'Revision-2', '2026-04-30', 'Active', 'Category Manager', 'Legal Team Member'),
  ('TPL-007', 'QHSE Pre-Qualification Questionnaire', 'QHSE Questionnaire', 'PGR-QHSE-OP-6.6', 'Revision-2', '2026-03-15', 'Active', 'Legal / Contracts', 'Legal Team Member');

INSERT OR IGNORE INTO template_usage_log (usage_id, template_id, used_in_ref, used_at) VALUES
  ('USE-SEED-001-1', 'TPL-001', 'TND-2026-001', '2026-07-01'),
  ('USE-SEED-001-2', 'TPL-001', 'TND-2026-002', '2026-08-10'),
  ('USE-SEED-003-1', 'TPL-003', 'TND-2026-001', '2026-07-05'),
  ('USE-SEED-003-2', 'TPL-003', 'CTR-2201', '2026-09-01'),
  ('USE-SEED-005-1', 'TPL-005', 'TND-2025-047', '2025-09-05'),
  ('USE-SEED-007-1', 'TPL-007', 'TND-2026-001', '2026-07-18'),
  ('USE-SEED-007-2', 'TPL-007', 'TND-2025-047', '2025-09-14');

-- Shared validity/reminder config default (buildspec Section 6.2) — matches
-- app.js's DEFAULT_VALIDITY_CONFIG so behavior is identical whether or not
-- this seed has run.
INSERT OR IGNORE INTO app_config (key, value) VALUES
  ('validity', '{"qhse_validity_months":12,"financial_validity_months":12,"reminder_days_before":[90,60,30]}');
