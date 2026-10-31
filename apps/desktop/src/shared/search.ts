export interface SearchTextRange {
  start: number
  end: number
}

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}

export function findSearchTextRanges(text: string, query: string): SearchTextRange[] {
  const normalizedQuery = normalizeSearchText(query.trim())
  if (!normalizedQuery) return []

  let normalizedText = ''
  const starts: number[] = []
  const ends: number[] = []
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index)
    if (codePoint === undefined) break
    const original = String.fromCodePoint(codePoint)
    const normalized = normalizeSearchText(original)
    normalizedText += normalized
    for (let offset = 0; offset < normalized.length; offset += 1) {
      starts.push(index)
      ends.push(index + original.length)
    }
    index += original.length
  }

  const ranges: SearchTextRange[] = []
  let cursor = 0
  let matchIndex = normalizedText.indexOf(normalizedQuery, cursor)
  while (matchIndex >= 0) {
    const matchEnd = matchIndex + normalizedQuery.length - 1
    ranges.push({ start: starts[matchIndex], end: ends[matchEnd] })
    cursor = matchIndex + normalizedQuery.length
    matchIndex = normalizedText.indexOf(normalizedQuery, cursor)
  }
  return ranges
}
