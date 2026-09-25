import { printElement } from './print.js'

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
    try {
      const { default: html2pdf } = await import('html2pdf.js')
      await html2pdf().set({ margin: 10, filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(sheet).save()
    } catch (error) {
      window.alert(`Could not make the PDF: ${error.message}`)
    } finally {
      download.disabled = false
      download.textContent = 'Download PDF'
    }
  }
}

export const pdfName = (label, student) => `${label} - ${[student?.last_name, student?.first_name].filter(Boolean).join(', ') || 'Student'}.pdf`.replace(/[\\/:*?"<>|]/g, '')
