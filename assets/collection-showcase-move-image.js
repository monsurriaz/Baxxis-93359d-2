if (!customElements.get('hover-image')) {
  class HoverImage extends HTMLElement {
    constructor() {
      super();
      this._imgWidth = 0;
      this._imgHeight = 0;
      this._hideTimeout = null;

      this._handleMouseMove = this.handleMouseMove.bind(this);
      this._handleMouseEnter = this.handleMouseEnter.bind(this);
      this._handleMouseLeave = this.handleMouseLeave.bind(this);
      this._updateRectAndImageDimensions = this.updateRectAndImageDimensions.bind(this);
    }

    connectedCallback() {
      this.img = this.querySelector('.hover-image');
      if (!this.img) {
        return;
      }

      this.text = this.innerText;
      this.dataSize = this.getAttribute('data-size');
      this.imgSrc = this.getAttribute('data-src');
      
      this.updateRectAndImageDimensions();
      
      this.addEventListener('mousemove', this._handleMouseMove, { passive: true });
      this.addEventListener('mouseenter', this._handleMouseEnter, { passive: true });
      this.addEventListener('mouseleave', this._handleMouseLeave, { passive: true });
      
      window.addEventListener('scroll', this._updateRectAndImageDimensions, { passive: true });
      window.addEventListener('resize', this._updateRectAndImageDimensions, { passive: true });

      this.img.style.willChange = 'transform, opacity'; 

      this.img.style.opacity = '0';
      this.img.style.display = 'none'; 

       if (this.img.tagName === 'IMG' && !this.img.complete) {
         this.img.onload = () => {
           this.updateImageDimensions();
         };
       } else {
         this.updateImageDimensions();
       }
    }

    disconnectedCallback() {
      this.removeEventListener('mousemove', this._handleMouseMove);
      this.removeEventListener('mouseenter', this._handleMouseEnter);
      this.removeEventListener('mouseleave', this._handleMouseLeave);
      window.removeEventListener('scroll', this._updateRectAndImageDimensions);
      window.removeEventListener('resize', this._updateRectAndImageDimensions);

      if (this._hideTimeout) {
        clearTimeout(this._hideTimeout);
        this._hideTimeout = null;
      }

      if (this.img) {
        this.img.style.willChange = 'auto';
      }
    }

    updateImageDimensions() {
      if (this.img) {
        this._imgWidth = this.img.offsetWidth;
        this._imgHeight = this.img.offsetHeight;
      }
    }

    updateRectAndImageDimensions() {
      this._containerRect = this.getBoundingClientRect();
      this.updateImageDimensions();
    }

    handleMouseEnter() {
      if (this._hideTimeout) {
        clearTimeout(this._hideTimeout);
        this._hideTimeout = null;
      }

      this.img.style.display = 'block'; 
      
      requestAnimationFrame(() => {
         if (this.img) {
            this.img.style.opacity = '1';
         }
      });
      
      this.updateRectAndImageDimensions();
    }

    handleMouseLeave() {
      if (this.img) {
         this.img.style.opacity = '0';
      }
      
      const transitionDuration = parseFloat(getComputedStyle(this.img).transitionDuration) * 1000; 
      
      this._hideTimeout = setTimeout(() => {
        if (this.img) {
          this.img.style.display = 'none';
        }
        this._hideTimeout = null;
      }, transitionDuration);
    }

    handleMouseMove(e) {
      if (!this.img || !this._containerRect || this._imgWidth === 0 || this._imgHeight === 0) {
         return;
      }

      const clientX = e.clientX;
      const clientY = e.clientY;

      requestAnimationFrame(() => {
        if (!this.img) return; 
        
        const cursorXInContainer = clientX - this._containerRect.left;
        const cursorYInContainer = clientY - this._containerRect.top;

        const translateX = cursorXInContainer - this._imgWidth / 2;
        const translateY = cursorYInContainer - this._imgHeight / 2;

        this.img.style.transform = `translate(${translateX}px, ${translateY}px)`;
        // Or: this.img.style.transform = `translate3d(${translateX}px, ${translateY}px, 0)`;
      });
    }
  }

  customElements.define('hover-image', HoverImage);
}
