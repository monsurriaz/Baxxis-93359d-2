if (typeof DeferredMedia === 'undefined') {
  console.error('Error: DeferredMedia class is not loaded. Ensure deferred-media.js is loaded before product-model.js.');
} else {
  if (!customElements.get('product-model')) {
    customElements.define(
      'product-model',
      class ProductModel extends DeferredMedia {
        constructor() {
          super();
        }

        async _initializeMedia(focus = true) {
          const baseLoaded = await super._initializeMedia(focus);
          if (!baseLoaded || this.mediaKind !== 'model') {
              return baseLoaded;
          }

          if (typeof Shopify === 'undefined' || typeof Shopify.loadFeatures !== 'function') {
              console.error('Shopify.loadFeatures does not exist. Cannot load Model Viewer UI.');
              return false;
          }

          return new Promise((resolve) => {
              Shopify.loadFeatures([
                {
                  name: 'model-viewer-ui',
                  version: '1.0',
                  onLoad: (errors) => {
                      this.setupModelViewerInterface(errors);
                      resolve(!errors);
                  },
                },
              ]);
          });
        }

        setupModelViewerInterface(errors) {
          if (errors) {
              console.error("Error loading Model Viewer UI:", errors);
              return;
          }

          const modelViewerElement = this.querySelector('model-viewer');
          if (!modelViewerElement) {
              console.error("Could not find model-viewer inside product-model.");
              return;
          }

          if (typeof Shopify === 'undefined' || typeof Shopify.ModelViewerUI !== 'function') {
               console.error('Shopify.ModelViewerUI does not exist.');
               return;
          }

          const modelViewerUi = new Shopify.ModelViewerUI(modelViewerElement);
          this.playerController = modelViewerUi;

          this._detachStateListeners();
          this._stateListeners = {
              play: () => this.setAttribute('playing', ''),
              pause: () => this.removeAttribute('playing')
          };

          modelViewerElement.addEventListener('shopify_model_viewer_ui_toggle_play', this._stateListeners.play);
          modelViewerElement.addEventListener('shopify_model_viewer_ui_toggle_pause', this._stateListeners.pause);

        }
      }
    );
  }

  window.ProductModelGlobalHandlers = {
    loadShopifyXR() {
      if (typeof Shopify === 'undefined' || typeof Shopify.loadFeatures !== 'function') {
          console.error('Shopify.loadFeatures does not exist. Cannot load Shopify XR.');
          return;
      }
      Shopify.loadFeatures([
        {
          name: 'shopify-xr',
          version: '1.0',
          onLoad: this.setupShopifyXR.bind(this),
        },
      ]);
    },

    setupShopifyXR(errors) {
      if (errors) {
          console.error("Error loading Shopify XR:", errors);
          return;
      }

      if (!window.ShopifyXR) {
        document.addEventListener('shopify_xr_initialized', () => this.setupShopifyXR());
        return;
      }

      document.querySelectorAll('[id^="ProductJSON-"]').forEach((modelJSON) => {
        try {
            window.ShopifyXR.addModels(JSON.parse(modelJSON.textContent));
            modelJSON.remove();
        } catch (e) {
            console.error("Error processing ProductJSON:", modelJSON, e);
        }
      });
      window.ShopifyXR.setupXRElements();
    },
  };

  window.addEventListener('DOMContentLoaded', () => {
    if (window.ProductModelGlobalHandlers) {
        window.ProductModelGlobalHandlers.loadShopifyXR();
    }
  });
}
