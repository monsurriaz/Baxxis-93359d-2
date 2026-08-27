class AgeVerifierPopup extends ModalDialog {
  constructor() {
    super();
    this.sectionId = this.dataset.sectionId;
    this.showPopup();

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

    const noButton = this.querySelector('#age-no');
    const backButton = this.querySelector('#age-back');

    if (noButton) {
      noButton.addEventListener('click', this.handleNoClick.bind(this));
    }

    if (backButton) {
      backButton.addEventListener('click', this.handleBackClick.bind(this));
    }
  }

  showPopup() {
    const ageVerified = localStorage.getItem('ageVerified');
    if (!ageVerified || ageVerified === 'false') {
      this.show();
    }
  }

  hide() {
    super.hide();
    localStorage.setItem('ageVerified', 'true');
  }

  handleNoClick() {
    const denyContent = this.querySelector('.age-popup__deny');
    const popupContent = this.querySelector('.age-popup__content-box');

    if (popupContent && denyContent) {
      popupContent.style.display = 'none';
      denyContent.style.display = 'flex';
    }
  }

  handleBackClick() {
    const denyContent = this.querySelector('.age-popup__deny');
    const popupContent = this.querySelector('.age-popup__content-box');

    if (popupContent && denyContent) {
      popupContent.style.display = 'flex';
      denyContent.style.display = 'none';
    }
  }
}

customElements.define('age-verifier-popup', AgeVerifierPopup);
