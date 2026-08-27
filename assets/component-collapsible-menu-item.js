
class CollapsibleMenuItem extends HTMLElement {
  constructor() {
    super();
    this.trigger = null;
    this.content = null;
  }

  connectedCallback() {
    this.trigger = this.querySelector('.collapsible-trigger');
    this.content = this.querySelector('.collapsible-content');

    if (!this.trigger || !this.content) return;

    this.content.style.overflow = 'hidden';
    this.content.style.transition = 'max-height 0.3s ease';

    if (this.classList.contains('open')) {
      this.content.style.display = 'block';
      this.content.style.maxHeight = this.content.scrollHeight + 'px';
      this.trigger.setAttribute('aria-expanded', 'true');
      this.content.setAttribute('aria-hidden', 'false');
    } else {
      this.content.style.display = 'none';
      this.content.style.maxHeight = '0';
      this.trigger.setAttribute('aria-expanded', 'false');
      this.content.setAttribute('aria-hidden', 'true');
    }

    this.trigger.addEventListener('click', () => this.toggle());
  }

  toggle() {
    const isOpen = this.classList.contains('open');

    if (isOpen) {
      this.classList.remove('open');
      this.trigger.setAttribute('aria-expanded', 'false');
      this.content.setAttribute('aria-hidden', 'true');

      this.content.style.maxHeight = this.content.scrollHeight + 'px';
      void this.content.offsetWidth;
      this.content.style.maxHeight = '0';

      this.content.addEventListener(
        'transitionend',
        () => {
          if (!this.classList.contains('open')) {
            this.content.style.display = 'none';
          }
        },
        { once: true }
      );
    } else {
      this.classList.add('open');
      this.trigger.setAttribute('aria-expanded', 'true');
      this.content.setAttribute('aria-hidden', 'false');

      this.content.style.display = 'block';
      const height = this.content.scrollHeight;
      this.content.style.maxHeight = '0';
      void this.content.offsetWidth;
      this.content.style.maxHeight = height + 'px';
    }
  }
}

customElements.define('collapsible-menu-item', CollapsibleMenuItem);

