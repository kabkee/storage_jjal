export function normalizeKorean(str) {
  if (!str) return ''
  return str.normalize('NFC').toLowerCase()
}

export function includesNormalized(haystack, needle) {
  if (!haystack || !needle) return false
  return normalizeKorean(haystack).includes(normalizeKorean(needle))
}
