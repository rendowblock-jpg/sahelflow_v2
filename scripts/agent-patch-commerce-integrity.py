from pathlib import Path

path = Path("src/lib/data/__tests__/data-integrity.test.ts")
text = path.read_text(encoding="utf-8")

old_seed = '''  it("sync an order → re-sync the same order → 1 order, 1 'created' OrderChange entry, customer not duplicated", async () => {
    const normalized: NormalizedOrder = {
'''
new_seed = '''  it("sync an order → re-sync the same order → 1 order, 1 'created' OrderChange entry, customer not duplicated", async () => {
    // Canonical provider intake requires an existing server-owned catalog price.
    await seedProductRaw({ name: "Widget A", price: 2000, stock: 100 });

    const normalized: NormalizedOrder = {
'''
old_number = '''    expect(ordersAfterFirst[0]!.orderNumber).toMatch(/^SYNC-SHOPIFY-\\d{4}$/);
'''
new_number = '''    expect(ordersAfterFirst[0]!.orderNumber).toMatch(/^ORD-\\d{4}$/);
'''

if text.count(old_seed) != 1:
    raise SystemExit("Expected exactly one Scenario 14 seed anchor")
if text.count(old_number) != 1:
    raise SystemExit("Expected exactly one Scenario 14 order-number assertion")

text = text.replace(old_seed, new_seed).replace(old_number, new_number)
path.write_text(text, encoding="utf-8")
