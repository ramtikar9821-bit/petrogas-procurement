-- Full relational schema for module data (tenders, clarifications, exceptions,
-- contracts, vendors, templates), replacing the localStorage prototype storage.
-- All tables land in this one migration even though only Vendors/Templates/
-- Contracts/config get API endpoints in this pass, so later passes (Tenders,
-- Clarifications, Exceptions) are pure API+frontend work with no schema churn.

ALTER TABLE users ADD COLUMN template_admin INTEGER NOT NULL DEFAULT 0;

CREATE TABLE vendors (
  vendor_id TEXT PRIMARY KEY,
  cr_number TEXT NOT NULL UNIQUE,
  vendor_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tenders (
  tender_number TEXT PRIMARY KEY,
  tender_title TEXT NOT NULL,
  issuance_date TEXT,
  bid_closing_date TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'Draft Criteria',
  approval_status TEXT,
  financial_threshold TEXT, -- JSON {min_current_ratio, max_debt_to_equity, min_net_profit_margin_pct}
  evaluators TEXT,          -- JSON array of names
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE criteria (
  criterion_id TEXT PRIMARY KEY,
  tender_number TEXT NOT NULL REFERENCES tenders(tender_number),
  criteria_type TEXT,
  sequence_no TEXT,
  requirement_description TEXT,
  end_user_notes TEXT
);
CREATE INDEX idx_criteria_tender ON criteria(tender_number);

CREATE TABLE tender_bidders (
  bidder_id TEXT PRIMARY KEY,
  tender_number TEXT NOT NULL REFERENCES tenders(tender_number),
  vendor_id TEXT REFERENCES vendors(vendor_id),
  name TEXT NOT NULL,
  final_recommendation TEXT
);
CREATE INDEX idx_bidders_tender ON tender_bidders(tender_number);
CREATE INDEX idx_bidders_vendor ON tender_bidders(vendor_id);

CREATE TABLE compliance_responses (
  response_id TEXT PRIMARY KEY,
  bidder_id TEXT NOT NULL REFERENCES tender_bidders(bidder_id),
  criterion_id TEXT NOT NULL REFERENCES criteria(criterion_id),
  response TEXT
);
CREATE INDEX idx_compliance_bidder ON compliance_responses(bidder_id);

CREATE TABLE qhse_assessments (
  bidder_id TEXT PRIMARY KEY REFERENCES tender_bidders(bidder_id),
  contractor_name TEXT,
  contractor_address TEXT,
  contract_title TEXT,
  contractor_representative TEXT,
  submission_date TEXT,
  contract_holder_name TEXT,
  contract_holder_signoff_date TEXT,
  qhse_advisor_name TEXT,
  qhse_advisor_signoff_date TEXT,
  justifications TEXT,
  vendor_id TEXT,
  source_tender_number TEXT,
  finalized_at TEXT,
  validity_end_date TEXT,
  reused_from_tender TEXT
);

CREATE TABLE qhse_ratings (
  bidder_id TEXT NOT NULL REFERENCES qhse_assessments(bidder_id),
  question_no TEXT NOT NULL,
  rating INTEGER,
  PRIMARY KEY (bidder_id, question_no)
);

CREATE TABLE financial_assessments (
  bidder_id TEXT PRIMARY KEY REFERENCES tender_bidders(bidder_id),
  outcome TEXT,
  evaluator_comments TEXT,
  vendor_id TEXT,
  source_tender_number TEXT,
  finalized_at TEXT,
  validity_end_date TEXT,
  reused_from_tender TEXT
);

CREATE TABLE financial_statements (
  statement_id TEXT PRIMARY KEY,
  bidder_id TEXT NOT NULL REFERENCES financial_assessments(bidder_id),
  year INTEGER,
  revenue REAL, gross_profit REAL, net_profit_loss REAL,
  total_assets REAL, total_liabilities REAL, total_equity REAL,
  current_assets REAL, current_liabilities REAL,
  cash_and_bank_balances REAL
);
CREATE INDEX idx_statements_bidder ON financial_statements(bidder_id);

CREATE TABLE financial_risk_flags (
  flag_id TEXT PRIMARY KEY,
  bidder_id TEXT NOT NULL REFERENCES financial_assessments(bidder_id),
  flag_type TEXT,
  description TEXT
);
CREATE INDEX idx_riskflags_bidder ON financial_risk_flags(bidder_id);

CREATE TABLE icv_submissions (
  bidder_id TEXT PRIMARY KEY REFERENCES tender_bidders(bidder_id),
  icv_certificate_ref TEXT,
  icv_score_pct REAL,
  omanised_roles_confirmed INTEGER,
  min_icv_threshold REAL
);

CREATE TABLE clarifications (
  id TEXT PRIMARY KEY,
  tender_ref TEXT,
  article_section_ref TEXT,
  category TEXT,
  cost_impact TEXT,
  question TEXT,
  originator_type TEXT,
  originator_name TEXT,
  external_authority TEXT,
  external_authority_other_name TEXT,
  logged_by TEXT,
  submitted_on TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  assigned_department TEXT,
  assigned_person TEXT,
  assigned_by TEXT,
  assigned_on TEXT,
  sla_days INTEGER,
  response_due_date TEXT,
  escalated INTEGER NOT NULL DEFAULT 0,
  escalated_at TEXT,
  escalated_to TEXT
);

CREATE TABLE clarification_responses (
  response_id TEXT PRIMARY KEY,
  clarification_id TEXT NOT NULL REFERENCES clarifications(id),
  responded_by TEXT,
  text TEXT,
  responded_on TEXT,
  delivery_method TEXT,
  sent_confirmed INTEGER
);
CREATE INDEX idx_clarification_responses ON clarification_responses(clarification_id);

CREATE TABLE exceptions (
  id TEXT PRIMARY KEY,
  tender_number TEXT,
  tender_title TEXT,
  tender_category TEXT,
  bidder_name TEXT,
  tender_issuance_date TEXT,
  bid_closing_date TEXT,
  contract_document_ref TEXT,
  clause_article_ref TEXT,
  original_clause_wording TEXT,
  initial_proposed_wording TEXT,
  is_fast_track INTEGER NOT NULL DEFAULT 0,
  referenced_precedent_id TEXT,
  fast_track_legal_notified_at TEXT,
  fast_track_auto_approve_deadline TEXT,
  fast_track_legal_objected INTEGER NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'Pending',
  approved_by TEXT,
  approval_date TEXT,
  negotiation_status TEXT NOT NULL DEFAULT 'Open',
  legal_consent_given INTEGER NOT NULL DEFAULT 0,
  legal_consent_date TEXT,
  reuse_scope TEXT,
  logged_by TEXT
);

CREATE TABLE exception_negotiation_rounds (
  round_id TEXT PRIMARY KEY,
  exception_id TEXT NOT NULL REFERENCES exceptions(id),
  round_no INTEGER,
  proposed_by TEXT,
  wording_text TEXT,
  date TEXT,
  communicated_by TEXT
);
CREATE INDEX idx_negotiation_rounds ON exception_negotiation_rounds(exception_id);

CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  vendor TEXT,
  vendor_id TEXT REFERENCES vendors(vendor_id),
  category TEXT,
  value REAL,
  currency TEXT,
  start_date TEXT,
  end_date TEXT,
  owner TEXT,
  criticality TEXT
);
CREATE INDEX idx_contracts_vendor ON contracts(vendor_id);

CREATE TABLE contract_renewals (
  renewal_id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  decision TEXT,
  new_end_date TEXT,
  approved_by TEXT,
  approval_date TEXT
);
CREATE INDEX idx_renewals_contract ON contract_renewals(contract_id);

CREATE TABLE contract_amendments (
  amendment_id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  amendment_type TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  changed_at TEXT
);
CREATE INDEX idx_amendments_contract ON contract_amendments(contract_id);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  document_number TEXT,
  revision TEXT,
  revision_date TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  owner TEXT,
  uploaded_by TEXT
);
CREATE INDEX idx_templates_docnumber ON templates(document_number);

CREATE TABLE template_usage_log (
  usage_id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id),
  used_in_ref TEXT,
  used_at TEXT
);
CREATE INDEX idx_usage_template ON template_usage_log(template_id);

CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL -- JSON
);
