class AnimatedCounter extends HTMLElement {
  constructor() {
    super();
    this.hasAnimated = false;
    this.observer = null;
  }

  static get observedAttributes() {
    return ['target', 'duration', 'easing', 'threshold'];
  }

  connectedCallback() {
    this.valueEl = this.querySelector('.counter-value');
    if (!this.valueEl) return;

    this.valueEl.setAttribute('aria-live', 'polite');
    this.setAttribute('role', 'status');

    this.initialParsed = this.parseValue();
    this.setupObserver();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }

  setupObserver() {
    const threshold = Math.max(0, Math.min(1, parseFloat(this.getAttribute('threshold')) || 0.3));

    this.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this.hasAnimated) {
        this.startAnimation();
        this.hasAnimated = true;
      }
    }, { threshold });

    this.observer.observe(this);
  }

  getEasing(name) {
    const easings = {
      easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
      easeOutQuad: t => 1 - (1 - t) ** 2,
      easeOutCubic: t => 1 - (1 - t) ** 3,
      easeInOutCubic: t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
      linear: t => t
    };
    return easings[name] || easings.easeOutExpo;
  }

  parseValue() {
    if (!this.valueEl) return null;
    
    const text = this.valueEl.textContent.trim();
    const match = text.match(/^([^\d.-]*)([-+]?[0-9,]+\.?[0-9]*)(.*)$/);

    if (!match) return null;

    const [, prefix, numStr, suffix] = match;
    const target = parseFloat(numStr.replace(/,/g, ''));
    
    return {
      target: isNaN(target) ? 0 : target,
      prefix,
      suffix,
      hasComma: numStr.includes(','),
      decimals: (numStr.split('.')[1] || '').length
    };
  }

  startAnimation() {
    if (!this.valueEl || !this.initialParsed) return;

    const parsed = this.initialParsed;
    const target = parseFloat(this.getAttribute('target')) || parsed.target;
    if (isNaN(target)) return;

    const duration = Math.max(100, parseInt(this.getAttribute('duration')) || 2000);
    const easing = this.getEasing(this.getAttribute('easing'));
    const { prefix, suffix, hasComma, decimals } = parsed;
    const isDecimal = target % 1 !== 0;
    const startTime = performance.now();

    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = easing(progress);

      let value = target * eased;
      if (isDecimal) {
        const precision = Math.max(decimals, 2);
        value = parseFloat(value.toFixed(precision));
      } else {
        value = Math.floor(value);
      }

      const display = hasComma ? value.toLocaleString('en-US') : String(value);
      this.valueEl.textContent = prefix + display + suffix;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        const final = hasComma ? target.toLocaleString('en-US') : String(target);
        this.valueEl.textContent = prefix + final + suffix;

        this.dispatchEvent(new CustomEvent('counter-complete', {
          detail: { target }
        }));
      }
    };

    requestAnimationFrame(animate);
  }

  reset() {
    this.hasAnimated = false;
    if (this.valueEl && this.initialParsed) {
      const { prefix, suffix } = this.initialParsed;
      this.valueEl.textContent = prefix + '0' + suffix;
    }
  }

  animate() {
    if (!this.hasAnimated) {
      this.startAnimation();
      this.hasAnimated = true;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) return;
    
    if (name === 'threshold') {
      this.observer?.disconnect();
      this.setupObserver();
    }
  }
}

customElements.define('animated-counter', AnimatedCounter);
