class NewsletterPopup extends ModalDialog {
  constructor() {
    super();
    this.delay = parseInt(this.dataset.delay) * 1000 || 2000;
    this.reopenDays = parseInt(this.dataset.reopen) || 1;
    this.sectionId = this.dataset.sectionId;

    this.modalOpener = document.querySelector('.newsletter-modal__opener');
    this.closeButton = this.modalOpener?.querySelector('.newsletter-modal__close');
    this.showPopupAfterDelay();
    this.initCloseButton();

    if (Shopify.designMode) {
      document.addEventListener('shopify:section:select', (event) => {
        if (event.detail.sectionId === this.sectionId) {
          this.show();
        }
      });
      document.addEventListener('shopify:section:deselect', (event) => {
        if (event.detail.sectionId === this.sectionId) {
          this.hide();
        }
      });
    }
  }

  showPopupAfterDelay() {
    const modalClosed = localStorage.getItem('newsletterPopupClosed');
    const openerClosed = localStorage.getItem('newsletterOpenerClosed');
    const currentTime = new Date().getTime();

    if (!modalClosed || currentTime > parseInt(modalClosed)) {
      setTimeout(() => {
        this.show();
      }, this.delay);
    }
    if (openerClosed && currentTime <= parseInt(openerClosed)) {
      this.hideModalOpener();
    }
  }

  hide() {
    super.hide();
    const expirationDate = new Date().getTime() + this.reopenDays * 24 * 60 * 60 * 1000;
    localStorage.setItem('newsletterPopupClosed', expirationDate);
  }
  initCloseButton() {
    if (this.closeButton) {
      this.closeButton.addEventListener('click', () => {
        this.hideModalOpener();
        const openerExpirationDate = new Date().getTime() + this.reopenDays * 24 * 60 * 60 * 1000;
        localStorage.setItem('newsletterOpenerClosed', openerExpirationDate);
      });
    }
  }
  hideModalOpener() {
    if (this.modalOpener) {
      this.modalOpener.style.display = 'none';
    }
  }
}

customElements.define('newsletter-popup', NewsletterPopup);
