
class FacetFiltersForm extends HTMLElement {
  constructor() {
    super();
    this.onActiveFilterClick = this.onActiveFilterClick.bind(this);

    this.debouncedOnSubmit = debounce((event) => {
      this.onSubmitHandler(event);
    }, 500);

    const facetForm = this.querySelector('form');
    facetForm.addEventListener('input', this.debouncedOnSubmit.bind(this));

    const facetWrapper = this.querySelector('#FacetsWrapperDesktop');
    if (facetWrapper) facetWrapper.addEventListener('keyup', onKeyUpEscape);
    viewMode();
  }

  static setListeners() {
    const onHistoryChange = (event) => {
      const searchParams = event.state ? event.state.searchParams : FacetFiltersForm.searchParamsInitial;
      if (searchParams === FacetFiltersForm.searchParamsPrev) return;
      FacetFiltersForm.renderPage(searchParams, null, false);
    };
    window.addEventListener('popstate', onHistoryChange);
  }

  static toggleActiveFacets(disable = true) {
    document.querySelectorAll('.js-facet-remove').forEach((element) => {
      element.classList.toggle('disabled', disable);
    });
  }

  static renderPage(searchParams, event, updateURLHash = true) {
    FacetFiltersForm.searchParamsPrev = searchParams;
    const sections = FacetFiltersForm.getSections();
    const countContainer = document.getElementById('ProductCount');
    const countContainerDesktop = document.getElementById('ProductCountDesktop');
    const countContainerMobile = document.getElementById('ProductCountMobile');
    const loadingSpinners = document.querySelectorAll(
      '.facets-container .loading__spinner, facet-filters-form .loading__spinner'
    );
    loadingSpinners.forEach((spinner) => spinner.classList.remove('hidden'));
    document.getElementById('ProductGridContainer').querySelector('.collection').classList.add('loading');
    if (countContainer) {
      countContainer.classList.add('loading');
    }
    if (countContainerDesktop) {
      countContainerDesktop.classList.add('loading');
    }
    if (countContainerMobile) {
      countContainerMobile.classList.add('loading');
    }

    sections.forEach((section) => {
      const url = `${window.location.pathname}?section_id=${section.section}&${searchParams}`;
      const filterDataUrl = (element) => element.url === url;

      FacetFiltersForm.filterData.some(filterDataUrl)
        ? FacetFiltersForm.renderSectionFromCache(filterDataUrl, event)
        : FacetFiltersForm.renderSectionFromFetch(url, event);
    });

    if (updateURLHash) FacetFiltersForm.updateURLHash(searchParams);
    
  }

  static renderSectionFromFetch(url, event) {
    fetch(url)
      .then((response) => response.text())
      .then((responseText) => {
        const html = responseText;
        FacetFiltersForm.filterData = [...FacetFiltersForm.filterData, { html, url }];
        FacetFiltersForm.renderFilters(html, event);
        FacetFiltersForm.renderProductGridContainer(html);
        FacetFiltersForm.renderProductCount(html);
        if (typeof initializeScrollAnimationTrigger === 'function') initializeScrollAnimationTrigger(html.innerHTML);
      });
  }

  static renderSectionFromCache(filterDataUrl, event) {
    const html = FacetFiltersForm.filterData.find(filterDataUrl).html;
    FacetFiltersForm.renderFilters(html, event);
    FacetFiltersForm.renderProductGridContainer(html);
    FacetFiltersForm.renderProductCount(html);
    if (typeof initializeScrollAnimationTrigger === 'function') initializeScrollAnimationTrigger(html.innerHTML);
  }

  static renderProductGridContainer(html) {
    document.getElementById('ProductGridContainer').innerHTML = new DOMParser()
      .parseFromString(html, 'text/html')
      .getElementById('ProductGridContainer').innerHTML;

      let container = document.getElementById('ProductGridContainer');
      let headerHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10);
      let posTop = container.offsetTop - headerHeight - 50;
      window.scrollTo({ top: posTop, behavior: "smooth" });
      
