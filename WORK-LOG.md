# Work Log — Edge 2.1.0

Running history of investigations and fixes made to this theme. Newest entry on top.

---

## 2026-09-04 — Kaching cart drawer: add the Easify addon to the compare-at price

**Reported by:** client — a product at 32,95 / compare-at 40,95 with a €5 Easify addon shows €37,95 struck through €40,95 in the cart drawer. The addon should lift the compare-at too, so it reads €45,95 → €37,95 (a €8 saving, not €3).

**Why this couldn't be done in Liquid**

- The store uses the **Kaching Cart** app embed (`shopify://apps/kaching-cart/blocks/embed/…`, in [`config/settings_data.json`](config/settings_data.json)) — it replaces the theme's drawer with its own Vue app rendered from the Ajax cart. There is no Liquid to edit, so the one-liner that works in [`snippets/cart-drawer.liquid:226`](snippets/cart-drawer.liquid#L226) (`item.variant.compare_at_price + (item.original_price - item.variant.price)`) has nowhere to go.
- Checked for an official customization hook in the Kaching app first — none found.

**How Easify charges the addon (confirmed from live `/cart.js`)**

- The addon raises the **line price** on the same variant: `price: 3795` where the variant is 3295, with `has_components: true` (a cart-transform expand) and the addon echoed in `properties._po:items:addon`. It is *not* a separate line item.
- So the addon is recoverable as `cart line price − variant price`, exactly like the Liquid version. `compare_at_price` isn't in `/cart.js` at all, so the variant is read from `/products/{handle}.js` (cached per handle).

**Fix — [`assets/kaching-addon-compare-at.js`](assets/kaching-addon-compare-at.js)** (loaded from [`layout/theme.liquid`](layout/theme.liquid) and [`layout/landing.liquid`](layout/landing.liquid))

- Rewrites `.kaching-cart-item__total-old` to `rendered compare-at + addon × quantity`, and the `.kaching-cart__badge` savings text to match. Only Kaching's stable, unhashed class names are targeted.
- **Formatting is copied from what Kaching already rendered** — currency symbol, decimal/thousands separators, decimal count and the U+2068/U+2069 bidi isolates are all reused, so output matches the drawer in any market. No dependency on the theme's money format.
- **Cart data** comes from sniffing Ajax cart responses (`fetch` + `XHR` are wrapped, never blocked), so we hold the same payload Kaching just rendered. If a row can't be explained by our copy of the cart, `/cart.js` is refetched and the pass repeats.
- **Row → cart line matching**: Kaching's markup exposes only `data-product-handle`, and the same variant legitimately appears several times (that's what an addon does). Rows are matched on handle + rendered price in DOM order, each line claimed once; the price match also reveals whether the drawer prints line totals or unit prices, which sets the quantity multiplier.
- **Re-entrancy**: our own output would otherwise be read back as input on the next pass and compound (45,95 → 50,95). Every element we touch stores `data-kc-base` / `data-kc-written`; while our text still stands the remembered original is used, and once Kaching re-renders the fresh text takes over. Writes are skipped when the text is already correct, so our mutations can't loop the observer.
- **Currency safety**: if `/products/*.js` and `/cart.js` disagree on currency in a converted market, the ratio between the rendered compare-at and the catalog one is pure conversion (compare-at is never touched by addons) — measured once per pass and applied to the variant price. Differences under 3 cents are treated as rounding, not an addon.

- **Addon measured against `original_price`, not `price`** — `price` reflects line-level discounts, so on a 10%-off line the addon would have measured €1,21 instead of €5,00. Same field the theme's Liquid version uses.
- **Gated on a new `enable_addon_compare_at` checkbox** (Theme settings → Cart, [`config/settings_schema.json`](config/settings_schema.json)), defaulting to `true` so a push doesn't silently switch the fix off — a setting absent from `settings_data.json` falls back to the schema default.

