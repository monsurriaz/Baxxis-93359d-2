if (!customElements.get('show-more-button')) {
  customElements.define(
    'show-more-button',
    class ShowMoreButton extends HTMLElement {
      constructor() {
        super();
        const button = this.querySelector('button');
        button.addEventListener('click', (event) => {
          this.expandShowMore(event);
          this.dispatchEvent(new CustomEvent('content-updated', {
            bubbles: true,
            composed: true
          }));
          const nextElementToFocus = event.target.closest('.parent-display').querySelector('.show-more-item');
          if (nextElementToFocus && !nextElementToFocus.classList.contains('hidden') && nextElementToFocus.querySelector('input')) {
            nextElementToFocus.querySelector('input').focus();
          }
        });
      }
      expandShowMore(event) {
        const parentDisplay = event.target.closest('[id^="Show-More-"]').closest('.parent-display');
        this.querySelectorAll('.label-text').forEach((element) => element.classList.toggle('hidden'));
        parentDisplay.querySelectorAll('.show-more-item').forEach((item) => item.classList.toggle('hidden'));
        
        if (!this.querySelector('.label-show-less')) {
          this.classList.add('hidden');
        }
      }
    }
  );
}
