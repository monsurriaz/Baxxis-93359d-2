class DetailsDisclosure extends HTMLElement {
  constructor() {
    super();
    this.mainDetailsToggle = this.querySelector('details');
    this.content = this.mainDetailsToggle.querySelector('summary').nextElementSibling;

    this.mainDetailsToggle.addEventListener('focusout', this.onFocusOut.bind(this));
    this.mainDetailsToggle.addEventListener('toggle', this.onToggle.bind(this));
  }

  onFocusOut() {
    setTimeout(() => {
      if (!this.contains(document.activeElement)) this.close();
    });
  }

  onToggle() {
    if (!this.animations) this.animations = this.content.getAnimations();

    if (this.mainDetailsToggle.hasAttribute('open')) {
      this.animations.forEach((animation) => animation.play());
    } else {
      this.animations.forEach((animation) => animation.cancel());
    }
  }

  close() {
    this.mainDetailsToggle.removeAttribute('open');
    this.mainDetailsToggle.querySelector('summary').setAttribute('aria-expanded', false);
  }
}

customElements.define('details-disclosure', DetailsDisclosure);

document.addEventListener('DOMContentLoaded', function() {
  var megaMenu = document.querySelectorAll('.mega-menu__content');
  megaMenu.forEach(function(menuItem) {
    var childLinks = menuItem.querySelectorAll('.menu__animation');
    
    childLinks.forEach(function(link, i) {
      var delay = (i + 1) / 10 * 1;
      var roundedDelay = Math.round(delay * 100) / 100;
      var css = `${roundedDelay}s`;
      link.style.setProperty('--animation-duration', css);
    });
  });
});

