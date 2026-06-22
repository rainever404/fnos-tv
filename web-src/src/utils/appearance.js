export const CARD_STYLE_STORAGE_KEY = 'fnos-tv:card-style'

export const DEFAULT_CARD_STYLE = {
  rating: true,
  watched: true,
  resolution: true
}

export function loadCardStyle() {
  try {
    const raw = localStorage.getItem(CARD_STYLE_STORAGE_KEY)
    if (!raw) {
      return {...DEFAULT_CARD_STYLE}
    }
    const parsed = JSON.parse(raw)
    return {
      rating: parsed?.rating !== false,
      watched: parsed?.watched !== false,
      resolution: parsed?.resolution !== false
    }
  } catch {
    return {...DEFAULT_CARD_STYLE}
  }
}

export function saveCardStyle(style) {
  const next = {
    ...DEFAULT_CARD_STYLE,
    ...(style || {})
  }
  localStorage.setItem(CARD_STYLE_STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('fnos-tv:set-card-style', {
    detail: next
  }))
  return next
}
