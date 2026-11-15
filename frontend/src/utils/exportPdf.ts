export function printCallBookPdf(title: string): void {
  const prevTitle = document.title
  document.title = `${title || 'CallbookMaker'} - 速查卡`
  window.print()
  window.setTimeout(() => {
    document.title = prevTitle
  }, 500)
}
