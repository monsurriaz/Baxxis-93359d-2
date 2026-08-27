
if (!customElements.get('custom-pagination')) {
  class CustomPagination extends HTMLElement {
    constructor() {
      super();
      this.sectionId = this.dataset.section;
      this.productList = document.querySelector(`ul[data-id="${this.sectionId}"]`);
      this.loadMoreButton = this.querySelector('.btn--load-more');
      this.paginationType = this.getAttribute('data-type');
      this.countItem = parseInt(this.productList.getAttribute('data-products-count'), 10);
      this.currentPage = 2;
      this.scrollObserver = null;
    }

    connectedCallback() {
      this.paginationType === 'load-more-button'
        ? this.setupLoadMoreButton()
        : this.paginationType === 'infinite-scroll'
        ? this.setupInfiniteScroll()
        : null;

      this.restoreScrollState();
      this.bindProductLinks();
    }

    bindProductLinks() {
      this.productList?.querySelectorAll('.grid__item a').forEach(link => {
        link.addEventListener('click', () => {
          sessionStorage.setItem('pagination-scrollY', window.scrollY);
          sessionStorage.setItem('pagination-currentPage', this.currentPage - 1); 
        });
      });
    }

    setupLoadMoreButton() {
      this.loadMoreButton?.addEventListener('click', () => this.loadNextPage());
    }

    setupInfiniteScroll() {
      this.scrollObserver = new IntersectionObserver(
        entries => entries[0].isIntersecting && this.loadNextPage(),
        { threshold: [0, 1] }
      );
      this.scrollObserver.observe(this);
    }

    buildUrlWithPageNumber(search = '', key = 'page') {
      const urlParams = new URLSearchParams(search);
      urlParams.set(key, this.currentPage);
      return `?${urlParams.toString()}`;
    }

    async loadNextPage() {
      if (this.hasAttribute('loading')) return;

      try {
        this.setAttribute('loading', true);
        this.toggleLoadingSpinner(true);

        const url = `${document.location.pathname}${this.buildUrlWithPageNumber(document.location.search)}`;
        const response = await fetch(url);
        const html = await response.text();

        this.renderFetchedProducts(html);
        this.currentPage++;
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        this.toggleLoadingSpinner(false);
        this.removeAttribute('loading');
      }
    }

    renderFetchedProducts(html) {
      const newProductGrid = new DOMParser()
        .parseFromString(html, 'text/html')
        .getElementById('product-grid');

      if (!newProductGrid?.children.length) {
        this.finalizePagination();
        return;
      }

      newProductGrid.querySelectorAll('.grid__item')
        .forEach(product => this.productList.appendChild(product));

      if (this.productList.children.length >= this.countItem) {
        this.finalizePagination();
      }


      this.bindProductLinks();
    }

    toggleLoadingSpinner(isLoading) {
      if (!this.loadMoreButton) return;

      const spinner = this.loadMoreButton.querySelector('.loading__spinner');
      this.loadMoreButton.classList.toggle('loading', isLoading);
      spinner?.classList.toggle('hidden', !isLoading);
    }

    finalizePagination() {
      this.scrollObserver?.unobserve(this);
      this.scrollObserver?.disconnect();
      this.loadMoreButton?.classList.add('visually-hidden');
    }

    disconnectedCallback() {
      this.scrollObserver?.disconnect();
      this.loadMoreButton?.removeEventListener('click', this.loadNextPage);
    }

    async restoreScrollState() {
      const savedPage = parseInt(sessionStorage.getItem('pagination-currentPage'), 10);
      const savedScrollY = parseInt(sessionStorage.getItem('pagination-scrollY'), 10);

      if (!isNaN(savedPage) && savedPage >= 2) {
        await this.loadPagesUpTo(savedPage);

        window.setTimeout(() => {
          window.scrollTo(0, savedScrollY);
        }, 100);
        sessionStorage.removeItem('pagination-currentPage');
        sessionStorage.removeItem('pagination-scrollY');
      }
    }

    async loadPagesUpTo(page) {
      while (this.currentPage <= page) {
        await this.loadNextPage();
      }
    }
  }

  customElements.define('custom-pagination', CustomPagination);
}