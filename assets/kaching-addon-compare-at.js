/**
 * Kaching Cart Drawer — addon-aware compare-at price (custom code)
 * ---------------------------------------------------------------
 * Easify Options charges its addons by raising the cart LINE price (Shopify
 * cart-transform: cart.js shows `has_components: true` and a price above the
 * variant's own price). The variant's compare-at price is catalog data, so it
 * stays put — the drawer ends up showing e.g. €40,95 struck through above
 * €37,95 (32.95 base + 5.00 addon), and a "You save €3" badge.
 *
 * In the theme's own cart drawer this is one Liquid line
 * (`item.variant.compare_at_price + (item.original_price - item.variant.price)`),
 * but Kaching's drawer is an app embed with no Liquid we can touch. So we do
 * the same arithmetic client-side and rewrite the rendered figures:
 *
 *     addon    = line price (cart.js)  -  variant price (products.js)
 *     new old  = rendered compare-at   +  addon
 *     new save = new old               -  rendered final price
 *
 * Everything is derived from what Kaching already rendered (currency symbol,
 * separators, decimals, bidi marks are reused verbatim), so the output matches
 * the drawer's own formatting in every market.
 *
 * Kaching re-renders reactively, so a one-shot pass is not enough: we observe
 * the drawer and re-apply. Writes are idempotent (we never write text that is
 * already correct), so our own mutations can't drive an infinite loop.
 */
