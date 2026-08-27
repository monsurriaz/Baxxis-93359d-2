class ModalDrawer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: none;
          z-index: 1000;
        }

        :host([open]) {
          display: block;
        }

        .modal-drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(1px);
          opacity: 0;
          transition: opacity var(--duration-medium, 0.3s) ease;
          pointer-events: none;
        }

        :host([open]) .modal-drawer-overlay {
          opacity: 1;
          pointer-events: auto;
        }

        .modal-drawer__content {
          position: fixed;
          bottom: 0;
          left: 0;
          width: 100%;
          background: rgb(var(--color-drawer-background));
          transform: translateY(100%);
          transition: transform var(--duration-medium, 0.3s) ease;
          z-index: 1001;
          padding: 30px;
          box-sizing: border-box;
        }

        :host([open]) .modal-drawer__content {
          transform: translateY(0);
        }

        @media (max-width: 768px) {
          .modal-drawer__content {
            padding: 20px 20px 30px 20px;
          }
        }
      </style>
      <div class="modal-drawer-overlay"></div>
      <div class="modal-drawer__content">
        <slot></slot>
      </div>
    `;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.focusableElements = [];
    this.firstFocusableElement = null;
    this.lastFocusableElement = null;
    this.restoreFocusTo = null;
  }

  connectedCallback() {
    this.overlay = this.shadowRoot.querySelector('.modal-drawer-overlay');
    this.content = this.shadowRoot.querySelector('.modal-drawer__content');
    this.closeButtons = this.querySelectorAll('.close-modal-drawer');

    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-modal', 'true');

    this.overlay.addEventListener('click', () => this.close());
    this.closeButtons.forEach(button => button.addEventListener('click', () => this.close()));

    this.shadowRoot.querySelector('slot').addEventListener('slotchange', () => {
      if (this.hasAttribute('open')) {
        this.updateFocusableElements();
        this.trapFocus();
      }
    });

    if (this.hasAttribute('open')) {
      this.open();
    } else {
      this.close();
    }
  }

  getFocusableElements() {
    const selector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    const lightDomFocusables = Array.from(this.querySelectorAll(selector));
    const shadowDomFocusables = Array.from(this.shadowRoot.querySelectorAll(selector));

    const allFocusables = [...shadowDomFocusables, ...lightDomFocusables].filter(
        el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    );

    allFocusables.sort((a, b) => {
        const tabindexA = a.tabIndex >= 0 ? a.tabIndex : (a.getAttribute('tabindex') === null ? 0 : parseInt(a.getAttribute('tabindex')));
        const tabindexB = b.tabIndex >= 0 ? b.tabIndex : (b.getAttribute('tabindex') === null ? 0 : parseInt(b.getAttribute('tabindex')));

        if (tabindexA === tabindexB) return 0;
        if (tabindexA === 0) return 1;
        if (tabindexB === 0) return -1;
        return tabindexA - tabindexB;
    });

    return allFocusables;
  }

  updateFocusableElements() {
      this.focusableElements = this.getFocusableElements();
      this.firstFocusableElement = this.focusableElements[0];
      this.lastFocusableElement = this.focusableElements[this.focusableElements.length - 1];

      if (this.focusableElements.length === 0) {
          this.content.setAttribute('tabindex', '-1');
          this.firstFocusableElement = this.content;
          this.lastFocusableElement = this.content;
      } else {
           this.content.removeAttribute('tabindex');
      }
  }

  trapFocus(event) {
    if (event.key === 'Tab') {
      const isFirstElement = document.activeElement === this.firstFocusableElement;
      const isLastElement = document.activeElement === this.lastFocusableElement;

      if (event.shiftKey) {
        if (isFirstElement || !this.contains(document.activeElement)) {
          this.lastFocusableElement.focus();
          event.preventDefault();
        }
      } else {
        if (isLastElement || !this.contains(document.activeElement)) {
          this.firstFocusableElement.focus();
          event.preventDefault();
        }
      }
    }
  }

  open() {
    this.restoreFocusTo = document.activeElement;
    this.style.display = 'block';

    requestAnimationFrame(() => {
      setTimeout(() => {
        this.setAttribute('open', '');
        this.updateFocusableElements();
        if (this.firstFocusableElement) {
            this.firstFocusableElement.focus();
        } else {
             this.focus();
        }
        document.addEventListener('keydown', this.handleKeyDown);
      }, 10);
    });
  }

  close() {
    if (!this.hasAttribute('open')) {
        return;
    }

    this.removeAttribute('open');
    document.removeEventListener('keydown', this.handleKeyDown);

    if (this.restoreFocusTo && typeof this.restoreFocusTo.focus === 'function') {
        this.restoreFocusTo.focus();
        this.restoreFocusTo = null;
    }

    setTimeout(() => {
      this.style.display = 'none';
    }, 300);
  }

  handleKeyDown(event) {
    if (event.key === 'Escape' && this.hasAttribute('open')) {
       this.close();
    }

    if (this.hasAttribute('open')) {
        this.trapFocus(event);
    }
  }

  static get observedAttributes() {
    return ['open'];
  }
}

customElements.define('modal-drawer', ModalDrawer);

class ModalTrigger extends DrawerButton {
  constructor() {
    super();
  }

  handleClick() {
    if (this.targetDrawer && this.targetDrawer instanceof ModalDrawer) {
      this.targetDrawer.open();
    }
  }
}

customElements.define('modal-trigger', ModalTrigger);
