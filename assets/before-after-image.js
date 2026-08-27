if (!customElements.get('before-after-image')) {
  class BeforeAfterImage extends HTMLElement {
    constructor() {
      super();
      this.slider = this.querySelector('.slider');
      this.container = this.querySelector('.before-after-container');
    }
  
    connectedCallback() {
      new IntersectionObserver((entries, o) => 
        entries.forEach(e => e.isIntersecting && this.initSlider(o)), 
      { threshold: 0 }).observe(this.container);
    }
  
    initSlider() {
      const update = (x) => {
        const { left, width } = this.container.getBoundingClientRect();
        const pos = Math.max(0, Math.min(x - left, width));
        
        requestAnimationFrame(() => {
          this.container.classList.remove('transition');
          this.container.style.setProperty('--slider-position', `${pos}px`);
          this.container.style.setProperty('--clip-path-percent', `${(pos / width) * 100}%`);
        });
      };
    
      const center = () => requestAnimationFrame(() => {
        const mid = this.container.offsetWidth / 2;
        this.container.classList.add('transition');
        this.container.style.setProperty('--slider-position', `${mid}px`);
        this.container.style.setProperty('--clip-path-percent', '50%');
      });
    
      this.slider.addEventListener('mousedown', () => {
        const move = (e) => update(e.clientX);
        const end = () => document.removeEventListener('mousemove', move);
        
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', end, { once: true });
      });
    
      this.slider.addEventListener('touchstart', () => {
        const move = (e) => update(e.touches[0].clientX);
        const end = () => document.removeEventListener('touchmove', move);
        
        document.addEventListener('touchmove', move);
        document.addEventListener('touchend', end, { once: true });
      });
    
      this.container.addEventListener('click', (e) => {
        this.container.classList.add('transition-faster');
        update(e.clientX);
        setTimeout(() => this.container.classList.remove('transition-faster'), 100);
      });

      this.slider.addEventListener('keydown', (e) => {
        const step = 20; // pixels
        const { left, width } = this.container.getBoundingClientRect();
        const current = parseFloat(getComputedStyle(this.container).getPropertyValue('--slider-position')) || width / 2;
      
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const newPos = Math.max(0, current - step);
          this.container.style.setProperty('--slider-position', `${newPos}px`);
          this.container.style.setProperty('--clip-path-percent', `${(newPos / width) * 100}%`);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          const newPos = Math.min(width, current + step);
          this.container.style.setProperty('--slider-position', `${newPos}px`);
          this.container.style.setProperty('--clip-path-percent', `${(newPos / width) * 100}%`);
        }
      });
      
    
      setTimeout(center, 200);
    }
  }
  
  customElements.define('before-after-image', BeforeAfterImage);
}
