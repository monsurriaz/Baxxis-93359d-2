
(function() {
  const lightbox = () => {
    const leftArrowSVGString = '<svg aria-hidden="true" focusable="false" fill="none" width="16" class="icon icon--direction-aware" viewBox="0 0 16 18"><path d="M11 1 3 9l8 8" stroke="currentColor" stroke-linecap="square" stroke-width="2"></path></svg>';
    const closeSvgString = '<svg aria-hidden="true" focusable="false" fill="none" width="16" class="icon" viewBox="0 0 16 16"><path d="m1 1 14 14M1 15 15 1" stroke="currentColor" stroke-width="1.2"></path></svg>';
    const lightbox = new PhotoSwipeLightbox({
      gallery: '.splide__gallery',
      children: '.product-media-zoom',
      bgOpacity: 1,
      showHideAnimationType: 'zoom',
      loop: true,
      counter: true,
      zoom: false,
      bgClickAction: false,
      arrowPrevSVG: leftArrowSVGString,
      arrowNextSVG: leftArrowSVGString,
      closeSVG: closeSvgString,
      pswpModule: PhotoSwipe
    });
    lightbox.init();
  }
  document.addEventListener("DOMContentLoaded", function() {
    lightbox();
    document.addEventListener('shopify:section:load', () => lightbox());
  });
})()

