class ScrollRevealSection extends HTMLElement {
    static get DEFAULT_CONFIG() {
        return {
            thresholdDown: 1.5,
            thresholdUp: 0.4,
            initialVisibleThreshold: 0.3
        };
    }

    constructor() {
        super();
        this.config = this.parseConfig();
        this.isVisible = false;
        this.lastScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        this.isIntersecting = false;
        this.scrollThreshold = 10; 
    }

    parseConfig() {
        return {
            thresholdDown: parseFloat(this.getAttribute('data-threshold-down') || ScrollRevealSection.DEFAULT_CONFIG.thresholdDown),
            thresholdUp: parseFloat(this.getAttribute('data-threshold-up') || ScrollRevealSection.DEFAULT_CONFIG.thresholdUp),
            initialVisibleThreshold: parseFloat(this.getAttribute('data-initial-threshold') || ScrollRevealSection.DEFAULT_CONFIG.initialVisibleThreshold),
            isTop: this.getAttribute('data-top') === 'true'
        };
    }

    connectedCallback() {
        this.initIntersectionObserver();
        window.addEventListener('scroll', () => this.handleScroll());
        this.handleScroll();
    }

    initIntersectionObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                this.isIntersecting = entry.isIntersecting;
            });
        }, {
            rootMargin: '0px',
            threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
        });

        observer.observe(this);
    }

    handleScroll() {
        const rect = this.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const isScrollingDown = scrollTop > this.lastScrollTop;
        const scrollDiff = Math.abs(scrollTop - this.lastScrollTop); 
        this.lastScrollTop = scrollTop;
        const distanceFromTop = windowHeight - rect.top;

       
        const isMobile = window.innerWidth < 768;

        if (scrollDiff < this.scrollThreshold) {
            return; 
        }

        if (this.config.isTop) {
            if (isScrollingDown && !this.isVisible && this.isIntersecting && distanceFromTop > rect.height * this.config.initialVisibleThreshold) {
                this.classList.add('is-visible');
                this.isVisible = true;
            } 
            
            else if (!isScrollingDown && isMobile && this.isVisible) {
                this.classList.remove('is-visible');
                this.isVisible = false;
            } 
            
            else if (!isScrollingDown && this.isVisible && (distanceFromTop < rect.height * this.config.thresholdUp || rect.bottom > windowHeight * this.config.thresholdUp)) {
                this.classList.remove('is-visible');
                this.isVisible = false;
            }
        } else {
            if (this.isIntersecting && distanceFromTop > rect.height * this.config.initialVisibleThreshold && distanceFromTop < windowHeight * this.config.thresholdDown) {
                this.classList.add('is-visible');
                this.isVisible = true;
            } 
            else if (!this.isIntersecting || distanceFromTop < rect.height * this.config.thresholdUp || distanceFromTop > windowHeight * this.config.thresholdDown) {
                this.classList.remove('is-visible');
                this.isVisible = false;
            }
        }
    }
}

customElements.define('scroll-reveal-section', ScrollRevealSection);
