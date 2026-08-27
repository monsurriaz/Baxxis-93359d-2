if (!customElements.get('scrolling-content')) {
class ScrollingContent extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        const template = document.createElement('template');
        template.innerHTML = `
            <slot name="images"></slot>
            <slot name="contents"></slot>
        `;
        this.shadowRoot.appendChild(template.content.cloneNode(true));
    }

    connectedCallback() {
        this.contentBlocks = this.querySelectorAll('.scrolling-content__content-block') || [];
        this.images = this.querySelectorAll('.scrolling-content__image-item') || [];
    
        if (this.images.length === 0 || this.contentBlocks.length === 0) {
            console.warn('No content blocks or images found');
            return;
        }

        if (this.images.length > 0) {
            this.images[0].classList.add('visible');
        }
        if (this.contentBlocks.length > 0) {
            this.contentBlocks[0].classList.add('active');
        }

        const observerOptions = {
            root: null,
            rootMargin: '-70% 0% -70% 0%',
            threshold: 0
        };

        this.observer = new IntersectionObserver(
            this.handleIntersect.bind(this), 
            observerOptions
        );

        this.contentBlocks.forEach(block => {
            if (block.hasAttribute('data-index')) {
                this.observer.observe(block);
            }
        });
    }

    handleIntersect(entries) {
        entries.forEach(entry => {
            const index = entry.target.getAttribute('data-index');
            const correspondingImage = this.querySelector(`.scrolling-content__image-item[data-index="${index}"]`);

            if (entry.isIntersecting) {
                this.contentBlocks.forEach(block => block.classList.remove('active'));
                entry.target.classList.add('active');

                this.images.forEach(image => image.classList.remove('visible'));
                if (correspondingImage) {
                    correspondingImage.classList.add('visible');
                }
            }
        });
    }

    disconnectedCallback() {
        if (this.observer) {
            this.contentBlocks.forEach(block => {
                if (block.hasAttribute('data-index')) {
                    this.observer.unobserve(block);
                }
            });
            this.observer.disconnect(); 
        }
    }
}
customElements.define('scrolling-content', ScrollingContent);
}