// Pages include only the static #tcsms-loading-screen wrapper inline (see index.html) so
// it paints before this module even downloads; this module owns the inner markup and
// styles (and creates the wrapper too, for any page that omits it) and hides it later.
let loadingScreen = document.getElementById('tcsms-loading-screen')

if (!loadingScreen) {
  loadingScreen = document.createElement('div')
  loadingScreen.id = 'tcsms-loading-screen'
  loadingScreen.className = 'loading-screen'
  document.body.prepend(loadingScreen)
}

loadingScreen.setAttribute('role', 'status')
loadingScreen.setAttribute('aria-label', 'Loading Thompson Christian School Management System')
if (!loadingScreen.children.length) {
  loadingScreen.innerHTML = `
    <img class="loading-mark" src="/assets/logo.png" alt="" aria-hidden="true" />
    <p class="loading-title">TCSMS</p>
    <p class="loading-subtitle">Preparing your workspace</p>
    <div class="loading-spinner" aria-hidden="true"></div>
  `
}

const loadingStyles = document.getElementById('tcsms-loading-styles') || document.createElement('style')
loadingStyles.id = 'tcsms-loading-styles'
if (!loadingStyles.isConnected)
  loadingStyles.textContent = `
  .loading-screen {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: .5rem;
    background: #091c3c;
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
    display: block;
    width: 6rem;
    height: 6rem;
    margin-bottom: .4rem;
    border-radius: 14px;
    object-fit: contain;
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
