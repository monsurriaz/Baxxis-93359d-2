class EstimateShipping extends HTMLElement {
    constructor() {
        super();
        this.initShippingCalc = this.initShippingCalc.bind(this);
        this.generateShippingRates = this.generateShippingRates.bind(this);
    }

    connectedCallback() {
        this.initShippingCalc();
        this.addEventListeners();
    }

    async initShippingCalc(preload = false) {
        const element = this.querySelector('#es-shipping-calc');
        const cartDrawerItems = document.querySelector('cart-drawer-items');
        const cartFooter = document.querySelector('.cart__footer');

        new Shopify.CountryProvinceSelector('es-shipping-calc-country', 'es-shipping-calc-province', {
            hideElement: 'es-shipping-calc-province-wrapper'
        });

        if (cartDrawerItems && !cartDrawerItems.classList.contains('is-empty')) {
            document.querySelector('#CartDrawer #es-shipping-calc').style.display = 'block';
        }

        if (cartFooter) {
            document.querySelector('#MainContent #es-shipping-calc').style.display = 'block';
        }
    }

    addEventListeners() {
        const selectAllshippingCountry = this.querySelectorAll("#es-shipping-calc-country");
        let selectedValue;

        selectAllshippingCountry.forEach(selectElement => {
            selectElement.addEventListener("change", (event) => {
                selectedValue = event.target.selectedOptions[0];

                selectAllshippingCountry.forEach(element => {
                    const optionToSelect = Array.from(element.options).find(option => option.value === selectedValue.value);
                    if (optionToSelect) {
                        optionToSelect.selected = true;

                        const dataProvinces = selectedValue.getAttribute('data-provinces');
                        if (dataProvinces) {
                            const allProvinceWrappers = this.querySelectorAll("#es-shipping-calc-province-wrapper");
                            const dataProvincesArr = dataProvinces.split(" ");
                            if (dataProvincesArr.length > 1) {
                                allProvinceWrappers.forEach(wrapper => {
                                    wrapper.style.display = 'block';
                                });
                            } else {
                                allProvinceWrappers.forEach(wrapper => {
                                    wrapper.style.display = 'none';
                                });
                            }
                        }
                    }
                });

                new Shopify.CountryProvinceSelector('es-shipping-calc-country', 'es-shipping-calc-province', {
                    hideElement: 'es-shipping-calc-province-wrapper'
                });
            });
        });

        const generateShippingRatesButton = this.querySelector('#es-shipping-calc-btn');
        if (generateShippingRatesButton) {
            generateShippingRatesButton.addEventListener('click', (event) => {
                this.generateShippingRates(event.target);
            });
        }
    }

    async generateShippingRates(btn) {
       
        const loadingSpinner = btn.querySelector('.loading__spinner');
        btn.classList.add('loading');
        loadingSpinner.classList.remove('hidden');

        const wrapper = btn.closest('estimate-shipping');

        const alertDanger = wrapper.querySelector('#es-shipping-calc-alert-danger');
        const alertWarning = wrapper.querySelector('#es-shipping-calc-alert-warning');
        const alertSuccess = wrapper.querySelector('#es-shipping-calc-alert-success');

        alertDanger.innerHTML = '';
        alertDanger.setAttribute('hidden', 'hidden');
        alertWarning.innerHTML = '';
        alertWarning.setAttribute('hidden', 'hidden');
        alertSuccess.innerHTML = '';
        alertSuccess.setAttribute('hidden', 'hidden');

        const country = wrapper.querySelector('#es-shipping-calc-country').value;
        const province = wrapper.querySelector('#es-shipping-calc-province').value;
        const zip = wrapper.querySelector('#es-shipping-calc-zip').value;

        const prepareResponse = await fetch(`/cart/prepare_shipping_rates.json?shipping_address[zip]=${zip}&shipping_address[country]=${country}&shipping_address[province]=${province}`, {
            method: 'POST'
        });

        if (prepareResponse.ok) {
            const asyncResponse = await fetch(`/cart/async_shipping_rates.json?shipping_address[zip]=${zip}&shipping_address[country]=${country}&shipping_address[province]=${province}`);
            const data = await asyncResponse.json();

            let html = '';

            if (data.shipping_rates.length) {
                data.shipping_rates.forEach(elem => {
                    html += `
                        <li>
                            ${elem.presentment_name}: <strong>${elem.price} ${elem.currency}</strong>
                        </li>
                    `;
                });

                alertSuccess.innerHTML = `
                    <ul class="">
                        ${html}
                    </ul>
                `;
                alertSuccess.removeAttribute('hidden');
            } else {
                alertWarning.innerHTML = `
                    <p class="">
                        No shipping rates found.
                    </p>
                `;
                alertWarning.removeAttribute('hidden');
            }
        } else {
            const data = await prepareResponse.json();

            let html = '';

            for (const [key, value] of Object.entries(data)) {
                html += `
                    <li>
                        <strong>${key}</strong>: ${value.toString()}
                    </li>
                `;
            }

            alertDanger.innerHTML = `
                <ul class="">
                    ${html}
                </ul>
            `;
            alertDanger.removeAttribute('hidden');
        }

        btn.classList.remove('loading');
        loadingSpinner.classList.add('hidden');
    }
}

customElements.define('estimate-shipping', EstimateShipping);
