import { supabase } from './auth-client.js'

// Disables a button and swaps its label while an async action runs, restoring it after.
export async function withBusy(button, busyLabel, action) {
  const originalLabel = button.textContent;
  const originalDisabled = button.disabled;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    return await action();
  } finally {
    button.disabled = originalDisabled;
    button.textContent = originalLabel;
  }
}

export function mountSidebar(items, brand) {
  const icons = {
    '⌂': '<svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-6h6v6"></path></svg>',
    '▣': '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 8h8v8H8z"></path></svg>',
    '♙': '<svg viewBox="0 0 24 24"><path d="M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"></path><path d="m8 20 1-6 3-2 3 2 1 6"></path><path d="M6 20h12"></path></svg>',
    '▤': '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16"></rect><path d="M8 8h8M8 12h8M8 16h8"></path></svg>',
    '♧': '<svg viewBox="0 0 24 24"><path d="M12 20v-5"></path><path d="M12 15a4 4 0 1 0-3-6 4 4 0 1 0 3 6Z"></path><path d="M12 15a4 4 0 1 0 3-6 4 4 0 1 0-3 6Z"></path></svg>',
    '☷': '<svg viewBox="0 0 24 24"><path d="M4 6h4M12 6h8M4 12h8M16 12h4M4 18h4M12 18h8"></path></svg>'
  };
  const existing = document.querySelector('.app-sidebar, .side, .admin-sidebar');
  if (existing) existing.remove();
  document.body.classList.add('has-app-sidebar');
  const sidebar = document.createElement('aside');
  sidebar.className = 'app-sidebar';
  sidebar.innerHTML = `<img src="/assets/logo.png" alt="Thompson Christian School" class="sidebar-logo"><div class="sidebar-brand">${brand}</div><nav class="sidebar-nav"></nav>`;
  const nav = sidebar.querySelector('.sidebar-nav');
  items.forEach(item => {
    const link = item.tab ? document.createElement('button') : document.createElement('a');
    link.className = 'sidebar-link';
    link.innerHTML = `<span class="sidebar-icon" aria-hidden="true">${icons[item.icon] || icons['▣']}</span><span class="sidebar-label"></span>`;
    link.querySelector('.sidebar-label').textContent = item.label;
    link.dataset.icon = item.icon || '';
    if (item.tab) link.dataset.tab = item.tab;
    if (item.href) link.href = item.href;
    if (item.active) link.classList.add('active');
    if (item.tab) link.type = 'button';
    nav.appendChild(link);
  });
  nav.querySelectorAll('.sidebar-link').forEach((link, index) => {
    const icon = link.dataset.icon;
    if (icon) link.style.setProperty('--sidebar-icon', `'${icon}'`);
    link.style.setProperty('--sidebar-index', index);
  });
  const layout = document.querySelector('.layout');
  if (layout) layout.prepend(sidebar);
  else document.body.prepend(sidebar);
  return sidebar;
}