    viewMode();
  }

  static renderProductCount(html) {
    const parser = new DOMParser();
    const parsedHtml = parser.parseFromString(html, 'text/html');

    const productCountElement = parsedHtml.getElementById('ProductCount');
    const productCountDesktopElement = parsedHtml.getElementById('ProductCountDesktop');
    const productCountMobileElement = parsedHtml.getElementById('ProductCountMobile');
    const productCountActiveElement = parsedHtml.getElementById('ProductCountActive');
    const countNewActive = productCountActiveElement ? productCountActiveElement.innerHTML : '0';
    

    const updateContainer = (containerId, count) => {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = count;
            container.classList.remove('loading');
        }
    };

    if (productCountElement) {
        updateContainer('ProductCount', productCountElement.innerHTML);
    }
    if (productCountDesktopElement) {
        updateContainer('ProductCountDesktop', productCountDesktopElement.innerHTML);
    }
    if (productCountMobileElement) {
        updateContainer('ProductCountMobile', productCountMobileElement.innerHTML);
    }

    const countActive = document.getElementById('ProductCountActive');
    if (countActive) {
        countActive.innerHTML = countNewActive;
    }

    const loadingSpinners = document.querySelectorAll(
        '.facets-container .loading__spinner, facet-filters-form .loading__spinner'
    );
    loadingSpinners.forEach(spinner => spinner.classList.add('hidden'));
  }


  static renderFilters(html, event) {
    const parsedHTML = new DOMParser().parseFromString(html, 'text/html');
    const facetDetailsElementsFromFetch = parsedHTML.querySelectorAll(
      '#FacetFiltersForm .js-filter, #FacetFiltersFormMobile .js-filter, #FacetFiltersPillsForm .js-filter'
    );
    const facetDetailsElementsFromDom = document.querySelectorAll(
      '#FacetFiltersForm .js-filter, #FacetFiltersFormMobile .js-filter, #FacetFiltersPillsForm .js-filter'
    );

    // Remove facets that are no longer returned from the server
    Array.from(facetDetailsElementsFromDom).forEach((currentElement) => {
      if (!Array.from(facetDetailsElementsFromFetch).some(({ id }) => currentElement.id === id)) {
        currentElement.remove();
      }
    });

    const matchesId = (element) => {
      const jsFilter = event ? event.target.closest('.js-filter') : undefined;
      return jsFilter ? element.id === jsFilter.id : false;
    };

    const facetsToRender = Array.from(facetDetailsElementsFromFetch).filter((element) => !matchesId(element));
    const countsToRender = Array.from(facetDetailsElementsFromFetch).find(matchesId);

    facetsToRender.forEach((elementToRender, index) => {
      const currentElement = document.getElementById(elementToRender.id);
      // Element already rendered in the DOM so just update the innerHTML
      if (currentElement) {
        document.getElementById(elementToRender.id).innerHTML = elementToRender.innerHTML;
      } else {
        if (index > 0) {
          const { className: previousElementClassName, id: previousElementId } = facetsToRender[index - 1];
          console.log(previousElementClassName, previousElementId);
          // Same facet type (eg horizontal/vertical or drawer/mobile)
          if (elementToRender.className === previousElementClassName) {
            document.getElementById(previousElementId).after(elementToRender);
            return;
          }
        }

        if (elementToRender.parentElement) {
          document.querySelector(`#${elementToRender.parentElement.id} .js-filter`).before(elementToRender);
        }
      }
    });

    FacetFiltersForm.renderActiveFacets(parsedHTML);
    FacetFiltersForm.renderAdditionalElements(parsedHTML);

    if (countsToRender) {
      const closestJSFilterID = event.target.closest('.js-filter').id;

      if (closestJSFilterID) {
        FacetFiltersForm.renderCounts(countsToRender, event.target.closest('.js-filter'));
        FacetFiltersForm.renderMobileCounts(countsToRender, document.getElementById(closestJSFilterID));

        const newFacetDetailsElement = document.getElementById(closestJSFilterID);
        const newElementSelector = newFacetDetailsElement.classList.contains('mobile-facets__details')
          ? `.mobile-facets__close-button`
          : `.facets__summary`;
        const newElementToActivate = newFacetDetailsElement.querySelector(newElementSelector);

        const isTextInput = event.target.getAttribute('type') === 'text';

        if (newElementToActivate && !isTextInput) newElementToActivate.focus();
      }
    }
    reinitializeCustomElements();
    viewMode();
  }

  static renderActiveFacets(html) {
    const activeFacetElementSelectors = ['.active-facets-mobile', '.active-facets-desktop'];

    activeFacetElementSelectors.forEach((selector) => {
      const activeFacetsElement = html.querySelector(selector);
      if (!activeFacetsElement) return;
      document.querySelector(selector).innerHTML = activeFacetsElement.innerHTML;
    });

    FacetFiltersForm.toggleActiveFacets(false);
  }

  static renderAdditionalElements(html) {
    const mobileElementSelectors = ['.mobile-facets__open', '.mobile-facets__count', '.sorting'];

    mobileElementSelectors.forEach((selector) => {
      if (!html.querySelector(selector)) return;
      document.querySelector(selector).innerHTML = html.querySelector(selector).innerHTML;
    });

    //document.getElementById('FacetFiltersFormMobile').closest('menu-drawer').bindEvents();
  }

  static renderCounts(source, target) {
    const targetSummary = target.querySelector('.facets__summary');
    const sourceSummary = source.querySelector('.facets__summary');

    if (sourceSummary && targetSummary) {
      targetSummary.outerHTML = sourceSummary.outerHTML;
    }

    const targetHeaderElement = target.querySelector('.facets__header');
    const sourceHeaderElement = source.querySelector('.facets__header');

    if (sourceHeaderElement && targetHeaderElement) {
      targetHeaderElement.outerHTML = sourceHeaderElement.outerHTML;
    }

    const targetWrapElement = target.querySelector('.facets-wrap');
    const sourceWrapElement = source.querySelector('.facets-wrap');

    if (sourceWrapElement && targetWrapElement) {
      const isShowingMore = Boolean(target.querySelector('show-more-button .label-show-more.hidden'));
      if (isShowingMore) {
        sourceWrapElement
          .querySelectorAll('.facets__item.hidden')
          .forEach((hiddenItem) => hiddenItem.classList.replace('hidden', 'show-more-item'));
      }

      targetWrapElement.outerHTML = sourceWrapElement.outerHTML;
    }
  }

  static renderMobileCounts(source, target) {
    const targetFacetsList = target.querySelector('.mobile-facets__list');
    const sourceFacetsList = source.querySelector('.mobile-facets__list');

    if (sourceFacetsList && targetFacetsList) {
      targetFacetsList.outerHTML = sourceFacetsList.outerHTML;
    }
  }

  static updateURLHash(searchParams) {
    history.pushState({ searchParams }, '', `${window.location.pathname}${searchParams && '?'.concat(searchParams)}`);
  }

  static getSections() {
    return [
      {
        section: document.getElementById('product-grid').dataset.id,
      },
    ];
  }

  createSearchParams(form) {
    const formData = new FormData(form);
    return new URLSearchParams(formData).toString();
  }

  onSubmitForm(searchParams, event) {
    FacetFiltersForm.renderPage(searchParams, event);
  }

  onSubmitHandler(event) {
    event.preventDefault();
    const sortFilterForms = document.querySelectorAll('facet-filters-form form');


    const searchParams = this.createFilteredSearchParams(event.target.closest('form'));


    if (event.srcElement.className === 'mobile-facets__checkbox') {
        this.onSubmitForm(searchParams.toString(), event);
    } else {
        const forms = [];
        const isMobile = event.target.closest('form').id === 'FacetFiltersFormMobile';
        sortFilterForms.forEach((form) => {
            if (!isMobile) {
                if (form.id === 'FacetSortForm' || form.id === 'FacetFiltersForm' || form.id === 'FacetSortDrawerForm') {
                    forms.push(this.createFilteredSearchParams(form).toString());
                }
            } else if (form.id === 'FacetFiltersFormMobile') {
                forms.push(this.createFilteredSearchParams(form).toString());
            }
        });
        this.onSubmitForm(forms.join('&'), event);
    }
  }


  createFilteredSearchParams(form) {
    const formData = new FormData(form);
    const searchParams = new URLSearchParams(formData);


    if (searchParams.has("filter.v.price.gte") && searchParams.get("filter.v.price.gte") === "0") {
        searchParams.delete("filter.v.price.gte");
    }

    const priceSlider = document.querySelector(".price-slider-range");
    if (priceSlider) {
        const maxPrice = parseFloat(priceSlider.dataset.max);
        
        if (searchParams.has("filter.v.price.lte") && searchParams.get("filter.v.price.lte") === maxPrice.toString()) {
            searchParams.delete("filter.v.price.lte");
        }
    }

    return searchParams; 
  }


  onActiveFilterClick(event) {
    event.preventDefault();
    FacetFiltersForm.toggleActiveFacets();
    const url =
      event.currentTarget.href.indexOf('?') == -1
        ? ''
        : event.currentTarget.href.slice(event.currentTarget.href.indexOf('?') + 1);
    FacetFiltersForm.renderPage(url);
  }
}

