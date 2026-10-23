import { confirmDialog } from '../shared/ui/dialog.js'

// Tracks typed-but-unsaved rows so a reload, sidebar click or class switch can't silently throw them away.
export function guardUnsaved(message = 'You have changes that are not saved yet. Discard them?') {
  const state = {
    dirty: false,
    mark() { state.dirty = true },
    clear() { state.dirty = false },
    async confirmDiscard() {
      if (!state.dirty) return true
      const discard = await confirmDialog(message, { title: 'Unsaved changes', confirmText: 'Discard changes', danger: true })
      if (discard) state.clear()
      return discard
    }
  }
  window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = '' } })
  return state
}
