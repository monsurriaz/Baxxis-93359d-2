class PageTransition extends HTMLElement {
  static get observedAttributes() {
    return ['duration'];
  }

  constructor() {
    super();
    this.duration = parseInt(this.getAttribute('duration')) || 350;
    this._handleClick = this._handleClick.bind(this);
    this._handlePageShow = this._handlePageShow.bind(this);
  }

  attributeChangedCallback(name, _, newValue) {
    if (name === 'duration') {
      const val = parseInt(newValue, 10);
      this.duration = !isNaN(val) && val >= 0 ? val : DEFAULT_DURATION;
    }
  }

  connectedCallback() {
    if (this.hasAttribute('duration')) {
      this.attributeChangedCallback('duration', null, this.getAttribute('duration'));
    }

    this.classList.add('active');

    const isReload = this._isReload();
    if (isReload) {
      this._hideInstant();
    } else {
      requestAnimationFrame(() => this.classList.remove('active', 'no-transition'));
      document.body.addEventListener('click', this._handleClick);
    }

    window.addEventListener('pageshow', this._handlePageShow);
  }

  disconnectedCallback() {
    document.body.removeEventListener('click', this._handleClick);
    window.removeEventListener('pageshow', this._handlePageShow);
  }

  _isReload() {
    try {
      const nav = performance.getEntriesByType?.("navigation")[0];
      return nav?.type === 'reload' || performance.navigation?.type === 1;
    } catch {
      return true;
    }
  }

  _hideInstant() {
    this.classList.add('no-transition');
    this.classList.remove('active');
    Object.assign(this.style, {
      opacity: 0,
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    setTimeout(() => this.classList.remove('no-transition'), 50);
  }

  _handleClick(e) {
    const a = e.target.closest('a');
    if (!a?.href) return;

    const href = a.getAttribute('href');
    const classListToIgnore = ['no-transition', 'product__media-icon', 'header__icon--cart', 'button'];
    if (
      a.hasAttribute('download') || a.target === '_blank' || a.rel === 'external' ||
      a.hasAttribute('data-no-transition') || a.href.startsWith('mailto:') ||
      a.href.startsWith('tel:') || href?.startsWith('#') || classListToIgnore.some(cls => a.classList.contains(cls))
    ) return;

    try {
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
    } catch {
      return;
    }

    e.preventDefault();
    this.classList.remove('no-transition');
    this.classList.add('active');
    setTimeout(() => location.href = a.href, this.duration);
  }

  _handlePageShow(e) {
    if (e.persisted) this._hideInstant();
  }
}

customElements.define('page-transition', PageTransition);