FacetFiltersForm.filterData = [];
FacetFiltersForm.searchParamsInitial = window.location.search.slice(1);
FacetFiltersForm.searchParamsPrev = window.location.search.slice(1);
customElements.define('facet-filters-form', FacetFiltersForm);
FacetFiltersForm.setListeners();

class PriceRange extends HTMLElement {
  constructor() {
    super();
    this.querySelectorAll('input').forEach((element) => {
      element.addEventListener('change', this.onRangeChange.bind(this));
      element.addEventListener('keydown', this.onKeyDown.bind(this));
    });
    this.setMinAndMaxValues();
    this.priceSlider();
  }
  connectedCallback(){
    this.priceSlider();
  }

  onRangeChange(event) {
    this.adjustToValidValues(event.currentTarget);
    this.setMinAndMaxValues();
  }

  onKeyDown(event) {
    if (event.metaKey) return;

    const pattern = /[0-9]|\.|,|'| |Tab|Backspace|Enter|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Delete|Escape/;
    if (!event.key.match(pattern)) event.preventDefault();
  }

  setMinAndMaxValues() {
    const inputs = this.querySelectorAll('input');
    const minInput = inputs[0];
    const maxInput = inputs[1];
    if (maxInput.value) minInput.setAttribute('data-max', maxInput.value);
    if (minInput.value) maxInput.setAttribute('data-min', minInput.value);
    if (minInput.value === '') maxInput.setAttribute('data-min', 0);
    if (maxInput.value === '') minInput.setAttribute('data-max', maxInput.getAttribute('data-max'));
  }

