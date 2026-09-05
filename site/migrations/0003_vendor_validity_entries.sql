-- Standalone Supplier Validity entries not tied to any tender/bidder (e.g. a
-- certification a vendor already holds outside of Tender Evaluation).
CREATE TABLE vendor_validity_entries (
  entry_id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(vendor_id),
  assessment_type TEXT NOT NULL,
  finalized_at TEXT NOT NULL,
  validity_end_date TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_validity_entries_vendor ON vendor_validity_entries(vendor_id);
