if (!customElements.get('text-reveal')) {
  class TextReveal extends HTMLElement {
    constructor() {
      super();
      this.words = [];
      this.isTicking = false;
      this.isVisible = false; 
      this.onScroll = this.onScroll.bind(this);
      this.update = this.update.bind(this);
      this.refresh = this.refresh.bind(this);
    }

    connectedCallback() {
      this.original = this.querySelector('[data-text-reveal="original"]');
      this.overlay = this.querySelector('[data-text-reveal="overlay"]');

      if (!this.original || !this.overlay) return;

      if (document.readyState === 'complete') {
        this.init();
      } else {
        window.addEventListener('load', () => this.init(), { once: true });
      }
    }

    init() {
      const text = this.original.textContent.trim();
      if (!text) return;

      const words = text.split(/\s+/).filter(w => w.length > 0);
      const className = this.dataset.revealClass || "text-reveal-word";
    
      const fragOriginal = document.createDocumentFragment();
      const fragOverlay = document.createDocumentFragment();
    
      words.forEach((w, index) => {
        const o = document.createElement("span");
        o.textContent = w;
        fragOriginal.appendChild(o);
    
        const ov = document.createElement("span");
        ov.className = className;
        ov.dataset.word = "";
        ov.textContent = w;
        fragOverlay.appendChild(ov);
        this.words.push(ov);
    
        if (index < words.length - 1) {
          fragOriginal.appendChild(document.createTextNode(" "));
          fragOverlay.appendChild(document.createTextNode(" "));
        }
      });
    
      this.original.innerHTML = "";
      this.overlay.innerHTML = "";
      this.original.appendChild(fragOriginal);
      this.overlay.appendChild(fragOverlay);
    
      window.addEventListener("resize", this.refresh);

      this.observer = new IntersectionObserver(entries => {
        this.isVisible = entries[0].isIntersecting;
        if (this.isVisible) {
          this.measure();
          window.addEventListener("scroll", this.onScroll, { passive: true });
          this.update();
        } else {
          window.removeEventListener("scroll", this.onScroll);
        }
      }, { rootMargin: "20% 0px", threshold: 0 });
    
      this.observer.observe(this);
    }

    measure() {
      const rect = this.getBoundingClientRect();
      const scrollTop = window.scrollY;
      this.start = rect.top + scrollTop - window.innerHeight * 0.8; 
      this.end = rect.top + scrollTop + rect.height - window.innerHeight * 0.2;
      this.total = this.end - this.start;
      if (this.total <= 0) this.total = 1;
    }

    onScroll() {
      if (!this.isTicking) {
        requestAnimationFrame(this.update);
        this.isTicking = true;
      }
    }

    update() {
      this.isTicking = false;
      if (!this.words.length || !this.isVisible) return;

      const currentScroll = window.scrollY;
      let p = (currentScroll - this.start) / this.total;
      p = Math.max(0, Math.min(p, 1));

      const count = this.words.length;
      
      for (let i = 0; i < count; i++) {
        const start = i / count;
        const end = (i + 1) / count;
        let v = 0;

        if (p >= end) v = 100;
        else if (p > start) v = ((p - start) / (end - start)) * 100;

        this.words[i].style.setProperty("--reveal-amount", v.toFixed(1) + "%");
      }
    }

    refresh() {
      this.measure();
      this.update();
    }

    disconnectedCallback() {
      window.removeEventListener("scroll", this.onScroll);
      window.removeEventListener("resize", this.refresh);
      this.observer?.disconnect();
    }
  }

  customElements.define("text-reveal", TextReveal);
}