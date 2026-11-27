# Jholzo app notifications

Every notification the apps get by themselves, with its exact words. The words live in
`supabase/functions/push-notify/index.ts`; the database triggers decide when (update 077).
`#DG-1001` / `#JF-1001` is the order number, `₹245` the order total, `Bikash` the rider's first name,
`Food delight` the restaurant. Tapping one opens that order in the app.

## Grocery orders

| When | Title | Message |
|---|---|---|
| Order placed | Order received 🧾 | We got your order #DG-1001. We will deliver it within 30–45 minutes. |
| Order placed with UPI (not paid yet) | Order received 🧾 | We got your order #DG-1001. Finish the UPI payment and we will deliver it within 30–45 minutes. |
| Order confirmed | *(nothing; "Order received" already said it)* | |
| Rider leaves with it | Your order is on the way 🛵 | Our rider has left with your order #DG-1001. It will reach you in 10–15 minutes. Please keep ₹245 ready (cash or UPI). *(paid: "Already paid ✓")* |
| Rider reaches the door | Rider at your door 📍 | Our rider has reached your location with order #DG-1001. Please keep ₹245 ready (cash or UPI). |
| Delivered | Your order has been delivered 🎉 | Order #DG-1001 is delivered. Thank you for shopping with Jholzo. Keep shopping! |
| Cancelled | Order cancelled | Your order #DG-1001 was cancelled: *reason*. Need help? Open Jholzo → Help. |

## Food orders

| When | Title | Message |
|---|---|---|
| Order placed | Order received 🧾 | We got your order #JF-1001 from Food delight. We are confirming it with the restaurant now. |
| A rider takes it | *(nothing)* | |
| Rider has called the restaurant | Your food is being prepared 🍳 | Food delight has your order #JF-1001 and is cooking it now. |
| Rider picked up the food | Your food is on the way 🛵 | Bikash has picked up your food from Food delight and is coming to you. Please keep ₹245 ready (cash or UPI). |
| Delivered | Your order has been delivered 😋 | Enjoy your meal! Order #JF-1001 is delivered. Thanks for ordering from Jholzo Food. Order again anytime! |
| Cancelled (e.g. the restaurant can't make it) | Food order cancelled | Your order #JF-1001 was cancelled: The restaurant could not take this order. Need help? Open Jholzo → Help. |

Rider pages from before update 073 also send "Rider on the way to the restaurant 🛵", "Rider at the restaurant 🥡"
and "Rider at your door 📍".

## Help & support

| When | Title | Message |
|---|---|---|
| The team answers | Jholzo Support replied | *the answer* |
| The request is closed | Request HT-1001 resolved | *the closing note* |

## Sent only when the owner presses the button

**Jholzo Money** (Admin → Jholzo Money). After giving money, a "Tell them in the app" box shows these words; they can
be changed before pressing Send. Nothing goes out without pressing it. It opens Jholzo Money in the app.

| What | Title | Message |
|---|---|---|
| Gift money, any order | ₹50 added to your Jholzo Money 🎁 | Use it on your next order before 4 Dec, 11:59 PM. It comes off your bill by itself. Happy shopping! |
| Gift money, from ₹199 | ₹50 added to your Jholzo Money 🎁 | Use it on an order of ₹199 or more before 4 Dec, 11:59 PM. It comes off your bill by itself. Happy shopping! |
| Money added by hand (with a reason) | ₹20 added to your Jholzo Money 🎁 | Sorry for the late delivery. Use it on your next order. It comes off your bill by itself. |

"Give to all customers" sends the same words to all customers (everyone logged in to the app, blocked numbers left out).

**Admin → App → Notifications**: anything you write, to everyone with the app, all customers, grocery customers,
food customers, Android or iPhone only, or chosen numbers.
