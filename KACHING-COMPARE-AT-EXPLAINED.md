# How the Kaching compare-at fix works

Everything about [`assets/kaching-addon-compare-at.js`](assets/kaching-addon-compare-at.js): the plan, why I asked for exactly those pieces of information, what each answer decided, every hard problem I hit, and how it was tested.

Written three times over: **English → বাংলা → English again**. Same content, so read whichever you like and skip the rest.

---
---

# Part 1 — English

## 0. TL;DR

The theme's own drawer could fix this in one line of Liquid. Kaching's drawer is an app embed with no Liquid at all, so the same arithmetic runs in the browser instead: read the cart from Shopify's Ajax API, read the variant from the product JSON, work out what Easify added, and rewrite the number Kaching already painted on screen — keeping its exact formatting, and re-doing it every time the app re-renders.

```
addon    = line list price (cart.js)  −  variant price (products.js)   →  37.95 − 32.95 = 5.00
new old  = rendered compare-at        +  addon × quantity              →  40.95 + 5.00  = 45.95
new save = new old                    −  rendered final price          →  45.95 − 37.95 = 8.00
```

## 1. The problem

A product sells at **€32,95** with a compare-at of **€40,95**. Easify adds a **€5,00** addon, so the customer pays **€37,95**. But compare-at is catalog data on the variant — it doesn't move. The drawer therefore showed:

| | Before | Client wanted |
|---|---|---|
| Struck-through price | €40,95 | **€45,95** |
| Price paid | €37,95 | €37,95 |
| Savings badge | You save €3 | **You save €8** |

## 2. Why Liquid was off the table

In the theme's own drawer this is trivial — the data is right there in [`snippets/cart-drawer.liquid:226`](snippets/cart-drawer.liquid#L226):

```liquid
{{ item.variant.compare_at_price | plus: item.original_price | minus: item.variant.price | money }}
```

But `config/settings_data.json` has this:

```json
"type": "shopify://apps/kaching-cart/blocks/embed/7705621e-3c0f-4e97-9d29-5c8528b19fb7"
```

An **app embed block**. Kaching ships its own JavaScript from Shopify's app CDN, and that script renders the entire drawer client-side. There is no `.liquid` file in this repo that produces a single pixel of it. Editing app code isn't possible, and asking Kaching to add the feature isn't a timeline anyone can plan around.

So: the theme can't *generate* the markup — but the theme's own JavaScript runs on the same page, in the same document, as Kaching's. Whatever Kaching paints, we can read and repaint. That's the whole idea.

## 3. How I planned it — starting from what I did *not* know

Before writing a line of code I listed everything the solution depended on, and marked what I actually knew:

| Question | Known? | Why it decides the design |
|---|---|---|
| How does Easify charge the addon? | ❌ | Separate line item vs. price bump on the same line are completely different fixes |
| Does the JS cart API expose what Liquid exposes? | ❌ | Liquid has `item.variant.price`; the Ajax API might not |
| Where does compare-at come from at runtime? | ❌ | If it isn't in the cart JSON, a second data source is needed |
| How does Kaching get its cart data? | ❌ | Standard Ajax API = we can listen in. Private app endpoint = we're blind |
| What is the drawer's DOM? | ❌ | Class names, nesting, and whether it's reachable at all |
| Is it inside shadow DOM? | ❌ | Closed shadow DOM would make this **impossible**, full stop |
| Does the app offer a supported hook? | ❌ | Always prefer a supported API over patching someone's DOM |

Seven unknowns, and guessing wrong on any of them means throwing the work away. That's why I asked instead of starting to type. I could read your theme, but I have no browser here — I can't add something to a cart and open devtools. You could, in about three minutes.

## 4. Why I asked for exactly those things

### Q1 — the `/cart.js` dump

**What it settled.** Look at what came back for the Magsafe line:

```json
{
  "variant_id": 54680191369559,
  "price": 3795,
  "original_price": 3795,
  "quantity": 1,
  "handle": "main-character",
  "has_components": true,
  "properties": {
    "Case Type": "Magsafe (€5,00)",
    "_po:items:addon": "[[{\"price\":5,...}]]"
  }
}
```

Five decisions came out of this single payload:

1. **`price: 3795` on the same variant.** The addon raises the price of the *existing* line — it is not a second line item. So the Liquid formula translates directly. If it had been a separate line, the whole approach would have been different (find the addon line, attribute it to its parent, hide it, and so on).
2. **`has_components: true`** means Shopify's cart-transform (a Shopify Function) is doing it. That confirms #1 from a second angle and explains the "Show 1 items" toggle in the drawer.
3. **No `compare_at_price` anywhere in the payload.** This is the important negative result. Liquid's `item.variant` is a full Variant object; the Ajax API's line item is a flat record with no variant object attached. So a second source was required — `/products/{handle}.js` — and that decision came straight from this dump.
4. **`price` vs `original_price` both present.** They're equal here because there's no discount, but that told me which one to use later (see §6.6).
5. **Two lines, same `variant_id`, same `handle`, different properties.** Your cart happened to contain exactly the nastiest case for matching rows to lines — I'll come back to this in §6.2. Enormously useful to see early.

Also: `price: 3795` matched the `€37,95` on screen exactly, which proved the cart API speaks the buyer's presentment currency. That mattered for §6.5.

### Q2 — the network request

You answered `https://baxxis.com/cart/update.js?kaching-cart=true`.

**What it settled.** That is Shopify's **standard Ajax Cart API**, just with a marker query parameter. It means Kaching's cart data travels over a channel I can observe from theme code — so the script can hold *the very same payload Kaching just rendered*, with no polling and no extra requests.

Had you answered "it's `/apps/kaching/cart` " (an app proxy) or "GraphQL to their own backend", the response body might not be Shopify's cart shape at all, and I'd have been forced into a worse design: poll `/cart.js` on a timer, or refetch on every DOM change, always slightly behind the app and occasionally showing a wrong number.

### Q3 — the outer HTML

The richest answer of the three. What I pulled out of it:

```html
<div class="kaching-cart-item-container">
  <div class="kaching-cart-item" data-product-handle="main-character" data-product-id="11091857965399">
    ...
    <div class="kaching-cart-item__total">
      <s class="kaching-cart-item__total-old">\u2068€40,95\u2069</s>
      <span class="kaching-cart-item__total-final">\u2068€37,95\u2069</span>
    </div>
    <div class="kaching-cart__badge"><span>You save \u2068€3\u2069</span></div>
```

1. **No shadow DOM.** Plain light DOM, so ordinary `querySelector` and a `MutationObserver` reach it. This was the go/no-go question — closed shadow DOM would have ended the project.
2. **Those `<!---->` comments everywhere.** That's Vue's empty-placeholder rendering. So the drawer is a **reactive app**: it re-renders itself whenever the cart changes, which means anything I write into it can be overwritten at any moment. That single observation is the reason the script is built around an observer and idempotent writes instead of a one-shot pass (§6.4, §6.5).
3. **Stable class names.** `kaching-cart-item__total-old` and friends carry no build hash — unlike Easify's `po-6AdUbe2b` classes we already learned never to touch. Safe to target, with the caveat in §11.
4. **`data-product-handle` but no variant id and no line key.** This created the matching problem in §6.2 — and, combined with the two identical-variant lines from Q1, told me a naive "match by handle" would be wrong.
5. **`\u2068` and `\u2069` around every price.** Those are invisible Unicode bidi isolates (U+2068 / U+2069). If I'd generated my own money strings with the theme's formatter, every rewritten price would have silently lost them, and could also have used a different separator or symbol placement. This is what pushed me to *derive* the format from the rendered string instead of building it (§6.3).
6. **The savings badge exists**, so fixing only the struck-through price would have left "You save €3" contradicting it on screen.
7. **A "Show 1 items" toggle** — bundle components render as their own rows *inside the same container*, so the selectors need to be scoped to avoid rewriting a component's price.

### Q4 — does Kaching offer an official hook?

You checked and found none. Worth thirty seconds: if the app had a supported customization API, using it would survive their updates. It doesn't, so DOM patching it is — with that trade-off now a known, documented risk rather than a surprise.

## 5. The formula

Per cart line:

