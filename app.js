
function changeSlide(newIndex) {
  const banner = document.querySelector('.promo-card-vnext');

  banner.classList.add('fade-out');

  setTimeout(() => {
    currentIndex = newIndex;
    renderBanner(currentIndex);

    banner.classList.remove('fade-out');
    banner.classList.add('fade-in');

    setTimeout(() => {
      banner.classList.remove('fade-in');
    }, 400);

  }, 200);
}
