export interface HighlightPart {
  text: string
  highlight: boolean
}

export function splitHighlightParts(text: string, keyword: string): HighlightPart[] {
  if (!keyword) return [{ text, highlight: false }]

  const parts: HighlightPart[] = []
  const lower = text.toLowerCase()
  const kw = keyword.toLowerCase()
  let pos = 0

  while (pos < text.length) {
    const idx = lower.indexOf(kw, pos)
    if (idx === -1) {
      parts.push({ text: text.slice(pos), highlight: false })
      break
    }
    if (idx > pos) {
      parts.push({ text: text.slice(pos, idx), highlight: false })
    }
    parts.push({
      text: text.slice(idx, idx + keyword.length),
      highlight: true,
    })
    pos = idx + keyword.length
  }

  return parts.length ? parts : [{ text, highlight: false }]
}

export function clearSearchHighlights(container: HTMLElement) {
  container.querySelectorAll('mark.search-highlight').forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
    parent.normalize()
  })
}

export function highlightSearchInElement(
  container: HTMLElement,
  keyword: string,
  targetMatchIndex = 0,
): HTMLElement | null {
  if (!keyword.trim()) return null

  clearSearchHighlights(container)

  const kw = keyword.toLowerCase()
  const marks: HTMLElement[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  let node = walker.nextNode()
  while (node) {
    if (node.nodeValue?.trim()) {
      textNodes.push(node as Text)
    }
    node = walker.nextNode()
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || ''
    const textLower = text.toLowerCase()
    let pos = 0
    const fragments: (string | HTMLElement)[] = []
    let changed = false

    while (pos < text.length) {
      const idx = textLower.indexOf(kw, pos)
      if (idx === -1) {
        fragments.push(text.slice(pos))
        break
      }

      changed = true
      if (idx > pos) fragments.push(text.slice(pos, idx))

      const mark = document.createElement('mark')
      mark.className = 'search-highlight'
      mark.textContent = text.slice(idx, idx + keyword.length)
      mark.dataset.searchMatch = String(marks.length)
      fragments.push(mark)
      marks.push(mark)
      pos = idx + keyword.length
    }

    if (!changed) continue

    const parent = textNode.parentNode
    if (!parent) continue

    const ref = textNode
    for (const fragment of fragments) {
      if (typeof fragment === 'string') {
        parent.insertBefore(document.createTextNode(fragment), ref)
      } else {
        parent.insertBefore(fragment, ref)
      }
    }
    parent.removeChild(textNode)
  }

  const target = marks[targetMatchIndex] ?? marks[0] ?? null
  if (target) {
    target.classList.add('search-highlight--active')
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return target
}
