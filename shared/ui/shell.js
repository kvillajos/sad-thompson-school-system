import { supabase } from '../lib/auth-client.js'
import { toast } from './ui-theme.js'
import { describeError } from '../lib/errors.js'
import { currentSchoolYear } from '../lib/grades.js'
import { mountNotificationBell } from './notifications.js'

import { noticeDialog } from './dialog.js'

// Disables a button and swaps its label (with a spinner) while an async action runs, restoring it after.
export async function withBusy(button, busyLabel, action) {
  const originalLabel = button.textContent
  const originalDisabled = button.disabled
  button.disabled = true
  button.textContent = busyLabel
  button.setAttribute('aria-busy', 'true')
  try {
    return await action()
  } finally {
    button.disabled = originalDisabled
    button.textContent = originalLabel
    button.removeAttribute('aria-busy')
  }
}

// Nav icons, one stroke style, keyed by the `icon` name each role's nav passes in.
const NAV_ICONS = {
  home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6 6 0 0 1 3.5 6"/>',
  badge: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17a4 4 0 0 1 8 0"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2Z"/><path d="M20 19v2H6"/><path d="M8 7h8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  years: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  audit: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  attendance: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  'user-plus': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M22 11h-6"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
  history: '<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2Z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8Z"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
}
export const icon = (paths, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const CHEVRONS_LEFT = '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>'
const MENU = '<path d="M4 6h16M4 12h16M4 18h16"/>'
const CLOSE = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
const COLLAPSE_KEY = 'tcsms_sidebar_collapsed'

// items: { label, href | tab, icon, active, group }. A new `group` value starts a labelled section.
export function mountSidebar(items, brand, role) {
  document.querySelector('.app-sidebar, .side, .admin-sidebar')?.remove()
  document.body.classList.add('has-app-sidebar')
  if (role) document.body.dataset.role = role
  const sidebar = document.createElement('aside')
  sidebar.className = 'app-sidebar'
  sidebar.id = 'app-sidebar'
  sidebar.innerHTML = `<div class="sidebar-head"><img src="/assets/logo.png" alt="Thompson Christian School" class="sidebar-logo"><div class="sidebar-brand"><strong>Thompson Christian School</strong><span></span></div></div><nav class="sidebar-nav" aria-label="Main"></nav><button type="button" class="sidebar-collapse" aria-controls="app-sidebar">${icon(CHEVRONS_LEFT, 16)}<span>Collapse</span></button>`
  sidebar.querySelector('.sidebar-brand span').textContent = String(brand).replace(/<br\s*\/?>/gi, ' ')
  const nav = sidebar.querySelector('.sidebar-nav')
  let group
  items.forEach(item => {
    if (item.group && item.group !== group) {
      const heading = document.createElement('p')
      heading.className = 'sidebar-group'
      heading.textContent = item.group
      nav.appendChild(heading)
    }
    group = item.group
    const link = item.tab ? document.createElement('button') : document.createElement('a')
    link.className = 'sidebar-link'
    link.innerHTML = `<span class="sidebar-icon">${icon(NAV_ICONS[item.icon] || NAV_ICONS.list)}</span><span class="sidebar-label"></span>`
    link.querySelector('.sidebar-label').textContent = item.label
    if (item.tab) {
      link.dataset.tab = item.tab
      link.type = 'button'
    }
    if (item.href) link.href = item.href
    if (item.active) link.classList.add('active')
    nav.appendChild(link)
  })
  const layout = document.querySelector('.layout')
  if (layout) layout.prepend(sidebar)
  else document.body.prepend(sidebar)

  // One highlight follows whichever link has .active, so switching tabs slides it instead of popping it.
  const indicator = document.createElement('span')
  indicator.className = 'sidebar-indicator'
  indicator.setAttribute('aria-hidden', 'true')
  nav.prepend(indicator)
  const crumb = document.querySelector('.topbar-crumb-current')
  const moveIndicator = () => {
    const active = nav.querySelector('.sidebar-link.active')
    nav.querySelectorAll('.sidebar-link').forEach(link => link.toggleAttribute('aria-current', link === active))
    if (crumb) crumb.textContent = active?.textContent || ''
    indicator.style.opacity = active ? '1' : '0'
    if (!active) return
    indicator.style.transform = `translateY(${active.offsetTop}px)`
    indicator.style.height = `${active.offsetHeight}px`
  }
  moveIndicator()
  // Transitions switch on only after the first placement, so the page doesn't open with the highlight sliding in from the top.
  requestAnimationFrame(() => {
    moveIndicator()
    requestAnimationFrame(() => indicator.classList.add('ready'))
  })
  new MutationObserver(moveIndicator).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] })
  window.addEventListener('resize', moveIndicator)
  sidebar.addEventListener('transitionend', event => event.target === sidebar && moveIndicator())

  // Desktop: collapse to an icon rail, remembered per browser. Collapsed links keep their name as a tooltip.
  const collapseButton = sidebar.querySelector('.sidebar-collapse')
  const setCollapsed = collapsed => {
    document.body.classList.toggle('sidebar-collapsed', collapsed)
    collapseButton.setAttribute('aria-expanded', String(!collapsed))
    collapseButton.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar')
    nav.querySelectorAll('.sidebar-link').forEach(link => (collapsed ? (link.title = link.textContent) : link.removeAttribute('title')))
  }
  // Small tablets always get the rail; their button is hidden and the saved choice applies again on wider screens.
  const tablet = window.matchMedia('(min-width: 701px) and (max-width: 1100px)')
  const saved = () => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  }
  setCollapsed(tablet.matches || saved())
  tablet.addEventListener('change', () => setCollapsed(tablet.matches || saved()))
  collapseButton.addEventListener('click', () => {
    const collapsed = !document.body.classList.contains('sidebar-collapsed')
    setCollapsed(collapsed)
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {}
  })

  // Phones: the sidebar is a drawer opened from the menu button in the top bar.
  document.querySelector('.mobile-nav-backdrop')?.remove()
  const backdrop = document.createElement('div')
  backdrop.className = 'mobile-nav-backdrop'
  backdrop.setAttribute('aria-hidden', 'true')
  document.body.append(backdrop)
  const menuButton = document.createElement('button')
  menuButton.type = 'button'
  menuButton.className = 'topbar-icon topbar-menu'
  menuButton.setAttribute('aria-controls', 'app-sidebar')
  document.querySelector('.app-topbar')?.prepend(menuButton)
  const setMenuOpen = open => {
    document.body.classList.toggle('mobile-nav-open', open)
    menuButton.innerHTML = icon(open ? CLOSE : MENU, 20)
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
    menuButton.setAttribute('aria-expanded', String(open))
    if (open) nav.scrollTop = 0
  }
  setMenuOpen(false)
  menuButton.addEventListener('click', () => setMenuOpen(!document.body.classList.contains('mobile-nav-open')))
  backdrop.addEventListener('click', () => setMenuOpen(false))
  sidebar.addEventListener('click', event => event.target.closest('.sidebar-link') && setMenuOpen(false))
  document.addEventListener('keydown', event => event.key === 'Escape' && setMenuOpen(false))
  window.addEventListener('resize', () => window.innerWidth > 700 && setMenuOpen(false))

  return sidebar
}