```
listPrice   = item.original_price            // what the line costs before discounts, addon included
basePrice   = variant.price × ratio          // catalog price of that variant, currency-adjusted
addon       = listPrice − basePrice          // what Easify added, per unit

renderedOld = the compare-at Kaching printed // already compare_at × quantity, already converted
newOld      = renderedOld + addon × quantity
newSave     = newOld − renderedFinal
```

Note what is *not* recomputed: the compare-at itself is never rebuilt from catalog data — the number Kaching printed is taken as truth and only *added to*. That keeps us out of the currency, tax and rounding business entirely. The only thing crossing the boundary between the two data sources is the addon, and §6.5 handles that.

## 6. The seven hard problems

### 6.1 Compare-at isn't in the cart

Solved by fetching `/products/{handle}.js` and finding the variant by id. Cached per handle in a plain object, so a cart with five lines of the same product makes **one** request, and re-renders make none. The test run confirms it: 1 product fetch across the whole session.

### 6.2 Which DOM row is which cart line?

The row exposes only `data-product-handle`. Your cart had **two lines of the identical variant** — same product, same size, differing only by addon. So handle alone is ambiguous, and index-order matching is fragile (upsells, free gifts and component rows can all appear in the list).

The solution uses the one thing that *is* distinctive and already on screen: **the price**.

```js
if (row.finalCents === item.final_line_price) multiplier = item.quantity;
else if (row.finalCents === item.final_price)  multiplier = 1;
```

Rows are walked in DOM order and each cart line can be claimed only once, so even two lines that render identically resolve one-to-one. And the same comparison quietly answers a second question I could not otherwise settle without asking you to test quantity 2: **does the drawer print the line total or the unit price?** If the rendered figure equals `final_line_price` it's a line total and the addon must be multiplied by quantity; if it equals `final_price` it's a unit price and it must not. Self-detecting, no assumption.

If a row matches nothing, our copy of the cart must be behind — the script refetches `/cart.js` and runs again.

### 6.3 Formatting money exactly like Kaching does

Currency symbol, symbol position, `,` vs `.` for decimals, thousands grouping, decimal count, the bidi isolates, and per-market variations. Generating that correctly for every market is a losing game.

So the script never *generates* a money string — it **edits the one already there**. `describeFormat()` reads the rendered text and works out its rules:

- Find the numeric token: `\u2068€40,95\u2069` → `40,95`.
- A trailing separator counts as a decimal point only when 1–2 digits follow it — so `40,95` is 40 euro 95, while `1.234` is a thousands separator, not 1 euro 234.
- Whatever separator is left over is the grouping separator.
- Four-plus digits with no separator means this market doesn't group at all.

Then the new number is printed with those exact rules and spliced back into the original string by character offset, so the symbol, spacing and invisible characters survive untouched. `\u2068€40,95\u2069` → `\u2068€45,95\u2069`.

One nicety: Kaching writes round savings as `€3`, not `€3,00`. The formatter keeps a zero-decimal style when the new amount is round, but grows decimals when it isn't — `€8` and `€8,50` both come out right.

### 6.4 The compounding trap — the bug that would have shipped

This is the one that would have looked fine in testing and gone wrong in production.

The observer fires on *any* drawer mutation, not just cart changes. Pass one reads `40,95`, adds `5,00`, writes `45,95`. Something unrelated mutates — a hover, an upsell loading. Pass two reads the compare-at again… and now it reads **`45,95`**, our own output, and writes `50,95`. Then `55,95`. The price climbs forever.

The fix: every element the script touches carries a memory of both values.

```js
el.dataset.kcBase    = "\u2068€40,95\u2069";   // what Kaching rendered
el.dataset.kcWritten = "\u2068€45,95\u2069";   // what we put there
```

On each pass, if the text still equals `kcWritten`, the input is `kcBase` — our own output is never mistaken for source data. The moment Kaching re-renders, the text no longer matches our stamp and the fresh text becomes the new base automatically. No cleanup, no reset, no state to get out of sync.

