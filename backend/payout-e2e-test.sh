#!/usr/bin/env bash
# End-to-end payout flow test
# Run backend first: npm run dev (port 5000)
# Fill in the variables below before running.
#
# Flow:
#   Customer pays → Vendor accepts/readies → Rider picks up/delivers
#   → Earning + VendorPayout created → Admin triggers batch
#   → Paystack initiates transfers → Webhook fires → Records COMPLETED

BASE="http://localhost:5000/api/v1"

# ── 0. Tokens (register/login manually first, then paste below) ─────────────
CUSTOMER_TOKEN=""
VENDOR_TOKEN=""
RIDER_TOKEN=""
ADMIN_TOKEN=""

# ── 1. Customer: get a vendor and add to cart ───────────────────────────────
echo "=== GET vendors ==="
curl -s -X GET "$BASE/vendors?lat=4.8&lng=7.0" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" | jq '.data[0] | {id, businessName}'

# Paste vendor id from above:
VENDOR_ID=""

echo "=== GET menu ==="
curl -s "$BASE/vendors/$VENDOR_ID/menu" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" | jq '.data[0] | {id, name, price}'

MENU_ITEM_ID=""

echo "=== ADD to cart ==="
curl -s -X POST "$BASE/cart/items" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"menuItemId\":\"$MENU_ITEM_ID\",\"quantity\":2}"

# ── 2. Customer: save address ────────────────────────────────────────────────
echo "=== SAVE address ==="
curl -s -X POST "$BASE/addresses" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"Home","address":"5 Test Street","city":"Port Harcourt","state":"Rivers","latitude":4.82,"longitude":7.05}'

ADDRESS_ID=""

# ── 3. Customer: place order ─────────────────────────────────────────────────
echo "=== PLACE order ==="
curl -s -X POST "$BASE/orders" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"deliveryAddressId\":\"$ADDRESS_ID\",\"paymentMethod\":\"CARD\"}" | jq '{id, orderNumber, subtotal, deliveryFee, platformFee, totalAmount}'

ORDER_ID=""
ORDER_NUMBER=""

# ── 4. Customer: initialize payment ─────────────────────────────────────────
echo "=== INIT payment ==="
curl -s -X POST "$BASE/payments/initialize" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"$ORDER_ID\"}" | jq '{authorizationUrl, reference}'

PAYSTACK_REF=""

# Visit authorizationUrl in browser and complete test payment, then:

# ── 5. Customer: verify payment ──────────────────────────────────────────────
echo "=== VERIFY payment ==="
curl -s -X POST "$BASE/payments/verify" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"reference\":\"$PAYSTACK_REF\",\"orderId\":\"$ORDER_ID\"}" | jq .

# ── 6. Vendor: accept then mark ready ───────────────────────────────────────
echo "=== VENDOR accept ==="
curl -s -X PATCH "$BASE/vendors/me/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $VENDOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"accept"}' | jq .

echo "=== VENDOR mark ready ==="
curl -s -X PATCH "$BASE/vendors/me/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $VENDOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"ready"}' | jq .

# ── 7. Rider: go online, accept job, pick up, deliver ───────────────────────
echo "=== RIDER go online ==="
curl -s -X PATCH "$BASE/riders/me/online" \
  -H "Authorization: Bearer $RIDER_TOKEN" | jq .

echo "=== RIDER accept job ==="
curl -s -X POST "$BASE/riders/me/accept/$ORDER_ID" \
  -H "Authorization: Bearer $RIDER_TOKEN" | jq .

echo "=== RIDER picked up ==="
curl -s -X PATCH "$BASE/riders/me/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"PICKED_UP"}' | jq .

echo "=== RIDER delivered ==="
curl -s -X PATCH "$BASE/riders/me/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"DELIVERED"}' | jq .

# ── 8. Verify earning + vendor payout were created ───────────────────────────
echo "=== RIDER earnings ==="
curl -s "$BASE/riders/me/earnings" \
  -H "Authorization: Bearer $RIDER_TOKEN" | jq .
# pendingPayout should be deliveryFee * 0.85

echo "=== VENDOR earnings ==="
curl -s "$BASE/vendors/me/earnings" \
  -H "Authorization: Bearer $VENDOR_TOKEN" | jq .
# pendingPayout should be subtotal * (0.97 or 0.925)

# ── 9. Admin: trigger payout batch ───────────────────────────────────────────
echo "=== TRIGGER payout batch ==="
curl -s -X POST "$BASE/admin/payouts/run-batch" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
# Watch server logs for "Transfer initiated" lines

# ── 10. Check payout status ──────────────────────────────────────────────────
echo "=== ADMIN payouts ==="
curl -s "$BASE/admin/payouts" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data[] | {name, type, amountDue, status}'

echo "=== RIDER earnings after batch ==="
curl -s "$BASE/riders/me/earnings" \
  -H "Authorization: Bearer $RIDER_TOKEN" | jq .
# pendingPayout = 0 once Paystack fires transfer.success webhook

# ── 11. Simulate Paystack transfer.success webhook (dev only) ─────────────
# Use Paystack CLI: paystack webhook trigger transfer.success
# OR manually call it with the transfer_code from the batch log
# The webhook is at POST /api/v1/payments/webhook
