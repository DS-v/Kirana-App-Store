// WhatsApp Business deep-link helpers (no API key required)
// All functions return a wa.me URL that opens WhatsApp with pre-filled text.
// The shopkeeper taps the link → WhatsApp opens → they press Send.

export function waLink(phone, message) {
  const cleaned = phone.replace(/\D/g, '')
  const full = cleaned.startsWith('91') ? cleaned : `91${cleaned}`
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`
}

// Build a UPI payment footer that's appended to payment-relevant messages.
// We include both the readable VPA (for copy-paste into any UPI app) and a
// upi:// deep link with the amount pre-filled (works as an intent on
// Android — long-press in WhatsApp gives a copy/open option).
function upiFooter(upiId, amount, payeeName) {
  if (!upiId) return ''
  const trimmed = String(upiId).trim()
  if (!trimmed) return ''
  const params = new URLSearchParams({
    pa: trimmed,
    ...(payeeName ? { pn: payeeName } : {}),
    ...(amount ? { am: Number(amount).toFixed(2), cu: 'INR' } : {}),
  })
  const upiLink = `upi://pay?${params.toString()}`
  return `\n\n💳 *Pay via UPI*\nVPA: \`${trimmed}\`${amount ? `\nAmount: ₹${Number(amount).toFixed(0)}` : ''}\n${upiLink}`
}

// ── Inbound order flow ────────────────────────────────────────────────────────

/**
 * Sent immediately after the shopkeeper receives a WhatsApp order message,
 * even before confirming it — lets the customer know it was seen.
 */
export function sendOrderAcknowledgement(phone, customerName, itemCount) {
  const msg =
`Namaste ${customerName} ji! 🙏

We received your order (${itemCount} item${itemCount !== 1 ? 's' : ''}) and are reviewing it now.

We'll confirm shortly. Thank you for ordering with us! 😊`
  return waLink(phone, msg)
}

/**
 * Sent after the shopkeeper taps Confirm — full itemised receipt.
 * Includes UPI payment footer when shop has a UPI ID set.
 */
export function sendOrderConfirmation(phone, customerName, items, total, opts = {}) {
  const { upiId, shopName } = opts
  const lines = items.map(i => `• ${i.productName} ×${i.qty} ${i.unit} — ₹${(i.price * i.qty).toFixed(0)}`).join('\n')
  const msg =
`✅ Order Confirmed!

${lines}

💰 *Total: ₹${total.toFixed(0)}*

Thank you ${customerName} ji! We'll pack your order shortly. 🙏${upiFooter(upiId, total, shopName)}`
  return waLink(phone, msg)
}

/**
 * Sent when shopkeeper marks order as Packed — ready for delivery/pickup.
 */
export function sendOrderPacked(phone, customerName) {
  const msg =
`📦 Your order is packed and ready, ${customerName} ji!

It will be delivered to you shortly. 🚀

Thank you for your patience! 🙏`
  return waLink(phone, msg)
}

/**
 * Sent when shopkeeper marks order as Delivered — delivery confirmation.
 * Includes UPI footer when amount is unpaid.
 */
export function sendOrderDelivered(phone, customerName, total, opts = {}) {
  const { upiId, shopName, amountDue } = opts
  const msg =
`✅ Order Delivered!

Your order has been delivered, ${customerName} ji.
${total ? `\n💰 Amount: ₹${total.toFixed(0)}` : ''}

Thank you for shopping with us! Please share your feedback. 😊🙏${upiFooter(upiId, amountDue ?? total, shopName)}`
  return waLink(phone, msg)
}

// ── OOS / substitution ────────────────────────────────────────────────────────

export function sendOutOfStockNotice(phone, customerName, outItems, altItems = []) {
  const oos  = outItems.map(i => `• ${i.productName}`).join('\n')
  const alts = altItems.length
    ? '\n\nAvailable alternatives:\n' + altItems.map(i => `• ${i.productName} — ₹${i.price}/${i.unit}`).join('\n')
    : ''
  const msg =
`⚠️ Update on your order, ${customerName} ji:

The following items are currently out of stock:
${oos}${alts}

Please let us know how you'd like to proceed. 🙏`
  return waLink(phone, msg)
}

// ── Udhaar / credit ───────────────────────────────────────────────────────────

export function sendUdhaarReminder(phone, customerName, amount, opts = {}) {
  const { upiId, shopName } = opts
  const msg =
`Namaste ${customerName} ji 🙏

Hope you're well! This is a gentle reminder that your current balance is *₹${amount}*.

Please settle at your convenience. Thank you for your trust! 😊${upiFooter(upiId, amount, shopName)}`
  return waLink(phone, msg)
}

export function sendUdhaarThankYou(phone, customerName, amount) {
  const msg =
`Dhanyawad ${customerName} ji! 🙏

We received your payment of *₹${amount}*. Your account is now clear. ✅

Thank you for shopping with us! 😊`
  return waLink(phone, msg)
}

// ── End-of-day report to shop owner ──────────────────────────────────────────

export function sendEndOfDaySummary(phone, summary) {
  const { date, totalOrders, fulfilled, missed, collected, credit, stockAlerts } = summary
  const alerts = stockAlerts.length ? `\n⚠️ Low/OOS: ${stockAlerts.join(', ')}` : ''
  const msg =
`📊 *End of Day – ${date}*

📦 Orders: ${totalOrders} total
✅ Fulfilled: ${fulfilled}
❌ Missed: ${missed}
💵 Collected: ₹${collected}
📋 Credit issued: ₹${credit}${alerts}

Jai Hind! 🇮🇳`
  return waLink(phone, msg)
}

// ── Generic helper ────────────────────────────────────────────────────────────

export function sendOrderToWhatsApp(phone, orderText) {
  return waLink(phone, orderText)
}
