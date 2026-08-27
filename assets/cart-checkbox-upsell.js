class CartCheckboxUpsell {
  constructor(cartItemsInstance) {
    this.cartItemsInstance = cartItemsInstance;
    this.variantId = this.getVariantId();
    this.isProgrammaticChange = false;
    this.isProcessing = false;
    
    this.init();
  }

  init() {
    this.initEvents();
    this.initObserver();
    this.updateCheckboxState();
  }

  initEvents() {
    document.body.addEventListener('change', (e) => {
      if (e.target.id === 'cart-upsell-checkbox') {
        if (this.isProgrammaticChange) {
          this.isProgrammaticChange = false;
          return;
        }
        
        if (this.isProcessing) {
          e.target.checked = !e.target.checked;
          return;
        }
        
        this.variantId = e.target.getAttribute('data-variant-id');
        
        if (e.target.checked) {
          this.addToCart();
        } else {
          this.removeFromCart();
        }
      }
    });

    document.addEventListener('cartUpdated', () => {
      setTimeout(() => this.updateCheckboxState(), 500);
    });
  }

  initObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const checkbox = node.id === 'cart-upsell-checkbox' ? node : node.querySelector?.('#cart-upsell-checkbox');
            
            if (checkbox) {
              this.isProgrammaticChange = false;
              this.variantId = checkbox.getAttribute('data-variant-id');
              setTimeout(() => this.updateCheckboxState(), 200);
            }
          }
        });
      });
    });

    const target = document.querySelector('cart-drawer') 
                || document.querySelector('cart-items') 
                || document.querySelector('#main-cart-items')
                || document.body;
    
    observer.observe(target, { childList: true, subtree: true });
  }

  getVariantId() {
    const checkbox = document.querySelector('#cart-upsell-checkbox');
    return checkbox?.getAttribute('data-variant-id');
  }

  /*updateCheckboxState() {
    const currentVariantId = this.getVariantId();
    if (currentVariantId) {
      this.variantId = currentVariantId;
    }
    
    if (!this.variantId) return;

    fetch('/cart.js')
      .then(r => r.json())
      .then(cart => {
        const hasUpsell = cart.items.some(item => item.variant_id.toString() === this.variantId);
        const checkbox = document.querySelector('#cart-upsell-checkbox');
        
        if (checkbox && checkbox.checked !== hasUpsell) {
          this.isProgrammaticChange = true;
          checkbox.checked = hasUpsell;
          
          setTimeout(() => {
            this.isProgrammaticChange = false;
          }, 50);
        }
      })
      .catch(err => console.error('Error fetching cart:', err));
  }*/
      updateCheckboxState() {
        // skip sync when processing
        if (this.isProcessing) {
          return;
        }
        
        const currentVariantId = this.getVariantId();
        if (currentVariantId) {
          this.variantId = currentVariantId;
        }
        
        if (!this.variantId) return;
      
        fetch('/cart.js')
          .then(r => r.json())
          .then(cart => {
            const hasUpsell = cart.items.some(item => item.variant_id.toString() === this.variantId);
            const checkbox = document.querySelector('#cart-upsell-checkbox');
            
            if (checkbox && checkbox.checked !== hasUpsell) {
              this.isProgrammaticChange = true;
              checkbox.checked = hasUpsell;
              
              setTimeout(() => {
                this.isProgrammaticChange = false;
              }, 50);
            }
          })
          .catch(err => console.error('Error fetching cart:', err));
      }

  addToCart() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    const formData = new FormData();
    formData.append('id', this.variantId);
    formData.append('quantity', 1);

    fetch('/cart/add.js', {
      method: 'POST',
      body: formData
    })
    .then(r => r.json())
    .then(() => {
      if (this.cartItemsInstance && typeof this.cartItemsInstance.onCartUpdate === 'function') {
        this.cartItemsInstance.onCartUpdate();
      }
      
      this.updateSections();
    })
    .catch(err => {
      console.error('Error adding to cart:', err);
      this.isProgrammaticChange = true;
      const checkbox = document.querySelector('#cart-upsell-checkbox');
      if (checkbox) checkbox.checked = false;
    })
    .finally(() => {
      setTimeout(() => {
        this.isProcessing = false;
      }, 500);
    });
  }

  removeFromCart() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    fetch('/cart.js')
      .then(r => r.json())
      .then(cart => {
        const lineItemIndex = cart.items.findIndex(item => item.variant_id.toString() === this.variantId);
        
        if (lineItemIndex === -1) {
          console.error('Upsell product not found in cart');
          this.isProcessing = false;
          return;
        }
        
        const line = lineItemIndex + 1;
        
        if (this.cartItemsInstance && typeof this.cartItemsInstance.updateQuantity === 'function') {
          this.cartItemsInstance.updateQuantity(line, 0, document.querySelector(`[data-index="${line}"]`));
          
          setTimeout(() => {
            this.isProcessing = false;
          }, 1000);
        } else {
          return fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ line, quantity: 0 })
          })
          .then(r => r.json())
          .then(() => {
            this.updateSections();
          })
          .finally(() => {
            setTimeout(() => {
              this.isProcessing = false;
            }, 1000);
          });
        }
      })
      .catch(err => {
        console.error('Error removing from cart:', err);
        this.isProgrammaticChange = true;
        const checkbox = document.querySelector('#cart-upsell-checkbox');
        if (checkbox) checkbox.checked = true;
        
        this.isProcessing = false;
      });
  }

  updateSections() {
    this.getSections().forEach(section => {
      fetch(`${routes.cart_url}?section_id=${section.section}`)
        .then(r => r.text())
        .then(html => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          this.renderSection(section, doc, html);
        })
        .catch(err => console.error(`Error updating ${section.id}:`, err));
    });
  }

  renderSection(section, doc, html) {
    if (section.id === 'main-cart-items') {
      const newContents = doc.querySelectorAll('.js-contents');
      const currentContents = document.querySelectorAll('.js-contents');
      
      newContents.forEach((newContent, i) => {
        const current = currentContents[i];
        if (current && newContent) {
          current.innerHTML = newContent.innerHTML;
        }
      });
    } else if (section.id === 'cart-icon-bubble') {
      const container = document.querySelector(section.selector);
      if (container) {
        container.innerHTML = html;
      }
    } else {
      const newEl = doc.querySelector(section.selector);
      const currentEl = document.querySelector(section.selector);
      if (currentEl && newEl) {
        currentEl.innerHTML = newEl.innerHTML;
      }
    }
  }

  getSections() {
    const mainCartItems = document.getElementById('main-cart-items');
    const cartSections = ['main-cart-items', 'main-cart-shipping', 'main-cart-discount', 'main-cart-total']
      .filter(() => mainCartItems)
      .map(id => ({
        id,
        section: mainCartItems.dataset.id,
        selector: id === 'main-cart-items' ? '.js-contents' : `#${id}`
      }));

    return [...cartSections, { id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '#cart-icon-bubble' }];
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const cartInstance = document.querySelector('cart-drawer-items') || document.querySelector('cart-items');
  
  if (cartInstance) {
    window.cartUpsellInstance = new CartCheckboxUpsell(cartInstance);
    
    if (typeof cartInstance.updateQuantity === 'function') {
      const originalUpdate = cartInstance.updateQuantity.bind(cartInstance);
      
      cartInstance.updateQuantity = function(...args) {
        const result = originalUpdate(...args);
        
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('cartUpdated'));
        }, 300);
        
        return result;
      };
    }
  }
});
