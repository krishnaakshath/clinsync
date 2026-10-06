// Minimal, strict XML support for the Tebra (Kareo) SOAP connector.
//
// Building: every value interpolated into a SOAP envelope goes through
// escapeXml() -- credentials and search input included -- so a value like
// `pw</Password><User>x</User>` can't inject elements.
//
// Parsing: a small non-validating parser that understands exactly what a
// WCF SOAP response needs (elements, attributes, text, the five predefined
// entities, numeric character references, CDATA, comments, processing
// instructions). It rejects DOCTYPE outright (no entity expansion / XXE
// surface) and throws on anything malformed rather than guessing.
// Namespace prefixes are stripped from element names (`s:Body` -> `Body`);
// the connector only ever looks elements up by local name.

export interface XmlElement {
  name: string // local name, prefix stripped
  attributes: Record<string, string> // raw qualified attribute names
  children: XmlElement[]
  text: string // concatenated direct text content (entities decoded)
}

// Characters outside the XML 1.0 `Char` production can't be represented at
// all (not even as character references), so they're dropped.
const ILLEGAL_XML_CHARS = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu

export function escapeXml(value: string): string {
  return value
    .replace(ILLEGAL_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(`XML parse error: ${message}`)
    this.name = 'XmlParseError'
  }
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.\-]*(?::[A-Za-z_][A-Za-z0-9_.\-]*)?$/
const PREDEFINED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decodeEntities(raw: string): string {
  return raw.replace(/&([^;&\s]*);?/g, (match, body: string) => {
    if (!match.endsWith(';')) throw new XmlParseError('unterminated entity reference')
    if (body in PREDEFINED) return PREDEFINED[body]
    let code: number | null = null
    if (/^#x[0-9A-Fa-f]+$/.test(body)) code = parseInt(body.slice(2), 16)
    else if (/^#[0-9]+$/.test(body)) code = parseInt(body.slice(1), 10)
    if (code === null) throw new XmlParseError(`unknown entity &${body};`)
    if (code > 0x10ffff) throw new XmlParseError('character reference out of range')
    return String.fromCodePoint(code)
  })
}

function localName(qname: string): string {
  const i = qname.indexOf(':')
  return i === -1 ? qname : qname.slice(i + 1)
}

export function parseXml(input: string): XmlElement {
  const src = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  let pos = 0
  const stack: { qname: string; el: XmlElement }[] = []
  let root: XmlElement | null = null

  const fail = (msg: string): never => { throw new XmlParseError(`${msg} at offset ${pos}`) }

  while (pos < src.length) {
    const lt = src.indexOf('<', pos)
    const textEnd = lt === -1 ? src.length : lt
    if (textEnd > pos) {
      const rawText = src.slice(pos, textEnd)
      if (stack.length === 0) {
        if (rawText.trim() !== '') fail('text outside the root element')
      } else {
        stack[stack.length - 1].el.text += decodeEntities(rawText)
      }
      pos = textEnd
      continue
    }

    // pos is at '<'
    if (src.startsWith('<?', pos)) {
      const end = src.indexOf('?>', pos + 2)
      if (end === -1) fail('unterminated processing instruction')
      pos = end + 2
    } else if (src.startsWith('<!--', pos)) {
      const end = src.indexOf('-->', pos + 4)
      if (end === -1) fail('unterminated comment')
      pos = end + 3
    } else if (src.startsWith('<![CDATA[', pos)) {
      if (stack.length === 0) fail('CDATA outside the root element')
      const end = src.indexOf(']]>', pos + 9)
      if (end === -1) fail('unterminated CDATA section')
      stack[stack.length - 1].el.text += src.slice(pos + 9, end)
      pos = end + 3
    } else if (src.startsWith('<!', pos)) {
      fail('DOCTYPE and other declarations are not allowed')
    } else if (src.startsWith('</', pos)) {
      const end = src.indexOf('>', pos + 2)
      if (end === -1) fail('unterminated end tag')
      const qname = src.slice(pos + 2, end).trim()
      const open = stack.pop()
      if (!open) fail(`unexpected end tag </${qname}>`)
      if (open!.qname !== qname) fail(`mismatched end tag </${qname}> for <${open!.qname}>`)
      pos = end + 1
    } else {
      // Start tag. Scan to the closing '>' while respecting quoted attribute values.
      let i = pos + 1
      let quote: string | null = null
      while (i < src.length) {
        const ch = src[i]
        if (quote) { if (ch === quote) quote = null } else if (ch === '"' || ch === "'") quote = ch
        else if (ch === '>') break
        else if (ch === '<') fail('unexpected < inside a tag')
        i++
      }
      if (i >= src.length) fail('unterminated start tag')
      let inner = src.slice(pos + 1, i)
      const selfClosing = inner.endsWith('/')
      if (selfClosing) inner = inner.slice(0, -1)
      const nameMatch = inner.match(/^([^\s/>]+)/)
      if (!nameMatch || !NAME_RE.test(nameMatch[1])) fail('invalid element name')
      const qname = nameMatch![1]
      const attributes: Record<string, string> = {}
      const attrSrc = inner.slice(qname.length)
      const attrRe = /\s+([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/gy
      let consumed = 0
      let m: RegExpExecArray | null
      while ((m = attrRe.exec(attrSrc)) !== null) {
        if (!NAME_RE.test(m[1])) fail('invalid attribute name')
        const rawValue = m[3] ?? m[4] ?? ''
        if (rawValue.includes('<')) fail('< in attribute value')
        attributes[m[1]] = decodeEntities(rawValue)
        consumed = attrRe.lastIndex
      }
      if (attrSrc.slice(consumed).trim() !== '') fail('malformed attributes')

      const el: XmlElement = { name: localName(qname), attributes, children: [], text: '' }
      if (stack.length === 0) {
        if (root) fail('more than one root element')
        root = el
      } else {
        stack[stack.length - 1].el.children.push(el)
      }
      if (!selfClosing) stack.push({ qname, el })
      pos = i + 1
    }
  }

  if (stack.length > 0) fail(`unclosed element <${stack[stack.length - 1].qname}>`)
  if (!root) fail('no root element')
  return root!
}

export function child(el: XmlElement | null | undefined, name: string): XmlElement | null {
  return el?.children.find((c) => c.name === name) ?? null
}

export function childrenNamed(el: XmlElement | null | undefined, name: string): XmlElement[] {
  return el ? el.children.filter((c) => c.name === name) : []
}

/** Text of the first child named `name`, or null if there is no such child. */
export function childText(el: XmlElement | null | undefined, name: string): string | null {
  const c = child(el, name)
  return c ? c.text : null
}
