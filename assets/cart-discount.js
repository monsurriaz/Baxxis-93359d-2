if (!customElements.get('cart-discount')) {
  class CartDiscount extends HTMLElement {
    constructor() {
      super();
      this.form = this.querySelector('form');
      this.input = this.querySelector('input[name="discount"]');
      this.button = this.form?.querySelector('button[type="submit"]');
      this.errorWrap = this.querySelector('.cart-discount__error');
      this.errorDiscount = this.querySelector('.cart-discount__error--discount');
      this.errorShipping = this.querySelector('.cart-discount__error--shipping');
      this.onApply = this.applyDiscount.bind(this);
      this.onRemove = this.removeDiscount.bind(this);
    }

    connectedCallback() {
      if (this.form) this.form.addEventListener('submit', this.onApply);
      this.addEventListener('click', this.onRemove);
    }

    disconnectedCallback() {
      if (this.form) this.form.removeEventListener('submit', this.onApply);
      this.removeEventListener('click', this.onRemove);
    }

    getCurrentCodes() {
      return Array.from(document.querySelectorAll('[data-discount-code]'))
        .map(el => el.dataset.discountCode)
        .filter(Boolean);
    }

    getSectionsToRender() {
      const main = document.getElementById('main-cart-items');
      const mainSectionId = main?.dataset.id;
      const sections = [];

      if (mainSectionId) {
        sections.push(
          { id: 'main-cart-items', section: mainSectionId, selector: '.js-contents' },
          { id: 'main-cart-total', section: mainSectionId, selector: '.js-contents-total' },
          { id: 'main-cart-shipping', section: mainSectionId, selector: '.js-contents-shipping' },
          { id: 'main-cart-discount', section: mainSectionId, selector: '.js-contents-discount' },
        );
      }

      sections.push(
        { id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '.shopify-section' },
        { id: 'cart-live-region-text', section: 'cart-live-region-text', selector: '.shopify-section' },
      );

      const cartDrawer = document.querySelector('cart-drawer');
      if (cartDrawer) {
        sections.push({ id: 'cart-drawer', section: 'cart-drawer', selector: null });
      }

      return sections;
    }

    async applyDiscount(e) {
      e.preventDefault();
      const code = this.input?.value.trim();
      if (!code) return;

      this.toggleError(false);
      this.setLoading(true);

      const existing = this.getCurrentCodes();
      if (!existing.includes(code)) existing.push(code);

      await this.updateDiscounts(existing);
      if (this.input) this.input.value = '';
    }

    async removeDiscount(e) {
      const pill = e.target.closest('[data-remove-discount]');
      if (!pill) return;

      e.preventDefault();
      this.toggleError(false);
      this.setLoading(true);

      const codeToRemove = pill.dataset.removeDiscount;
      const keep = this.getCurrentCodes().filter(c => c !== codeToRemove);

      await this.updateDiscounts(keep);
    }

    async updateDiscounts(codes) {
      try {
        const checkboxUpsell = document.querySelector('#cart-upsell-checkbox');
        const wasChecked = checkboxUpsell?.checked;

        const sectionsMeta = this.getSectionsToRender();
        const sections = sectionsMeta.map(s => s.section);

        const body = JSON.stringify({
          discount: (codes && codes.length) ? codes.join(',') : '',
          sections,
          sections_url: window.location.pathname,
        });

        const res = await fetch(`${window.routes.cart_update_url}.js`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body,
        });

        if (!res.ok) throw new Error('Failed to update discounts');

        const data = await res.json();
        const lastCode = codes[codes.length - 1];

        const isShipping = this.checkShippingDiscount(data, codes, lastCode);
        if (isShipping) {
          this.toggleError(true, 'shipping');
          return;
        }

        if (codes.length > 0) {
          const appliedCodes = data.discount_codes?.map(d => d.code) || [];
          
          if (lastCode && !appliedCodes.includes(lastCode)) {
            this.toggleError(true, 'discount_code');
            return;
          }

          if (Array.isArray(data.discount_codes) && data.discount_codes.length) {
            const last = data.discount_codes.find(d => d.code === lastCode);
            if (last && last.applicable === false) {
              this.toggleError(true, 'discount_code');
              return;
            }
          }
        }

        const cartDrawer = document.querySelector('cart-drawer');
        if (cartDrawer && typeof cartDrawer.renderContents === 'function') {
          cartDrawer.renderContents(data);
        }

        sectionsMeta.forEach(({ id, section, selector }) => {
          if (section === 'cart-drawer') return;

          const container = document.getElementById(id);
          const htmlStr = data.sections?.[section];
          if (!container || !htmlStr) return;

          const doc = new DOMParser().parseFromString(htmlStr, 'text/html');
          const fragment = selector ? doc.querySelector(selector) : doc.body;
          if (!fragment) return;

          const target = selector ? (container.querySelector(selector) || container) : container;
          target.innerHTML = fragment.innerHTML;
        });

        setTimeout(() => {
          const newCheckbox = document.querySelector('#cart-upsell-checkbox');
          if (newCheckbox) {
            const variantId = newCheckbox.getAttribute('data-variant-id');
            if (data.items && variantId) {
              const hasUpsellInCart = data.items.some(item => 
                item.variant_id.toString() === variantId
              );
              newCheckbox.checked = hasUpsellInCart;
            }
          }

          document.dispatchEvent(new CustomEvent('cartUpdated'));
        }, 100);

      } catch (err) {
        console.error('[CartDiscount] updateDiscounts error:', err);
        this.toggleError(true, 'discount_code');
      } finally {
        this.setLoading(false);
      }
    }

    checkShippingDiscount(data, codes, lastCode) {
      if (!codes.length || !lastCode) return false;

      if (!data.discount_codes || !Array.isArray(data.discount_codes)) return false;

      const appliedCodes = data.discount_codes.map(d => d.code);
      const currentDOMCodes = this.getCurrentCodes();

      const lastDiscount = data.discount_codes.find(d => d.code === lastCode);
      
      return (
        lastDiscount && 
        lastDiscount.applicable === true &&
        appliedCodes.length === currentDOMCodes.length &&
        !currentDOMCodes.includes(lastCode)
      );
    }

    toggleError(show, type = 'discount_code') {
      if (!this.errorWrap) return;

      if (!show) {
        this.errorWrap.classList.add('hidden');
        this.errorDiscount?.classList.add('hidden');
        this.errorShipping?.classList.add('hidden');
        return;
      }

      this.errorWrap.classList.remove('hidden');
      if (type === 'discount_code') this.errorDiscount?.classList.remove('hidden');
      if (type === 'shipping') this.errorShipping?.classList.remove('hidden');
    }

    setLoading(isLoading) {
      if (!this.button) return;
      this.button.disabled = isLoading;
      this.button.classList.toggle('loading', isLoading);
    }
  }

  customElements.define('cart-discount', CartDiscount);
}
