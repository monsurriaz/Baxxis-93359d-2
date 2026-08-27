class StackCards extends HTMLElement {
  constructor() {
    super();
    this.items = [];
    this.scrollingFn = null;
    this.scrolling = false;
    this.marginY = 0;
    this.elementHeight = 0;
    this.cardTop = 0;
    this.cardHeight = 0;
    this.windowHeight = 0;
    this._intersectionObserver = null;
    this._resizeTimeout = null;

    this._onScroll = this._onScroll.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onIntersection = this._onIntersection.bind(this);
    this._onFocusIn = this._onFocusIn.bind(this);
  }

  connectedCallback() {
    this.items = Array.from(this.querySelectorAll('.js-stack-cards__item'));
    if (this.items.length === 0) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if ('IntersectionObserver' in window) {
      this._intersectionObserver = new IntersectionObserver(this._onIntersection, { threshold: [0, 1] });
      this._intersectionObserver.observe(this);
    }

    window.addEventListener('resize', this._onResize);
    this.addEventListener('focusin', this._onFocusIn);

    this._setStackCards();
  }

  disconnectedCallback() {
    if (this._intersectionObserver) this._intersectionObserver.disconnect();
    window.removeEventListener('resize', this._onResize);
    this.removeEventListener('focusin', this._onFocusIn);
    this._removeScrollListener();
  }

  _onIntersection(entries) {
    const entry = entries[0];
    if (entry.isIntersecting) {
      this._addScrollListener();
    } else {
      this._removeScrollListener();
      this.items.forEach(item => item.classList.remove('is-focused'));
    }
  }
  

  _addScrollListener() {
    if (this.scrollingFn) return;
    this.scrollingFn = this._onScroll;
    window.addEventListener('scroll', this.scrollingFn);
  }

  _removeScrollListener() {
    if (!this.scrollingFn) return;
    window.removeEventListener('scroll', this.scrollingFn);
    this.scrollingFn = null;
  }

  _onScroll() {
    if (this.scrolling) return;
    this.scrolling = true;
    window.requestAnimationFrame(() => this._animateStackCards());
  }

  _onResize() {
    clearTimeout(this._resizeTimeout);
    this._resizeTimeout = setTimeout(() => {
      this._setStackCards();
      this._animateStackCards();
    }, 250);
  }

  _setStackCards() {
    let marginYValue = getComputedStyle(this).getPropertyValue('--stack-cards-gap');
    this.marginY = this._parseCssSizeToPx(marginYValue.trim());
    this.elementHeight = this.offsetHeight;

    if (this.items.length > 0) {
      const cardStyle = getComputedStyle(this.items[0]);
      this.cardTop = Math.floor(parseFloat(cardStyle.getPropertyValue('top'))) || 0;
      this.cardHeight = Math.floor(parseFloat(cardStyle.getPropertyValue('height'))) || 0;
    }

    this.windowHeight = window.innerHeight;

    if (isNaN(this.marginY)) {
      this.style.paddingBottom = '0px';
    } else {
      this.style.paddingBottom = `${this.marginY * (this.items.length - 1)}px`;
    }

    this.items.forEach((item, i) => {
      if (isNaN(this.marginY)) {
        item.style.transform = 'none';
      } else {
        item.style.transform = `translateY(${this.marginY * i}px)`;
      }
      item.classList.remove('is-focused');
    });
  }

  _parseCssSizeToPx(value) {
    if (!value) return NaN;
    if (value.endsWith('px')) return parseInt(value);
    if (value.endsWith('rem')) return parseFloat(value) * 16;
    if (value.endsWith('em')) return parseFloat(value) * 16;
    return NaN;
  }

  _animateStackCards() {
    if (isNaN(this.marginY)) {
      this.scrolling = false;
      return;
    }

    const top = this.getBoundingClientRect().top;

    if (this.cardTop - top + this.windowHeight - this.elementHeight - this.cardHeight + this.marginY + this.marginY * this.items.length > 0) {
      this.scrolling = false;
      return;
    }

    this.items.forEach((item, i) => {
      const scrolling = this.cardTop - top - i * (this.cardHeight + this.marginY);
      if (scrolling > 0) {
        const scaling = i === this.items.length - 1 ? 1 : (this.cardHeight - scrolling * 0.15) / this.cardHeight;
        item.style.transform = `scale(${scaling})`;
      } else {
        item.style.transform = `scale(1)`;
      }
    });

    this.scrolling = false;
  }

  _onFocusIn(event) {
    const focusedItem = event.target.closest('.js-stack-cards__item');
    if (!focusedItem) return;
  
    this.items.forEach((item) => item.classList.remove('is-focused'));
    focusedItem.classList.add('is-focused');
  
    // Delay scroll to avoid interfering with focus
    setTimeout(() => {
      focusedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 10);
  
    this._animateStackCards();
  }
  
}

customElements.define('stack-cards', StackCards);
