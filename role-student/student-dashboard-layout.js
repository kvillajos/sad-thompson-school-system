export function mountStudentDashboardLayout() {
  const tabs = [...document.querySelectorAll('[data-tab]')]
  const panels = [...document.querySelectorAll('[data-panel]')]

  const showTab = name => {
    if (!document.querySelector(`[data-panel="${name}"]`)) name = 'dashboard'
    tabs.forEach(tab => {
      const active = tab.dataset.tab === name
      tab.classList.toggle('active', active)
      tab.setAttribute('aria-current', active ? 'page' : 'false')
    })
    panels.forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== name))
  }

  tabs.forEach(tab =>
    tab.addEventListener('click', () => {
      if (location.hash.slice(1) !== tab.dataset.tab) history.pushState(null, '', `#${tab.dataset.tab}`)
      showTab(tab.dataset.tab)
    })
  )
  window.addEventListener('popstate', () => showTab(location.hash.slice(1) || 'dashboard'))
  showTab(location.hash.slice(1) || 'dashboard')
}
