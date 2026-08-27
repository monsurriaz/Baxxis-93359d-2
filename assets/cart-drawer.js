class CartDrawer extends HTMLElement {
  constructor() {
    super();
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
    this._boundHandleDocumentKeyDown = this._handleDocumentKeyDown.bind(this);
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;
    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);

    setTimeout(() => {
      this.classList.add('animate', 'active');
    }, 30);

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        if (typeof trapFocus === 'function') {
            trapFocus(containerToTrapFocusOn, focusElement);
        }
      },
      { once: true }
    );

    document.body.classList.add('overflow-hidden');
    document.addEventListener('keydown', this._boundHandleDocumentKeyDown);
  }

  close() {
    if (!this.classList.contains('active')) return;

    this.classList.remove('active');
    if (typeof removeTrapFocus === 'function' && this.activeElement) {
        removeTrapFocus(this.activeElement);
    }
    document.body.classList.remove('overflow-hidden');
    document.removeEventListener('keydown', this._boundHandleDocumentKeyDown);
  }

  _handleDocumentKeyDown(event) {
    if (event.code === 'Escape') {
      if (this.classList.contains('active')) {
        const isModalDrawerOpen = document.querySelector('modal-drawer[open]');
        if (isModalDrawerOpen) {
          return;
        }
        event.preventDefault();
        this.close();
      }
    }
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    if (typeof onKeyUpEscape === 'function') {
        cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
    }
  }

  renderContents(parsedState) {
    const drawerInner = this.querySelector('.drawer__inner');
    if (drawerInner && drawerInner.classList.contains('is-empty')) {
        drawerInner.classList.remove('is-empty');
    }
    this.productId = parsedState.id;
    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector
        ? document.querySelector(section.selector)
        : document.getElementById(section.id);
      if (sectionElement) {
        sectionElement.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.id], section.selector);
      }
    });

    setTimeout(() => {
      const overlay = this.querySelector('#CartDrawer-Overlay');
      if (overlay) {
          overlay.removeEventListener('click', this.close.bind(this));
          overlay.addEventListener('click', this.close.bind(this));
      }
      this.open();
    }, 50);
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'CartDrawer',
        section: 'cart-drawer',
        selector: '.drawer__inner',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);
