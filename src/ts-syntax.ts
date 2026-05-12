import { pathParamName } from './naming.js'

export function isValidTsIdentifier(name: string): boolean {
  return /^[$A-Z_][0-9A-Z_$]*$/i.test(name)
}

export function literalToTs(value: any): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return `'${quoteForSingleQuoteString(value)}'`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return 'unknown'
}

export function quoteForSingleQuoteString(value: unknown): string {
  return String(value).replace(/[\\'\n\r\t\b\f\v\u2028\u2029]/g, char => {
    switch (char) {
      case '\\':
        return '\\\\'
      case "'":
        return "\\'"
      case '\n':
        return '\\n'
      case '\r':
        return '\\r'
      case '\t':
        return '\\t'
      case '\b':
        return '\\b'
      case '\f':
        return '\\f'
      case '\v':
        return '\\v'
      case '\u2028':
        return '\\u2028'
      case '\u2029':
        return '\\u2029'
      default:
        return char
    }
  })
}

export function escapeTemplateLiteralPart(value: unknown): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

export function tsObjectKey(key: unknown): string {
  const value = String(key)
  return isValidTsIdentifier(value) ? value : `'${quoteForSingleQuoteString(value)}'`
}

export function objectAccess(objectName: string, key: string): string {
  return isValidTsIdentifier(key) ? `${objectName}.${key}` : `${objectName}[${tsObjectKey(key)}]`
}

export function pathToTemplateLiteral(url: string, paramsObjectName: string): string {
  const parts = url.split('/').map(segment => {
    const paramName = pathParamName(segment)
    if (paramName) return `\${${objectAccess(paramsObjectName, paramName)}}`
    return escapeTemplateLiteralPart(segment)
  })
  return `\`${parts.join('/')}\``
}
