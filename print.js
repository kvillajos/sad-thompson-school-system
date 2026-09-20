export function printElement(element, className) {
  if (!element) throw new Error('A print element is required')
  document.body.classList.add(className)
  try {
    window.print()
  } finally {
    document.body.classList.remove(className)
  }
}
