/* preselect.js — Header option preselect for Edge 2.1.0
 * - Persists the chosen value (e.g. Size) in localStorage
 * - Collection links: rewrites every /collections/<handle> link on the page to
 *   carry the native Shopify filter param (does NOT reload the current view)
 * - Product pages: auto-selects the matching variant on load
 */
(function () {
  'use strict';

  function init() {
    var STORAGE_KEY = 'edge_preselect_value';

    var picker = document.querySelector('[data-preselect]');
    if (!picker) return;

  // --- config from the header <select> data attributes ---
  var optionRaw = (picker.getAttribute('data-preselect-option') || '').trim();
  // aliases support multilingual option names, e.g. "Size,Dydis"
  var optionAliases = optionRaw
    .split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
  var primaryOption = (optionRaw.split(',')[0] || '').trim();
  var pageType = picker.getAttribute('data-page-type') || '';

  // NOTE: verify this param against your store. Apply the filter manually on a
  // collection page and copy the query string — it should read
  // "filter.v.option.<option name>". Adjust the casing here if yours differs.
  var filterParam = 'filter.v.option.' + primaryOption.toLowerCase();

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch (e) { return ''; }
  }
  function setStored(v) {
    try {
      if (v) localStorage.setItem(STORAGE_KEY, v);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }
  function currentUrl() { return new URL(window.location.href); }
  function normalize(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  var stored = getStored();

  // ---- reflect the current choice in the header select ----
  (function initSelectValue() {
    var fromUrl = currentUrl().searchParams.get(filterParam);
    var val = fromUrl != null ? fromUrl : stored;
    if (val == null) return;
    var exists = Array.prototype.some.call(picker.options, function (o) {
      return o.value === val;
    });
    if (exists) picker.value = val;
  })();

  /* =========================================================================
   * COLLECTION LINK DECORATION
   * Matches collection-index links only:
   *   /collections/shoes            ✓
   *   /en-gb/collections/shoes/     ✓  (locale prefix)
   *   /collections/all              ✓
   *   /collections/shoes/products/x ✗  (product link — excluded)
   *   /collections                  ✗  (collection list page)
   * ========================================================================= */
  var COLLECTION_RE = /\/collections\/[^/?#]+\/?$/;

  function decorateLink(a, value) {
    var raw = a.getAttribute('href');
    if (!raw || raw.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(raw)) return;

    if (a.closest('facet-remove, .active-facets, facet-filters-form, .facets, #FacetFiltersForm, #FacetFiltersFormMobile, .mobile-facets')) return;

    var u;
    try { u = new URL(raw, window.location.origin); } catch (e) { return; }
    if (u.origin !== window.location.origin) return;
    if (!COLLECTION_RE.test(u.pathname)) return;

    if (/(^|&)(filter\.|sort_by=)/.test(u.search.replace(/^\?/, ''))) return;

    // Nothing to do: no value to apply and no stale filter to strip.
    // Leave the link — and any page= it carries — untouched.
    var hadFilter = u.searchParams.has(filterParam);
    if (!value && !hadFilter) return;

    u.searchParams.delete(filterParam); // idempotent: never stack the param
    u.searchParams.delete('page');       // reset pagination only when the filter changes
    if (value) u.searchParams.set(filterParam, value);

    a.setAttribute('href', u.pathname + u.search + u.hash);
  }

  function decorateWithin(root, value) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    if (root.tagName === 'A' && root.hasAttribute('href')) decorateLink(root, value);
    var links = root.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) decorateLink(links[i], value);
  }

  // Re-decorate links injected after load (quick-view, predictive search,
  // Section Rendering grid/facet re-renders). We observe childList only — never
  // attributes — so our own href writes don't retrigger the observer.
  var linkObserver = new MutationObserver(function (mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var added = mutations[m].addedNodes;
      for (var n = 0; n < added.length; n++) {
        if (added[n].nodeType === 1) decorateWithin(added[n], picker.value);
      }
    }
    // Facet apply/clear re-renders the grid; the URL is already updated by then,
    // so reconcile here too (covers themes that don't emit a history event).
    if (pageType === 'collection') syncFromCollectionUrl();
  });
  linkObserver.observe(document.body, { childList: true, subtree: true });

  // ---- header select change: store, re-decorate, and act per page type ----
  var internalSync = false; // true while reconciling from the URL (skip navigation)

  // Reconcile stored value + trigger with the collection URL's filter param.
  // Defined at init scope so the link observer can call it too.
  function syncFromCollectionUrl() {
    if (pageType !== 'collection') return;
    var raw = currentUrl().searchParams.get(filterParam);
    var newVal = raw == null ? '' : raw; // no param = filter cleared = All
    if (newVal === (picker.value || '')) { setStored(newVal); return; }
    internalSync = true;
    picker.value = newVal;                      // '' selects All (or clears selection)
    setStored(newVal);                          // '' clears the stored preference
    decorateWithin(document, newVal);           // drop/refresh the param on page links
    picker.dispatchEvent(new Event('change', { bubbles: true })); // refresh trigger label
    internalSync = false;
  }

  picker.addEventListener('change', function () {
    if (internalSync) return; // URL-driven sync already stored/decorated/labelled
    var val = picker.value;
    setStored(val);
    decorateWithin(document, val);

    if (pageType === 'collection') {
      // Apply the filter to the current view by replacing the URL.
      var u = currentUrl();
      if (val) u.searchParams.set(filterParam, val);
      else u.searchParams.delete(filterParam);
      u.searchParams.delete('page'); // reset pagination for the new filter
      window.location.replace(u.toString());
      return;
    }

    if (pageType === 'product') {
      applied = false;            // allow re-applying the new value
      applyProductPreselect(val);
    }
  });

  /* =========================================================================
   * COLLECTION FILTER SYNC
   * The URL is authoritative on collection pages: no filter param = All. This
   * MUST run before the first decorate pass, so a cleared param wipes the stored
   * value before any link gets re-stamped with the stale filter.
   * ========================================================================= */
  if (pageType === 'collection') {
    if (!window.__preselectHistoryPatched) {
      window.__preselectHistoryPatched = true;
      ['pushState', 'replaceState'].forEach(function (m) {
        var orig = history[m];
        history[m] = function () {
          var r = orig.apply(this, arguments);
          window.dispatchEvent(new Event('preselect:locationchange'));
          return r;
        };
      });
      window.addEventListener('popstate', function () {
        window.dispatchEvent(new Event('preselect:locationchange'));
      });
    }
    window.addEventListener('preselect:locationchange', syncFromCollectionUrl);
    syncFromCollectionUrl(); // reconcile on load (clears if the param is gone)
  }

  // ---- initial pass over the whole page (uses the reconciled value) ----
  decorateWithin(document, picker.value);

  /* =========================================================================
   * DRAWER UI
   * The drawer is just an alternate front-end for the hidden <select>. Clicking
   * an option sets picker.value + fires "change", so all logic above runs as-is.
   * ========================================================================= */
  try {
  (function wireDrawer() {
    // Resolved at document scope — the trigger and drawer do NOT need to share
    // a parent, so you can place the trigger in the header and the drawer
    // anywhere else (e.g. a snippet rendered near </body>).
    var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-preselect-trigger]'));
    var trigger = triggers[0]; // reference for aria state + return focus
    var drawer = document.querySelector('[data-preselect-drawer]');
    if (!triggers.length || !drawer) return;

    var panel = drawer.querySelector('.preselect-drawer__panel');
    var search = drawer.querySelector('[data-preselect-search]');
    var currentLabels = Array.prototype.slice.call(document.querySelectorAll('[data-preselect-current]'));
    var emptyEl = drawer.querySelector('[data-preselect-empty]');

    var brandStep = drawer.querySelector('[data-preselect-step="brand"]');
    var modelStep = drawer.querySelector('[data-preselect-step="model"]');
    var brandList = drawer.querySelector('[data-preselect-brandlist]');
    var brandBtns = Array.prototype.slice.call(drawer.querySelectorAll('[data-preselect-brand]'));
    var allBtn = drawer.querySelector('[data-preselect-all]');
    var backBtn = drawer.querySelector('[data-preselect-back]');
    var titleEl = drawer.querySelector('[data-preselect-title]');
    var defaultTitle = titleEl ? titleEl.textContent : '';

    // model options only (the brand-step "All" button is excluded on purpose)
    var modelEls = Array.prototype.slice.call(
      drawer.querySelectorAll('[data-preselect-step="model"] [data-preselect-value]')
    );

    var currentBrand = null; // null = brand step; '' = "Other"; else a brand name
    var visible = [];
    var activeIndex = -1;
    var lastFocused = null;

    function optionsForBrand(brand) {
      return modelEls.filter(function (o) {
        return (o.getAttribute('data-brand') || '') === brand;
      });
    }

    function fillCounts() {
      // add an "Other" bucket if any value matched no brand
      if (brandList && optionsForBrand('').length) {
        var hasOther = brandBtns.some(function (b) {
          return (b.getAttribute('data-preselect-brand') || '') === '';
        });
        if (!hasOther) {
          var li = document.createElement('li');
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'preselect-drawer__brand';
          btn.setAttribute('data-preselect-brand', '');
          btn.innerHTML = '<span>Other</span><span class="preselect-drawer__count" data-count></span>';
          li.appendChild(btn);
          brandList.appendChild(li);
          brandBtns.push(btn);
        }
      }
      brandBtns.forEach(function (b) {
        var c = b.querySelector('[data-count]');
        if (c) c.textContent = optionsForBrand(b.getAttribute('data-preselect-brand') || '').length;
      });
    }

    function setActive(i) {
      visible.forEach(function (o) { o.classList.remove('is-active'); });
      activeIndex = i;
      if (i > -1 && visible[i]) {
        visible[i].classList.add('is-active');
        visible[i].scrollIntoView({ block: 'nearest' });
      }
    }

    function syncTrigger() {
      var val = picker.value;
      var text = val
        ? val
        : (allBtn ? allBtn.textContent.trim() : (picker.options[0] ? picker.options[0].text : ''));
      currentLabels.forEach(function (el) { el.textContent = text; });
      triggers.forEach(function (t) { t.classList.toggle('has-value', !!val); });
      modelEls.forEach(function (o) {
        var sel = o.getAttribute('data-preselect-value') === val;
        o.classList.toggle('is-selected', sel);
        o.setAttribute('aria-selected', sel ? 'true' : 'false');
      });
      if (allBtn) allBtn.classList.toggle('is-selected', val === '');
    }

    function filter(q) {
      q = (q || '').trim().toLowerCase();
      visible = [];
      modelEls.forEach(function (o) {
        var li = o.closest('li') || o;
        var inBrand = (o.getAttribute('data-brand') || '') === (currentBrand || '');
        if (currentBrand === null || !inBrand) { li.style.display = 'none'; return; }
        var full = (o.getAttribute('data-preselect-value') || '').toLowerCase(); // "iphone 16 pro"
        var label = o.textContent.trim().toLowerCase();                          // "16 pro"
        var hit = !q || full.indexOf(q) !== -1 || label.indexOf(q) !== -1;
        li.style.display = hit ? '' : 'none';
        if (hit) visible.push(o);
      });
      if (emptyEl) emptyEl.hidden = visible.length > 0;
      setActive(q && visible.length ? 0 : -1);
    }

    function showBrandStep() {
      currentBrand = null;
      if (modelStep) modelStep.hidden = true;
      if (brandStep) brandStep.hidden = false;
      if (search) { search.hidden = true; search.value = ''; }
      if (backBtn) backBtn.hidden = true;
      if (titleEl) titleEl.textContent = defaultTitle;
      setActive(-1);
    }

    function showModelStep(brand) {
      currentBrand = brand;
      if (brandStep) brandStep.hidden = true;
      if (modelStep) modelStep.hidden = false;
      if (backBtn) backBtn.hidden = false;
      if (titleEl) titleEl.textContent = brand === '' ? 'Other' : brand;
      if (search) { search.hidden = false; search.value = ''; }
      filter('');
      // pre-highlight the current selection if it lives in this brand
      var val = picker.value;
      if (val) {
        for (var i = 0; i < visible.length; i++) {
          if (visible[i].getAttribute('data-preselect-value') === val) { setActive(i); break; }
        }
      }
    }

    function selectValue(val) {
      picker.value = val;
      picker.dispatchEvent(new Event('change', { bubbles: true })); // may navigate on collection pages
      syncTrigger();
      close();
    }

    function open() {
      lastFocused = document.activeElement;
      var val = picker.value;
      var current = val
        ? modelEls.filter(function (o) { return o.getAttribute('data-preselect-value') === val; })[0]
        : null;
      if (current) showModelStep(current.getAttribute('data-brand') || '');
      else showBrandStep();

      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      triggers.forEach(function (t) { t.setAttribute('aria-expanded', 'true'); });
      document.documentElement.style.overflow = 'hidden';
      (currentBrand !== null && search ? search : panel).focus();
    }

    function close() {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      triggers.forEach(function (t) { t.setAttribute('aria-expanded', 'false'); });
      document.documentElement.style.overflow = '';
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    fillCounts();

    triggers.forEach(function (t) { t.addEventListener('click', open); });

    drawer.addEventListener('click', function (e) {
      if (e.target.closest('[data-preselect-close]')) close();
    });

    if (backBtn) backBtn.addEventListener('click', function () { showBrandStep(); panel.focus(); });

    brandBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        showModelStep(b.getAttribute('data-preselect-brand') || '');
        if (search) search.focus();
      });
    });

    if (allBtn) allBtn.addEventListener('click', function () { selectValue(''); });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !drawer.classList.contains('is-open')) return;
      if (currentBrand !== null) { showBrandStep(); panel.focus(); } // back to brands first
      else close();
    });

    if (search) {
      search.addEventListener('input', function () { filter(search.value); });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActive(Math.min(activeIndex + 1, visible.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActive(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (visible[activeIndex]) visible[activeIndex].click();
        }
      });
    }

    modelEls.forEach(function (o) {
      o.addEventListener('mouseenter', function () {
        var i = visible.indexOf(o);
        if (i > -1) setActive(i);
      });
      o.addEventListener('click', function () {
        selectValue(o.getAttribute('data-preselect-value'));
      });
    });

    picker.addEventListener('change', syncTrigger);
    syncTrigger();
  })();
  } catch (e) {
    // A drawer failure must not stop the product-page variant preselect below.
    console.error('[preselect] drawer init failed:', e);
  }

  /* =========================================================================
   * PRODUCT VARIANT PRESELECT (unchanged)
   * ========================================================================= */
  var applied = false;

  function optionNameFromLabel(groupEl) {
    // Edge dropdown: <div class="form__label">Size: <span class="form__label-value">…</span></div>
    // Also handles <legend>/<label> for radio-style pickers.
    var labelEl = groupEl.querySelector('.form__label, legend, label');
    if (!labelEl) return '';
    var clone = labelEl.cloneNode(true);
    var valSpan = clone.querySelector('.form__label-value');
    if (valSpan && valSpan.parentNode) valSpan.parentNode.removeChild(valSpan);
    return clone.textContent;
  }

  function optionNameFromControl(groupEl) {
    var control = groupEl.querySelector('select, input[type="radio"]');
    if (!control) return '';
    var nm = control.getAttribute('name') || '';
    // Shopify controls are named options[Size], options[Color], etc.
    var m = nm.match(/\[([^\]]+)\]/);
    return m ? m[1] : nm;
  }

  function groupMatchesOption(groupEl) {
    var candidates = [
      optionNameFromLabel(groupEl),
      groupEl.getAttribute('data-option-name') || '',
      optionNameFromControl(groupEl)
    ];
    for (var i = 0; i < candidates.length; i++) {
      var n = normalize(candidates[i]).replace(/[:•]/g, '').trim();
      if (n && optionAliases.indexOf(n) !== -1) return true;
    }
    return false;
  }

  function selectValueInGroup(groupEl, value) {
    var target = normalize(value);

    var radios = groupEl.querySelectorAll('input[type="radio"]');
    for (var i = 0; i < radios.length; i++) {
      if (normalize(radios[i].value) === target) {
        if (radios[i].disabled) return false;
        if (!radios[i].checked) {
          radios[i].checked = true;
          radios[i].dispatchEvent(new Event('input', { bubbles: true }));
          radios[i].dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      }
    }

    var sel = groupEl.querySelector('select');
    if (sel) {
      for (var j = 0; j < sel.options.length; j++) {
        if (normalize(sel.options[j].value) === target) {
          if (sel.value !== sel.options[j].value) {
            sel.value = sel.options[j].value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return true;
        }
      }
    }
    return false;
  }

  function applyProductPreselect(value) {
    if (applied || !value) return applied;

    var groups = document.querySelectorAll(
      'variant-selects .product-form__input, .product-form__input, ' +
      'variant-selects fieldset, product-form fieldset'
    );
    if (!groups.length) return false;

    for (var i = 0; i < groups.length; i++) {
      // try every group whose option name matches; stop at the first that
      // actually contains the value (handles duplicate/sticky product forms)
      if (groupMatchesOption(groups[i]) && selectValueInGroup(groups[i], value)) {
        applied = true;
        return true;
      }
    }
    return false;
  }

  if (pageType === 'product' && stored) {
    if (!applyProductPreselect(stored)) {
      var obs = new MutationObserver(function () {
        if (applyProductPreselect(stored) || applied) obs.disconnect();
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () { obs.disconnect(); }, 5000);
    }
  }
  } // end init

  // Run after the DOM is parsed, no matter where this script sits (inline or
  // external, head or body) — so the trigger/select/drawer already exist.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();