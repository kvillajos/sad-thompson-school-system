import { printElement } from './print.js'
import { toast } from '../ui/ui-theme.js'

// Shows a print-ready element as a page in a window first. Nothing is saved until "Download PDF" is clicked;
// "Print" still opens the browser print dialog. html2pdf.js is loaded only when a PDF is actually made.
export function previewPdf(element, { title, filename, printClass }) {
  if (!element) throw new Error('A document element is required')
  document.getElementById('pdf-preview-modal')?.remove()
  const modal = document.createElement('div')
  modal.id = 'pdf-preview-modal'
  modal.className = 'admin-modal'
  modal.innerHTML = `<div class="admin-modal-box pdf-preview-box"><div class="admin-modal-head"><h3></h3><button type="button" data-pdf-close aria-label="Close">x</button></div><div class="pdf-preview-scroll"><div class="pdf-sheet"></div></div><div class="admin-actions"><button type="button" class="admin-cancel" data-pdf-cancel>Close</button><button type="button" class="admin-secondary" data-pdf-print>Print</button><button type="button" class="admin-primary" data-pdf-download>Download PDF</button></div></div>`
  modal.querySelector('h3').textContent = title
  const sheet = modal.querySelector('.pdf-sheet')
  sheet.innerHTML = element.innerHTML
  document.body.appendChild(modal)
  const close = () => modal.remove()
  modal.querySelector('[data-pdf-close]').onclick = modal.querySelector('[data-pdf-cancel]').onclick = close
  modal.querySelector('[data-pdf-print]').onclick = () => printElement(element, printClass)
  const download = modal.querySelector('[data-pdf-download]')
  download.onclick = async () => {
    download.disabled = true
    download.textContent = 'Preparing...'
    download.setAttribute('aria-busy', 'true')
    try {
      const { default: html2pdf } = await import('html2pdf.js')
      // html2pdf lays the source out in an A4-content-wide (~718px) box, so the 794px preview sheet would be cut
      // off on the right. Render a copy that takes the box's width instead.
      const source = sheet.cloneNode(true)
      Object.assign(source.style, { width: 'auto', padding: '0', boxShadow: 'none' })
      // html2pdf moves a block to the next page in whole 1046px steps but slices the canvas every
      // floor(canvas.width * 277/190) px; at the default 718.1px width those drift ~2px a page, so a moved
      // block's top border lands on the previous page. A 717.5px-wide capture (1435px at scale 2) slices at
      // exactly 2 x 1046. ponytail: tied to A4 + 10mm margins + scale 2; recompute if any of those change.
      const blob = await html2pdf().set({ margin: 10, filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, width: 717.5, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['.transcript-semester', '.signatures-section', 'table.doc-table tr'] } }).from(source).outputPdf('blob')
      // A plain download link instead of .save(): the popup .save() falls back to on iOS Safari is blocked after the await.
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(link.href), 60000)
    } catch {
      toast('Could not make the PDF. Use Print and choose "Save as PDF" as the printer instead.', 'error')
    } finally {
      download.disabled = false
      download.textContent = 'Download PDF'
      download.removeAttribute('aria-busy')
    }
  }
}

export const pdfName = (label, student) => `${label} - ${[student?.last_name, student?.first_name].filter(Boolean).join(', ') || 'Student'}.pdf`.replace(/[\\/:*?"<>|]/g, '')
