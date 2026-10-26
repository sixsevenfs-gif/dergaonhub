// The bill as a PDF (A6-width receipt), made in the browser. jsPDF's built-in font has no ₹ sign,
// so amounts are written as "Rs. 285".
import { jsPDF } from 'jspdf'
import { LEGAL } from '../config.js'

const rs = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100
  return 'Rs. ' + v.toLocaleString('en-IN', Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const when = (iso) =>
  new Date(iso ?? Date.now()).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export const billUrl = (order) => `${window.location.origin}/bill/${order.order_number}`

export function billPdf({ order, items, store }) {
  const W = 105
  const rowH = 6
  const H = 120 + items.length * rowH + (order.ordered_by_phone ? 5 : 0)
  const doc = new jsPDF({ unit: 'mm', format: [W, H] })
  const L = 8
  const R = W - 8

  // Header band
  doc.setFillColor(11, 11, 11)
  doc.rect(0, 0, W, 26, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(255, 255, 255)
  doc.text('dergaon', L, 13)
  doc.setTextColor(232, 255, 58)
  doc.text('hub', L + doc.getTextWidth('dergaon '), 13)
  doc.setFont('helvetica', 'normal')
  // "Powered by" follows the switch in Admin → Settings.
  if (store?.show_powered_by !== false) {
    doc.setFontSize(6.5)
    doc.setTextColor(170, 168, 160)
    doc.text(`POWERED BY ${LEGAL.COMPANY.toUpperCase()}`, L, 18.5)
  }
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('BILL / RECEIPT', R, 13, { align: 'right' })
  doc.setTextColor(232, 255, 58)
  doc.text(`#${order.order_number}`, R, 18.5, { align: 'right' })

  // Customer and date
  let y = 34
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text(order.customer_name, L, y)
  doc.setFont('helvetica', 'normal')
  doc.text(when(order.completed_at ?? order.created_at), R, y, { align: 'right' })
  y += 4.5
  doc.setTextColor(110, 110, 110)
  doc.setFontSize(7.5)
  const place = doc.splitTextToSize(order.address ?? '', R - L)[0] ?? ''
  if (place) doc.text(place, L, y)
  if (order.ordered_by_phone) {
    y += 4.5
    doc.text(`Ordered by ${order.ordered_by_name}`, L, y)
  }

  // Items
  y += 8
  doc.setDrawColor(220, 220, 220)
  doc.line(L, y - 4, R, y - 4)
  doc.setFontSize(7)
  doc.setTextColor(130, 130, 130)
  doc.text('ITEM', L, y)
  doc.text('QTY', 66, y, { align: 'right' })
  doc.text('AMOUNT', R, y, { align: 'right' })
  y += 2.5
  doc.line(L, y, R, y)
  y += 4.5
  doc.setFontSize(8.5)
  doc.setTextColor(30, 30, 30)
  for (const i of items) {
    doc.text(doc.splitTextToSize(i.name_snapshot, 52)[0], L, y)
    doc.text(String(i.quantity), 66, y, { align: 'right' })
    doc.text(rs(i.line_total), R, y, { align: 'right' })
    y += rowH
  }

  // Charges and total
  y += 1
  doc.line(L, y - 4, R, y - 4)
  const line = (label, value) => {
    doc.setTextColor(110, 110, 110)
    doc.text(label, L, y)
    doc.setTextColor(30, 30, 30)
    doc.text(value, R, y, { align: 'right' })
    y += 5
  }
  line('Items total', rs(order.subtotal))
  line('Delivery charge', order.delivery_fee ? rs(order.delivery_fee) : 'FREE')
  if (order.packaging_fee) line('Packaging charge', rs(order.packaging_fee))
  y += 3
  doc.setFillColor(244, 244, 240)
  doc.roundedRect(L - 2, y - 5, R - L + 4, 10, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(11, 11, 11)
  doc.text('Total', L, y + 1.5)
  doc.text(rs(order.total), R, y + 1.5, { align: 'right' })
  y += 11
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const paid = order.status === 'completed'
    ? `Paid by ${order.payment_method === 'cash' ? `cash${order.cash_collected ? ` (${rs(order.cash_collected)})` : ''}` : 'UPI'}`
    : `To pay on delivery: ${order.payment_method === 'cash' ? 'cash' : 'UPI'}`
  doc.setTextColor(16, 128, 70)
  doc.text(paid, L, y)

  // Footer
  y += 9
  doc.setTextColor(120, 120, 120)
  doc.setFontSize(7)
  doc.text('Thank you for shopping with Dergaon Hub!', W / 2, y, { align: 'center' })
  y += 4
  doc.text(`Problem with an item? Report within ${LEGAL.COMPLAINT_HOURS} hours: ${window.location.host}/report/${order.order_number}`, W / 2, y, { align: 'center', maxWidth: R - L })
  y += 4
  if (store?.phone) doc.text(`Call / WhatsApp: ${store.phone}`, W / 2, y, { align: 'center' })
  return doc
}

export const billFileName = (order) => `DergaonHub-Bill-${order.order_number}.pdf`

export function downloadBill(data) {
  billPdf(data).save(billFileName(data.order))
}

// Opens the phone's share sheet with the PDF (pick WhatsApp and the contact).
// Returns false where sharing files is not supported (most computers): download it instead.
export async function shareBill(data, text = '') {
  const file = new File([billPdf(data).output('blob')], billFileName(data.order), { type: 'application/pdf' })
  if (!navigator.canShare?.({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title: `Bill #${data.order.order_number}`, ...(text ? { text } : {}) })
  } catch {
    // closed the share sheet
  }
  return true
}