(`data-*` attributes are safe to write because the observer watches `childList` and `characterData`, not `attributes` — stamping doesn't wake it.)

There's a test for exactly this: mutate something unrelated, then assert the price is still 45,95 and not 50,95.

### 6.5 Two data sources, possibly two currencies

`/cart.js` is definitely in the buyer's presentment currency (proved by `3795` matching `€37,95`). `/products/*.js` is *usually* converted too — but I can't guarantee it for every market, and if the two disagree, `listPrice − basePrice` stops being an addon and becomes an addon plus an exchange-rate error.

The script measures the discrepancy instead of assuming it away. Compare-at prices are never touched by addons, so:

```
ratio = (compare-at Kaching rendered) ÷ (compare-at from products.js)
```

is pure currency conversion, nothing else. Measured once per pass from any line that has one, then applied to the variant price before subtracting. Same currency → ratio is 1 → the formula collapses to the simple version. There's a test at a 1.2× rate that confirms a €5 addon still measures as exactly €5 and a no-addon line doesn't drift.

A 3-cent noise floor (`ADDON_NOISE_FLOOR`) absorbs conversion rounding, so a line with no addon is never nudged by a cent.

### 6.6 `price` or `original_price`?

I originally used `item.price`, then changed it while re-reading the flow. In the Ajax API, `price` reflects line-level discounts while `original_price` doesn't. With a 10% discount on the line, `price` would be 3416 and the "addon" would measure as €1,21 instead of €5,00 — a wrong compare-at, appearing only on discounted carts, which is exactly the kind of bug that survives a demo and shows up on Black Friday. `original_price` is discount-immune, and it's also what your Liquid formula used. There's a test for it.

### 6.7 Staying applied without fighting the app

Kaching re-renders reactively, so this can't be a one-shot script.

- A `MutationObserver` on the document watches `childList`, `subtree` and `characterData` — the last one matters because a quantity change may only rewrite a text node, replacing no elements.
- Every burst of mutations is collapsed into one pass with `requestAnimationFrame`, so a hundred mutations in a frame cost one run.
- Writes are skipped when the text is already correct. That's what makes it terminate: our write causes a mutation → the observer runs again → the value is already right → nothing is written → no further mutation. It settles after one extra no-op pass, every time. No flags, no fighting.
- If a pass is already running (waiting on a fetch), the next request is queued rather than run concurrently.

And the cart data stays fresh by listening to the app's own requests:

```js
window.fetch = function () {
  var promise = originalFetch.apply(this, arguments);   // untouched, returned as-is
  if (CART_JSON_RE.test(url)) {
    promise.then(res => res.clone().json().then(rememberCart));  // clone(), never the original body
  }
  return promise;
};
```

Two safety details in there. The original promise is returned unchanged, so Kaching's own code sees exactly what it would have seen. And the body is read from `res.clone()` — a response body can only be consumed once, so reading the original would break the app's own parsing. Everything is wrapped in `try`/`catch`; if the sniffing fails the app carries on, and the `/cart.js` fallback covers us anyway. XHR is patched too, since which transport the app uses is not something we control.

Shadow DOM was ruled out by your HTML, but a future app update could adopt it, so there's a throttled scan that finds an open shadow root and observes inside it as well.

## 7. What runs, in order, when a shopper changes quantity

1. Kaching sends `POST /cart/update.js?kaching-cart=true`.
2. Our `fetch` wrapper spots the URL, clones the response, and stores the fresh cart. Kaching's own code is unaffected.
3. Kaching's Vue re-renders the row with its own compare-at (`40,95` is back on screen).
4. That DOM change wakes the observer, which schedules a pass on the next animation frame.
5. `collectRows()` reads each row. Our stamp no longer matches (Vue overwrote it), so the fresh `40,95` becomes the new base.
6. `matchRowsToItems()` pairs rows with cart lines by handle + rendered price, and learns line-total vs unit-price mode.
7. Products are already cached — no request.
8. `currencyRatio()` measures conversion (1 in a single-currency store).
9. Addon computed, `45,95` written, badge updated.
10. Those writes cause one more observer pass, which finds everything already correct and writes nothing. Settled.

Total: zero extra network requests, one animation frame.

## 8. How it was tested without a browser

I can't open your store, so I rebuilt the relevant parts of it in **jsdom** — a real DOM implementation in Node — using **your actual markup** and **your actual cart payload**. Four suites:

| Suite | What it proves |
|---|---|
| `test-money` | 14 cases: parsing and rewriting `\u2068€40,95\u2069`, US `$1,234.56`, EU grouping, no-decimal currencies, nbsp separators, percent badges, `€8` vs `€8,50` |
| `test-drawer` | Full pipeline on your real HTML + real cart JSON: addon line corrected to €45,95 / "You save €8", the no-addon line untouched, an unrelated re-render **not** compounding to €50,95, quantity 2 giving €91,90 with a stale-cart refetch |
| `test-currency` | A 1.2× converted market: the addon still measures as exactly €5 and the no-addon line doesn't drift |
| `test-discount` | A 10%-off line still measures the full €5 addon (the `original_price` fix) |

All passing. They live in this session's scratch directory rather than the repo — say the word and I'll move them into the project so they can be re-run after any Kaching update.

**Confirmed working on the live store** by you on 2026-09-04. One caveat: the `original_price` fix in §6.6 was made *after* that browser check, so the asset needs re-uploading and a quick re-test.

What tests **cannot** prove, and you should still click through: real Kaching behaviour on remove/undo, the cart-level totals in the footer, quantity 2 in the actual app, and the currency switcher.

## 9. Files changed

| File | Change |
|---|---|
| [`assets/kaching-addon-compare-at.js`](assets/kaching-addon-compare-at.js) | New. The whole fix, ~430 lines with comments |
| [`layout/theme.liquid`](layout/theme.liquid) | Loads it, deferred, ungated (Kaching replaces whichever drawer the theme would show) |
| [`layout/landing.liquid`](layout/landing.liquid) | Same, for the landing layout |
| [`WORK-LOG.md`](WORK-LOG.md) | Entry for 2026-09-04 |

Nothing existing was modified — it's additive, and deleting the asset plus the two script tags reverts it completely.

## 10. Limitations, honestly

- **Addon bigger than the discount margin.** If compare-at is 34,95 and the addon pushes the price to 37,95, Kaching renders no `<s>` at all and there's nothing to rewrite — that line shows no strikethrough. I deliberately didn't fabricate one; tell me if the client wants it.
- **Cart-level totals untouched.** If the drawer footer shows a subtotal compare-at or a total savings figure, it still uses the unadjusted numbers. Send me that markup and it's a small extension.
- **Class names are a contract Kaching never signed.** A future app update renaming `kaching-cart-item__total-old` stops this silently — no error, prices just go back to unadjusted. Worth re-checking after Kaching updates. (The one upside of silent failure: it degrades to the current behaviour, never to a wrong price.)
- **Not verified in a real browser yet** at the time of writing — jsdom is faithful, but it isn't your storefront.
- **A shopper with JS blocked** sees the unadjusted price. Unavoidable for any client-side fix.

## 11. Debugging it later

Open the drawer with an addon item in the cart and run in console:

```js
// What the script sees
await (await fetch('/cart.js')).json();
document.querySelectorAll('.kaching-cart-item__total-old').forEach(el =>
  console.log(el.textContent, '| base:', el.dataset.kcBase, '| written:', el.dataset.kcWritten)
);
```

If `kcBase` and `kcWritten` are present and the text equals `kcWritten`, the script is working. If the attributes are missing entirely, either the class names changed or the script isn't loading. If `kcBase` is missing but the price is wrong, the row didn't match a cart line — check that `data-product-handle` and the rendered price still line up with `/cart.js`.

---
---

# পর্ব ২ — বাংলা

## ০. এক নজরে

থিমের নিজের কার্ট ড্রয়ার হলে এই কাজটা লিকুইডের এক লাইনেই হয়ে যেত। কিন্তু Kaching-এর ড্রয়ার একটা অ্যাপ এমবেড — সেখানে কোনো লিকুইড ফাইলই নেই। তাই একই হিসাবটা ব্রাউজারে চালানো হয়েছে: Shopify-র Ajax API থেকে কার্ট পড়া, প্রোডাক্ট JSON থেকে ভ্যারিয়েন্ট পড়া, Easify কত টাকা যোগ করেছে সেটা বের করা, আর Kaching স্ক্রিনে যে সংখ্যাটা এঁকে রেখেছে সেটাকেই নতুন করে লিখে দেওয়া — হুবহু একই ফরম্যাট রেখে, এবং অ্যাপ যতবার নতুন করে রেন্ডার করে ততবারই আবার করে দেওয়া।

```
অ্যাডঅন      = লাইনের লিস্ট প্রাইস (cart.js)  −  ভ্যারিয়েন্টের দাম (products.js)  →  ৩৭.৯৫ − ৩২.৯৫ = ৫.০০
নতুন কম্পেয়ার = রেন্ডার করা কম্পেয়ার প্রাইস    +  অ্যাডঅন × কোয়ান্টিটি          →  ৪০.৯৫ + ৫.০০ = ৪৫.৯৫
নতুন সেভিংস   = নতুন কম্পেয়ার                −  রেন্ডার করা ফাইনাল দাম         →  ৪৫.৯৫ − ৩৭.৯৫ = ৮.০০
```

## ১. সমস্যাটা কী ছিল

একটা প্রোডাক্টের দাম **€৩২,৯৫**, কম্পেয়ার অ্যাট প্রাইস **€৪০,৯৫**। Easify দিয়ে **€৫,০০**-এর অ্যাডঅন নিলে কাস্টমার দেয় **€৩৭,৯৫**। কিন্তু কম্পেয়ার অ্যাট প্রাইস হলো ভ্যারিয়েন্টের ক্যাটালগ ডেটা — সেটা নড়ে না। ফলে ড্রয়ারে দেখাচ্ছিল:

| | আগে | ক্লায়েন্ট যা চেয়েছে |
|---|---|---|
| কাটা দাম | €৪০,৯৫ | **€৪৫,৯৫** |
| যে দাম দিচ্ছে | €৩৭,৯৫ | €৩৭,৯৫ |
| সেভিংস ব্যাজ | You save €3 | **You save €8** |

## ২. লিকুইড দিয়ে কেন করা গেল না

থিমের নিজের ড্রয়ারে কাজটা সহজ, কারণ সব ডেটা হাতের কাছেই আছে ([`snippets/cart-drawer.liquid:226`](snippets/cart-drawer.liquid#L226)):

```liquid
{{ item.variant.compare_at_price | plus: item.original_price | minus: item.variant.price | money }}
```

কিন্তু `config/settings_data.json`-এ আছে:

```json
"type": "shopify://apps/kaching-cart/blocks/embed/7705621e-3c0f-4e97-9d29-5c8528b19fb7"
```

অর্থাৎ এটা একটা **অ্যাপ এমবেড ব্লক**। Kaching তার নিজের জাভাস্ক্রিপ্ট Shopify-র অ্যাপ CDN থেকে পাঠায়, আর সেই স্ক্রিপ্টই পুরো ড্রয়ারটা ব্রাউজারে তৈরি করে। এই রিপোজিটরিতে এমন কোনো `.liquid` ফাইল নেই যেটা ওই ড্রয়ারের এক বিন্দুও বানায়। অ্যাপের কোড এডিট করা যায় না, আর Kaching-কে ফিচার যোগ করতে বলে বসে থাকাও কোনো সমাধান নয়।

তাহলে উপায়? থিম ওই মার্কআপ **বানাতে** পারে না ঠিকই — কিন্তু থিমের নিজের জাভাস্ক্রিপ্ট একই পেজে, একই ডকুমেন্টে চলে, যেখানে Kaching-এর স্ক্রিপ্ট চলে। Kaching যা-ই আঁকুক, আমরা সেটা পড়তে পারি এবং নতুন করে লিখেও দিতে পারি। পুরো সমাধানের মূল বুদ্ধি এটাই।

## ৩. পরিকল্পনা — যা যা জানতাম না, সেখান থেকে শুরু

কোড লেখার আগে আমি তালিকা করেছিলাম, সমাধানটা কোন কোন তথ্যের উপর নির্ভর করছে এবং তার কতটা আমি আসলে জানি:

| প্রশ্ন | জানা ছিল? | কেন এটা ডিজাইন ঠিক করে দেয় |
|---|---|---|
| Easify অ্যাডঅনের টাকাটা কীভাবে নেয়? | ❌ | আলাদা লাইন আইটেম, নাকি একই লাইনের দাম বাড়ানো — দুটোর সমাধান সম্পূর্ণ আলাদা |
| লিকুইডে যা পাওয়া যায়, JS কার্ট API-তেও কি তাই পাওয়া যায়? | ❌ | লিকুইডে `item.variant.price` আছে, Ajax API-তে না-ও থাকতে পারে |
| কম্পেয়ার অ্যাট প্রাইস রানটাইমে কোথা থেকে আসবে? | ❌ | কার্ট JSON-এ না থাকলে দ্বিতীয় একটা ডেটা সোর্স লাগবে |
| Kaching কার্টের ডেটা কীভাবে আনে? | ❌ | স্ট্যান্ডার্ড Ajax API হলে আমরা শুনতে পারি; নিজস্ব এন্ডপয়েন্ট হলে আমরা অন্ধ |
| ড্রয়ারের DOM কেমন? | ❌ | ক্লাসের নাম, গঠন, আর আদৌ নাগাল পাওয়া যায় কি না |
| এটা কি shadow DOM-এর ভেতরে? | ❌ | ক্লোজড shadow DOM হলে কাজটা **অসম্ভব**, এখানেই শেষ |
| অ্যাপে অফিসিয়াল কোনো হুক আছে? | ❌ | অন্যের DOM ঘাঁটার চেয়ে সাপোর্টেড API সবসময় ভালো |

সাতটা অজানা। এর যেকোনো একটাতে ভুল ধরে নিলে পুরো কাজটাই ফেলে দিতে হতো। এজন্যই আমি টাইপ করা শুরু না করে আগে জিজ্ঞেস করেছি। আপনার থিম আমি পড়তে পারি, কিন্তু এখানে আমার কোনো ব্রাউজার নেই — আমি কার্টে জিনিস যোগ করে devtools খুলতে পারি না। আপনি পারেন, তিন মিনিটেই।

## ৪. ঠিক ওই তথ্যগুলোই কেন চেয়েছিলাম

### প্রশ্ন ১ — `/cart.js`-এর ডেটা

**এটা কী কী ঠিক করে দিল।** Magsafe লাইনটার জন্য যা এসেছিল:

```json
{
  "variant_id": 54680191369559,
  "price": 3795,
  "original_price": 3795,
  "handle": "main-character",
  "has_components": true,
  "properties": { "Case Type": "Magsafe (€5,00)", "_po:items:addon": "[[{\"price\":5,...}]]" }
}
```

এই এক টুকরো ডেটা থেকেই পাঁচটা সিদ্ধান্ত এসেছে:

১. **একই ভ্যারিয়েন্টের উপর `price: 3795`।** অর্থাৎ অ্যাডঅন আলাদা লাইন হিসেবে যোগ হয় না, বিদ্যমান লাইনটার দামই বাড়িয়ে দেয়। তাই লিকুইডের সূত্রটা সরাসরি এখানে খাটে। আলাদা লাইন হলে পুরো পদ্ধতিই অন্যরকম হতো — অ্যাডঅন লাইন খুঁজে বের করা, সেটাকে তার প্যারেন্ট লাইনের সঙ্গে মেলানো, লুকিয়ে ফেলা, ইত্যাদি।

২. **`has_components: true`** মানে কাজটা Shopify-র cart-transform (একটা Shopify Function) করছে। এটা প্রথম সিদ্ধান্তটাকেই দ্বিতীয় দিক থেকে নিশ্চিত করে, আর ড্রয়ারের "Show 1 items" বোতামটাও ব্যাখ্যা করে।

৩. **পুরো ডেটায় `compare_at_price` কোথাও নেই।** এটাই সবচেয়ে গুরুত্বপূর্ণ "না-পাওয়া" ফলাফল। লিকুইডের `item.variant` একটা পূর্ণ Variant অবজেক্ট, কিন্তু Ajax API-র লাইন আইটেম একটা সমতল রেকর্ড — সঙ্গে কোনো ভ্যারিয়েন্ট অবজেক্ট নেই। তাই দ্বিতীয় একটা সোর্স লাগবেই, আর সেটা `/products/{handle}.js`। এই সিদ্ধান্তটা সরাসরি এই ডেটা থেকেই এসেছে।

৪. **`price` আর `original_price` — দুটোই আছে।** এখানে ডিসকাউন্ট নেই বলে দুটো সমান, কিন্তু পরে কোনটা ব্যবহার করব সেটা এখান থেকেই ঠিক হয়েছে (§৬.৬ দেখুন)।

৫. **দুটো লাইন, একই `variant_id`, একই `handle`, শুধু প্রপার্টি আলাদা।** ঘটনাচক্রে আপনার কার্টেই সেই সবচেয়ে কঠিন কেসটা ছিল, যেটায় DOM-এর সারির সঙ্গে কার্ট লাইন মেলানো কঠিন হয়ে যায় — §৬.২-এ এই প্রসঙ্গে ফিরব। এটা আগেভাগে দেখতে পাওয়া বিরাট কাজে দিয়েছে।

আরেকটা কথা: `price: 3795` স্ক্রিনের `€37,95`-এর সঙ্গে হুবহু মিলেছে, যা প্রমাণ করে কার্ট API ক্রেতার প্রেজেন্টমেন্ট কারেন্সিতেই কথা বলে। §৬.৫-এর জন্য এটা জরুরি ছিল।

### প্রশ্ন ২ — নেটওয়ার্ক রিকোয়েস্ট

আপনি উত্তর দিয়েছিলেন `https://baxxis.com/cart/update.js?kaching-cart=true`।

**এটা কী ঠিক করে দিল।** ওটা Shopify-র **স্ট্যান্ডার্ড Ajax Cart API**, শুধু সঙ্গে একটা চিহ্নিতকরণ প্যারামিটার জোড়া। মানে Kaching-এর কার্ট ডেটা এমন একটা পথে যাতায়াত করে যেটা থিমের কোড থেকে আমি শুনতে পারি — ফলে স্ক্রিপ্ট ঠিক **সেই ডেটাটাই** ধরে রাখতে পারে যেটা দিয়ে Kaching এইমাত্র রেন্ডার করল, কোনো পোলিং ছাড়াই, বাড়তি রিকোয়েস্ট ছাড়াই।

উত্তরটা যদি হতো "এটা `/apps/kaching/cart`" (অ্যাপ প্রক্সি) কিংবা "ওদের নিজস্ব ব্যাকএন্ডে GraphQL", তাহলে রেসপন্সের গঠন Shopify-র কার্ট ফরম্যাট না-ও হতে পারত, আর আমাকে খারাপ একটা ডিজাইনে যেতে হতো: টাইমার দিয়ে `/cart.js` বারবার চেক করা, কিংবা প্রতিটা DOM পরিবর্তনে নতুন করে আনা — সবসময় অ্যাপের চেয়ে একটু পিছিয়ে, আর মাঝেমধ্যে ভুল সংখ্যা দেখানো।

### প্রশ্ন ৩ — outer HTML

তিনটার মধ্যে সবচেয়ে বেশি তথ্য এখান থেকেই পেয়েছি:

```html
<div class="kaching-cart-item-container">
  <div class="kaching-cart-item" data-product-handle="main-character">
    <div class="kaching-cart-item__total">
      <s class="kaching-cart-item__total-old">\u2068€40,95\u2069</s>
      <span class="kaching-cart-item__total-final">\u2068€37,95\u2069</span>
    </div>
    <div class="kaching-cart__badge"><span>You save \u2068€3\u2069</span></div>
```

১. **shadow DOM নেই।** সাধারণ light DOM, তাই `querySelector` আর `MutationObserver` দিয়েই নাগাল পাওয়া যায়। এটাই ছিল হ্যাঁ/না প্রশ্ন — ক্লোজড shadow DOM হলে কাজটা এখানেই শেষ হয়ে যেত।

২. **সব জায়গায় ওই `<!---->` কমেন্টগুলো।** ওগুলো Vue-র খালি প্লেসহোল্ডার। অর্থাৎ ড্রয়ারটা একটা **রিঅ্যাকটিভ অ্যাপ**: কার্ট বদলালেই নিজে নিজে আবার রেন্ডার করে, মানে আমি যা-ই লিখি যেকোনো মুহূর্তে সেটা মুছে যেতে পারে। শুধু এই একটা পর্যবেক্ষণের কারণেই স্ক্রিপ্টটা একবার চলে থেমে যাওয়ার বদলে অবজারভার আর "একই জিনিস বারবার লিখলেও সমস্যা নেই" ডিজাইনে তৈরি হয়েছে (§৬.৪, §৬.৫)।

৩. **ক্লাসের নাম স্থিতিশীল।** `kaching-cart-item__total-old` জাতীয় নামে কোনো বিল্ড-হ্যাশ নেই — Easify-র `po-6AdUbe2b` ধরনের ক্লাসের মতো নয়, যেগুলো ছোঁয়া যাবে না তা আমরা আগেই শিখেছি। এগুলো ধরা নিরাপদ, তবে §১১-এর সতর্কতাসহ।

৪. **`data-product-handle` আছে, কিন্তু ভ্যারিয়েন্ট আইডি বা লাইন কী নেই।** এখান থেকেই §৬.২-এর মেলানোর সমস্যাটা তৈরি হয় — আর প্রশ্ন ১-এর একই ভ্যারিয়েন্টের দুই লাইনের সঙ্গে মিলিয়ে বোঝা গেল, শুধু handle দিয়ে মেলানো ভুল হবে।

৫. **প্রতিটা দামের চারপাশে `\u2068` আর `\u2069`।** ওগুলো অদৃশ্য ইউনিকোড bidi আইসোলেট (U+2068 / U+2069)। আমি যদি থিমের ফরম্যাটার দিয়ে নিজে টাকার স্ট্রিং বানাতাম, তাহলে প্রতিটা নতুন লেখা দামে ওগুলো চুপচাপ হারিয়ে যেত, আর সেপারেটর বা প্রতীকের অবস্থানও আলাদা হয়ে যেতে পারত। এই কারণেই আমি টাকার ফরম্যাট **বানানোর** বদলে রেন্ডার করা স্ট্রিং থেকে **বের করে নেওয়ার** পথে গিয়েছি (§৬.৩)।

৬. **সেভিংস ব্যাজটা আছে**, তাই শুধু কাটা দামটা ঠিক করলে পাশে "You save €3" লেখাটা তার সঙ্গে সাংঘর্ষিক হয়ে বসে থাকত।

৭. **"Show 1 items" বোতাম** — বান্ডলের কম্পোনেন্টগুলো *একই কন্টেইনারের ভেতরেই* নিজস্ব সারি হিসেবে রেন্ডার হয়, তাই সিলেক্টরগুলো এমনভাবে সীমাবদ্ধ করতে হয়েছে যাতে ভুল করে কম্পোনেন্টের দাম বদলে না যায়।

### প্রশ্ন ৪ — Kaching-এ অফিসিয়াল হুক আছে কি না

আপনি দেখে জানালেন, নেই। ত্রিশ সেকেন্ড খরচ করার মতো প্রশ্ন ছিল: অ্যাপে যদি সাপোর্টেড কাস্টমাইজেশন API থাকত, সেটা ব্যবহার করলে ওদের আপডেটেও কাজটা টিকে থাকত। যেহেতু নেই, তাই DOM প্যাচ করা ছাড়া উপায় নেই — আর এই ঝুঁকিটা এখন অজানা বিপদ নয়, লিখিতভাবে জানা ঝুঁকি।

## ৫. সূত্র

প্রতিটা কার্ট লাইনের জন্য:

```
listPrice   = item.original_price       // ডিসকাউন্টের আগে লাইনের দাম, অ্যাডঅনসহ
basePrice   = variant.price × ratio     // ভ্যারিয়েন্টের ক্যাটালগ দাম, কারেন্সি সমন্বয় করে
addon       = listPrice − basePrice     // Easify প্রতি ইউনিটে যা যোগ করেছে

renderedOld = Kaching যে কম্পেয়ার প্রাইস লিখেছে   // এতে কোয়ান্টিটি আর কারেন্সি আগেই ধরা
newOld      = renderedOld + addon × quantity
newSave     = newOld − renderedFinal
```

লক্ষ্য করুন কোন জিনিসটা **নতুন করে হিসাব করা হয়নি**: কম্পেয়ার অ্যাট প্রাইস কখনোই ক্যাটালগ ডেটা থেকে নতুন করে বানানো হয় না — Kaching যে সংখ্যাটা লিখেছে সেটাকেই সত্য ধরে নিয়ে শুধু তার সঙ্গে **যোগ** করা হয়। এতে কারেন্সি, ট্যাক্স আর রাউন্ডিংয়ের ঝামেলায় আমাদের ঢুকতেই হয় না। দুই ডেটা সোর্সের সীমানা পেরোয় কেবল অ্যাডঅনের অঙ্কটা, আর সেটা §৬.৫ সামলায়।

## ৬. সাতটা কঠিন সমস্যা

### ৬.১ কম্পেয়ার অ্যাট প্রাইস কার্টে নেই

সমাধান: `/products/{handle}.js` থেকে এনে আইডি দিয়ে ভ্যারিয়েন্ট খুঁজে নেওয়া। প্রতিটা handle-এর ফল ক্যাশ করা হয়, তাই একই প্রোডাক্টের পাঁচটা লাইন থাকলেও রিকোয়েস্ট যায় **একটা**, আর পরের রেন্ডারগুলোতে একটাও না। টেস্টেও তাই দেখা গেছে: পুরো সেশনে ১টা প্রোডাক্ট ফেচ।

### ৬.২ কোন DOM সারি কোন কার্ট লাইন?

সারিতে আছে শুধু `data-product-handle`। আপনার কার্টে ছিল **একই ভ্যারিয়েন্টের দুটো লাইন** — একই প্রোডাক্ট, একই সাইজ, পার্থক্য শুধু অ্যাডঅনে। তাই শুধু handle দিয়ে আলাদা করা যায় না, আবার ক্রম অনুযায়ী মেলানোও ভঙ্গুর (আপসেল, ফ্রি গিফট, কম্পোনেন্ট সারি — সবই তালিকায় আসতে পারে)।

সমাধানে এমন একটা জিনিস ব্যবহার করেছি যা আলাদা করে চেনায় এবং স্ক্রিনে আগে থেকেই আছে: **দাম**।

```js
if (row.finalCents === item.final_line_price) multiplier = item.quantity;
else if (row.finalCents === item.final_price)  multiplier = 1;
```

সারিগুলো DOM-এর ক্রমে দেখা হয় এবং প্রতিটা কার্ট লাইন একবারই দখল হতে পারে, তাই হুবহু একরকম দেখতে দুটো সারিও এক-এক করে মিলে যায়। আর এই একই তুলনা চুপচাপ দ্বিতীয় একটা প্রশ্নেরও উত্তর দেয়, যেটা নাহলে আপনাকে কোয়ান্টিটি ২ দিয়ে পরীক্ষা করতে বলতে হতো: **ড্রয়ার কি লাইনের মোট দাম দেখায়, নাকি প্রতি ইউনিটের দাম?** রেন্ডার করা সংখ্যাটা `final_line_price`-এর সমান হলে সেটা লাইন টোটাল, তাই অ্যাডঅনকে কোয়ান্টিটি দিয়ে গুণ করতে হবে; আর `final_price`-এর সমান হলে সেটা প্রতি ইউনিট, গুণ করা যাবে না। নিজে নিজেই ধরে ফেলে, কোনো অনুমান নেই।

কোনো সারি কিছুর সঙ্গেই না মিললে বুঝতে হবে আমাদের কার্টের কপিটা পুরোনো — তখন স্ক্রিপ্ট `/cart.js` আবার এনে আরেকবার চালায়।

### ৬.৩ Kaching-এর মতো হুবহু ফরম্যাটে টাকা লেখা

মুদ্রার প্রতীক, প্রতীকের অবস্থান, দশমিকে `,` না `.`, হাজারের বিভাজক, দশমিকের ঘর সংখ্যা, bidi আইসোলেট, আর প্রতিটা মার্কেটের নিজস্ব নিয়ম — সব মিলিয়ে নিজে থেকে সঠিক ফরম্যাট বানানো হারা লড়াই।

তাই স্ক্রিপ্ট কখনো টাকার স্ট্রিং **বানায় না** — যেটা আগে থেকেই আছে সেটাকেই **সম্পাদনা করে**। `describeFormat()` রেন্ডার করা লেখাটা পড়ে তার নিয়মগুলো বের করে:

- সংখ্যার অংশটা খুঁজে নেয়: `\u2068€40,95\u2069` → `40,95`।
- শেষের সেপারেটরটাকে দশমিক ধরা হয় কেবল তখনই, যখন তার পরে ১–২টা সংখ্যা থাকে — তাই `40,95` মানে ৪০ ইউরো ৯৫, আর `1.234` মানে হাজারের বিভাজক, ১ ইউরো ২৩৪ নয়।
- যে সেপারেটরটা বাকি থাকে সেটাই হাজারের বিভাজক।
- চার বা তার বেশি অঙ্ক অথচ কোনো সেপারেটর নেই — মানে এই মার্কেটে গ্রুপিং হয় না।

এরপর নতুন সংখ্যাটা ঠিক ওই নিয়মেই লেখা হয় এবং অক্ষরের অবস্থান ধরে মূল স্ট্রিংয়ের ভেতরেই বসিয়ে দেওয়া হয়, ফলে প্রতীক, ফাঁকা জায়গা আর অদৃশ্য অক্ষরগুলো অক্ষত থাকে। `\u2068€40,95\u2069` → `\u2068€45,95\u2069`।

ছোট্ট একটা সূক্ষ্মতা: Kaching পূর্ণসংখ্যার সেভিংস লেখে `€3`, `€3,00` নয়। তাই নতুন অঙ্কটা পূর্ণ হলে ফরম্যাটার দশমিকহীন ধাঁচই রাখে, আর পূর্ণ না হলে দশমিক যোগ করে — `€8` আর `€8,50` দুটোই ঠিকভাবে আসে।

### ৬.৪ যোগ হতে হতে বেড়ে যাওয়ার ফাঁদ — যে বাগটা প্রায় ছেড়ে দিয়েছিলাম

এটাই সেই সমস্যা, যেটা টেস্টে ঠিকঠাক দেখাত আর প্রোডাকশনে গিয়ে বিগড়ে যেত।

অবজারভার ড্রয়ারের **যেকোনো** পরিবর্তনেই চালু হয়, শুধু কার্ট বদলালে নয়। প্রথমবার `40,95` পড়ে, `5,00` যোগ করে, `45,95` লিখে দেয়। এরপর সম্পর্কহীন কিছু একটা বদলাল — মাউস হোভার, কিংবা কোনো আপসেল লোড হলো। দ্বিতীয়বার আবার কম্পেয়ার প্রাইসটা পড়া হলো… কিন্তু এবার সেখানে আছে **`45,95`**, অর্থাৎ আমাদেরই লেখা সংখ্যা, আর লিখে দিল `50,95`। তারপর `55,95`। দাম বাড়তেই থাকবে।

সমাধান: স্ক্রিপ্ট যে এলিমেন্টেই হাত দেয়, সেটায় দুটো মান মনে রাখা হয়।

```js
el.dataset.kcBase    = "\u2068€40,95\u2069";   // Kaching যা লিখেছিল
el.dataset.kcWritten = "\u2068€45,95\u2069";   // আমরা যা বসিয়েছি
```

প্রতিবার চালানোর সময় লেখাটা যদি এখনো `kcWritten`-এর সমান হয়, তাহলে হিসাবের ইনপুট হবে `kcBase` — অর্থাৎ নিজের লেখা ফলাফলকে কখনোই মূল ডেটা ভেবে ভুল হয় না। আর Kaching যে মুহূর্তে নতুন করে রেন্ডার করে, লেখাটা আমাদের ছাপের সঙ্গে আর মেলে না, তাই নতুন লেখাটাই স্বয়ংক্রিয়ভাবে নতুন ভিত্তি হয়ে যায়। আলাদা করে পরিষ্কার করা লাগে না, রিসেট লাগে না, বেমানান হয়ে যাওয়ার মতো কোনো স্টেটও থাকে না।

(`data-*` অ্যাট্রিবিউট লেখা নিরাপদ, কারণ অবজারভার `childList` আর `characterData` দেখে, `attributes` দেখে না — ছাপ মারলে সে জাগে না।)

ঠিক এই জিনিসটার জন্য একটা টেস্ট আছে: সম্পর্কহীন কিছু একটা বদলে দিয়ে যাচাই করা হয় দামটা এখনো ৪৫,৯৫ আছে, ৫০,৯৫ হয়ে যায়নি।

### ৬.৫ দুটো ডেটা সোর্স, সম্ভবত দুটো কারেন্সি

`/cart.js` নিশ্চিতভাবেই ক্রেতার প্রেজেন্টমেন্ট কারেন্সিতে (`3795` আর `€37,95` মিলে যাওয়াই প্রমাণ)। `/products/*.js`-ও *সাধারণত* রূপান্তরিত — কিন্তু প্রতিটা মার্কেটের জন্য আমি নিশ্চয়তা দিতে পারি না, আর দুটো যদি না মেলে তাহলে `listPrice − basePrice` আর অ্যাডঅন থাকে না, হয়ে যায় অ্যাডঅন প্লাস এক্সচেঞ্জ রেটের ভুল।

স্ক্রিপ্ট তাই ধরে নেওয়ার বদলে পার্থক্যটা **মেপে নেয়**। কম্পেয়ার অ্যাট প্রাইসে অ্যাডঅনের কোনো হাত নেই, তাই:

```
ratio = (Kaching যে কম্পেয়ার প্রাইস দেখাচ্ছে) ÷ (products.js-এর কম্পেয়ার প্রাইস)
```

এটা বিশুদ্ধভাবে কারেন্সি রূপান্তর, আর কিছুই নয়। প্রতিবার চালানোর সময় যেকোনো একটা লাইন থেকে একবার মেপে নিয়ে ভ্যারিয়েন্টের দামে প্রয়োগ করা হয়, তারপর বিয়োগ। একই কারেন্সি হলে ratio হয় ১, আর সূত্রটা সরল রূপেই ফিরে আসে। ১.২ গুণ রেটে একটা টেস্ট আছে, যা নিশ্চিত করে €৫-এর অ্যাডঅন তখনো ঠিক €৫-ই মাপা হয় এবং অ্যাডঅনহীন লাইনটা এক পয়সাও নড়ে না।

৩ পয়সার একটা সহনশীলতা (`ADDON_NOISE_FLOOR`) রাউন্ডিংয়ের হেরফের শুষে নেয়, তাই অ্যাডঅন নেই এমন লাইন কখনো এক পয়সাও বাড়ে না।

### ৬.৬ `price` না `original_price`?

প্রথমে `item.price` ব্যবহার করেছিলাম, পরে কোডটা আবার পড়তে গিয়ে বদলেছি। Ajax API-তে `price`-এ লাইন-লেভেল ডিসকাউন্ট ধরা থাকে, `original_price`-এ থাকে না। লাইনে ১০% ডিসকাউন্ট থাকলে `price` হতো ৩৪১৬, আর "অ্যাডঅন" মাপা হতো €৫,০০-র বদলে €১,২১ — ফল হতো ভুল কম্পেয়ার প্রাইস, যা কেবল ডিসকাউন্টওয়ালা কার্টেই দেখা যেত। ঠিক এই ধরনের বাগই ডেমো পার করে ফেলে আর ব্ল্যাক ফ্রাইডেতে গিয়ে ধরা পড়ে। `original_price` ডিসকাউন্টে বদলায় না, আর আপনার লিকুইড সূত্রেও ওটাই ছিল। এর জন্যও টেস্ট আছে।

### ৬.৭ অ্যাপের সঙ্গে যুদ্ধ না করে টিকে থাকা

Kaching রিঅ্যাকটিভভাবে বারবার রেন্ডার করে, তাই এটা একবার চলে থেমে যাওয়ার স্ক্রিপ্ট হতে পারে না।

- ডকুমেন্টের উপর একটা `MutationObserver` `childList`, `subtree` আর `characterData` দেখে — শেষেরটা জরুরি, কারণ কোয়ান্টিটি বদলালে হয়তো শুধু একটা টেক্সট নোডই বদলাবে, কোনো এলিমেন্ট বদলাবে না।
- একগুচ্ছ পরিবর্তনকে `requestAnimationFrame` দিয়ে একটামাত্র পাসে জড়ো করা হয়, তাই এক ফ্রেমে একশোটা পরিবর্তন হলেও কাজ চলে একবার।
- লেখাটা আগে থেকেই ঠিক থাকলে নতুন করে লেখা হয় না। এটাই একে থামায়: আমাদের লেখায় একটা পরিবর্তন হয় → অবজারভার আবার চলে → মান আগে থেকেই ঠিক → কিছু লেখা হয় না → আর কোনো পরিবর্তনও হয় না। প্রতিবারই একটা বাড়তি নিষ্ক্রিয় পাসের পর থেমে যায়। কোনো ফ্ল্যাগ নেই, কোনো যুদ্ধ নেই।
- আগের পাস এখনো চলতে থাকলে (কোনো ফেচের অপেক্ষায়) পরেরটা একসঙ্গে না চালিয়ে সারিতে রাখা হয়।

আর কার্টের ডেটা টাটকা থাকে অ্যাপের নিজের রিকোয়েস্ট শুনে:

```js
window.fetch = function () {
  var promise = originalFetch.apply(this, arguments);   // অপরিবর্তিত, যেমন ছিল তেমনই ফেরত
  if (CART_JSON_RE.test(url)) {
    promise.then(res => res.clone().json().then(rememberCart));  // clone(), মূল বডি নয়
  }
  return promise;
};
```

এখানে দুটো নিরাপত্তার সূক্ষ্মতা আছে। মূল প্রমিসটা অবিকৃতভাবে ফেরত দেওয়া হয়, তাই Kaching-এর নিজের কোড ঠিক তা-ই পায় যা সে এমনিতেই পেত। আর বডিটা পড়া হয় `res.clone()` থেকে — একটা রেসপন্স বডি একবারই পড়া যায়, তাই মূলটা পড়লে অ্যাপের নিজের পার্সিং ভেঙে যেত। পুরোটাই `try`/`catch`-এ মোড়া; শোনার কাজটা ব্যর্থ হলেও অ্যাপ চলতে থাকে, আর `/cart.js` ফলব্যাক তো আছেই। XHR-ও একইভাবে সামলানো, কারণ অ্যাপ কোন পথে রিকোয়েস্ট পাঠাবে সেটা আমাদের হাতে নেই।

আপনার HTML দেখেই shadow DOM বাদ গিয়েছিল, তবু ভবিষ্যতে অ্যাপ আপডেটে সেটা আসতে পারে, তাই থ্রটল করা একটা স্ক্যান খোলা shadow root খুঁজে নিয়ে তার ভেতরেও নজর রাখে।

## ৭. কাস্টমার কোয়ান্টিটি বদলালে ঠিক কী কী ঘটে

১. Kaching পাঠায় `POST /cart/update.js?kaching-cart=true`।
২. আমাদের `fetch` র‍্যাপার URL-টা চিনে ফেলে, রেসপন্সের কপি নেয়, টাটকা কার্ট জমা রাখে। Kaching-এর কোডে কোনো প্রভাব পড়ে না।
৩. Kaching-এর Vue সারিটা নতুন করে রেন্ডার করে নিজের কম্পেয়ার প্রাইস দিয়ে (স্ক্রিনে আবার `40,95`)।
৪. ওই পরিবর্তনে অবজারভার জেগে ওঠে এবং পরের অ্যানিমেশন ফ্রেমে একটা পাস নির্ধারণ করে।
৫. `collectRows()` প্রতিটা সারি পড়ে। আমাদের ছাপ আর মেলে না (Vue মুছে দিয়েছে), তাই টাটকা `40,95`-ই নতুন ভিত্তি হয়।
৬. `matchRowsToItems()` handle আর রেন্ডার করা দাম দিয়ে সারির সঙ্গে কার্ট লাইন মেলায়, এবং লাইন-টোটাল না ইউনিট-প্রাইস সেটাও বুঝে নেয়।
৭. প্রোডাক্ট আগেই ক্যাশে আছে — কোনো রিকোয়েস্ট নেই।
৮. `currencyRatio()` রূপান্তর মেপে নেয় (এক কারেন্সির স্টোরে ১)।
৯. অ্যাডঅন হিসাব হয়, `45,95` লেখা হয়, ব্যাজ হালনাগাদ হয়।
১০. ওই লেখাগুলোর কারণে অবজারভার আরেকবার চলে, দেখে সব ঠিকই আছে, কিছু লেখে না। এখানেই থেমে যায়।

মোট: বাড়তি কোনো নেটওয়ার্ক রিকোয়েস্ট নেই, একটা অ্যানিমেশন ফ্রেম।

## ৮. ব্রাউজার ছাড়া কীভাবে টেস্ট করলাম

আপনার স্টোর আমি খুলতে পারি না, তাই দরকারি অংশটুকু **jsdom**-এ বানিয়ে নিয়েছি — Node-এর ভেতরে চলা সত্যিকারের DOM — এবং তাতে ব্যবহার করেছি **আপনার আসল মার্কআপ** আর **আপনার আসল কার্ট ডেটা**। চারটা সুট:

| সুট | কী প্রমাণ করে |
|---|---|
| `test-money` | ১৪টা কেস: `\u2068€40,95\u2069` পড়া ও নতুন করে লেখা, US `$1,234.56`, ইউরোপীয় গ্রুপিং, দশমিকহীন মুদ্রা, nbsp সেপারেটর, শতাংশের ব্যাজ, `€8` বনাম `€8,50` |
| `test-drawer` | আপনার আসল HTML + আসল কার্ট JSON-এ পুরো প্রবাহ: অ্যাডঅন লাইন €৪৫,৯৫ / "You save €8", অ্যাডঅনহীন লাইন অপরিবর্তিত, সম্পর্কহীন রি-রেন্ডারে €৫০,৯৫ **না** হওয়া, কোয়ান্টিটি ২-এ €৯১,৯০ এবং পুরোনো কার্ট ধরা পড়ে আবার আনা |
| `test-currency` | ১.২ গুণ রূপান্তরিত মার্কেট: €৫-এর অ্যাডঅন তখনো ঠিক €৫, অ্যাডঅনহীন লাইন অটল |
| `test-discount` | ১০% ছাড়সহ লাইনেও পুরো €৫ অ্যাডঅনই মাপা হয় (`original_price` সংশোধনটা) |

সবগুলো পাস। ফাইলগুলো আপাতত এই সেশনের অস্থায়ী ফোল্ডারে আছে, রিপোতে নয় — বললে প্রজেক্টে সরিয়ে দেব, যাতে Kaching আপডেটের পর আবার চালানো যায়।

টেস্ট যা **প্রমাণ করতে পারে না**, সেগুলো আপনাকে ক্লিক করে দেখতে হবে: রিমুভ/আনডুতে Kaching-এর আসল আচরণ, ফুটারের কার্ট-লেভেল টোটাল, আসল অ্যাপে কোয়ান্টিটি ২, আর কারেন্সি সুইচার।

## ৯. কোন কোন ফাইল বদলেছে

| ফাইল | পরিবর্তন |
|---|---|
| [`assets/kaching-addon-compare-at.js`](assets/kaching-addon-compare-at.js) | নতুন। পুরো সমাধান, কমেন্টসহ ~৪৩০ লাইন |
| [`layout/theme.liquid`](layout/theme.liquid) | defer দিয়ে লোড করা, কোনো সেটিংসে আটকানো নেই (থিম যে ড্রয়ারই দেখাক, Kaching সেটাকে বদলে দেয়) |
| [`layout/landing.liquid`](layout/landing.liquid) | একই, ল্যান্ডিং লেআউটের জন্য |
| [`WORK-LOG.md`](WORK-LOG.md) | ২০২৬-০৯-০৪ তারিখের এন্ট্রি |

আগের কোনো কোড বদলানো হয়নি — পুরোটাই সংযোজন, আর অ্যাসেট ফাইলটা আর দুটো স্ক্রিপ্ট ট্যাগ মুছে দিলেই সবকিছু আগের অবস্থায় ফিরে যাবে।

## ১০. সীমাবদ্ধতা, সরাসরি বলছি

- **অ্যাডঅন যখন ছাড়ের ব্যবধানের চেয়ে বড়।** কম্পেয়ার প্রাইস ৩৪,৯৫ আর অ্যাডঅনের পর দাম ৩৭,৯৫ হলে Kaching কোনো `<s>`-ই রেন্ডার করে না, ফলে বদলানোর মতো কিছু থাকে না — ওই লাইনে কাটা দাম দেখাবে না। আমি ইচ্ছে করেই বানিয়ে একটা বসাইনি; ক্লায়েন্ট চাইলে বলবেন।
- **কার্ট-লেভেল টোটাল অপরিবর্তিত।** ড্রয়ারের ফুটারে যদি সাবটোটালের কম্পেয়ার প্রাইস বা মোট সেভিংস দেখানো হয়, সেটা এখনো অসমন্বিত সংখ্যাই দেখাবে। ওই মার্কআপটা পাঠালে অল্প কাজেই যোগ করা যাবে।
- **ক্লাসের নাম এমন এক চুক্তি, যাতে Kaching সই করেনি।** ভবিষ্যতের কোনো আপডেটে `kaching-cart-item__total-old` নাম বদলে গেলে এটা চুপচাপ কাজ করা বন্ধ করবে — কোনো এরর নয়, দাম শুধু অসমন্বিত অবস্থায় ফিরে যাবে। Kaching আপডেটের পর একবার দেখে নেওয়া ভালো। (চুপচাপ বন্ধ হওয়ার একটাই সুবিধা: এটা বর্তমান আচরণে ফিরে যায়, ভুল দামে নয়।)
- **এখনো আসল ব্রাউজারে যাচাই করা হয়নি** (এই লেখার সময় পর্যন্ত) — jsdom বিশ্বস্ত, কিন্তু সে আপনার স্টোরফ্রন্ট নয়।
- **যার ব্রাউজারে JS বন্ধ**, সে অসমন্বিত দামই দেখবে। ক্লায়েন্ট-সাইড যেকোনো সমাধানেই এটা অনিবার্য।

## ১১. পরে ডিবাগ করতে হলে

কার্টে অ্যাডঅনওয়ালা আইটেম রেখে ড্রয়ার খুলে কনসোলে চালান:

```js
// স্ক্রিপ্ট যা দেখছে
await (await fetch('/cart.js')).json();
document.querySelectorAll('.kaching-cart-item__total-old').forEach(el =>
  console.log(el.textContent, '| base:', el.dataset.kcBase, '| written:', el.dataset.kcWritten)
);
```

`kcBase` আর `kcWritten` থাকলে এবং লেখাটা `kcWritten`-এর সমান হলে বুঝবেন স্ক্রিপ্ট কাজ করছে। অ্যাট্রিবিউট দুটো একেবারেই না থাকলে হয় ক্লাসের নাম বদলেছে, নয়তো স্ক্রিপ্টই লোড হচ্ছে না। `kcBase` নেই অথচ দাম ভুল — তার মানে সারিটা কোনো কার্ট লাইনের সঙ্গে মেলেনি; দেখুন `data-product-handle` আর রেন্ডার করা দাম `/cart.js`-এর সঙ্গে এখনো মেলে কি না।

---
---

# Part 3 — English again

A second pass in English, written as a linear narrative rather than a Q&A — useful if you're explaining this to the client or to another developer.

## The situation

Baxxis sells a phone case at €32,95 against a €40,95 compare-at. Easify Options lets the shopper add a €5,00 Magsafe upgrade, so the line costs €37,95. The compare-at, being a property of the variant in Shopify's catalog, stays at €40,95 — so the drawer advertises a €3 saving on a product whose "real" comparison point should now be €45,95, an €8 saving. The client wants the compare-at to rise with the addon.

On the theme's own cart drawer this is a one-line Liquid change, because Liquid hands you the full variant object next to the cart line. The store, however, runs the **Kaching Cart** app embed, which renders the drawer from its own JavaScript. There is no Liquid, no template, no snippet — nothing in the theme produces that markup, and the app's own code isn't editable.

## The approach

The theme cannot generate Kaching's markup, but the theme's JavaScript shares a document with it. So the fix reads what Kaching rendered, works out what Easify added, and rewrites the rendered number in place. Three sources of truth are involved:

1. **The rendered DOM** — the compare-at and final price the app already computed, already in the buyer's currency, already multiplied by quantity, already formatted for the market. This is treated as the base and never recomputed.
2. **`/cart.js`** — the cart line, giving the price with the addon baked in (`original_price`) and the quantity.
3. **`/products/{handle}.js`** — the variant's catalog price, which is the only way to know what the price would have been *without* the addon.

The addon is the difference between (2) and (3); it gets added to (1). That's the entire fix. Everything else in the file exists to make it survive contact with a reactive app.

## Why the three questions were necessary

I had no browser, so I could not see the drawer, its data, or its markup. Seven design-critical facts were unknown, and each answer collapsed several of them:

- **The cart dump** proved Easify raises the line price rather than adding a line item (so the Liquid formula ports over), revealed `has_components: true` (Shopify cart-transform, confirming it), and — most importantly — proved compare-at is *absent* from the Ajax cart, forcing the second data source. It also happened to contain two lines of the identical variant, which exposed the row-matching problem before I could write a naive matcher.
- **The network URL** proved Kaching uses Shopify's standard Ajax cart endpoints, which means the script can observe the app's own cart traffic and stay perfectly in sync instead of polling.
- **The outer HTML** proved there is no shadow DOM (the go/no-go question), revealed Vue's fingerprints (so the drawer re-renders and the fix must be continuous and idempotent), gave the stable class names, showed that only the product handle is exposed (creating the matching problem), and — the detail that changed the whole formatting strategy — revealed invisible bidi isolate characters around every price.
- **The fourth question** (any official hook) was about preferring a supported API to DOM patching. There wasn't one, so the maintenance risk is now documented rather than discovered later.

Guessing on any of these would have meant a rewrite. Three minutes of your devtools time saved a day of mine.

## The engineering that isn't obvious

- **Never generate money strings — edit the existing one.** The formatter reads the rendered price to learn the market's rules (separators, decimal count, grouping) and splices the new number back into the original string by character offset, so the symbol, spacing and invisible Unicode survive exactly. It also mirrors Kaching's habit of writing round savings as `€3` rather than `€3,00`.
- **Never let our output become our input.** Each touched element stores what the app rendered (`data-kc-base`) and what we wrote (`data-kc-written`). Without this, any unrelated re-render would make the price climb 45,95 → 50,95 → 55,95 forever. This is the single most dangerous bug in the whole design and it has a dedicated test.
- **Match rows to cart lines by price, not position.** The markup exposes only the product handle, and the same variant can appear twice. Matching on handle + rendered price, in DOM order, each line claimed once, resolves it — and the same comparison reveals whether the drawer prints line totals or unit prices, which sets the quantity multiplier without anyone having to test it manually.
- **Measure the currency gap, don't assume it away.** If the product JSON and the cart JSON ever disagree on currency, the ratio between the rendered compare-at and the catalog compare-at is pure conversion (addons never touch compare-at), so it's measured once per pass and applied to the variant price. In a single-currency store the ratio is 1 and nothing changes.
- **Measure the addon against `original_price`, not `price`.** A line-level discount would otherwise shrink the measured addon — €1,21 instead of €5,00 on a 10%-off cart. This was caught on a re-read, not by a test failure, and now has a test.
- **Terminate by being idempotent, not by fighting.** Writes are skipped when the value is already correct, so our own mutations wake the observer exactly once more and then stop. No suppression flags, no races with Vue.
- **Wrap the app's requests without disturbing them.** The original promise is returned untouched and the body is read from a clone, because a response body can only be consumed once — reading the original would break Kaching's own parsing.

## Verification

Four jsdom suites run against your real markup and real cart payload cover the money formatting across markets, the full pipeline, the compounding trap, quantity changes with a stale-cart refetch, a converted-currency market, and a discounted line. All pass. Browser verification on the live store is still yours to do — particularly remove/undo, quantity 2, the footer totals and the currency switcher.

## The trade-off to keep in mind

This is a DOM-level integration with an app that never promised its class names would stay put. If Kaching renames them in a future release, the fix stops working silently. The mitigation is that silent failure degrades to *today's* behaviour — an unadjusted compare-at, never a wrong price — and the work log records exactly what to re-check after an app update. If Kaching ever ships a customization API, this should be revisited and moved onto it.