export function mountProfile(user, roleLabel, onSignOut) {
  const existing = document.querySelector('.floating-profile');
  if (existing) existing.remove();
  const profile = document.createElement('div');
  profile.className = 'floating-profile profile-menu';
  const name = user?.username || roleLabel;
  const safeName = String(name).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const safeRole = String(roleLabel).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  profile.innerHTML = `<button class="profile-toggle" aria-expanded="false"><span class="profile-avatar">${safeName.charAt(0).toUpperCase()}</span><span><strong>${safeName}</strong><small>${safeRole}</small></span><span class="profile-chevron">⌄</span></button><div class="profile-dropdown hidden"><button class="profile-edit"><span aria-hidden="true">✎</span> Edit Profile</button><button class="profile-change-password"><span aria-hidden="true">⚿</span> Change Password</button><button class="profile-signout"><span aria-hidden="true">↪</span> Sign Out</button></div>`;
  document.body.appendChild(profile);
  const toggle = profile.querySelector('.profile-toggle');
  const dropdown = profile.querySelector('.profile-dropdown');
  toggle.addEventListener('click', () => {
    dropdown.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')));
  });
  document.addEventListener('click', event => {
    if (profile.contains(event.target)) return;
    dropdown.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    dropdown.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
  });
  profile.querySelector('.profile-signout').addEventListener('click', onSignOut);
  profile.querySelector('.profile-edit').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    openProfileModal(user, roleLabel, profile);
  });
  profile.querySelector('.profile-change-password').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    openPasswordModal();
  });
  const avatar = profile.querySelector('.profile-avatar');
  const nameEl = profile.querySelector('.profile-toggle strong');
  const setAvatar = (url, firstName, lastName) => {
    avatar.textContent = '';
    if (url) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      image.width = 40;
      image.height = 40;
      avatar.appendChild(image);
      return;
    }
    const initials = [firstName, lastName].filter(Boolean).map(value => value.trim().charAt(0)).join('').toUpperCase();
    avatar.textContent = initials || safeName.charAt(0).toUpperCase();
  };
  const setDisplayName = (firstName, lastName) => {
    if (!firstName) return;
    const label = lastName ? `${firstName.trim()} ${lastName.trim().charAt(0).toUpperCase()}.` : firstName.trim();
    nameEl.textContent = label;
  };
  const loadAvatar = async () => {
    const profileQuery = user.student_id
      ? supabase.from('students').select('first_name,last_name,profile_picture_url').eq('student_id', user.student_id).maybeSingle()
      : Number(user.role_id) === 1
        ? supabase.from('admins').select('first_name,middle_name,last_name').eq('user_id', user.user_id).maybeSingle()
        : supabase.from('staff_profiles').select('first_name,last_name').eq('user_id', user.user_id).maybeSingle();
    const [profileResult, accountResult] = await Promise.all([
      profileQuery,
      supabase.from('users').select('profile_picture_url').eq('user_id', user.user_id).maybeSingle()
    ]);
    const data = profileResult.data || {};
    setAvatar(data.profile_picture_url || accountResult.data?.profile_picture_url, data.first_name, data.last_name);
    setDisplayName(data.first_name, data.last_name);
  };
  loadAvatar();
  showLoginNotice();
}

