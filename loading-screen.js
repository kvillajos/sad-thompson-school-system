// Pages should include the static #tcsms-loading-screen markup inline (see index.html)
// so it paints before this module even downloads. This module only ensures the
// screen/styles exist (fallback for pages without the inline markup) and hides it later.
let loadingScreen = document.getElementById('tcsms-loading-screen')

if (!loadingScreen) {
  loadingScreen = document.createElement('div')
  loadingScreen.id = 'tcsms-loading-screen'
  loadingScreen.className = 'loading-screen'
  loadingScreen.setAttribute('role', 'status')
  loadingScreen.setAttribute('aria-label', 'Loading Thompson Christian School Management System')
  loadingScreen.innerHTML = `
    <div class="loading-mark" aria-hidden="true">T</div>
    <p class="loading-title">TCSMS</p>
    <p class="loading-subtitle">Preparing your workspace</p>
    <div class="loading-spinner" aria-hidden="true"></div>
  `
  document.body.prepend(loadingScreen)
}

const loadingStyles = document.getElementById('tcsms-loading-styles') || document.createElement('style')
loadingStyles.id = 'tcsms-loading-styles'
if (!loadingStyles.isConnected) loadingStyles.textContent = `
  .loading-screen {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: .5rem;
    background: #102a43;
    color: #f7fbff;
    opacity: 1;
    transition: opacity .35s ease, visibility .35s ease;
  }
  .loading-screen.auth-overlay {
    background: rgba(7, 27, 58, .58);
    backdrop-filter: blur(3px);
  }
  .loading-screen.is-hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .loading-mark {
    display: grid;
    place-items: center;
    width: 4.25rem;
    height: 4.25rem;
    margin-bottom: .4rem;
    border: 2px solid #f0b429;
    border-radius: 50%;
    color: #f0b429;
    font-family: Georgia, serif;
    font-size: 2rem;
    font-weight: 700;
    animation: loading-pulse 1.8s ease-in-out infinite;
  }
  .loading-title {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: .12em;
  }
  .loading-subtitle {
    margin: 0;
    color: #bcccdc;
    font-size: .85rem;
  }
  .loading-spinner {
    width: 1.25rem;
    height: 1.25rem;
    margin-top: .8rem;
    border: 2px solid rgba(255, 255, 255, .25);
    border-top-color: #f0b429;
    border-radius: 50%;
    animation: loading-spin .8s linear infinite;
  }
  @keyframes loading-spin { to { transform: rotate(360deg); } }
  @keyframes loading-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }
`

if (!loadingStyles.isConnected) document.head.appendChild(loadingStyles)

export function hideLoadingScreen() {
  requestAnimationFrame(() => loadingScreen.classList.add('is-hidden'))
}

export function showLoadingScreen(subtitle = 'Signing you in...') {
  const subtitleElement = loadingScreen.querySelector('.loading-subtitle')
  if (subtitleElement) subtitleElement.textContent = subtitle
  loadingScreen.style.background = 'rgba(7, 27, 58, .58)'
  loadingScreen.classList.add('auth-overlay')
  loadingScreen.classList.remove('is-hidden')
}