export function mountProfile(user, roleLabel, onSignOut) {
  document.querySelector('.app-topbar')?.remove()
  const topbar = document.createElement('header')
  topbar.className = 'app-topbar'
  const name = user?.username || roleLabel
  topbar.innerHTML = `<nav class="topbar-crumb" aria-label="Breadcrumb"><span class="topbar-crumb-role"></span>${icon('<path d="m9 18 6-6-6-6"/>', 14)}<span class="topbar-crumb-current" aria-current="page"></span></nav>
    <div class="topbar-actions">
      <span class="sy-chip" title="Current school year">${icon(NAV_ICONS.calendar, 15)}<span>SY ${currentSchoolYear().replace('-', '–')}</span></span>
      <button class="topbar-icon theme-toggle" type="button" aria-pressed="false"></button>
      <div class="profile-menu">
        <button class="profile-toggle" type="button" aria-expanded="false" aria-haspopup="menu"><span class="profile-avatar"></span><span class="profile-name"><strong></strong><small></small></span>${icon('<path d="m6 9 6 6 6-6"/>', 16)}</button>
        <div class="profile-dropdown hidden" role="menu">
          <button class="profile-edit" type="button" role="menuitem">${icon('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', 16)}Edit profile</button>
          <button class="profile-change-password" type="button" role="menuitem">${icon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 16)}Change password</button>
          <button class="profile-signout" type="button" role="menuitem">${icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>', 16)}Sign out</button>
        </div>
      </div>
    </div>`
  topbar.querySelector('.topbar-crumb-role').textContent = roleLabel
  topbar.querySelector('.profile-toggle strong').textContent = name
  topbar.querySelector('.profile-toggle small').textContent = roleLabel
  topbar.querySelector('.profile-avatar').textContent = String(name).charAt(0).toUpperCase()
  document.body.prepend(topbar)
  const profile = topbar.querySelector('.profile-menu')
  const toggle = profile.querySelector('.profile-toggle')
  const dropdown = profile.querySelector('.profile-dropdown')
  const themeToggle = topbar.querySelector('.theme-toggle')
  const updateThemeToggle = () => {
    const dark = document.documentElement.dataset.theme === 'dark'
    themeToggle.innerHTML = dark
      ? icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>', 19)
      : icon('<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>', 19)
    themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode')
    themeToggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode'
    themeToggle.setAttribute('aria-pressed', String(dark))
  }
  updateThemeToggle()
  themeToggle.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark'
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try {
      localStorage.setItem('tcsms_theme', dark ? 'dark' : 'light')
    } catch {}
    updateThemeToggle()
    themeToggle.classList.remove('spin')
    void themeToggle.offsetWidth
    themeToggle.classList.add('spin')
  })
  const closeDropdown = () => {
    dropdown.classList.add('hidden')
    toggle.setAttribute('aria-expanded', 'false')
  }
  toggle.addEventListener('click', () => {
    dropdown.classList.toggle('hidden')
    toggle.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')))
  })
  document.addEventListener('click', event => !profile.contains(event.target) && closeDropdown())
  document.addEventListener('keydown', event => event.key === 'Escape' && closeDropdown())
  mountNotificationBell(user, roleLabel, themeToggle)
  profile.querySelector('.profile-signout').addEventListener('click', onSignOut)
  profile.querySelector('.profile-edit').addEventListener('click', () => {
    dropdown.classList.add('hidden')
    openProfileModal(user, roleLabel, profile)
  })
  profile.querySelector('.profile-change-password').addEventListener('click', () => {
    dropdown.classList.add('hidden')
    openPasswordModal(onSignOut)
  })
  const avatar = profile.querySelector('.profile-avatar')
  const nameEl = profile.querySelector('.profile-toggle strong')
  const setAvatar = (url, firstName, lastName) => {
    avatar.textContent = ''
    if (url) {
      const image = document.createElement('img')
      image.src = url
      image.alt = ''
      image.width = 40
      image.height = 40
      avatar.appendChild(image)
      return
    }
    const initials = [firstName, lastName]
      .filter(Boolean)
      .map(value => value.trim().charAt(0))
      .join('')
      .toUpperCase()
    avatar.textContent = initials || String(name).charAt(0).toUpperCase()
  }
  const setDisplayName = (firstName, lastName) => {
    if (!firstName) return
    const label = lastName ? `${firstName.trim()} ${lastName.trim().charAt(0).toUpperCase()}.` : firstName.trim()
    nameEl.textContent = label
  }
  const loadAvatar = async () => {
    const profileQuery = user.student_id
      ? supabase.from('students').select('first_name,last_name,profile_picture_url').eq('student_id', user.student_id).maybeSingle()
      : Number(user.role_id) === 1
        ? supabase.from('admins').select('first_name,middle_name,last_name').eq('user_id', user.user_id).maybeSingle()
        : supabase.from('staff_profiles').select('first_name,last_name').eq('user_id', user.user_id).maybeSingle()
    const [profileResult, accountResult] = await Promise.all([
      profileQuery,
      supabase.from('users').select('profile_picture_url').eq('user_id', user.user_id).maybeSingle()
    ])
    const data = profileResult.data || {}
    setAvatar(data.profile_picture_url || accountResult.data?.profile_picture_url, data.first_name, data.last_name)
    setDisplayName(data.first_name, data.last_name)
  }
  loadAvatar()
  showLoginNotice()
}