  adjustToValidValues(input) {
    const value = Number(input.value);
    const min = Number(input.getAttribute('data-min'));
    const max = Number(input.getAttribute('data-max'));

    if (value < min) input.value = min;
    if (value > max) input.value = max;
  }


  priceSlider() {
      const sliderRange = this.querySelector(".price-slider-range");
      if (!sliderRange) return;

      const [minInput, maxInput] = this.querySelectorAll('input');
      const form = this.closest('facet-filters-form') || document.querySelector('facet-filters-form');
      const event = new CustomEvent('input');

      const minValue = parseFloat(minInput.value.replace(',', '')) || 0;
      const maxValue = parseFloat(maxInput.value.replace(',', '')) || parseFloat(sliderRange.dataset.max);

      if (sliderRange.noUiSlider) {
          sliderRange.noUiSlider.destroy();
      }
      const direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';

      noUiSlider.create(sliderRange, {
          start: [minValue, maxValue],
          direction: direction,
          connect: true,
          step: 10,
          handleAttributes: [
            { 'aria-label': 'lower' },
            { 'aria-label': 'upper' },
          ],
          range: {
              'min': 0,
              'max': parseFloat(sliderRange.dataset.max)
          }
      });
      
      sliderRange.noUiSlider.on('update', (values) => {
          minInput.value = Math.round(parseFloat(values[0]));
          maxInput.value = Math.round(parseFloat(values[1]));
      });
      let debounceTimer;

      sliderRange.noUiSlider.on('set', (values) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          minInput.value = Math.round(parseFloat(values[0]));
          maxInput.value = Math.round(parseFloat(values[1]));
          form.querySelector('form')?.dispatchEvent(event);
        }, 100);
      });

  }
  
}

