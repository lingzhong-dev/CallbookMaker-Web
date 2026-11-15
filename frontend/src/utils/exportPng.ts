import { toPng } from 'html-to-image'

function safeFilename(name: string): string {
  return (name || 'live-call-book')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 64)
}

export async function exportQuickRefPng(element: HTMLElement, title: string): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    await document.fonts.ready
  }

  const rect = element.getBoundingClientRect()
  const width = Math.max(760, Math.ceil(Math.max(element.scrollWidth, rect.width)))
  const height = Math.ceil(Math.max(element.scrollHeight, rect.height))

  const dataUrl = await toPng(element, {
    pixelRatio: 2.5,
    width,
    height,
    backgroundColor: '#ffffff',
    cacheBust: true,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      margin: '0'
    }
  })

  const link = document.createElement('a')
  link.download = `${safeFilename(title)}-call-card.png`
  link.href = dataUrl
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
