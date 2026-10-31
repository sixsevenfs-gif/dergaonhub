// Sales numbers for one day or a range, and the downloadable sheet (CSV opens in Excel and Google Sheets).
// Sales count only delivered orders, the same as Daily summary.
import { addDays } from './format.js'

const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0)
const isCash = (o) => o.payment_method === 'cash'
const payLabel = (o) => (isCash(o) ? 'Cash' : 'UPI')

export function summarize(orders, expenses = []) {
  const done = orders.filter((o) => o.status === 'completed')
  const cash = sum(done.filter(isCash), (o) => o.cash_collected)
  const upi = sum(done.filter((o) => !isCash(o)), (o) => o.total)
  const spent = sum(expenses, (e) => e.amount)
  return {
    orders: orders.length,
    delivered: done.length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
    pending: orders.filter((o) => o.status === 'placed' || o.status === 'confirmed').length,
    sales: sum(done, (o) => o.total),
    cash,
    upi,
    deliveryFees: sum(done, (o) => o.delivery_fee) + sum(done, (o) => o.express_fee),
    packaging: sum(done, (o) => o.packaging_fee),
    walletUsed: sum(done, (o) => o.wallet_used),
    itemsSold: sum(done, (o) => sum(o.items ?? [], (i) => i.quantity)),
    customers: new Set(done.map((o) => o.customer_phone)).size,
    avgOrder: done.length ? Math.round(sum(done, (o) => o.total) / done.length) : 0,
    spent,
    profit: cash + upi - spent,
  }
}

// What sold, most first (delivered orders only): pieces, how many orders had it, money, customers, last day.
export function itemsSold(orders) {
  const map = {}
  for (const o of orders.filter((x) => x.status === 'completed')) {
    for (const i of o.items ?? []) {
      const row = (map[i.name_snapshot] ??= { name: i.name_snapshot, productId: i.product_id, quantity: 0, orders: 0, amount: 0, phones: new Set(), lastDate: '' })
      row.quantity += i.quantity
      row.orders += 1
      row.amount += Number(i.line_total) || 0
      row.phones.add(o.customer_phone)
      if (o.delivery_date > row.lastDate) row.lastDate = o.delivery_date
    }
  }
  return Object.values(map)
    .map(({ phones, ...row }) => ({ ...row, customers: phones.size }))
    .sort((a, b) => b.quantity - a.quantity || b.amount - a.amount)
}

// The top-items table as a sheet.
export function itemsCSV({ from, to, items }) {
  const out = [line([`Jholzo top items: ${from} to ${to}`]), line(['Delivered orders only. Amounts in rupees.']), '']
  out.push(line(['Rank', 'Item', 'Times ordered', 'Quantity', 'Amount', 'Customers', 'Last ordered']))
  items.forEach((i, n) => out.push(line([n + 1, i.name, i.orders, i.quantity, i.amount, i.customers, i.lastDate])))
  return out.join('\r\n')
}

const cell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const line = (values) => values.map(cell).join(',')
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '')

// One sheet with three parts: day by day, every order, and items sold.
export function reportCSV({ from, to, orders, expenses }) {
  const out = []
  const total = summarize(orders, expenses)
  out.push(line([`Jholzo sales report: ${from === to ? from : `${from} to ${to}`}`]))
  out.push(line(['Sales count delivered orders only. Amounts in rupees.']))
  out.push('')

  out.push(line(['DAY BY DAY']))
  out.push(line(['Date', 'Orders', 'Delivered', 'Cancelled', 'Pending', 'Sales', 'Cash', 'UPI', 'Delivery charges', 'Packaging', 'Wallet used', 'Items sold', 'Spent at shops', 'Profit']))
  const row = (label, s) => [label, s.orders, s.delivered, s.cancelled, s.pending, s.sales, s.cash, s.upi, s.deliveryFees, s.packaging, s.walletUsed, s.itemsSold, s.spent, s.profit]
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(line(row(d, summarize(orders.filter((o) => o.delivery_date === d), expenses.filter((e) => e.date === d)))))
  }
  out.push(line(row('TOTAL', total)))
  out.push('')

  out.push(line(['ORDERS']))
  out.push(line(['Date', 'Order no', 'Time placed', 'Customer', 'Phone', 'Area', 'Status', 'Payment', 'Items', 'Item count', 'Items total', 'Delivery charge', 'Express charge', 'Packaging', 'Wallet used', 'Order total', 'Cash collected', 'Cancel reason']))
  for (const o of orders) {
    const items = o.items ?? []
    out.push(line([
      o.delivery_date, o.order_number, timeOf(o.created_at), o.customer_name, o.customer_phone, o.area, o.status === 'completed' ? 'delivered' : o.status, payLabel(o),
      items.map((i) => `${i.name_snapshot} x${i.quantity}`).join('; '), sum(items, (i) => i.quantity),
      o.subtotal, o.delivery_fee, o.express_fee ?? 0, o.packaging_fee ?? 0, o.wallet_used ?? 0, o.total, o.cash_collected ?? 0, o.cancel_reason,
    ]))
  }
  out.push('')

  out.push(line(['ITEMS SOLD']))
  out.push(line(['Item', 'Times ordered', 'Quantity', 'Amount', 'Customers']))
  for (const i of itemsSold(orders)) out.push(line([i.name, i.orders, i.quantity, i.amount, i.customers]))

  return out.join('\r\n')
}

// Saves the sheet as a file (the BOM makes Excel read ₹ and Hindi names correctly).
export function downloadCSV(fileName, csv) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
