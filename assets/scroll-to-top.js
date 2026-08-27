if (!customElements.get('scroll-to-top')) {
class ScrollToTop extends HTMLElement {
  constructor() {
    super();
    this.handleScroll = this.handleScroll.bind(this);
  }
  
  connectedCallback() {
    window.addEventListener('scroll', this.handleScroll);
    this.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    this.handleScroll();
  }
  
  disconnectedCallback() {
    window.removeEventListener('scroll', this.handleScroll);
  }
  
  handleScroll() {
    this.classList.toggle('is-visible', window.scrollY > window.innerHeight);
  }
}

customElements.define('scroll-to-top', ScrollToTop);
}
