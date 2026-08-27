if (!customElements.get('product-info')) {
  customElements.define(
    'product-info',
    class ProductInfo extends HTMLElement {
      quantityInput = undefined;
      quantityForm = undefined;
      onVariantChangeUnsubscriber = undefined;
      cartUpdateUnsubscriber = undefined;
      abortController = undefined;
      pendingRequestUrl = null;
      preProcessHtmlCallbacks = [];
      postProcessHtmlCallbacks = [];

      constructor() {
        super();
        this.quantityInput = this.querySelector('.quantity__input');
      }

      connectedCallback() {
        this.initializeProductSwapUtility();

        // Subscribe to optionValueSelectionChange instead of variant change directly
        this.onVariantChangeUnsubscriber = subscribe(
          PUB_SUB_EVENTS.optionValueSelectionChange,
          this.handleOptionValueChange.bind(this)
        );

        this.initQuantityHandlers();
        this.dispatchEvent(new CustomEvent('product-info:loaded', { bubbles: true }));
      }

      addPreProcessCallback(callback) {
        this.preProcessHtmlCallbacks.push(callback);
      }

      initQuantityHandlers() {
        if (!this.quantityInput) return;

        this.quantityForm = this.querySelector('.product-form__quantity');
        if (!this.quantityForm) return;

        this.setQuantityBoundries();
        if (!this.dataset.originalSection) {
          this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, this.fetchQuantityRules.bind(this));
        }
      }

      disconnectedCallback() {
        this.onVariantChangeUnsubscriber();
        this.cartUpdateUnsubscriber?.();
      }

      initializeProductSwapUtility() {
        this.preProcessHtmlCallbacks.push((html) =>
          html.querySelectorAll('.scroll-trigger').forEach((element) => element.classList.add('scroll-trigger--cancel'))
        );
        this.postProcessHtmlCallbacks.push((newNode) => {
          window?.Shopify?.PaymentButton?.init();
          window?.ProductModel?.loadShopifyXR();
        });
      }

      // KEY: new handler using selectedOptionValues
      
      handleOptionValueChange({ data: { event, target, selectedOptionValues } }) {
        if (!this.contains(event.target)) return;

        this.resetProductFormState();
        
        if (target?.dataset?.featuredMediaId) {
          const featuredMediaId = target.dataset.featuredMediaId;
          if (featuredMediaId !== 'null' && featuredMediaId !== 'undefined') {
            this.updateCarouselInstant(featuredMediaId);
          }
        }

        const isColorInput = target.closest('.variant-picker__color'); 
        if (isColorInput) {
          const selectedValue = target.value;
          if (selectedValue) {
            this.updateCarouselGroupInstant(selectedValue);
          }
        }

        const productUrl = target.dataset.productUrl || this.pendingRequestUrl || this.dataset.url;
        this.pendingRequestUrl = productUrl;
        
        const shouldSwapProduct = this.dataset.url !== productUrl;
        const shouldFetchFullPage = this.dataset.updateUrl === 'true' && shouldSwapProduct;

        this.renderProductInfo({
          requestUrl: this.buildRequestUrlWithParams(productUrl, selectedOptionValues, shouldFetchFullPage),
          targetId: target.id,
          callback: shouldSwapProduct
            ? this.handleSwapProduct(productUrl, shouldFetchFullPage)
            : this.handleUpdateProductInfo(productUrl),
        });
      }

      resetProductFormState() {
        const productForm = this.productForm;
        productForm?.toggleSubmitButton(true);
        productForm?.handleErrorMessage();
      }

      handleSwapProduct(productUrl, updateFullPage) {
        return (html) => {
          this.productModal?.remove();

          const selector = updateFullPage ? "product-info[id^='MainProduct']" : 'product-info';
          const variant = this.getSelectedVariant(html.querySelector(selector));
          this.updateURL(productUrl, variant?.id);

          if (updateFullPage) {
            document.querySelector('head title').innerHTML = html.querySelector('head title').innerHTML;

            HTMLUpdateUtility.viewTransition(
              document.querySelector('main'),
              html.querySelector('main'),
              this.preProcessHtmlCallbacks,
              this.postProcessHtmlCallbacks
            );
          } else {
            HTMLUpdateUtility.viewTransition(
              this,
              html.querySelector('product-info'),
              this.preProcessHtmlCallbacks,
              this.postProcessHtmlCallbacks
            );
          }
        };
      }

      renderProductInfo({ requestUrl, targetId, callback }) {
        this.abortController?.abort();
        this.abortController = new AbortController();

        fetch(requestUrl, { signal: this.abortController.signal })
          .then((response) => response.text())
          .then((responseText) => {
            this.pendingRequestUrl = null;
            const html = new DOMParser().parseFromString(responseText, 'text/html');
            callback(html);
          })
          .then(() => {
            document.querySelector(`#${targetId}`)?.focus();
          })
          .catch((error) => {
            if (error.name === 'AbortError') {
              console.log('Fetch aborted by user');
            } else {
              console.error(error);
            }
          });
      }

      getSelectedVariant(productInfoNode) {
        const selectedVariant = productInfoNode.querySelector('variant-selects [data-selected-variant]')?.innerHTML;
        return !!selectedVariant ? JSON.parse(selectedVariant) : null;
      }

      // KEY: Build URL with option_values instead of variant ID
      buildRequestUrlWithParams(url, optionValues, shouldFetchFullPage = false) {
        const params = [];

        !shouldFetchFullPage && params.push(`section_id=${this.sectionId}`);

        if (optionValues.length) {
          params.push(`option_values=${optionValues.join(',')}`);
        }

        return `${url}?${params.join('&')}`;
      }

      updateOptionValues(html) {
        const variantSelects = html.querySelector('variant-selects');
        if (variantSelects) {
          HTMLUpdateUtility.viewTransition(this.variantSelectors, variantSelects, this.preProcessHtmlCallbacks);
        }
      }

      handleUpdateProductInfo(productUrl) {
        return (html) => {
          const variant = this.getSelectedVariant(html);

          if (this.pickupAvailability) {
            if (variant && variant.available) {
              this.pickupAvailability.fetchAvailability(variant.id);
            } else {
              this.pickupAvailability.removeAttribute('available');
              this.pickupAvailability.innerHTML = '';
            }
          }
          this.updateOptionValues(html);
          this.updateURL(productUrl, variant?.id);
          this.updateVariantInputs(variant?.id);

          if (!variant) {
            this.setUnavailable();

            this.updateStickyPrice(this.sectionId, html);
            this.updateStickyImage(this.sectionId, html);

            this.toggleStickyAddButton(true, window.variantStrings.unavailable);
            this.updateButtonPrice(null);
            publish(PUB_SUB_EVENTS.variantChange, {
              data: {
                sectionId: this.sectionId,
                html,
                variant: null,
              },
            });
            return;
          }


          const updateSourceFromDestination = (id, shouldHide = (source) => false) => {
            const source = html.getElementById(`${id}-${this.sectionId}`);
            const destination = this.querySelector(`#${id}-${this.dataset.section}`);
            if (source && destination) {
              destination.innerHTML = source.innerHTML;
              destination.classList.toggle('hidden', shouldHide(source));
            }
          };

          updateSourceFromDestination('price');
          updateSourceFromDestination('Sku', ({ classList }) => classList.contains('hidden'));
          updateSourceFromDestination('Inventory', ({ innerText }) => innerText === '');
          updateSourceFromDestination('Volume');
          updateSourceFromDestination('Price-Per-Item', ({ classList }) => classList.contains('hidden'));

          // update sticky elements (keep custom code)
          this.updateStickyPrice(this.sectionId, html);
          this.updateStickyImage(this.sectionId, html);

          this.updateQuantityRules(this.sectionId, html);
          this.querySelector(`#Quantity-Rules-${this.dataset.section}`)?.classList.remove('hidden');
          this.querySelector(`#Volume-Note-${this.dataset.section}`)?.classList.remove('hidden');

          this.productForm?.toggleSubmitButton(
            html.getElementById(`ProductSubmitButton-${this.sectionId}`)?.hasAttribute('disabled') ?? true,
            window.variantStrings.soldOut
          );

          // update sticky button (custom code)
          const stickyAddButtonUpdated = html.getElementById(`StickyProductSubmitButton-${this.sectionId}`);
          this.toggleStickyAddButton(
            stickyAddButtonUpdated ? stickyAddButtonUpdated.hasAttribute('disabled') : true,
            window.variantStrings.soldOut
          );

          // update button price (custom code)
          this.updateButtonPrice(variant);

          // update sold out state (custom code)
          this.updateSoldOutState(variant);

          // update carousel (custom code)
          this.updateCarousel(variant);

          publish(PUB_SUB_EVENTS.variantChange, {
            data: {
              sectionId: this.sectionId,
              html,
              variant,
            },
          });
        };
      }

      updateVariantInputs(variantId) {
        this.querySelectorAll(
          `#product-form-${this.dataset.section}, #product-form-installment-${this.dataset.section}`
        ).forEach((productForm) => {
          const input = productForm.querySelector('input[name="id"]');
          input.value = variantId ?? '';
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      updateURL(url, variantId) {
        this.querySelector('share-button')?.updateUrl(
          `${window.shopUrl}${url}${variantId ? `?variant=${variantId}` : ''}`
        );

        if (this.dataset.updateUrl === 'false') return;
        window.history.replaceState({}, '', `${url}${variantId ? `?variant=${variantId}` : ''}`);
      }

      setUnavailable() {
        this.productForm?.toggleSubmitButton(true, window.variantStrings.unavailable);

        const selectors = ['price', 'Inventory', 'Sku', 'Price-Per-Item', 'Volume-Note', 'Volume', 'Quantity-Rules']
          .map((id) => `#${id}-${this.dataset.section}`)
          .join(', ');
        document.querySelectorAll(selectors).forEach(({ classList }) => classList.add('hidden'));

        // update sticky elements
        const priceSticky = document.getElementById(`price-${this.dataset.section}-sticky`);
        if (priceSticky) priceSticky.classList.add('hidden');

        //this.toggleStickyAddButton(true, window.variantStrings.unavailable);
      }
      

      // === CUSTOM METHODS ===

      updateButtonPrice(variant) {
        const productForm = document.getElementById(`product-form-${this.dataset.section}`);
        if (!productForm) return;

        const addButton = productForm.querySelector('[name="add"]');
        if (!addButton) return;

        const buttonPriceEl = addButton.querySelector('.buttonPrice');
        if (!buttonPriceEl) return;

        if (variant) {
          buttonPriceEl.classList.remove('hidden');
          buttonPriceEl.textContent = `— ${formatMoney(
            variant.price,
            window.theme.settings.money_with_currency_format
          )}`;
        } else {
          buttonPriceEl.classList.add('hidden');
        }
      }

      toggleStickyAddButton(disable = true, text, modifyClass = true) {
        const stickyProductForm = document.getElementById(`sticky-atc-${this.dataset.section}`);
        if (!stickyProductForm) return;
        const stickyAddButton = stickyProductForm.querySelector('[name="add"]');
        const stickyAddButtonText = stickyAddButton?.querySelector('span');

        if (!stickyAddButton) return;

        if (disable) {
          stickyAddButton.setAttribute('disabled', 'disabled');
          if (text && stickyAddButtonText) stickyAddButtonText.textContent = text;
        } else {
          stickyAddButton.removeAttribute('disabled');
          if (stickyAddButtonText) {
            stickyAddButtonText.textContent = stickyAddButton.hasAttribute('data-preorder')
              ? window.variantStrings.preOrder
              : window.variantStrings.addToCart;
          }
        }
      }

      updateStickyPrice(sectionId, html) {
        const stickyPriceSourceId = `price-${sectionId}-sticky`;
      
        const source = html.getElementById(stickyPriceSourceId);
        const destination = document.getElementById(stickyPriceSourceId);
      
        if (source && destination) {
          destination.innerHTML = source.innerHTML;
          destination.classList.toggle('hidden', source.classList.contains('hidden'));
        }
      }
      

      updateStickyImage(sectionId, html) {
        const sourceImage = html.getElementById(`image-${sectionId}-sticky`);
        const destinationImage = document.getElementById(`image-${sectionId}-sticky`);

        if (sourceImage && destinationImage) {
          destinationImage.src = sourceImage.src;
          destinationImage.srcset = sourceImage.srcset;
          destinationImage.sizes = sourceImage.sizes;
        }
      }

      updateSoldOutState(variant) {
        const soldOutMessageElement = document.getElementById(`sold-out-message-${this.dataset.section}`);
        const soldOutVariantNameElement = document.querySelector(`#sold-out-variant-name-${this.dataset.section}`);
        const soldOutSelectElement = document.getElementById(`ContactFormSoldout-select-${this.dataset.section}`);

        if (variant && !variant.available) {
          if (soldOutMessageElement) {
            soldOutMessageElement.classList.remove('hidden');
          }
          if (soldOutVariantNameElement) {
            soldOutVariantNameElement.textContent = variant.title;
          }

          if (soldOutSelectElement) {
            const selectedVariantId = variant.id;
            const options = soldOutSelectElement.querySelectorAll('option');

            options.forEach((option) => {
              const optionId = option.getAttribute('option-id');
              if (optionId == selectedVariantId) {
                option.selected = true;
              }
            });
          }
        } else {
          if (soldOutMessageElement) {
            soldOutMessageElement.classList.add('hidden');
          }
          if (soldOutVariantNameElement) {
            soldOutVariantNameElement.textContent = '';
          }
        }
      }

      updateCarouselGroupInstant(groupName) {
        if (!groupName) return;

        const updateGroupForElement = (element) => {
          if (!element) return;
          
          const hasGrouping = element.dataset.mediaGrouping === 'true';
          const currentGroup = element.currentFilterGroup;
          
          if (hasGrouping && groupName !== currentGroup) {
            if (typeof element.filterSlides === 'function') {
              element.filterSlides(groupName, false);
            }
          }
        };

        const galleryCarousel = document.getElementById(`Gallery-carousel-${this.dataset.section}`);
        updateGroupForElement(galleryCarousel);
        
        const quickViewContainer = document.querySelector('.product-modal-content');
        if (quickViewContainer) {
          const galleryCarouselQuickView = quickViewContainer.querySelector(`#Gallery-carousel-${this.dataset.section}`);
          updateGroupForElement(galleryCarouselQuickView);
        }
      }
      updateCarouselInstant(mediaId) {
        if (typeof mediaId === 'string') {
          mediaId = parseInt(mediaId);
        }
        if (isNaN(mediaId)) return;
      
        const updateCarouselForElement = (element) => {
          if (!element || !element.updateCarouselImages) return;
          
          element.updateCarouselImages(mediaId);
        };
      
        const galleryCarousel = document.getElementById(`Gallery-carousel-${this.dataset.section}`);
        updateCarouselForElement(galleryCarousel);
        
        const quickViewContainer = document.querySelector('.product-modal-content');
        if (quickViewContainer) {
          const galleryCarouselQuickView = quickViewContainer.querySelector(`#Gallery-carousel-${this.dataset.section}`);
          updateCarouselForElement(galleryCarouselQuickView);
        }
      }

      
      updateCarousel(variantOrMediaId) {
        let mediaId;
        let group;
        
        if (typeof variantOrMediaId === 'number' || typeof variantOrMediaId === 'string') {
          mediaId = parseInt(variantOrMediaId);
          if (isNaN(mediaId)) return;
        } else if (variantOrMediaId?.featured_media?.id) {
          mediaId = variantOrMediaId.featured_media.id;
          group = variantOrMediaId.option1 || variantOrMediaId.options?.[0];
        } else {
          return;
        }
      
        const updateCarouselForElement = (element) => {
          if (!element) return;
          
          const hasGrouping = element.dataset.mediaGrouping === 'true';
          const currentGroup = element.currentFilterGroup;
          
          let needsFilter = false;
          if (hasGrouping && group && currentGroup !== group) {
            if (element.prebuiltStates && element.prebuiltStates.has(group)) {
              needsFilter = true;
            } else {
            }
          }
          
          if (needsFilter) {
            element.filterSlides(group, false);
            return;
          }
          
          if (element.updateCarouselImages) {
            element.updateCarouselImages(mediaId);
          }
        };
      
        const galleryCarousel = document.getElementById(`Gallery-carousel-${this.dataset.section}`);
        updateCarouselForElement(galleryCarousel);
        
        const quickViewContainer = document.querySelector('.product-modal-content');
        if (quickViewContainer) {
          const galleryCarouselQuickView = quickViewContainer.querySelector(`#Gallery-carousel-${this.dataset.section}`);
          updateCarouselForElement(galleryCarouselQuickView);
        }
      }
        
      setQuantityBoundries() {
        if (!this.quantityInput) return;
        
        const data = {
          cartQuantity: this.quantityInput.dataset.cartQuantity ? parseInt(this.quantityInput.dataset.cartQuantity) : 0,
          min: this.quantityInput.dataset.min ? parseInt(this.quantityInput.dataset.min) : 1,
          max: this.quantityInput.dataset.max ? parseInt(this.quantityInput.dataset.max) : null,
          step: this.quantityInput.step ? parseInt(this.quantityInput.step) : 1,
        };

        let min = data.min;
        const max = data.max === null ? data.max : data.max - data.cartQuantity;
        if (max !== null) min = Math.min(min, max);
        if (data.cartQuantity >= data.min) min = Math.min(min, data.step);

        this.quantityInput.min = min;

        if (max) {
          this.quantityInput.max = max;
        } else {
          this.quantityInput.removeAttribute('max');
        }
        this.quantityInput.value = min;

        publish(PUB_SUB_EVENTS.quantityUpdate, undefined);
      }

      fetchQuantityRules() {
        const currentVariantId = this.productForm?.variantIdInput?.value;
        if (!currentVariantId) return;

        this.querySelector('.quantity__rules-cart .loading__spinner')?.classList.remove('hidden');
        return fetch(`${this.dataset.url}?variant=${currentVariantId}&section_id=${this.dataset.section}`)
          .then((response) => response.text())
          .then((responseText) => {
            const html = new DOMParser().parseFromString(responseText, 'text/html');
            this.updateQuantityRules(this.dataset.section, html);
          })
          .catch((e) => console.error(e))
          .finally(() => this.querySelector('.quantity__rules-cart .loading__spinner')?.classList.add('hidden'));
      }

      updateQuantityRules(sectionId, html) {
        if (!this.quantityInput) return;
        this.setQuantityBoundries();

        const quantityFormUpdated = html.getElementById(`Quantity-Form-${sectionId}`);
        const selectors = ['.quantity__input', '.quantity__rules', '.quantity__label'];
        for (let selector of selectors) {
          const current = this.quantityForm.querySelector(selector);
          const updated = quantityFormUpdated?.querySelector(selector);
          if (!current || !updated) continue;
          if (selector === '.quantity__input') {
            const attributes = ['data-cart-quantity', 'data-min', 'data-max', 'step'];
            for (let attribute of attributes) {
              const valueUpdated = updated.getAttribute(attribute);
              if (valueUpdated !== null) {
                current.setAttribute(attribute, valueUpdated);
              } else {
                current.removeAttribute(attribute);
              }
            }
          } else {
            current.innerHTML = updated.innerHTML;
            if (selector === '.quantity__label') {
              const updatedAriaLabelledBy = updated.getAttribute('aria-labelledby');
              if (updatedAriaLabelledBy) {
                current.setAttribute('aria-labelledby', updatedAriaLabelledBy);
                const labelId = updatedAriaLabelledBy;
                const currentHiddenLabel = document.getElementById(labelId);
                const updatedHiddenLabel = html.getElementById(labelId);
                if (currentHiddenLabel && updatedHiddenLabel) {
                  currentHiddenLabel.textContent = updatedHiddenLabel.textContent;
                }
              }
            }
          }
        }
      }

      get productForm() {
        return this.querySelector(`product-form`);
      }

      get productModal() {
        return document.querySelector(`#ProductModal-${this.dataset.section}`);
      }

      get pickupAvailability() {
        return this.querySelector(`pickup-availability`);
      }

      get variantSelectors() {
        return this.querySelector('variant-selects');
      }

      get relatedProducts() {
        const relatedProductsSectionId = SectionId.getIdForSection(
          SectionId.parseId(this.sectionId),
          'related-products'
        );
        return document.querySelector(`product-recommendations[data-section-id^="${relatedProductsSectionId}"]`);
      }

      get quickOrderList() {
        const quickOrderListSectionId = SectionId.getIdForSection(
          SectionId.parseId(this.sectionId),
          'quick_order_list'
        );
        return document.querySelector(`quick-order-list[data-id^="${quickOrderListSectionId}"]`);
      }

      get sectionId() {
        return this.dataset.originalSection || this.dataset.section;
      }
    }
  );
}