customElements.define('price-range', PriceRange);


class FacetRemove extends HTMLElement {
  constructor() {
    super();
    const facetLink = this.querySelector('a');
    facetLink.setAttribute('role', 'button');
    facetLink.addEventListener('click', this.closeFilter.bind(this));
    facetLink.addEventListener('keyup', (event) => {
      event.preventDefault();
      if (event.code.toUpperCase() === 'SPACE') this.closeFilter(event);
    });
  }

  closeFilter(event) {
    event.preventDefault();
    const form = this.closest('facet-filters-form') || document.querySelector('facet-filters-form');
    form.onActiveFilterClick(event);
  }
}

customElements.define('facet-remove', FacetRemove);


function reinitializeCustomElements() {
  const container = document.querySelector('.section-collection-products-grid, .template-search');
  if (!container) return;

  container.querySelectorAll('collapsible-details').forEach((element) => {
    const isOpen = element.querySelector('details')?.open;
    
    const newElement = element.cloneNode(true);
    element.replaceWith(newElement);

    requestAnimationFrame(() => {
      if (typeof newElement.connectedCallback === 'function') {
        newElement.connectedCallback();
      }

      const newDetails = newElement.querySelector('details');
      if (isOpen) {
        newDetails.open = true;
      }
    });
  });
}


