if (!customElements.get('cart-terms-check')) {
  class CartTermsCheck extends HTMLElement {
    constructor() {
      super();
    }

    connectedCallback() {
      this.checkbox = this.querySelector('.cart__terms-checkbox');
      this.checkoutButton = this.querySelector('.cart__checkout-button');

      if (!this.checkbox || !this.checkoutButton) return;
      this.attachEvents();
    }

    attachEvents() {
      this.checkoutButton.addEventListener('click', (event) => {
        if (!this.checkbox.checked) {
          event.preventDefault();
          event.stopImmediatePropagation(); 
          this.checkbox.setCustomValidity(window.cartStrings.termsCheckboxNotify);
          this.checkbox.reportValidity();
          return false;
        } else {
          this.checkbox.setCustomValidity('');
        }
      });

      this.checkbox.addEventListener('change', () => {
        if (this.checkbox.checked) {
          this.checkbox.setCustomValidity('');
        }
      });
    }
  }

  customElements.define('cart-terms-check', CartTermsCheck);
}