function openProfileModal(user, roleLabel, profile) {
  document.getElementById('tcsms-profile-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'tcsms-profile-modal';
  modal.className = 'admin-modal';
  const safeRole = String(roleLabel).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  modal.innerHTML = `<div class="admin-modal-box profile-modal-box">
    <div class="admin-modal-head"><h3>Edit Profile</h3><button type="button" id="tcsms-profile-close">x</button></div>
    <form id="tcsms-profile-form" class="profile-form" novalidate>
      <div><img id="tcsms-profile-preview" class="profile-picture-preview" alt="Current profile picture"><div class="profile-identity"><p class="profile-readonly"><b>Username:</b> ${String(user?.username || '-')}</p><p class="profile-readonly"><b>Role:</b> ${safeRole}</p></div></div>
      <label class="admin-full">First Name<input id="tcsms-profile-first-name" maxlength="80" required></label>
      <label class="admin-full">Middle Name<input id="tcsms-profile-middle-name" maxlength="80"></label>
      <label class="admin-full">Last Name<input id="tcsms-profile-last-name" maxlength="80" required></label>
      <label class="admin-full">Email<input id="tcsms-profile-email" type="email" data-current="${String(user?.email || '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))}" placeholder="${String(user?.email || '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))}" required></label>
      <div class="admin-full"><label>Profile Picture</label><div class="profile-picture-actions"><input id="tcsms-profile-picture" type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="admin-view" id="tcsms-profile-upload">Upload Image</button><button type="button" class="admin-view" id="tcsms-profile-camera">Use Camera</button><button type="button" class="admin-cancel" id="tcsms-profile-remove">Remove Existing</button></div><small>Images are cropped and saved as 50x50 pixels.</small></div>
      <div class="admin-actions"><button type="button" id="tcsms-profile-cancel" class="admin-cancel">Cancel</button><button class="admin-primary" type="submit">Confirm Changes</button></div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  const setProfilePicture = url => {
    const avatar = profile.querySelector('.profile-avatar');
    const preview = modal.querySelector('#tcsms-profile-preview');
    if (url) { preview.src = url; preview.classList.remove('profile-picture-placeholder'); }
    else { preview.removeAttribute('src'); preview.classList.add('profile-picture-placeholder'); preview.alt = 'No profile picture'; preview.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 50'%3E%3Ccircle cx='25' cy='25' r='25' fill='%23eaf1ff'/%3E%3Ctext x='25' y='32' text-anchor='middle' fill='%231756d1' font-size='22' font-family='Arial'%3E${String(user?.username || roleLabel).charAt(0).toUpperCase()}%3C/text%3E%3C/svg%3E`; }
    avatar.textContent = '';
    if (url) { const image = document.createElement('img'); image.src = url; image.alt = ''; image.width = 40; image.height = 40; avatar.appendChild(image); }
    else avatar.textContent = String(user?.username || roleLabel).charAt(0).toUpperCase();
  };
  const loadProfile = async () => {
    const profileQuery = user.student_id
      ? supabase.from('students').select('first_name,middle_name,last_name,profile_picture_url').eq('student_id', user.student_id).maybeSingle()
      : Number(user.role_id) === 1
        ? supabase.from('admins').select('first_name,middle_name,last_name').eq('user_id', user.user_id).maybeSingle()
        : supabase.from('staff_profiles').select('first_name,middle_name,last_name').eq('user_id', user.user_id).maybeSingle();
    const [profileResult, pictureResult] = await Promise.all([
      profileQuery,
      supabase.from('users').select('profile_picture_url').eq('user_id', user.user_id).maybeSingle()
    ]);
    if (profileResult.error) return window.alert(`Could not load your profile details: ${profileResult.error.message}`);
    if (pictureResult.error) return window.alert(`Could not load your profile picture: ${pictureResult.error.message}`);
    const data = profileResult.data || {};
    [['#tcsms-profile-first-name', data.first_name], ['#tcsms-profile-middle-name', data.middle_name], ['#tcsms-profile-last-name', data.last_name]].forEach(([selector, value]) => {
      const input = modal.querySelector(selector);
      input.dataset.current = value || '';
      input.placeholder = value || '';
      input.classList.toggle('has-value', Boolean(value));
    });
    const email = modal.querySelector('#tcsms-profile-email');
    email.classList.add('has-value');
    setProfilePicture(data.profile_picture_url || pictureResult.data?.profile_picture_url);
  };
  modal.querySelectorAll('#tcsms-profile-first-name, #tcsms-profile-middle-name, #tcsms-profile-last-name, #tcsms-profile-email').forEach(input => {
    input.addEventListener('input', () => input.classList.toggle('has-value', Boolean(input.value.trim())));
    input.addEventListener('focus', () => {
      if (!input.value && input.dataset.current) input.dataset.current = '';
    }, { once: false });
  });
  loadProfile();
  const close = () => modal.remove();
  modal.querySelector('#tcsms-profile-close').addEventListener('click', close);
  modal.querySelector('#tcsms-profile-cancel').addEventListener('click', close);
  modal.querySelector('#tcsms-profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const valueFor = selector => { const input = modal.querySelector(selector); return input.value.trim() || input.dataset.current || ''; };
    const firstName = valueFor('#tcsms-profile-first-name');
    const middleName = valueFor('#tcsms-profile-middle-name');
    const lastName = valueFor('#tcsms-profile-last-name');
    const email = valueFor('#tcsms-profile-email');
    if (!firstName || !lastName || !email) return window.alert('Enter your name and email.');
    const result = await confirmProfileChange(user.email, () => supabase.rpc('submit_profile_change', { p_first_name: firstName, p_middle_name: middleName || null, p_last_name: lastName, p_email: email }));
    if (!result) return;
    if (modal.profilePictureBlob) {
      const picture = modal.profilePictureBlob;
      const path = `users/${user.user_id}/${crypto.randomUUID()}-${picture.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const upload = await supabase.storage.from('profile-pictures').upload(path, picture, { upsert: false });
      if (upload.error) return window.alert(upload.error.message);
      const publicUrl = supabase.storage.from('profile-pictures').getPublicUrl(path).data.publicUrl;
      const pictureResult = await supabase.rpc('update_own_profile_picture', { p_url: publicUrl });
      if (pictureResult.error) return window.alert(pictureResult.error.message);
      setProfilePicture(publicUrl);
    }
    close();
    window.alert('Profile changes submitted for administrator approval.');
  });
  const cropImage = (source, name = 'profile.png') => new Promise(resolve => {
    const crop = document.createElement('div');
    crop.className = 'admin-modal';
    crop.innerHTML = `<div class="admin-modal-box profile-crop-box"><div class="admin-modal-head"><h3>Crop Profile Picture</h3><button type="button" data-crop-close>x</button></div><canvas width="240" height="240" id="tcsms-crop-canvas"></canvas><label>Zoom<input type="range" id="tcsms-crop-zoom" min="1" max="3" step="0.01" value="1"></label><label>Horizontal Position<input type="range" id="tcsms-crop-x" min="0" max="100" value="50"></label><label>Vertical Position<input type="range" id="tcsms-crop-y" min="0" max="100" value="50"></label><div class="admin-actions"><button type="button" class="admin-cancel" data-crop-cancel>Cancel</button><button type="button" class="admin-primary" data-crop-save>Use Cropped Image</button></div></div>`;
    document.body.appendChild(crop);
    const canvas = crop.querySelector('canvas'); const context = canvas.getContext('2d');
    const draw = () => { const zoom = Number(crop.querySelector('#tcsms-crop-zoom').value); const side = Math.min(source.width, source.height) / zoom; const left = (source.width - side) * Number(crop.querySelector('#tcsms-crop-x').value) / 100; const top = (source.height - side) * Number(crop.querySelector('#tcsms-crop-y').value) / 100; context.clearRect(0, 0, 240, 240); context.drawImage(source, left, top, side, side, 0, 0, 240, 240); };
    crop.querySelectorAll('input').forEach(input => input.addEventListener('input', draw)); draw();
    const close = () => { crop.remove(); resolve(null); };
    crop.querySelector('[data-crop-close]').onclick = crop.querySelector('[data-crop-cancel]').onclick = close;
    crop.querySelector('[data-crop-save]').onclick = () => canvas.toBlob(blob => { crop.remove(); resolve(new File([blob], name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' })); }, 'image/png');
  });
  const chooseImage = file => { if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return window.alert('Use PNG, JPG, or WEBP for the profile picture.'); const image = new Image(); image.onload = async () => { modal.profilePictureBlob = await cropImage(image, file.name); }; image.src = URL.createObjectURL(file); };
  modal.querySelector('#tcsms-profile-upload').onclick = () => modal.querySelector('#tcsms-profile-picture').click();
  modal.querySelector('#tcsms-profile-picture').onchange = event => chooseImage(event.target.files?.[0]);
  modal.querySelector('#tcsms-profile-camera').onclick = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ video: true }); const camera = document.createElement('div'); camera.className = 'admin-modal'; camera.innerHTML = `<div class="admin-modal-box camera-box"><div class="admin-modal-head"><h3>Take Profile Picture</h3><button type="button" data-camera-close>x</button></div><video autoplay playsinline style="width:100%"></video><div class="admin-actions"><button type="button" class="admin-cancel" data-camera-cancel>Cancel</button><button type="button" class="admin-primary" data-camera-capture>Capture</button></div></div>`; document.body.appendChild(camera); const video = camera.querySelector('video'); video.srcObject = stream; const stop = () => { stream.getTracks().forEach(track => track.stop()); camera.remove(); }; camera.querySelector('[data-camera-close]').onclick = camera.querySelector('[data-camera-cancel]').onclick = stop; camera.querySelector('[data-camera-capture]').onclick = async () => { const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0); const image = new Image(); image.onload = async () => { stop(); modal.profilePictureBlob = await cropImage(image); }; image.src = canvas.toDataURL('image/png'); }; } catch { window.alert('Camera access was not available.'); } };
  modal.querySelector('#tcsms-profile-remove').onclick = async () => { const result = await confirmProfileChange(user.email, () => supabase.rpc('remove_own_profile_picture')); if (result) { setProfilePicture(null); window.alert('Profile picture removed.'); } };
}

// Resolves true only after the signed-in user re-enters their own password correctly.
export function confirmPassword(email, message = 'Enter your password to continue.') {
  return new Promise(resolve => {
    const prompt = document.createElement('div'); prompt.className = 'admin-modal stack-above';
    prompt.innerHTML = `<div class="admin-modal-box" style="width:min(100%,420px)"><div class="admin-modal-head"><h3>Confirm Password</h3><button type="button" data-password-close>x</button></div><form data-password-form><p>${message}</p><input type="password" data-profile-password autocomplete="current-password" required><p class="login-hint" data-password-error style="color:#c0392b;margin:0" role="alert"></p><div class="admin-actions"><button type="button" class="admin-cancel" data-password-cancel>Cancel</button><button type="submit" class="admin-primary">Confirm</button></div></form></div>`;
    document.body.appendChild(prompt);
    const finish = value => { prompt.remove(); resolve(value); };
    prompt.querySelector('[data-password-close]').onclick = prompt.querySelector('[data-password-cancel]').onclick = () => finish(false);
    prompt.querySelector('[data-password-form]').onsubmit = async event => {
      event.preventDefault();
      const { error } = await supabase.auth.signInWithPassword({ email, password: prompt.querySelector('[data-profile-password]').value });
      if (error) { prompt.querySelector('[data-password-error]').textContent = 'Password is incorrect.'; return; }
      finish(true);
    };
    prompt.querySelector('[data-profile-password]').focus();
  });
}

function confirmProfileChange(email, action) {
  return new Promise(resolve => {
    const prompt = document.createElement('div'); prompt.className = 'admin-modal';
    prompt.innerHTML = `<div class="admin-modal-box" style="width:min(100%,420px)"><div class="admin-modal-head"><h3>Confirm Changes</h3><button type="button" data-password-close>x</button></div><p>Enter your password to confirm this change.</p><input type="password" data-profile-password autocomplete="current-password"><div class="admin-actions"><button type="button" class="admin-cancel" data-password-cancel>Cancel</button><button type="button" class="admin-primary" data-password-confirm>Confirm</button></div></div>`;
    document.body.appendChild(prompt);
    const close = () => { prompt.remove(); resolve(null); };
    prompt.querySelector('[data-password-close]').onclick = prompt.querySelector('[data-password-cancel]').onclick = close;
    prompt.querySelector('[data-password-confirm]').onclick = async () => { const password = prompt.querySelector('[data-profile-password]').value; if (!password) return window.alert('Enter your password.'); const confirmation = await supabase.auth.signInWithPassword({ email, password }); if (confirmation.error) return window.alert('Password verification failed.'); const result = await action(); prompt.remove(); resolve(result.error ? (window.alert(result.error.message), null) : result); };
    prompt.querySelector('[data-profile-password]').focus();
  });
}

function openPasswordModal() {
  document.getElementById('tcsms-password-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'tcsms-password-modal';
  modal.className = 'admin-modal';
  modal.innerHTML = `<div class="admin-modal-box" style="width:min(100%,420px)">
    <div class="admin-modal-head"><h3>Change Password</h3><button type="button" id="tcsms-password-close">x</button></div>
    <form id="tcsms-password-form">
      <label class="admin-full">New Password<input type="password" id="tcsms-new-password" minlength="8" required></label>
      <label class="admin-full">Confirm Password<input type="password" id="tcsms-confirm-password" minlength="8" required></label>
      <div class="admin-actions"><button type="button" id="tcsms-password-cancel" class="admin-cancel">Cancel</button><button class="admin-primary" type="submit">Update Password</button></div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#tcsms-password-close').addEventListener('click', close);
  modal.querySelector('#tcsms-password-cancel').addEventListener('click', close);
  modal.querySelector('#tcsms-password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const newPassword = document.getElementById('tcsms-new-password').value;
    const confirmPassword = document.getElementById('tcsms-confirm-password').value;
    if (newPassword.length < 8) return window.alert('Password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return window.alert('Passwords do not match.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return window.alert(error.message);
    close();
    window.alert('Password updated successfully.');
  });
}

// Reminds users once per browser session (i.e. each fresh login) that they can change
// their password, instead of forcing it. sessionStorage clears on sign-out/new session.
function showLoginNotice() {
  if (sessionStorage.getItem('tcsms_password_notice_shown')) return;
  sessionStorage.setItem('tcsms_password_notice_shown', 'true');
  window.setTimeout(() => {
    document.getElementById('tcsms-login-notice')?.remove();
    const modal = document.createElement('div');
    modal.id = 'tcsms-login-notice';
    modal.className = 'admin-modal';
    modal.innerHTML = `<div class="admin-modal-box" style="width:min(100%,400px);text-align:center">
      <p style="margin:0 0 16px;color:var(--ui-text);font-size:14px">Tip: you can change your password anytime from the profile menu in the top-right corner.</p>
      <div class="admin-actions" style="justify-content:center"><button type="button" class="admin-primary" id="tcsms-login-notice-ok">Got it</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#tcsms-login-notice-ok').addEventListener('click', () => modal.remove());
  }, 300);
}
