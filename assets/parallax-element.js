/**
 *  @class
 *  @function ParallaxElement
 */

document.addEventListener('DOMContentLoaded', () => {
  if (!customElements.get('parallax-element')) {
    class ParallaxElement extends HTMLElement {
      constructor() {
        super();
        this.animationFrameId = null;
        this.parallax = null;
      }
    
      connectedCallback() {
        const images = this.querySelectorAll('.parallax-image');

        if (images.length > 0) {
          this.parallax = new Ukiyo(images, {
            scale: 1.7,
            speed: 1.7,
            externalRAF: true
          });

          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  this.startAnimation();
                } else {
                  this.stopAnimation();
                }
              });
            },
            { threshold: 0.1 }
          );

          observer.observe(this);
        }
      }

      startAnimation() {
        const animate = () => {
          this.parallax?.animate();
          this.animationFrameId = requestAnimationFrame(animate);
        };
        if (!this.animationFrameId) {
          this.animationFrameId = requestAnimationFrame(animate);
        }
      }

      stopAnimation() {
        if (this.animationFrameId) {
          cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = null;
        }
      }
    
      disconnectedCallback() {
        this.stopAnimation();

        if (this.parallax) {
          this.parallax.destroy();
          this.parallax = null;
        }
      }
    }

    customElements.define('parallax-element', ParallaxElement);
  }
});

