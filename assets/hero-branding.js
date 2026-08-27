class HeroBranding extends HTMLElement {
  constructor() {
    super();
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  connectedCallback() {
    this.logo = this.querySelector('.hero-branding__logo');
    if (!this.logo) return;

    // Parse attributes
    this.scaleEnd = parseFloat(this.getAttribute('scale-end')) || 0.3;
    this.scrollRange = this.parseScrollRange(this.getAttribute('scroll-range') || '50vh');
    this.headerSelector = this.getAttribute('header-selector') || '.site-header';
    this.headerClass = this.getAttribute('header-class') || 'hero-branding-active';
    this.header = document.querySelector(this.headerSelector);

    const attrScaleStart = this.getAttribute('scale-start');
    if (attrScaleStart) {
      this.scaleStart = parseFloat(attrScaleStart);
    } else {

      requestAnimationFrame(() => {
        this.scaleStart = this.calculateAutoScaleStart();
        this.handleScroll();
      });
    }

    window.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('resize', this.handleResize, { passive: true });

    this.handleScroll();
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);
    if (this.header) {
      this.header.classList.remove(this.headerClass);
    }
  }

  parseScrollRange(value) {
    if (value.endsWith('vh')) {
      return window.innerHeight * (parseFloat(value) / 100);
    }
    return parseFloat(value);
  }

  calculateAutoScaleStart() {
    const viewportWidth = window.innerWidth;
    const logoWidth = this.logo.offsetWidth || 100;
  
    const isMobile = viewportWidth <= 768;
    const maxRatio = isMobile ? 0.8 : 0.5;
    const maxAllowedWidth = viewportWidth * maxRatio;
  
    const scale = maxAllowedWidth / logoWidth;
    return Math.round(scale * 1000) / 1000; 
  }
  
  

  handleResize() {
    if (!this.getAttribute('scale-start')) {
      this.scaleStart = this.calculateAutoScaleStart();
      this.handleScroll();
    }
  }

  handleScroll() {
    if (!this.scaleStart) return;

    const scrollY = window.scrollY;
    const percentage = Math.min(1, Math.max(0, scrollY / this.scrollRange));
    const rawScale = this.scaleStart - (this.scaleStart - this.scaleEnd) * percentage;
    const scale = Math.round(rawScale * 1000) / 1000;

    this.logo.style.transform = `translate3d(0, 0, 0) scale(${scale})`;

    if (this.header) {
      if (percentage >= 1) {
        this.logo.style.opacity = '0';
        this.header.classList.remove(this.headerClass);
      } else {
        this.logo.style.opacity = '1';
        this.header.classList.add(this.headerClass);
      }
    }
  }
}

customElements.define('hero-branding', HeroBranding);
