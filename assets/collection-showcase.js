if (!customElements.get('collection-showcase')) {
class CollectionShowcase extends HTMLElement {
  connectedCallback() {
    const items = this.querySelectorAll('.collection-showcase-item');

    items.forEach(item => {
      const imgContainer = item.querySelector('.img-container');
      const img = imgContainer?.querySelector('img');

      if (!img || !imgContainer) return;

      item.addEventListener('mouseenter', () => {
        if (!img.complete) {
          img.onload = () => {
            imgContainer.style.width = img.offsetWidth + 'px';
          };
        } else {
          imgContainer.style.width = img.offsetWidth + 'px';
        }
      });

      item.addEventListener('mouseleave', () => {
        imgContainer.style.width = '0';
      });
    });
  }
}

  customElements.define('collection-showcase', CollectionShowcase);
}