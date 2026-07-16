import { includesNormalized } from './textNormalize'

export function matchesSearch(image, query) {
  if (!query) return true
  const scalarFields = [image.name, image.tag, image.file]
  const arrayFields = [image.emotion, image.situation]

  const inScalar = scalarFields.some(f => includesNormalized(f, query))
  if (inScalar) return true

  return arrayFields.some(arr =>
    Array.isArray(arr) && arr.some(v => includesNormalized(v, query))
  )
}

export function matchesFacetFilters(image, selected) {
  const emotion = (selected && selected.emotion) || []
  const situation = (selected && selected.situation) || []

  const emotionOk = emotion.length === 0 ||
    (Array.isArray(image.emotion) && image.emotion.some(e => emotion.includes(e)))
  const situationOk = situation.length === 0 ||
    (Array.isArray(image.situation) && image.situation.some(s => situation.includes(s)))

  return emotionOk && situationOk
}