function openProfileModal(user, roleLabel, profile) {
  document.getElementById('tcsms-profile-modal')?.remove()
  const modal = document.createElement('div')
  modal.id = 'tcsms-profile-modal'
  modal.className = 'admin-modal drawer'
  const safeRole = String(roleLabel).replace(
    /[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
  )
  const canChangePicture = [1, 2].includes(Number(user?.role_id))
  modal.innerHTML = `<div class="admin-modal-box profile-modal-box">
    <div class="admin-modal-head"><h3>Edit Profile</h3><button type="button" id="tcsms-profile-close">x</button></div>
    <form id="tcsms-profile-form" class="profile-form" novalidate>
      <div><div class="pfp-edit-wrap"><img id="tcsms-profile-preview" class="profile-picture-preview" alt="Current profile picture">${canChangePicture ? '<button type="button" class="pfp-edit-btn" id="tcsms-profile-edit-pic" aria-label="Change profile picture" aria-haspopup="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><div class="pfp-menu hidden" id="tcsms-profile-menu"><button type="button" id="tcsms-profile-upload">Upload image</button><button type="button" id="tcsms-profile-camera">Use camera</button><button type="button" id="tcsms-profile-remove" class="danger">Remove picture</button></div>' : ''}</div><div class="profile-identity"><p class="profile-readonly"><b>Username:</b> ${String(user?.username || '-')}</p><p class="profile-readonly"><b>Role:</b> ${safeRole}</p></div></div>
      <label class="admin-full">First Name<input id="tcsms-profile-first-name" maxlength="80"></label>
      <label class="admin-full">Middle Name<input id="tcsms-profile-middle-name" maxlength="80"></label>
      <label class="admin-full">Last Name<input id="tcsms-profile-last-name" maxlength="80"></label>
      <label class="admin-full">Email<input id="tcsms-profile-email" maxlength="150" type="email" data-current="${String(user?.email || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])}" placeholder="${String(user?.email || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])}"></label>
      ${canChangePicture ? '<input id="tcsms-profile-picture" type="file" accept="image/png,image/jpeg,image/webp" hidden>' : ''}
      <div class="admin-actions"><button type="button" id="tcsms-profile-cancel" class="admin-cancel">Cancel</button><button class="admin-primary" type="submit">Confirm Changes</button></div>
    </form>
  </div>`
  document.body.appendChild(modal)
  const setProfilePicture = url => {
    const avatar = profile.querySelector('.profile-avatar')
    const preview = modal.querySelector('#tcsms-profile-preview')
    if (url) {
      preview.src = url
      preview.classList.remove('profile-picture-placeholder')
    } else {
      preview.removeAttribute('src')
      preview.classList.add('profile-picture-placeholder')
      preview.alt = 'No profile picture'
      preview.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 50'%3E%3Ccircle cx='25' cy='25' r='25' fill='%232161d1'/%3E%3Ctext x='25' y='32' text-anchor='middle' fill='%23ffffff' font-size='22' font-weight='700' font-family='Arial'%3E${String(
        user?.username || roleLabel
      )
        .charAt(0)
        .toUpperCase()}%3C/text%3E%3C/svg%3E`
    }
    avatar.textContent = ''
    if (url) {
      const image = document.createElement('img')
      image.src = url
      image.alt = ''
      image.width = 40
      image.height = 40
      avatar.appendChild(image)
    } else
      avatar.textContent = String(user?.username || roleLabel)
        .charAt(0)
        .toUpperCase()
  }
  const loadProfile = async () => {
    const profileQuery = user.student_id
      ? supabase
          .from('students')
          .select('first_name,middle_name,last_name,profile_picture_url')
          .eq('student_id', user.student_id)
          .maybeSingle()
      : Number(user.role_id) === 1
        ? supabase.from('admins').select('first_name,middle_name,last_name').eq('user_id', user.user_id).maybeSingle()
        : supabase.from('staff_profiles').select('first_name,middle_name,last_name').eq('user_id', user.user_id).maybeSingle()
    const [profileResult, pictureResult] = await Promise.all([
      profileQuery,
      supabase.from('users').select('profile_picture_url').eq('user_id', user.user_id).maybeSingle()
    ])
    if (profileResult.error) return toast(describeError(profileResult.error, 'Load your profile'), 'error')
    if (pictureResult.error) return toast(describeError(pictureResult.error, 'Load your profile picture'), 'error')
    const data = profileResult.data || {}
    ;[
      ['#tcsms-profile-first-name', data.first_name],
      ['#tcsms-profile-middle-name', data.middle_name],
      ['#tcsms-profile-last-name', data.last_name]
    ].forEach(([selector, value]) => {
      const input = modal.querySelector(selector)
      input.dataset.current = value || ''
      input.value = value || ''
      input.classList.toggle('has-value', Boolean(value))
    })
    const email = modal.querySelector('#tcsms-profile-email')
    email.value = email.dataset.current
    email.classList.add('has-value')
    setProfilePicture(data.profile_picture_url || pictureResult.data?.profile_picture_url)
  }
  modal
    .querySelectorAll('#tcsms-profile-first-name, #tcsms-profile-middle-name, #tcsms-profile-last-name, #tcsms-profile-email')
    .forEach(input => {
      input.addEventListener('input', () => input.classList.toggle('has-value', Boolean(input.value.trim())))
      input.addEventListener(
        'focus',
        () => {
          if (!input.value && input.dataset.current) input.dataset.current = ''
        },
        { once: false }
      )
    })
  loadProfile()
  const close = () => modal.remove()
  modal.querySelector('#tcsms-profile-close').addEventListener('click', close)
  modal.querySelector('#tcsms-profile-cancel').addEventListener('click', close)
  modal.querySelector('#tcsms-profile-form').addEventListener('submit', async event => {
    event.preventDefault()
    const valueFor = selector => {
      const input = modal.querySelector(selector)
      return input.value.trim() || input.dataset.current || ''
    }
    const firstName = valueFor('#tcsms-profile-first-name')
    const middleName = valueFor('#tcsms-profile-middle-name')
    const lastName = valueFor('#tcsms-profile-last-name')
    const email = valueFor('#tcsms-profile-email')
    if (!firstName || !lastName || !email) return toast('Enter your first name, last name and email.', 'error')
    const emailInput = modal.querySelector('#tcsms-profile-email')
    if (emailInput.value.trim() && !emailInput.checkValidity()) return emailInput.reportValidity()
    const submitButton = modal.querySelector('#tcsms-profile-form [type="submit"]')
    const changed = ['first-name', 'middle-name', 'last-name', 'email'].some(id => {
      const input = modal.querySelector(`#tcsms-profile-${id}`)
      return input.value.trim() !== (input.dataset.current || '')
    })
    if (!changed && !modal.profilePictureBlob) return close()
    const result = await confirmProfileChange(user.email, async () =>
      changed
        ? supabase.rpc('submit_profile_change', {
            p_first_name: firstName,
            p_middle_name: middleName || null,
            p_last_name: lastName,
            p_email: email
          })
        : {}
    )
    if (!result) return
    if (modal.profilePictureBlob) {
      const saved = await withBusy(submitButton, 'Uploading…', async () => {
        const picture = modal.profilePictureBlob
        const path = `users/${user.user_id}/${crypto.randomUUID()}-${picture.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const upload = await supabase.storage.from('profile-pictures').upload(path, picture, { upsert: false })
        if (upload.error) return toast(describeError(upload.error, 'Upload picture'), 'error')
        const publicUrl = supabase.storage.from('profile-pictures').getPublicUrl(path).data.publicUrl
        const pictureResult = await supabase.rpc('staff_update_profile_picture', {
          p_user_id: user.user_id,
          p_url: publicUrl
        })
        if (pictureResult.error) return toast(describeError(pictureResult.error, 'Save picture'), 'error')
        setProfilePicture(publicUrl)
        return true
      })
      if (!saved) return
    }
    close()
    toast(changed ? 'Profile changes sent. An administrator will review them.' : 'Profile picture updated.')
  })
  if (canChangePicture) {
    const previewPicture = blob => {
      modal.profilePictureBlob = blob
      const preview = modal.querySelector('#tcsms-profile-preview')
      preview.classList.remove('profile-picture-placeholder')
      preview.alt = 'Selected profile picture'
      preview.src = URL.createObjectURL(blob)
    }
    const cropImage = (source, name = 'profile.png') =>
      new Promise(resolve => {
        const crop = document.createElement('div')
        crop.className = 'admin-modal'
        crop.innerHTML = `<div class="admin-modal-box profile-crop-box"><div class="admin-modal-head"><h3>Crop Profile Picture</h3><button type="button" data-crop-close>x</button></div><div class="crop-stage"><canvas width="240" height="240" id="tcsms-crop-canvas"></canvas><div class="crop-circle"></div></div><small class="crop-hint">Keep your face inside the circle.</small><label>Zoom<input type="range" id="tcsms-crop-zoom" min="1" max="3" step="0.01" value="1"></label><label>Horizontal Position<input type="range" id="tcsms-crop-x" min="0" max="100" value="50"></label><label>Vertical Position<input type="range" id="tcsms-crop-y" min="0" max="100" value="50"></label><div class="admin-actions"><button type="button" class="admin-cancel" data-crop-cancel>Cancel</button><button type="button" class="admin-primary" data-crop-save>Use Cropped Image</button></div></div>`
        document.body.appendChild(crop)
        const canvas = crop.querySelector('canvas')
        const context = canvas.getContext('2d')
        const draw = () => {
          const zoom = Number(crop.querySelector('#tcsms-crop-zoom').value)
          const side = Math.min(source.width, source.height) / zoom
          const left = ((source.width - side) * Number(crop.querySelector('#tcsms-crop-x').value)) / 100
          const top = ((source.height - side) * Number(crop.querySelector('#tcsms-crop-y').value)) / 100
          context.clearRect(0, 0, 240, 240)
          context.drawImage(source, left, top, side, side, 0, 0, 240, 240)
        }
        crop.querySelectorAll('input').forEach(input => input.addEventListener('input', draw))
        draw()
        const close = () => {
          crop.remove()
          resolve(null)
        }
        crop.querySelector('[data-crop-close]').onclick = crop.querySelector('[data-crop-cancel]').onclick = close
        crop.querySelector('[data-crop-save]').onclick = () =>
          canvas.toBlob(blob => {
            crop.remove()
            resolve(new File([blob], name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' }))
          }, 'image/png')
      })
    const chooseImage = file => {
      if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
        return toast('Use a PNG, JPG, or WEBP image for the profile picture.', 'error')
      const image = new Image()
      image.onload = async () => {
        const blob = await cropImage(image, file.name)
        if (blob) previewPicture(blob)
      }
      image.src = URL.createObjectURL(file)
    }
    const menu = modal.querySelector('#tcsms-profile-menu')
    modal.querySelector('#tcsms-profile-edit-pic').onclick = event => {
      event.stopPropagation()
      menu.classList.toggle('hidden')
    }
    modal.addEventListener('click', () => menu.classList.add('hidden'))
    modal.querySelector('#tcsms-profile-upload').onclick = () => modal.querySelector('#tcsms-profile-picture').click()
    modal.querySelector('#tcsms-profile-picture').onchange = event => chooseImage(event.target.files?.[0])
    modal.querySelector('#tcsms-profile-camera').onclick = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        const camera = document.createElement('div')
        camera.className = 'admin-modal'
        camera.innerHTML = `<div class="admin-modal-box camera-box"><div class="admin-modal-head"><h3>Take Profile Picture</h3><button type="button" data-camera-close>x</button></div><video autoplay playsinline style="width:100%"></video><div class="admin-actions"><button type="button" class="admin-cancel" data-camera-cancel>Cancel</button><button type="button" class="admin-primary" data-camera-capture>Capture</button></div></div>`
        document.body.appendChild(camera)
        const video = camera.querySelector('video')
        video.srcObject = stream
        const stop = () => {
          stream.getTracks().forEach(track => track.stop())
          camera.remove()
        }
        camera.querySelector('[data-camera-close]').onclick = camera.querySelector('[data-camera-cancel]').onclick = stop
        camera.querySelector('[data-camera-capture]').onclick = async () => {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          canvas.getContext('2d').drawImage(video, 0, 0)
          const image = new Image()
          image.onload = async () => {
            stop()
            const blob = await cropImage(image)
            if (blob) previewPicture(blob)
          }
          image.src = canvas.toDataURL('image/png')
        }
      } catch {
        toast('The camera is not available. Check that this site is allowed to use it, or upload an image instead.', 'error')
      }
    }
    modal.querySelector('#tcsms-profile-remove').onclick = async () => {
      const result = await confirmProfileChange(user.email, () =>
        supabase.rpc('staff_update_profile_picture', { p_user_id: user.user_id, p_url: null })
      )
      if (result) {
        setProfilePicture(null)
        toast('Profile picture removed.')
      }
    }
  }
}

// Resolves true only after the signed-in user re-enters their own password correctly.
// Wraps a password input with an eye button so people can check what they typed.
const EYE_OPEN =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>'
const EYE_OFF =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a19.8 19.8 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.4 10.4 0 0 1 12 5c7 0 11 7 11 7a19.7 19.7 0 0 1-3.17 4.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
export function withPasswordToggle(input) {
  const wrap = document.createElement('div')
  wrap.className = 'pw-wrap'
  input.replaceWith(wrap)
  wrap.append(input)
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'pw-toggle'
  toggle.innerHTML = EYE_OPEN
  toggle.setAttribute('aria-label', 'Show password')
  toggle.onclick = () => {
    const reveal = input.type === 'password'
    input.type = reveal ? 'text' : 'password'
    toggle.innerHTML = reveal ? EYE_OFF : EYE_OPEN
    toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password')
  }
  wrap.append(toggle)
}

export function confirmPassword(email, message = 'Enter your password to continue.') {
  return new Promise(resolve => {
    const prompt = document.createElement('div')
    prompt.className = 'admin-modal stack-above'
    prompt.innerHTML = `<div class="admin-modal-box" style="width:min(100%,400px)"><div class="admin-modal-head"><h3>Confirm Password</h3><button type="button" data-password-close>x</button></div><form data-password-form style="grid-template-columns:1fr;gap:8px"><input type="password" maxlength="128" data-profile-password placeholder="Password" autocomplete="current-password" required style="margin:0;align-self:start"><small data-password-message style="color:var(--ui-muted);line-height:1.4"></small><p class="login-hint" data-password-error style="color:#c0392b;margin:0;font-size:13px" role="alert"></p><div class="admin-actions" style="margin-top:4px"><button type="button" class="admin-cancel" data-password-cancel>Cancel</button><button type="submit" class="admin-primary">Confirm</button></div></form></div>`
    prompt.querySelector('[data-password-message]').textContent = message
    document.body.appendChild(prompt)
    withPasswordToggle(prompt.querySelector('[data-profile-password]'))
    const finish = value => {
      prompt.remove()
      resolve(value)
    }
    prompt.querySelector('[data-password-close]').onclick = prompt.querySelector('[data-password-cancel]').onclick = () => finish(false)
    prompt.querySelector('[data-password-form]').onsubmit = async event => {
      event.preventDefault()
      const { error } = await withBusy(prompt.querySelector('[type="submit"]'), 'Checking…', () =>
        supabase.auth.signInWithPassword({ email, password: prompt.querySelector('[data-profile-password]').value })
      )
      if (error) {
        prompt.querySelector('[data-password-error]').textContent = /fetch|network/i.test(error.message)
          ? 'Could not reach the server. Check your connection and try again.'
          : 'Password is incorrect.'
        prompt.querySelector('[data-profile-password]').select()
        return
      }
      finish(true)
    }
    prompt.querySelector('[data-profile-password]').focus()
  })
}

async function confirmProfileChange(email, action) {
  if (!(await confirmPassword(email, 'Enter your password to confirm this change.'))) return null
  const result = await action()
  if (result?.error) {
    toast(describeError(result.error, 'Save profile'), 'error')
    return null
  }
  return result
}

// Rules for a new password: 8+ characters with an uppercase letter, a lowercase letter and a digit.
export const passwordRules = [
  ['At least 8 characters', pw => pw.length >= 8],
  ['One uppercase letter', pw => /[A-Z]/.test(pw)],
  ['One lowercase letter', pw => /[a-z]/.test(pw)],
  ['One number', pw => /\d/.test(pw)]
]
export const passwordIsValid = pw => passwordRules.every(([, test]) => test(pw))

function openPasswordModal(onSignOut) {
  document.getElementById('tcsms-password-modal')?.remove()
  const modal = document.createElement('div')
  modal.id = 'tcsms-password-modal'
  modal.className = 'admin-modal'
  modal.innerHTML = `<div class="admin-modal-box" style="width:min(100%,420px)">
    <div class="admin-modal-head"><h3>Change Password</h3><button type="button" id="tcsms-password-close">x</button></div>
    <form id="tcsms-password-form">
      <label class="admin-full">New Password<input type="password" id="tcsms-new-password" minlength="8" maxlength="72" autocomplete="new-password"></label>
      <div class="pw-meter" aria-live="polite"><div class="pw-bar"><span id="tcsms-pw-fill"></span></div><small id="tcsms-pw-label">Enter a password</small><ul id="tcsms-pw-rules">${passwordRules.map(([label]) => `<li>${label}</li>`).join('')}</ul></div>
      <label class="admin-full">Confirm Password<input type="password" id="tcsms-confirm-password" minlength="8" maxlength="72" autocomplete="new-password"></label>
      <p class="admin-full login-hint" id="tcsms-password-error" role="alert" style="color:var(--ui-danger);margin:0;font-size:13px"></p>
      <div class="admin-actions"><button type="button" id="tcsms-password-cancel" class="admin-cancel">Cancel</button><button class="admin-primary" type="submit">Update Password</button></div>
    </form>
  </div>`
  document.body.appendChild(modal)
  modal.querySelectorAll('input[type="password"]').forEach(withPasswordToggle)
  const close = () => modal.remove()
  const strengthNames = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
  const strengthColors = ['#dc2626', '#dc2626', '#f59e0b', '#65a30d', '#16a34a']
  const showStrength = () => {
    const pw = modal.querySelector('#tcsms-new-password').value
    const passed = passwordRules.map(([, test]) => test(pw))
    const met = passed.filter(Boolean).length
    const level = !pw ? 0 : met === passed.length ? (pw.length >= 12 ? 4 : 3) : Math.min(2, met) // 3+ only when every rule passes
    modal.querySelectorAll('#tcsms-pw-rules li').forEach((li, index) => li.classList.toggle('ok', passed[index]))
    const fill = modal.querySelector('#tcsms-pw-fill')
    fill.style.width = `${pw ? (level + 1) * 20 : 0}%`
    fill.style.background = strengthColors[level]
    modal.querySelector('#tcsms-pw-label').textContent = pw ? strengthNames[level] : 'Enter a password'
  }
  modal.querySelector('#tcsms-new-password').addEventListener('input', showStrength)
  modal.querySelector('#tcsms-password-close').addEventListener('click', close)
  modal.querySelector('#tcsms-password-cancel').addEventListener('click', close)
  modal.querySelector('#tcsms-password-form').addEventListener('submit', async event => {
    event.preventDefault()
    const newPassword = document.getElementById('tcsms-new-password').value
    const repeated = document.getElementById('tcsms-confirm-password').value
    const errorLine = modal.querySelector('#tcsms-password-error')
    if (!passwordIsValid(newPassword)) return void (errorLine.textContent = 'The new password does not meet every rule above.')
    if (newPassword !== repeated) return void (errorLine.textContent = 'The two passwords do not match.')
    errorLine.textContent = ''
    // The current password is required too, so an unattended signed-in screen cannot be used to take over the account.
    const {
      data: { session }
    } = await supabase.auth.getSession()
    if (!(await confirmPassword(session?.user?.email, 'Enter your current password to change it.'))) return
    const { error } = await withBusy(modal.querySelector('[type="submit"]'), 'Updating…', () =>
      supabase.auth.updateUser({ password: newPassword })
    )
    if (error) return void (errorLine.textContent = describeError(error, 'Update password'))
    close()
    // Sign out so the new password is proven on the next login, not just assumed.
    await noticeDialog('Your password was updated. Sign in again with your new password.', { title: 'Password updated', okText: 'Sign in' })
    onSignOut()
  })
}

// Reminds users once per browser session (i.e. each fresh login) that they can change
// their password, instead of forcing it. sessionStorage clears on sign-out/new session.
function showLoginNotice() {
  if (sessionStorage.getItem('tcsms_password_notice_shown')) return
  sessionStorage.setItem('tcsms_password_notice_shown', 'true')
  window.setTimeout(() => {
    document.getElementById('tcsms-login-notice')?.remove()
    const modal = document.createElement('div')
    modal.id = 'tcsms-login-notice'
    modal.className = 'admin-modal'
    modal.innerHTML = `<div class="admin-modal-box" style="width:min(100%,400px);text-align:center">
      <p style="margin:0 0 16px;color:var(--ui-text);font-size:14px">Tip: you can change your password anytime from the profile menu in the top-right corner.</p>
      <div class="admin-actions" style="justify-content:center"><button type="button" class="admin-primary" id="tcsms-login-notice-ok">Got it</button></div>
    </div>`
    document.body.appendChild(modal)
    modal.querySelector('#tcsms-login-notice-ok').addEventListener('click', () => modal.remove())
  }, 300)
}