**Verified** with four jsdom suites run against the real drawer markup and the real `/cart.js` payload: formatting across EU/US/no-decimal/nbsp/percent formats, first render, no-addon lines left alone, an unrelated re-render not compounding the price, a quantity change (addon × 2 + stale-cart refetch), a 1.2× converted-currency market, and a discounted line. **Confirmed working on the live store by the client the same day** — though that browser check predates the `original_price` change above, so the asset needs re-uploading and a re-check.

**Known limitations**

- If the addon exceeds the compare-at margin (compare-at < price + addon), Kaching renders no `<s>` at all and there is nothing to rewrite — that line simply shows no strikethrough. Injecting one was left out deliberately; say the word if the client wants it.
- The drawer's **cart-level** subtotal/savings (if it shows one) is untouched — need that markup to extend this.
- Depends on Kaching's current class names; an app update renaming them stops this silently (no error, prices just stay unadjusted).

---

## 2026-09-03 — Easify Options: sync real price into swatch descriptions

**Reported by:** client noticed Easify's option swatches (image swatches under Product Options) show a hardcoded price typed into the app's admin settings, instead of the real product price.

**Investigation**

- Searched the theme for any Easify-specific code (`easify`, `po-` classes) — found none. Easify is a pure app-embed block (`shopify://apps/easify-options/...`), loaded from Shopify's app CDN; the theme has zero awareness of it.
- Confirmed the swatch markup pattern from two real examples the client provided:
  - A swatch with no addon (`Tough`) → `.po-optionSwatch-description` shows the bare product price (`29,95`).
  - A swatch with an addon (`Magsafe`, showing `.po-imageOption-price` = `€5,00`) → description shows `34,95` = `29.95 + 5.00`.
  - Confirmed the formula: **description = current product price + that swatch's own addon (if any)**.
- Matched only on Easify's stable, non-hashed class names (`po-optionSwatch-description`, `po-optionSwatch-root`, `po-imageOption-price`) — Easify also emits build-hashed classes (`po-6AdUbe2b`, `po-3NrNH_I1`, …) that will change on app updates and must never be targeted.

**Fix — [`assets/product-info.js`](assets/product-info.js)**

- Added `parseEasifyPriceToCents()` — locale-safe money-string parser (handles `€5,00`, `$5.00`, `1.234,56`).
- `<product-info>` now tracks `currentVariantPriceCents`, seeded from a new `data-variant-price` attribute and refreshed on every real Shopify variant change.
- Added a `MutationObserver` scoped to `<product-info>` (`initEasifyPriceSync`) that watches for Easify's late-injected swatches (it renders after page load, and re-renders on its own option interactions) and stamps each `.po-optionSwatch-description` with `formatMoney(basePrice + addon)`, using the theme's existing `formatMoney` + `money_with_currency_format` — the same formatter already used for `.buttonPrice`, so currency handling is consistent with the rest of the theme.
- Added `data-variant-price="{{ product.selected_or_first_available_variant.price }}"` to the `<product-info>` tag in all three places it's rendered: [`sections/main-product.liquid`](sections/main-product.liquid), [`sections/featured-product.liquid`](sections/featured-product.liquid), [`sections/main-product-quick-view.liquid`](sections/main-product-quick-view.liquid).

