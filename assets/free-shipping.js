/**
 *  @class
 *  @function FreeShippingProgressBar
 */

if (!customElements.get('free-shipping-progress-bar')) {
    let currentPercent = 0; // Store the current percentage globally
    class FreeShippingProgressBar extends HTMLElement {
      constructor() {
        super();
      }
  
      connectedCallback() {
        this.updateStatus();
      }
  
      updateStatus() {
        const remainingAmountText = this.querySelector('.free-shipping__info-text strong');
        const cartTotal = parseInt(this.dataset.cartTotal, 10) || 0;
        const freeShippingThreshold = Math.round(parseInt(this.dataset.shippingAmount, 10) * (Shopify.currency.rate || 1));
        const remainingInfo = this.querySelector('.free-shipping__info-text');
        const eligibilityInfo = this.querySelector('.free-shipping__info-eligibility');
        const isEligible = cartTotal >= freeShippingThreshold;
  
        if (remainingAmountText && !isEligible) {
          const remainingAmount = freeShippingThreshold - cartTotal;
          const currencyFormat = window.theme.settings.money_with_currency_format || "${{amount}}";
          remainingAmountText.innerHTML = formatMoney(remainingAmount, currencyFormat);
        }
  
        remainingInfo.style.display = isEligible ? 'none' : 'block';
        eligibilityInfo.style.display = isEligible ? 'block' : 'none';
  
        const progressPercentage = isEligible ? 1 : cartTotal / freeShippingThreshold;
        this.animateProgressBar(progressPercentage);
      }
  
      animateProgressBar(progressPercentage) {
        const targetPercent = progressPercentage * 100;
        const startPercent = currentPercent;
        const duration = 200;
        const startTime = performance.now();
  
        const ease = (t) => t * (2 - t); 
  
        const animate = (time) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = ease(progress);
  
          currentPercent = startPercent + (targetPercent - startPercent) * easedProgress;
          this.style.setProperty('--percent', `${currentPercent}%`);
  
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            currentPercent = targetPercent; 
            this.style.setProperty('--percent', `${currentPercent}%`);
          }
        };
  
        requestAnimationFrame(animate);
      }
    }
  
    customElements.define('free-shipping-progress-bar', FreeShippingProgressBar);
}