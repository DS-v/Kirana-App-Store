// WhatsApp Business deep-link helpers (no API key required for MVP)

export function waLink(phone, message) {
  const cleaned = phone.replace(/\D/g, '')
  const full = cleaned.startsWith('91') ? cleaned : `91${cleaned}`
  const encoded = encodeURIComponent(message)
  return `https://wa.me/${full}?text=${encoded}`
}

export function sendOrderConfirmation(phone, customerName, items, total) {
  const lines = items.map(i => `• ${i.productName} x${i.qty} ${i.unit} — ₹${(i.price * i.qty).toFixed(0)}`).join('\n')
  const msg =
`✅ Order Confirmed – ${new Date().toLocaleDateString('en-IN')}

${lines}

💰 Total: ₹${total.toFixed(0)}

Thank you! 🙏`
  return waLink(phone, msg)
}

export function sendOutOfStockNotice(phone, customerName, outItems, altItems = []) {
  const oos = outItems.map(i => `• ${i.productName}`).join('\n')
  const alts = altItems.length
    ? '\n\nAvailable alternatives:\n' + altItems.map(i => `• ${i.productName} — ₹${i.price}/${i.unit}`).join('\n')
    : ''
  const msg =
`⚠️ Update on your order:

The following items are out of stock:
${oos}${alts}

Please let us know how you'd like to proceed. 🙏`
  return waLink(phone, msg)
}

export function sendUdhaarReminder(phone, customerName, amount) {
  const msg =
`Namaste ${customerName} ji 🙏

Hope you're well! This is a gentle reminder that your current balance is ₹${amount}.

Please settle at your convenience. Thank you for your trust! 😊`
  return waLink(phone, msg)
}

export function sendUdhaarThankYou(phone, customerName, amount) {
  const msg =
`Dhanyawad ${customerName} ji! 🙏

We received your payment of ₹${amount}. Your account is now up to date.

Thank you for shopping with us! 😊`
  return waLink(phone, msg)
}

export function sendEndOfDaySummary(phone, summary) {
  const { date, totalOrders, fulfilled, missed, collected, credit, stockAlerts } = summary
  const alerts = stockAlerts.length ? `\n⚠️ Low/OOS: ${stockAlerts.join(', ')}` : ''
  const msg =
`📊 End of Day Summary – ${date}

📦 Orders: ${totalOrders} total
✅ Fulfilled: ${fulfilled}
❌ Missed: ${missed}
💵 Collected: ₹${collected}
📋 Credit issued: ₹${credit}${alerts}

Jai Hind! 🇮🇳`
  return waLink(phone, msg)
}

export function sendOrderToWhatsApp(phone, orderText) {
  return waLink(phone, orderText)
}
