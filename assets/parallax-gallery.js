class ParallaxGallery extends HTMLElement {
  constructor() {
    super();
    this._onScroll = this._onScroll.bind(this);
    this._update = this._update.bind(this);
    this._ticking = false;
    this._isIntersecting = false;
  }

  connectedCallback() {
    this.container = this.querySelector(".parallax-gallery__container");
    
    if (!this.container) {
      console.error("No `.parallax-gallery__container` found inside <parallax-gallery>.");
      return;
    }

    this.items = Array.from(
      this.container.querySelectorAll(".parallax-gallery__item")
    ).map((item) => ({
      element: item,
      offset: Number(item.dataset.offset) || 0,
    }));

    // Intersection Observer element visible
    this._observer = new IntersectionObserver(
      (entries) => {
        this._isIntersecting = entries[0].isIntersecting;
        if (this._isIntersecting) {
          this._update();
        }
      },
      { rootMargin: "50px" } 
    );
    
    this._observer.observe(this.container);
    window.addEventListener("scroll", this._onScroll, { passive: true });
  }

  disconnectedCallback() {
    window.removeEventListener("scroll", this._onScroll);
    if (this._observer) {
      this._observer.disconnect();
    }
  }

  _onScroll() {
    if (!this._isIntersecting || this._ticking) return;
    
    window.requestAnimationFrame(this._update);
    this._ticking = true;
  }

  _update() {
    if (!this._isIntersecting) {
      this._ticking = false;
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    
    const progress = (windowHeight - rect.top) / (windowHeight + rect.height);
    const scrollProgress = Math.max(0, Math.min(1, progress));
    
    this.items.forEach(({ element, offset }) => {
      let movement;
      
      if (offset < 0) {
        movement = scrollProgress * Math.abs(offset);
      } else {
        movement = -scrollProgress * offset;
      }

      element.style.transform = `translate3d(0, ${movement}px, 0)`;
    });

    this._ticking = false;
  }
}

customElements.define("parallax-gallery", ParallaxGallery);
