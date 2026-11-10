import { escapeHtml } from '../shared/lib/html.js'

/**
 * Renders the exclusion note-taking panel for promotion reviews.
 * Allows registrars to log and update freeform notes justifying exclusion.
 */
export function renderExclusionNotesPanel(containerEl, { studentId, studentName, schoolYear, existingNote = '', onSave }) {
    if (!containerEl) return

    containerEl.innerHTML = `
        <div class="exclusion-notes-card p-4 bg-white border border-slate-200 rounded-lg shadow-sm mt-3">
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-semibold text-slate-800 text-sm">
                    Promotion Exclusion Note — <span class="text-indigo-600">${escapeHtml(studentName)}</span>
                </h4>
                <span class="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                    SY ${escapeHtml(schoolYear)}
                </span>
            </div>
            <p class="text-xs text-slate-500 mb-2">
                Log explicit reasons or administrative sanctions explaining why this student is excluded from automatic promotion.
            </p>
            <textarea 
                id="exclusion-note-input"
                class="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y min-h-[80px]"
                placeholder="Enter detailed exclusion note (e.g., Unresolved failing grades in Math, Pending disciplinary sanction)..."
            >${escapeHtml(existingNote)}</textarea>
            <div class="flex justify-end gap-2 mt-2">
                <button 
                    id="save-exclusion-note-btn"
                    type="button" 
                    class="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
                >
                    Save Exclusion Note
                </button>
            </div>
        </div>
    `

    const saveBtn = containerEl.querySelector('#save-exclusion-note-btn')
    const textarea = containerEl.querySelector('#exclusion-note-input')

    saveBtn?.addEventListener('click', async () => {
        const noteText = textarea.value.trim()
        if (onSave) {
            saveBtn.disabled = true
            saveBtn.textContent = 'Saving...'
            await onSave({ studentId, schoolYear, note: noteText })
            saveBtn.disabled = false
            saveBtn.textContent = 'Save Exclusion Note'
        }
    })
}