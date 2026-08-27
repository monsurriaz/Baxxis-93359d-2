if (!customElements.get('smooth-scroll-nav')) {
  class SmoothScrollNav extends HTMLElement {
    connectedCallback() {
      this.addEventListeners();
      this.elementsToObserve = Array.from(this.querySelectorAll("a.scroll-anchor")).map((linkElement) => 
        document.querySelector(linkElement.getAttribute("href"))
      );
      this.navListItems = Array.from(this.querySelectorAll("li"));
      window.addEventListener("scroll", this.markVisibleSection.bind(this));
      window.addEventListener("resize", this.markVisibleSection.bind(this));
      this.markVisibleSection();
    }

    addEventListeners() {
      const links = this.querySelectorAll('a.scroll-anchor');
      links.forEach(link => {
        link.addEventListener('click', this.handleClick);
      });
    }

    handleClick(e) {
      e.preventDefault();
      const targetId = e.currentTarget.getAttribute('href').slice(1);
      const targetElement = document.getElementById(targetId);
      const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;

      if (targetElement) {
        const currentUrl = window.location.href.split('#')[0];
        history.pushState(null, '', currentUrl);
        const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    }

    markVisibleSection() {
      this.navListItems.forEach((item) => item.classList.remove("is-visible"));
      for (const [index, elementToObserve] of this.elementsToObserve.entries()) {
        const boundingClientRect = elementToObserve.getBoundingClientRect();
        if (boundingClientRect.top <= window.innerHeight && boundingClientRect.bottom >= 0) {
          this.querySelector(`a[href="#${elementToObserve.id}"]`).parentElement.classList.add("is-visible");
          break;
        }
      }
    }
  }

  customElements.define('smooth-scroll-nav', SmoothScrollNav);
}