**Known limitations (can't be verified from the theme side)**

- If Easify's addon figure isn't itself currency-converted per Shopify Market, adding it to our correctly-converted base price will be off in non-default currencies — worth testing with the currency switcher.
- Detection is add-node-only; if Easify ever mutates an existing swatch's price text in place (no DOM replacement) instead of re-rendering, the observer won't catch it.
- Relies on Easify's current stable class names — a future Easify update renaming them breaks this silently (no error, just stops updating).

**Incident — lost work after `shopify theme pull`**

- After a `shopify theme pull`, the `data-variant-price` attribute was missing from all three sections (it had never been committed, so the pull reverted those files to the live version).
- `assets/product-info.js` itself survived because it was the only file the pull happened not to touch.
- Re-applied the three `data-variant-price` attributes. **Lesson: commit each fix right after verifying it** — anything uncommitted is exactly what a theme pull discards.

---

## 2026-09-03 — Header "Shop your model" selector: oversized arrow + drawer flash on load

**Reported by:** client — the dropdown arrow next to the header model-selector briefly rendered oversized on every page load.

**Root cause**

- The entire `preselect`/`preselect-drawer` stylesheet was embedded inline in a `<style>` block at the very bottom of `<body>` ([`snippets/preselect-drawer.liquid`](snippets/preselect-drawer.liquid)), while the trigger button renders at the top of the page inside the header ([`snippets/preselect.liquid`](snippets/preselect.liquid), rendered from [`sections/header.liquid`](sections/header.liquid) and [`snippets/header-drawer.liquid`](snippets/header-drawer.liquid)).
- No stylesheet in the theme defined `.icon-caret` sizing outside that late block, and the SVG had no explicit `width`/`height`, so before the late CSS parsed, the browser used the default replaced-element size (~300×150px) — the oversized arrow.
- Same root cause also meant the **entire drawer** (brand list + ~105 device options) rendered briefly as a visible block at the bottom of every page load, and the mobile hide rule for the trigger (`@media (max-width:1070px)`) wasn't active yet either.

**Fix**

- Client moved the preselect/drawer CSS out of the inline `<style>` block and into [`assets/theme.css`](assets/theme.css), which loads as a blocking stylesheet in `<head>` — so styling is present before the header paints. Verified working.
- Note: `test-class` (a leftover debug class) on the caret SVG had already been removed in an earlier commit ([`198a06c`](../../commit/198a06c)); the dead `.test-class {}` stub in `theme.css` was also identified as leftover cruft.

**Other issues found (not yet fixed — flagged for later)**

- `{% render 'preselect' %}` in [`sections/header.liquid:337`](sections/header.liquid#L337) and [`snippets/header-drawer.liquid:251`](snippets/header-drawer.liquid#L251) is **not gated** on `settings.enable_preselect` — turning the feature off leaves a dead, unstyled button in the header.
- `settings.preselect_no_results_text` is referenced in [`snippets/preselect-drawer.liquid`](snippets/preselect-drawer.liquid) but doesn't exist in the settings schema — always falls back to hardcoded English.
- `settings_schema.json` has a trailing comma right after the Preselect settings block (Shopify's parser tolerates it; strict JSON parsers don't).
- Drawer panel background is hardcoded `#fff` instead of a theme surface variable — will look wrong on a dark color scheme.

---

## 2026-09-03 — Product page thumbnails offset right on mobile (few thumbnails)

**Reported by:** client — on mobile, when a product has only a few visible thumbnails, the thumbnail strip showed a large empty gap on the left and started from the right edge of the screen.

**Root cause**

- The Splide carousel config in [`snippets/product-media-gallery.liquid`](snippets/product-media-gallery.liquid) enables `"focus": "center"` whenever `product.media.size >= 5` (and similar gates at `>= 6`, `> perpage`).
- `product.media.size` counts **all** media, including images that belong to a specific variant. Those are still rendered as real slides (required — the thumbnail carousel is index-synced to the main gallery via `main.sync(thumbnails)`) but hidden purely via CSS (`.thumbnail--variant-hidden { display: none !important }` in [`assets/theme.css`](assets/theme.css)).
- Result: a product with 8 media where 5 belong to variants shows only 3 visible thumbnails, but the gate still saw `8 >= 5` and switched on center-focus. With only 3 slides and nothing to scroll, Splide's centering math produced a large positive `translateX` on `.splide__list`, pushing the strip right and leaving empty space on the left.
- Same wrong count was also driving two desktop alignment gates and the arrow-visibility gate (`product.media.size > perpage`), which showed scroll arrows on carousels with nothing to scroll.

**Fix**

- Client added a `visible_thumb_count` calculation (counting only non-variant-hidden media) in [`snippets/product-media-gallery.liquid`](snippets/product-media-gallery.liquid) and swapped it in for `product.media.size` across all four gates. Verified working.

---

## Prior commits (context, not made via this log's sessions)

- `198a06c` — preselect mobile css fixed
- `50235c8` — fixed preselect issue and thumbnail left spacing on mobile
- `6dda3df` — Base theme without fixing header and thumbnail spacing on product media
- `caabd72` — Edge 2.1.0 theme init
