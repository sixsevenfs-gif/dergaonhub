// Policy page text. Business details come from LEGAL in src/config.js; timings and fees from
// Admin → Settings, so the pages always match how the store actually works.
// Plain-language starting point: have it checked by someone qualified before launch.
import { CONFIG, LEGAL } from '../config.js'
import { fmtTime, rupee } from '../lib/format.js'
import { H, P, UL } from '../components/Prose.jsx'

const contactLine = (store) => `phone/WhatsApp +91 ${store.phone}, email ${LEGAL.EMAIL}`

export const POLICIES = {
  about: {
    title: 'About us',
    body: (store) => (
      <>
        <P>
          {LEGAL.BRAND} is an online grocery store for Dergaon, run by {LEGAL.COMPANY}. You order daily essentials
          on our website, and we bring them to your door the same evening.
        </P>
        <H>How it works</H>
        <UL items={[
          `Order before ${fmtTime(store.cutoff_time)} and we deliver today between ${fmtTime(store.slot_start)} and ${fmtTime(store.slot_end)}.`,
          'We call you to confirm your order.',
          'We buy your items fresh from trusted local shops in Dergaon and pack them for you.',
          'You pay on delivery, by cash or UPI.',
        ]} />
        <H>Where we deliver</H>
        <P>{store.delivery_area.join(', ')}. More areas are coming soon.</P>
      </>
    ),
  },

  contact: {
    title: 'Contact us',
    body: (store) => (
      <>
        <P>We are happy to help with orders, delivery, payments or anything else.</P>
        <UL items={[
          `Phone: +91 ${store.phone} (${fmtTime(store.open_time)} – ${fmtTime(store.close_time)})`,
          `WhatsApp: +91 ${store.whatsapp.slice(-10)}`,
          `Email: ${LEGAL.EMAIL}`,
          `Address: ${LEGAL.ADDRESS}`,
        ]} />
        <H>Problem with an order?</H>
        <P>
          Open the order from "My orders" and tap "Report a problem". We reply on the same order page and usually
          sort it out within a day.
        </P>
        <H>Grievance officer</H>
        <P>
          {LEGAL.GRIEVANCE_OFFICER}, {LEGAL.COMPANY}, {LEGAL.ADDRESS}. Contact: {contactLine(store)}. We acknowledge
          complaints within 48 hours and aim to resolve them within one month.
        </P>
      </>
    ),
  },

  privacy: {
    title: 'Privacy policy',
    body: (store) => (
      <>
        <P>This policy explains what information {LEGAL.BRAND} ({LEGAL.COMPANY}) collects and how we use it.</P>
        <H>What we collect</H>
        <UL items={[
          'Your name, phone number, delivery address and area, which you enter at checkout.',
          'Your orders: items, amounts, payment method (cash or UPI), delivery status and any notes.',
          'Complaints you report and our replies.',
          'Your phone number when you log in to see your orders.',
        ]} />
        <P>We do not collect card or bank details. You pay us directly on delivery.</P>
        <H>How we use it</H>
        <UL items={[
          'To confirm, prepare and deliver your order, and to call or WhatsApp you about it.',
          'To send your bill on WhatsApp after delivery.',
          'To show your order history and handle complaints.',
          'To prevent fake orders, for example limits on first orders and blocking numbers after repeated no-shows.',
        ]} />
        <H>Who we share it with</H>
        <P>
          We do not sell your information. The person delivering your order sees your name, phone and address. We may
          share information if the law requires it.
        </P>
        <H>WhatsApp and phone</H>
        <P>
          When you tap a WhatsApp button, the message is sent through WhatsApp, which has its own privacy policy. We
          only message you about your orders.
        </P>
        <H>Stored on your phone</H>
        <P>
          The website remembers your cart, your login and your last delivery details on your phone so you don't have
          to type them again. You can clear them by logging out or clearing your browser data.
        </P>
        <H>How long we keep it</H>
        <P>We keep order records for as long as needed for accounts and legal reasons, then delete them.</P>
        <H>Your choices</H>
        <P>
          You can ask us to show, correct or delete your information at {contactLine(store)}. Some order records may
          need to be kept for accounts.
        </P>
        <H>Changes</H>
        <P>If we change this policy, we will update this page and the date below.</P>
      </>
    ),
  },

  terms: {
    title: 'Terms & conditions',
    body: (store) => (
      <>
        <P>
          By ordering on {LEGAL.BRAND}, run by {LEGAL.COMPANY}, you agree to these terms. Please read them along with
          our Refund & cancellation and Delivery policies.
        </P>
        <H>Orders</H>
        <UL items={[
          'Placing an order is a request. It is final only after we call you and confirm it.',
          `Minimum order value is ${rupee(store.min_order)}. A delivery charge (by distance, minimum ${rupee(store.min_delivery_fee)}) and a packaging charge (${rupee(store.pack_fee_low)} to ${rupee(store.pack_fee_high)} by order value) are added and shown before you place the order.`,
          `For a phone number's first order, the limit is ${rupee(CONFIG.FIRST_ORDER_LIMIT)}. It goes up after a successful delivery.`,
          'We may refuse or cancel an order, for example if an item is not available, the address is outside our delivery area, or details look fake.',
        ]} />
        <H>Prices and items</H>
        <UL items={[
          'Prices on the website are in Indian Rupees and can change. You pay the price shown when you placed the order.',
          'Photos are for reference only. The actual pack may look different.',
          'If your chosen brand is not available and you allowed a similar brand, we may send one of the same type and size at about the same price. Otherwise we remove the item and tell you the new total.',
        ]} />
        <H>Payment</H>
        <P>You pay on delivery by cash or UPI. Please check the amount before paying. We do not give credit (udhaar).</P>
        <H>No-shows</H>
        <P>
          If you are not available or refuse a confirmed order without a valid reason, it counts as a no-show. After{' '}
          {CONFIG.NO_SHOW_LIMIT} no-shows, online ordering from that number is blocked.
        </P>
        <H>Use of the website</H>
        <P>Please don't place fake orders, use someone else's number, or misuse the website.</P>
        <H>Our responsibility</H>
        <P>
          We take care to deliver the right items in good condition. If something goes wrong, we will replace or
          refund as described in our Refund & cancellation policy. Our responsibility is limited to the value of the
          order.
        </P>
        <H>Disputes</H>
        <P>These terms follow the laws of India. Courts in Golaghat, Assam have jurisdiction.</P>
        <H>Contact</H>
        <P>{contactLine(store)}.</P>
      </>
    ),
  },

  refund: {
    title: 'Refund & cancellation',
    body: () => (
      <>
        <H>Cancelling an order</H>
        <UL items={[
          'Before we confirm your order: cancel any time, free. Just tell us when we call, or WhatsApp us.',
          'After we confirm: we buy your items from the shop, so the order cannot be cancelled. Please be available at delivery time.',
          'We may cancel an order if items are not available. You pay nothing for cancelled orders.',
        ]} />
        <H>Check at the door</H>
        <P>Please check your items when you receive them, before paying. You can refuse a damaged or wrong item right there and you will not be charged for it.</P>
        <H>Problems after delivery</H>
        <P>
          If an item is damaged, expired, wrong or missing, report it within {LEGAL.COMPLAINT_HOURS} hours from "My
          orders" → "Report a problem". If you can, send a photo on WhatsApp too. After checking, we will:
        </P>
        <UL items={[
          'replace the item in your next delivery slot, or',
          'refund the item amount by UPI or cash within 3 working days.',
        ]} />
        <H>What we can't take back</H>
        <UL items={[
          'Opened or used items, unless they were damaged or expired when delivered.',
          'Items reported after the time above.',
        ]} />
        <H>Refund method</H>
        <P>Refunds go back the way you paid: UPI to the same number, cash with your next order or at your door.</P>
      </>
    ),
  },

  delivery: {
    title: 'Delivery policy',
    body: (store) => (
      <>
        <H>Delivery areas</H>
        <P>We currently deliver in {store.delivery_area.join(', ')}, up to {store.max_delivery_km} km from our store.</P>
        <H>Delivery time</H>
        <UL items={[
          `Orders placed before ${fmtTime(store.cutoff_time)} are delivered the same day between ${fmtTime(store.slot_start)} and ${fmtTime(store.slot_end)}.`,
          'Orders placed after that time are delivered the next day in the same slot.',
          `We deliver up to ${CONFIG.DELIVERY_CAP} orders per evening. If the slot is full, your order moves to the next day and the website shows the date before you order.`,
          'Heavy rain, floods or other problems can delay delivery. We will call or WhatsApp you if that happens, and we may pause new orders for the day.',
        ]} />
        <H>Charges</H>
        <P>
          Minimum order {rupee(store.min_order)}. The delivery charge depends on how far you are from us (minimum{' '}
          {rupee(store.min_delivery_fee)}), worked out from the pin you set on the map. A packaging charge of{' '}
          {rupee(store.pack_fee_low)} (orders below {rupee(store.pack_mid_from)}), {rupee(store.pack_fee_mid)} (below{' '}
          {rupee(store.pack_high_from)}) or {rupee(store.pack_fee_high)} (larger orders) is added. Both are shown before you place the order.
        </P>
        <H>At delivery</H>
        <UL items={[
          'Please keep your phone on. We call when we are near.',
          'If we can\'t reach you after trying, the order may be cancelled as a no-show.',
          'You get your bill on WhatsApp after delivery.',
        ]} />
        <H>Track your order</H>
        <P>See the status any time on the order page, or from "My orders".</P>
      </>
    ),
  },
}
