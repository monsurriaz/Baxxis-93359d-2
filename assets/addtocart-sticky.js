if (!customElements.get('product-add-to-cart-sticky')) {
    class ProductAddToCartSticky extends HTMLElement {
      constructor() {
        super();
        this.handleScroll = this.handleScroll.bind(this);
        this.sectionId = this.dataset.section;
        this.variantChangeUnsubscriber = undefined;
      }
  
      connectedCallback() {
        this.targetElement = document.querySelector('[id^="ProductSubmitButton-"]');
        this.footerElement = document.querySelector('footer');
        this.stickyAtcVariantInput = this.querySelector('.product-variant-id');
  
        window.addEventListener("scroll", this.handleScroll);
        
        this.variantChangeUnsubscriber = subscribe(
          PUB_SUB_EVENTS.variantChange,
          this.handleVariantChange.bind(this)
        );
  
        this.handleScroll();
      }
  
      disconnectedCallback() {
        window.removeEventListener("scroll", this.handleScroll);
        
        if (this.variantChangeUnsubscriber) {
          this.variantChangeUnsubscriber();
        }
      }
  
      getAbsoluteTop(element) {
        if (!element) return 0;
        let top = 0;
        while (element) {
          top += element.offsetTop || 0;
          element = element.offsetParent;
        }
        return top;
      }
  
      handleScroll() {
        if (!this.targetElement || !this.footerElement) return;
  
        const targetTopPosition = this.getAbsoluteTop(this.targetElement);
        const footerTopPosition = this.getAbsoluteTop(this.footerElement);
        const isTargetElementOutOfView = targetTopPosition < window.scrollY;
        const isFooterInView = window.scrollY + window.innerHeight > footerTopPosition;
  
        if (isTargetElementOutOfView && !isFooterInView) {
          this.classList.add('show');
        } else {
          this.classList.remove('show');
        }
      }
  
      handleVariantChange({ data: { sectionId, html, variant } }) {
        const mainSectionId = this.sectionId.replace(/^template--\d+__/, '');
        const eventSectionId = sectionId.replace(/^template--\d+__/, '');
        
        if (mainSectionId !== eventSectionId) return;
  
        // Update variant input
        if (this.stickyAtcVariantInput) {
          this.stickyAtcVariantInput.value = variant?.id || '';
          this.stickyAtcVariantInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
  
        this.updateStickyOptionsFromHTML(sectionId, html);
      }
  
      updateStickyOptionsFromHTML(sectionId, html) {
        const sourceOptionsContainer = html.querySelector('.selected-variant-details .options-container');
        const destinationOptionsContainer = this.querySelector('.selected-variant-details .options-container');
  
        if (!sourceOptionsContainer || !destinationOptionsContainer) return;
  
        const sourceOptions = sourceOptionsContainer.querySelectorAll('.selected-variant-option');
        const destinationOptions = destinationOptionsContainer.querySelectorAll('.selected-variant-option');
  
        sourceOptions.forEach((sourceOption, index) => {
          if (destinationOptions[index]) {
            destinationOptions[index].textContent = sourceOption.textContent;
          }
        });
      }
    }
  
    customElements.define('product-add-to-cart-sticky', ProductAddToCartSticky);
  }
  