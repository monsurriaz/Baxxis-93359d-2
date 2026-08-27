class CollectionListTabs extends HTMLElement {
  constructor() {
    super();
    this.handleResize = this.updateEvents.bind(this);
  }

  activateTab(item, triggeredByKeyboard = false) {
    const tabIndex = item.getAttribute('data-tab-index');
    const bgColor = item.getAttribute('data-bg-color');
    const textColor = item.getAttribute('data-text-color');

    if (bgColor && textColor) {
      this.style.setProperty('--bg-color', bgColor);
      this.style.setProperty('--text-color', textColor);
    }

    this.querySelectorAll('.collection-list-tabs-images__item').forEach(img => {
      img.classList.toggle('active-image', img.getAttribute('data-tab-index') === tabIndex);
    });

    const tabItems = this.querySelectorAll('.collection-list-tabs-text__item');
    tabItems.forEach(tab => {
      const isActive = tab === item;
      tab.classList.toggle('active-tab', isActive);
      //tab.setAttribute('tabindex', isActive ? '0' : '-1');
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    if (triggeredByKeyboard) {
      item.focus();
    }
  }

  handleKeydown(e) {
    const key = e.key;
  
    if (key === 'Enter' || key === ' ') {
      if (e.target.classList.contains('collection-list-tabs-text__item')) {
        e.preventDefault();
        this.activateTab(e.target, true);
      }
      return;
    }
  
    const tabItems = Array.from(this.querySelectorAll('.collection-list-tabs-text__item'));
    const currentIndex = tabItems.indexOf(document.activeElement);
    if (currentIndex === -1) return;
  
    let newIndex;
  
    if (key === 'ArrowLeft' || key === 'ArrowUp') {
      newIndex = (currentIndex - 1 + tabItems.length) % tabItems.length;
    } else if (key === 'ArrowRight' || key === 'ArrowDown') {
      newIndex = (currentIndex + 1) % tabItems.length;
    } else {
      return;
    }
  
    e.preventDefault();
    this.activateTab(tabItems[newIndex], true);
  }
  

  updateEvents() {
    const tabItems = this.querySelectorAll('.collection-list-tabs-text__item');
    const isDesktop = window.innerWidth >= 1024;

    tabItems.forEach(item => {
      item.removeEventListener('mouseenter', item._handleHover);
      item.removeEventListener('click', item._handleClick);
      item.removeEventListener('keydown', item._handleKeydown);
      item.removeAttribute('data-listener');
    });

    if (isDesktop) {
      tabItems.forEach(item => {
        if (!item.hasAttribute('data-listener')) {
          item._handleHover = () => this.activateTab(item);
          item.addEventListener('mouseenter', item._handleHover);
          item.setAttribute('data-listener', 'hover');
        }
      });
    } else {
      tabItems.forEach(item => {
        if (!item.hasAttribute('data-listener')) {
          item._handleClick = e => {
            if (e.target.closest('a')) return;
            e.preventDefault();
            this.activateTab(item);
          };
          item.addEventListener('click', item._handleClick);
          item.setAttribute('data-listener', 'click');
        }
      });
    }

    tabItems.forEach(item => {
      if (!item._handleKeydown) {
        item._handleKeydown = this.handleKeydown.bind(this);
        item.addEventListener('keydown', item._handleKeydown);
      }
    });
    
  }

  connectedCallback() {
    const tabItems = this.querySelectorAll('.collection-list-tabs-text__item');
    if (tabItems.length > 0) {
      this.activateTab(tabItems[0], false);
    }
    this.updateEvents();
    window.addEventListener('resize', this.handleResize);
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this.handleResize);
  }
}

customElements.define('collection-list-tabs', CollectionListTabs);
