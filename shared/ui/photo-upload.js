import { supabase } from '../lib/auth-client.js'
import { describeError } from '../lib/errors.js'
import { toast } from './ui-theme.js'

export function mountPhotoUpload(host, { userId, studentId, onSaved }) {
  if (!host) throw new Error('Profile photo upload host was not found')
  const targetId = studentId || userId
  if (!targetId) throw new Error('Profile photo upload requires a user or student ID')

  host.innerHTML =
    '<input type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="admin-view">Change photo</button>'
  const picker = host.querySelector('input[type="file"]')
  const button = host.querySelector('button')
  button.onclick = () => picker.click()
  picker.onchange = async () => {
    const file = picker.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      picker.value = ''
      return toast('Choose a PNG, JPG, or WEBP image up to 3 MB.', 'error')
    }

    button.disabled = true
    button.textContent = 'Uploading…'
    let publicUrl
    try {
      const folder = studentId ? String(studentId) : `users/${userId}`
      const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${folder}/${crypto.randomUUID()}-${filename}`
      const { error: uploadError } = await supabase.storage.from('profile-pictures').upload(path, file, { upsert: false })
      if (uploadError) throw uploadError

      publicUrl = supabase.storage.from('profile-pictures').getPublicUrl(path).data.publicUrl
      const { error } = await supabase.rpc('staff_update_profile_picture', { p_user_id: userId, p_url: publicUrl })
      if (error) throw error
    } catch (error) {
      toast(describeError(error, 'Save photo'), 'error')
      return
    } finally {
      button.disabled = false
      button.textContent = 'Change photo'
    }

    picker.value = ''
    toast('Profile picture updated.')
    onSaved?.(publicUrl)
  }
}