function viewMode() {
  class ViewModeController {
    constructor(gridId, desktopBtnSelector, mobileBtnSelector) {
      this.gridId = gridId;
      this.desktopBtnSelector = desktopBtnSelector;
      this.mobileBtnSelector = mobileBtnSelector;
      
      this.grid = document.getElementById(gridId);
      this.desktopButtons = document.querySelectorAll(desktopBtnSelector);
      this.mobileButtons = document.querySelectorAll(mobileBtnSelector);
      
      this.isCustomizer = window.Shopify?.designMode;
      this.tempStorage = { desktop: null, mobile: null };
      
      this.config = {
        desktop: { 
          key: 'productDesktopViewCols', 
          regex: /^lg:grid-cols-\d+$/, 
          prefix: 'lg:',
          default: '4'
        },
        mobile: { 
          key: 'productMobileViewCols', 
          regex: /^grid-cols-\d+(?!.*lg:)$/, 
          prefix: '',
          default: '2'
        }
      };
      
      this.currentMode = null;
      this.currentCols = null;
      
      this.init();
    }

    getDefaultCols(mode) {
      if (!this.grid) return this.config[mode].default;
      
      const dataAttr = this.grid.getAttribute(`data-${mode}-cols`);
      if (dataAttr) return dataAttr;
      
      const colClass = Array.from(this.grid.classList)
        .find(cls => this.config[mode].regex.test(cls));
      
      return colClass ? colClass.match(/\d+/)[0] : this.config[mode].default;
    }

    init() {
      if (!this.grid || (this.desktopButtons.length === 0 && this.mobileButtons.length === 0)) return;

      if (this.isCustomizer) {
        localStorage.removeItem(this.config.desktop.key);
        localStorage.removeItem(this.config.mobile.key);
        
        ['load', 'select'].forEach(event => {
          document.addEventListener(`shopify:section:${event}`, () => this.handleCustomizerUpdate());
        });
      }

      this.applyViewMode(true);
      this.registerEvents();
      
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          const newMode = this.getCurrentMode();
          if (newMode !== this.currentMode) this.applyViewMode();
        }, 150);
      });
    }

    handleCustomizerUpdate() {
      this.grid = document.getElementById(this.gridId);
      this.desktopButtons = document.querySelectorAll(this.desktopBtnSelector);
      this.mobileButtons = document.querySelectorAll(this.mobileBtnSelector);
      
      if (!this.grid) return;
      
      this.tempStorage = { desktop: null, mobile: null };
      this.currentMode = null;
      this.currentCols = null;
      this.applyViewMode(true);
      this.registerEvents();
    }

    getCurrentMode() {
      return window.matchMedia('(min-width: 64rem)').matches ? 'desktop' : 'mobile';
    }

    getSavedCols(mode) {
      const { key } = this.config[mode];
      
      if (this.isCustomizer) {
        return this.tempStorage[mode] || this.getDefaultCols(mode);
      }
      
      return localStorage.getItem(key) || this.getDefaultCols(mode);
    }

    applyViewMode(forceUpdate = false) {
      if (!this.grid) return;
      
      const mode = this.getCurrentMode();
      const cols = this.getSavedCols(mode);
      const buttons = mode === 'desktop' ? this.desktopButtons : this.mobileButtons;
      
      if (!buttons.length) return;
      
      if (forceUpdate || mode !== this.currentMode || cols !== this.currentCols) {
        const { regex, prefix } = this.config[mode];
        
        // Remove old grid classes
        Array.from(this.grid.classList)
          .filter(cls => regex.test(cls))
          .forEach(cls => this.grid.classList.remove(cls));
        
        // Add new grid class
        this.grid.classList.add(`${prefix}grid-cols-${cols}`);
        
        // Update active button
        buttons.forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-view-mode') === cols);
        });
        
        this.currentMode = mode;
        this.currentCols = cols;
        this.restartGridAnimations();
      }
    }

    registerEvents() {
      // Remove old listeners by replacing buttons
      const setupButtons = (buttons, mode) => {
        buttons.forEach(btn => {
          const newBtn = btn.cloneNode(true);
          btn.parentNode?.replaceChild(newBtn, btn);
          
          newBtn.addEventListener('click', () => {
            const value = newBtn.getAttribute('data-view-mode');
            
            if (this.isCustomizer) {
              this.tempStorage[mode] = value;
            } else {
              localStorage.setItem(this.config[mode].key, value);
            }
            
            this.applyViewMode(true);
          });
        });
      };
      
      if (this.desktopButtons.length) {
        setupButtons(this.desktopButtons, 'desktop');
        this.desktopButtons = document.querySelectorAll(this.desktopBtnSelector);
      }
      
      if (this.mobileButtons.length) {
        setupButtons(this.mobileButtons, 'mobile');
        this.mobileButtons = document.querySelectorAll(this.mobileBtnSelector);
      }
    }

    restartGridAnimations() {
      const elements = this.grid.querySelectorAll('.scroll-trigger, .animate--slide-in');
      
      elements.forEach(el => {
        el.classList.add('scroll-trigger--offscreen');
        el.classList.remove('scroll-trigger--cancel');
        if (el.hasAttribute('data-cascade')) {
          el.style.removeProperty('--animation-order');
        }
      });

      if (typeof initializeScrollAnimationTrigger === "function") {
        initializeScrollAnimationTrigger(this.grid);
      }
    }
  }

  new ViewModeController('product-grid', '.view-mode__button', '.view-mode__button-mobile');
}

// Single-select enforcement for facets flagged with [data-single-select]
document.addEventListener(
  'change',
  (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.type !== 'checkbox' || !input.checked) return;

    const group = input.closest('[data-single-select]');
    if (!group) return;

    // Uncheck every other value sharing this filter's param name
    group
      .querySelectorAll(`input[type="checkbox"][name="${CSS.escape(input.name)}"]`)
      .forEach((other) => {
        if (other !== input) other.checked = false;
      });
  },
  true
);
