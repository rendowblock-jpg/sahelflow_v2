CREATE TABLE IF NOT EXISTS storefront (
  storefront_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  receipt_encryption_public_key TEXT NOT NULL,
  active_release_id TEXT,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','paused')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, shop_id)
);

CREATE TABLE IF NOT EXISTS storefront_release (
  release_id TEXT PRIMARY KEY NOT NULL,
  storefront_id TEXT NOT NULL,
  parent_release_id TEXT,
  template_id TEXT NOT NULL CHECK(template_id IN ('sahara','atlas','oasis')),
  locale TEXT NOT NULL CHECK(locale IN ('ar','fr','en')),
  artifact_json TEXT NOT NULL,
  artifact_digest TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(storefront_id) REFERENCES storefront(storefront_id) ON DELETE CASCADE,
  FOREIGN KEY(parent_release_id) REFERENCES storefront_release(release_id)
);

CREATE TRIGGER IF NOT EXISTS storefront_release_parent_guard
BEFORE INSERT ON storefront_release
BEGIN
  SELECT CASE
    WHEN (SELECT active_release_id FROM storefront WHERE storefront_id = NEW.storefront_id)
         IS NOT NEW.parent_release_id
    THEN RAISE(ABORT, 'stale_release_parent')
  END;
END;

CREATE TRIGGER IF NOT EXISTS storefront_release_activate
AFTER INSERT ON storefront_release
BEGIN
  UPDATE storefront
     SET active_release_id = NEW.release_id, updated_at = CURRENT_TIMESTAMP
   WHERE storefront_id = NEW.storefront_id;
END;

CREATE TABLE IF NOT EXISTS storefront_allocation (
  release_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  unit_price_dzd INTEGER NOT NULL CHECK(unit_price_dzd >= 0),
  delegated_quantity INTEGER NOT NULL CHECK(delegated_quantity >= 0),
  remaining_quantity INTEGER NOT NULL CHECK(remaining_quantity >= 0),
  PRIMARY KEY(release_id, item_key),
  FOREIGN KEY(release_id) REFERENCES storefront_release(release_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS storefront_shipping_rule (
  release_id TEXT NOT NULL,
  wilaya_code TEXT NOT NULL,
  delivery_mode TEXT NOT NULL CHECK(delivery_mode IN ('home','desk')),
  fee_dzd INTEGER NOT NULL CHECK(fee_dzd >= 0),
  PRIMARY KEY(release_id, wilaya_code, delivery_mode),
  FOREIGN KEY(release_id) REFERENCES storefront_release(release_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS storefront_receipt (
  relay_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id TEXT UNIQUE NOT NULL,
  storefront_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  encrypted_customer TEXT NOT NULL,
  wrapped_customer_key TEXT NOT NULL,
  wilaya_code TEXT NOT NULL,
  delivery_mode TEXT NOT NULL,
  subtotal_dzd INTEGER NOT NULL,
  shipping_dzd INTEGER NOT NULL,
  total_dzd INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'received' CHECK(state IN ('received','imported','rejected','reconciled')),
  canonical_order_ref TEXT,
  result_digest TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(storefront_id) REFERENCES storefront(storefront_id) ON DELETE CASCADE,
  FOREIGN KEY(release_id) REFERENCES storefront_release(release_id),
  UNIQUE(storefront_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS storefront_receipt_poll_idx
  ON storefront_receipt(storefront_id, relay_sequence, state);

CREATE TABLE IF NOT EXISTS storefront_receipt_line (
  receipt_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price_dzd INTEGER NOT NULL CHECK(unit_price_dzd >= 0),
  PRIMARY KEY(receipt_id, item_key),
  FOREIGN KEY(receipt_id) REFERENCES storefront_receipt(receipt_id) ON DELETE CASCADE,
  FOREIGN KEY(release_id, item_key) REFERENCES storefront_allocation(release_id, item_key)
);

CREATE TRIGGER IF NOT EXISTS storefront_receipt_allocation_guard
BEFORE INSERT ON storefront_receipt_line
BEGIN
  SELECT CASE
    WHEN COALESCE((
      SELECT remaining_quantity
        FROM storefront_allocation
       WHERE release_id = NEW.release_id AND item_key = NEW.item_key
    ), -1) < NEW.quantity
    THEN RAISE(ABORT, 'allocation_exhausted')
  END;
END;

CREATE TRIGGER IF NOT EXISTS storefront_receipt_allocation_decrement
AFTER INSERT ON storefront_receipt_line
BEGIN
  UPDATE storefront_allocation
     SET remaining_quantity = remaining_quantity - NEW.quantity
   WHERE release_id = NEW.release_id AND item_key = NEW.item_key;
END;
