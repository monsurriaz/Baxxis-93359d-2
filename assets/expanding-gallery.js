class ExpandingGallery extends HTMLElement {
    constructor() {
      super();
      this.panels = [];
      this.autoRotate = false;
      this.rotateInterval = null;
      this.rotateIntervalTime = 5000;
  
      // Bind methods
      this.handlePanelClick = this.handlePanelClick.bind(this);
      this.handleKeyDown = this.handleKeyDown.bind(this);
    }
  
    static get observedAttributes() {
      return ['auto-rotate', 'rotate-interval'];
    }
  
    connectedCallback() {
      this.panels = Array.from(this.querySelectorAll('.gallery-panel'));
      this.setupEventListeners();
  
      // Config
      if (this.hasAttribute('auto-rotate')) {
        this.autoRotate = this.getAttribute('auto-rotate') === 'true';
      }
  
      if (this.hasAttribute('rotate-interval')) {
        this.rotateIntervalTime = parseInt(this.getAttribute('rotate-interval')) || 5000;
      }
  
      // Auto activate first panel
      if (this.panels.length > 0 && !this.querySelector('.gallery-panel.active')) {
        this.activatePanel(this.panels[0]);
      }
  
      if (this.autoRotate) {
        this.startAutoRotate();
      }
  
      // ✅ Shopify Theme Editor support
      document.addEventListener('shopify:block:select', (event) => {
        const block = event.target.closest('.gallery-panel');
        if (block && this.contains(block)) {
          this.activatePanel(block);
          this.stopAutoRotate();
        }
      });
    }
  
    disconnectedCallback() {
      this.removeEventListeners();
      this.stopAutoRotate();
    }
  
    attributeChangedCallback(name, oldValue, newValue) {
      if (name === 'auto-rotate') {
        this.autoRotate = newValue === 'true';
        this.autoRotate ? this.startAutoRotate() : this.stopAutoRotate();
      }
  
      if (name === 'rotate-interval') {
        this.rotateIntervalTime = parseInt(newValue) || 5000;
        if (this.autoRotate) {
          this.stopAutoRotate();
          this.startAutoRotate();
        }
      }
    }
  
    setupEventListeners() {
      this.panels.forEach(panel => {
        panel.addEventListener('click', this.handlePanelClick);
      });
  
      document.addEventListener('keydown', this.handleKeyDown);
    }
  
    removeEventListeners() {
      this.panels.forEach(panel => {
        panel.removeEventListener('click', this.handlePanelClick);
      });
  
      document.removeEventListener('keydown', this.handleKeyDown);
    }
  
    handlePanelClick(event) {
      const clickedPanel = event.currentTarget;
      this.activatePanel(clickedPanel);
      this.stopAutoRotate();
  
      this.dispatchEvent(new CustomEvent('panel-changed', {
        detail: {
          panel: clickedPanel,
          index: this.panels.indexOf(clickedPanel)
        }
      }));
    }
  
    activatePanel(panel) {
      this.panels.forEach(p => p.classList.remove('active'));
      panel.classList.add('active');
    }
  
    handleKeyDown(event) {
      const activePanel = this.querySelector('.gallery-panel.active');
      if (!activePanel) return;
  
      const activeIndex = this.panels.indexOf(activePanel);
      let newIndex;
  
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        newIndex = (activeIndex + 1) % this.panels.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        newIndex = (activeIndex - 1 + this.panels.length) % this.panels.length;
      }
  
      if (newIndex !== undefined) {
        this.activatePanel(this.panels[newIndex]);
      }
    }
  
    startAutoRotate() {
      if (this.rotateInterval) return;
  
      this.rotateInterval = setInterval(() => {
        const activePanel = this.querySelector('.gallery-panel.active');
        const activeIndex = this.panels.indexOf(activePanel);
        const nextIndex = (activeIndex + 1) % this.panels.length;
        this.activatePanel(this.panels[nextIndex]);
      }, this.rotateIntervalTime);
    }
  
    stopAutoRotate() {
      if (this.rotateInterval) {
        clearInterval(this.rotateInterval);
        this.rotateInterval = null;
      }
    }
  
    // Public API
    goToPanel(index) {
      if (index >= 0 && index < this.panels.length) {
        this.activatePanel(this.panels[index]);
      }
    }
  
    getCurrentIndex() {
      const activePanel = this.querySelector('.gallery-panel.active');
      return this.panels.indexOf(activePanel);
    }
  }
  
  customElements.define('expanding-gallery', ExpandingGallery);
  