(function () {
  'use strict';

  var ITEM_CONTAINER = '.kaching-cart-item-container';
  var ITEM = '.kaching-cart-item';
  var COMPONENT_ITEM = '.kaching-cart-item-component';
  var TOTAL_FINAL = '.kaching-cart-item__total-final';
  var TOTAL_OLD = '.kaching-cart-item__total-old';
  var SAVE_BADGE = '.kaching-cart__badge';

  // Ajax cart endpoints whose response body is a full cart object.
  var CART_JSON_RE = /\/cart(?:\/(?:add|change|update|clear))?\.js(?:[?#]|$)/;

  // Sub-3-cent differences are currency-conversion rounding, not an addon.
  var ADDON_NOISE_FLOOR = 3;

  var cart = null;
  var cartFetch = null;
  var products = {};
  var roots = [];
  var observer = null;
  var scheduled = false;
  var running = false;
  var rerun = false;
  var lastDeepScan = 0;

  var routeRoot = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

  /* ------------------------------------------------------------------ money */

  // Any run of digits, optionally broken up by separators: "40,95", "1.234,56".
  // Non-breaking and narrow spaces are in the class: some locales group with them.
  var NUMBER_TOKEN = /\d[\d.,\u00A0\u202F ]*\d|\d/;

  /**
   * Reads the money format out of a rendered string, so we can print a new
   * amount exactly the way the drawer prints its own.
   */
  function describeFormat(text) {
    var match = String(text == null ? '' : text).match(NUMBER_TOKEN);
    if (!match) return null;

    var token = match[0];
    var decimals = 0;
    var decimalSep = '';
    var lastSepPos = Math.max(token.lastIndexOf(','), token.lastIndexOf('.'));

    // A trailing separator is only a decimal point if 1-2 digits follow it —
    // "1.234" is a thousands separator, "40,95" is not.
    if (lastSepPos !== -1 && /^\d{1,2}$/.test(token.slice(lastSepPos + 1))) {
      decimalSep = token.charAt(lastSepPos);
      decimals = token.length - lastSepPos - 1;
    }

    // Whatever separator is left over groups the thousands.
    var groupSep = '';
    for (var i = 0; i < token.length; i++) {
      var ch = token.charAt(i);
      if (/\d/.test(ch) || (decimalSep && i === lastSepPos)) continue;
      groupSep = ch;
      break;
    }

    var intDigits = (decimals ? token.slice(0, lastSepPos) : token).replace(/\D/g, '').length;
    return {
      index: match.index,
      token: token,
      decimals: decimals,
      decimalSep: decimalSep || ',',
      groupSep: groupSep || (decimalSep === ',' ? '.' : ','),
      // Four-plus digits printed with no separator means this shop doesn't group.
      grouped: groupSep ? true : intDigits < 4,
    };
  }

  function parseMoneyToCents(text) {
    var format = describeFormat(text);
    if (!format) return null;

    var token = format.token;
    var sepPos = format.decimals ? token.lastIndexOf(format.decimalSep) : -1;
    var whole = (sepPos === -1 ? token : token.slice(0, sepPos)).replace(/\D/g, '');
    var frac = (sepPos === -1 ? '' : token.slice(sepPos + 1)).replace(/\D/g, '');

    return parseInt(whole || '0', 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  }

  /** Rewrites the number inside `text` with `cents`, keeping everything else. */
  function formatLikeTemplate(text, cents) {
    var format = describeFormat(text);
    if (!format) return null;

    var amount = Math.abs(Math.round(cents));
    // Kaching drops ",00" on round savings — keep that, but never hide real cents.
    var decimals = format.decimals || (amount % 100 === 0 ? 0 : 2);
    var whole = String(decimals ? Math.floor(amount / 100) : Math.round(amount / 100));

    if (format.grouped) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, format.groupSep);

    var out = decimals ? whole + format.decimalSep + String(amount % 100).padStart(2, '0') : whole;
    return text.slice(0, format.index) + out + text.slice(format.index + format.token.length);
  }

  /* ------------------------------------------------------------------- data */

  function rememberCart(json) {
    if (!json || !Array.isArray(json.items)) return;
    cart = json;
    schedule();
  }

  function refreshCart() {
    if (cartFetch) return cartFetch;
    cartFetch = fetch(routeRoot + 'cart.js', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json();
      })
      .then(rememberCart)
      .catch(function () {})
      .then(function () {
        cartFetch = null;
      });
    return cartFetch;
  }

  function getProduct(handle) {
    if (!products[handle]) {
      products[handle] = fetch(routeRoot + 'products/' + encodeURIComponent(handle) + '.js', {
        headers: { Accept: 'application/json' },
      })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .catch(function () {
          return null;
        });
    }
    return products[handle];
  }

  function findVariant(product, variantId) {
    if (!product || !Array.isArray(product.variants)) return null;
    for (var i = 0; i < product.variants.length; i++) {
      if (product.variants[i].id === variantId) return product.variants[i];
    }
    return null;
  }

  /**
   * Kaching's cart data always arrives through the Ajax API, so listening in on
   * those responses keeps us in sync with the exact payload it just rendered —
   * no polling, no extra requests. Both transports are patched because which
   * one the app uses is an implementation detail we don't control.
   */
  function sniffCartResponses() {
    var originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function () {
        var promise = originalFetch.apply(this, arguments);
        try {
          var input = arguments[0];
          var url = String(input && input.url ? input.url : input || '');
          if (CART_JSON_RE.test(url)) {
            promise
              .then(function (res) {
                res
                  .clone()
                  .json()
                  .then(rememberCart)
                  .catch(function () {});
              })
              .catch(function () {});
          }
        } catch (e) {
          /* never let our sniffing break the app's own request */
        }
        return promise;
      };
    }

    var originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function () {
      this.__kcCartUrl = arguments[1];
      return originalOpen.apply(this, arguments);
    };

    var originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      if (CART_JSON_RE.test(String(xhr.__kcCartUrl || ''))) {
        xhr.addEventListener('load', function () {
          try {
            rememberCart(JSON.parse(xhr.responseText));
          } catch (e) {
            /* not JSON — nothing to remember */
          }
        });
      }
      return originalSend.apply(this, arguments);
    };
  }

  /* --------------------------------------------------------------------- dom */

  function queryAll(selector) {
    var found = [];
    roots.forEach(function (root) {
      root.querySelectorAll(selector).forEach(function (el) {
        found.push(el);
      });
    });
    return found;
  }

  /**
   * One entry per top-level cart row: the elements we may rewrite, plus the
   * figures Kaching itself rendered into them.
   */
  function collectRows() {
    return queryAll(ITEM_CONTAINER)
      .map(function (container) {
        var row = container.querySelector(ITEM);
        if (!row || !row.dataset.productHandle) return null;

        var finalEl = row.querySelector(TOTAL_FINAL);
        var oldEl = row.querySelector(TOTAL_OLD);
        // Bundle components render their own rows inside the same container.
        if (!finalEl || !oldEl) return null;
        if (finalEl.closest(ITEM) !== row || oldEl.closest(ITEM) !== row) return null;
        if (finalEl.closest(COMPONENT_ITEM) || oldEl.closest(COMPONENT_ITEM)) return null;

        var oldText = baseTextOf(oldEl);
        var finalCents = parseMoneyToCents(finalEl.textContent);
        var oldCents = parseMoneyToCents(oldText);
        if (finalCents == null || oldCents == null) return null;

        var badgeEl = row.querySelector(SAVE_BADGE);
        if (badgeEl && (badgeEl.closest(ITEM) !== row || badgeEl.closest(COMPONENT_ITEM))) badgeEl = null;

        return {
          handle: row.dataset.productHandle,
          oldEl: oldEl,
          oldText: oldText,
          badgeEl: badgeEl,
          finalCents: finalCents,
          oldCents: oldCents,
        };
      })
      .filter(Boolean);
  }

  /**
   * Kaching's markup carries the product handle but not the variant id or line
   * key, and one product can sit in the cart several times (that is exactly
   * what an addon does — same variant, different options). So rows are matched
   * on handle plus the rendered price, in DOM order, each cart line claimed
   * once. Matching on the price also tells us whether the drawer prints line
   * totals or unit prices, which decides the quantity multiplier.
   */
  function matchRowsToItems(rows) {
    var claimed = [];
    var pairs = [];
    var stale = false;

    rows.forEach(function (row) {
      for (var i = 0; i < cart.items.length; i++) {
        if (claimed[i]) continue;
        var item = cart.items[i];
        if (item.handle !== row.handle) continue;

        var multiplier = null;
        if (row.finalCents === item.final_line_price) multiplier = item.quantity;
        else if (row.finalCents === item.final_price) multiplier = 1;
        if (multiplier == null) continue;

        claimed[i] = true;
        pairs.push({ row: row, item: item, multiplier: multiplier });
        return;
      }
      // No cart line explains this row — our copy of the cart is behind.
      stale = true;
    });

    return { pairs: pairs, stale: stale };
  }

  /**
   * products.js and cart.js can, in a converted-currency market, disagree about
   * which currency they speak. Compare-at prices are never touched by addons,
   * so the ratio between a rendered compare-at and the catalog one is pure
   * conversion — measure it once and use it to bring variant prices into the
   * currency the drawer is actually printing.
   */
  function currencyRatio(pairs, productsByHandle) {
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      var variant = findVariant(productsByHandle[pair.row.handle], pair.item.variant_id);
      if (!variant || !variant.compare_at_price) continue;

      var renderedUnit = pair.row.oldCents / pair.multiplier;
      var ratio = renderedUnit / variant.compare_at_price;
      if (isFinite(ratio) && ratio > 0.01 && ratio < 100) return ratio;
    }
    return 1;
  }

  /**
   * The figure we write becomes the figure we would read on the next pass, and
   * adding the addon to it again would compound (45,95 -> 50,95). So every
   * element we touch remembers both what Kaching rendered and what we wrote:
   * as long as our text is still standing, the remembered original is the
   * input. The moment Kaching re-renders (its own value back, or a new one),
   * the stamp no longer matches and the fresh text becomes the new original.
   */
  function baseTextOf(el) {
    var current = el.textContent;
    return el.dataset.kcWritten === current && el.dataset.kcBase != null ? el.dataset.kcBase : current;
  }

  function setText(el, baseText, text) {
    if (text == null || el.textContent === text) return;
    el.dataset.kcBase = baseText;
    el.dataset.kcWritten = text;
    el.textContent = text;
  }

  /**
   * The badge is only ours to rewrite if it currently states the savings we are
   * about to change — anything else in there ("Only 2 left") is left alone.
   */
  function updateSavingsBadge(badgeEl, oldCents, finalCents, newOldCents) {
    if (!badgeEl) return;

    var target = null;
    badgeEl.querySelectorAll('span').forEach(function (span) {
      if (!target && /\d/.test(span.textContent)) target = span;
    });
    if (!target) return;

    var text = baseTextOf(target);
    var shown = parseMoneyToCents(text);
    if (shown == null) return;

    if (text.indexOf('%') !== -1) {
      var currentPercent = Math.round(((oldCents - finalCents) / oldCents) * 100);
      // `shown` is a percentage read as cents (25% -> 2500).
      if (Math.abs(shown / 100 - currentPercent) > 1) return;
      var newPercent = Math.round(((newOldCents - finalCents) / newOldCents) * 100);
      setText(target, text, formatLikeTemplate(text, newPercent * 100));
      return;
    }

    if (Math.abs(shown - (oldCents - finalCents)) > ADDON_NOISE_FLOOR) return;
    setText(target, text, formatLikeTemplate(text, newOldCents - finalCents));
  }

  function apply() {
    if (running) {
      rerun = true;
      return;
    }

    var rows = collectRows();
    if (!rows.length) return;
    if (!cart) {
      refreshCart();
      return;
    }

    var matched = matchRowsToItems(rows);
    var pairs = matched.pairs;
    if (matched.stale) refreshCart();
    if (!pairs.length) return;

    running = true;
    var handles = pairs.map(function (pair) {
      return pair.row.handle;
    });

    Promise.all(handles.map(getProduct))
      .then(function (fetched) {
        var productsByHandle = {};
        handles.forEach(function (handle, i) {
          productsByHandle[handle] = fetched[i];
        });

        var ratio = currencyRatio(pairs, productsByHandle);

        pairs.forEach(function (pair) {
          var row = pair.row;
          var variant = findVariant(productsByHandle[row.handle], pair.item.variant_id);
          if (!variant) return;

          // What Easify added on top of the catalog price, per unit. Measured
          // against `original_price` (pre-discount), never `price`: a discount
          // on the line would otherwise eat into the addon and understate it.
          var listPrice = pair.item.original_price != null ? pair.item.original_price : pair.item.price;
          var addon = listPrice - Math.round(variant.price * ratio);
          if (addon < ADDON_NOISE_FLOOR) return;

          var newOldCents = row.oldCents + addon * pair.multiplier;
          setText(row.oldEl, row.oldText, formatLikeTemplate(row.oldText, newOldCents));
          updateSavingsBadge(row.badgeEl, row.oldCents, row.finalCents, newOldCents);
        });
      })
      .catch(function () {})
      .then(function () {
        running = false;
        if (rerun) {
          rerun = false;
          schedule();
        }
      });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      discoverRoots();
      apply();
    });
  }

  /* ---------------------------------------------------------------- observe */

  function observe(root) {
    if (roots.indexOf(root) !== -1) return;
    roots.push(root);
    observer.observe(root === document ? document.documentElement : root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /**
   * The drawer normally lives in the light DOM, but app embeds sometimes render
   * into an open shadow root — which the document-level observer can't see into
   * and querySelectorAll can't reach. Scan for one only while we have no rows
   * yet, and no more than twice a second.
   */
  function discoverRoots() {
    if (document.querySelector(ITEM_CONTAINER)) return;

    var now = Date.now();
    if (now - lastDeepScan < 500) return;
    lastDeepScan = now;

    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var shadow = all[i].shadowRoot;
      if (shadow && shadow.querySelector(ITEM_CONTAINER)) observe(shadow);
    }
  }

  function init() {
    observer = new MutationObserver(schedule);
    observe(document);
    sniffCartResponses();
    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
