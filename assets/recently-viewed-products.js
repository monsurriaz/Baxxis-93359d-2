if (!window.customElements.get("recently-viewed-products")) {
class RecentlyViewedProducts extends HTMLElement {
    constructor() {
        super();
        this.observer = new IntersectionObserver(this.onIntersect.bind(this), { threshold: 0.2 });
    }

    connectedCallback() {
        this.observer.observe(this);
    }

    async onIntersect(entries) {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                this.observer.unobserve(entry.target);
                const query = this.buildQuery();
                if (query) {
                    this.loadProducts(query);
                }
            }
        }
    }

    buildQuery() {
        const items = JSON.parse(localStorage.getItem("recently-viewed") || "[]");
        const excludeId = this.getAttribute("exclude-id");
        if (excludeId) {
            const index = items.indexOf(parseInt(excludeId));
            if (index !== -1) items.splice(index, 1);
        }
        return items.slice(0, this.productLimit).map(id => `id:${id}`).join(" OR ");
    }

    async loadProducts(query) {
        try {
            const response = await fetch(`${theme.routes.root_url}search?q=${query}&resources[limit]=10&resources[type]=product&section_id=${this.sectionId}`);
            const html = await response.text();
            const products = new DOMParser().parseFromString(html, 'text/html').querySelector("recently-viewed-products");
            if (products && products.hasChildNodes()) {
                this.innerHTML = products.innerHTML;
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    }

    get sectionId() {
        return this.getAttribute("section-id");
    }

    get productLimit() {
        return parseInt(this.getAttribute("products-limit")) || 4;
    }
}

window.customElements.define("recently-viewed-products", RecentlyViewedProducts);
}
