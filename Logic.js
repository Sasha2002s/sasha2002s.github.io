let isPanningEnabled = false;
let panArea = document.getElementById('pan-area');
let togglePanButton = document.getElementById('toggle-pan-btn');
let isPanning = false;
let startX = 0, startY = 0, scrollLeft = 0, scrollTop = 0;

// Toggle panning functionality
togglePanButton.addEventListener('click', function() {
  isPanningEnabled = !isPanningEnabled;
  togglePanButton.textContent = isPanningEnabled ? 'Disable Pan' : 'Enable Pan';
  
  if (isPanningEnabled) {
    panArea.style.cursor = 'grab';
  } else {
    panArea.style.cursor = 'default';
  }
});

// Mouse events for panning
panArea.addEventListener('mousedown', (e) => {
  if (!isPanningEnabled) return;

  isPanning = true;
  startX = e.pageX - panArea.offsetLeft;
  startY = e.pageY - panArea.offsetTop;
  scrollLeft = panArea.scrollLeft;
  scrollTop = panArea.scrollTop;
  panArea.style.cursor = 'grabbing';
});

panArea.addEventListener('mouseup', () => {
  isPanning = false;
  panArea.style.cursor = 'grab';
});

panArea.addEventListener('mouseleave', () => {
  isPanning = false;
  panArea.style.cursor = 'grab';
});

panArea.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  e.preventDefault();

  const x = e.pageX - panArea.offsetLeft;
  const y = e.pageY - panArea.offsetTop;

  const walkX = (x - startX) * 1; // Multiplier can be adjusted
  const walkY = (y - startY) * 1; // Multiplier can be adjusted
  
  panArea.scrollLeft = scrollLeft - walkX;
  panArea.scrollTop = scrollTop - walkY;
});
function isElementInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Function to add 'visible' class when in view
function handleScroll() {
  const textElement = document.querySelector('.scroll-animated-text');
  if (isElementInViewport(textElement)) {
      textElement.classList.add('visible');
  } else {
      textElement.classList.remove('visible');
  }
}

// Add scroll event listener
window.addEventListener('scroll', handleScroll);

// Initial check in case the element is already in view when the page loads
handleScroll();