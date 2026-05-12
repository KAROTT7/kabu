export const upperFirst = (value: string): string => (value ? value[0].toUpperCase() + value.slice(1) : value)

export function safeWord(value: unknown): string {
  return String(value)
    .replace(/[{}]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => (index > 0 ? upperFirst(word.toLowerCase()) : word.toLowerCase()))
    .join('')
}

export function pathParamName(segment: unknown): string {
  const value = String(segment || '').trim()
  const braceMatch = value.match(/^\{(.+)\}$/)
  if (braceMatch) return braceMatch[1]
  if (value.startsWith(':') && value.length > 1) return value.slice(1)
  return ''
}

function pathSegmentToNamePart(segment: string): string {
  const paramName = pathParamName(segment)
  if (paramName) return `By${upperFirst(safeWord(paramName))}`
  return upperFirst(safeWord(segment))
}

export function operationName(method: string, url: string): string {
  const parts = url.split('/').filter(Boolean).map(pathSegmentToNamePart).filter(Boolean)
  return `${method.toLowerCase()}${parts.join('')}`
}
