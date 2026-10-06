import { describe, it, expect } from 'vitest'
import { escapeXml, parseXml, child, childText, childrenNamed } from '@/connectors/xml'

describe('escapeXml', () => {
  it('escapes all five XML special characters', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;')
  })

  it('neutralises an element-injection attempt', () => {
    const hostile = 'pw</Password><User>admin</User><Password>'
    const escaped = escapeXml(hostile)
    expect(escaped).not.toContain('<')
    expect(escaped).not.toContain('>')
    // Round-trips back to the original string when embedded and parsed.
    const doc = parseXml(`<Password>${escaped}</Password>`)
    expect(doc.text).toBe(hostile)
  })

  it('strips characters that are illegal in XML 1.0', () => {
    expect(escapeXml('a\u0000b\u0008c\u001Fd')).toBe('abcd')
    expect(escapeXml('tab\there\nnl')).toBe('tab\there\nnl')
  })
})

describe('parseXml', () => {
  it('parses nested elements, strips namespace prefixes and decodes entities', () => {
    const doc = parseXml('<?xml version="1.0"?><s:Env xmlns:s="urn:x"><s:Body><A>1 &lt; 2 &amp;&amp; 3 &gt; 2 &#65;&#x42;</A><B i:nil="true"/><!-- c --><C><![CDATA[<raw> & stuff]]></C></s:Body></s:Env>')
    expect(doc.name).toBe('Env')
    const body = child(doc, 'Body')!
    expect(childText(body, 'A')).toBe('1 < 2 && 3 > 2 AB')
    expect(childText(body, 'B')).toBe('')
    expect(child(body, 'B')!.attributes['i:nil']).toBe('true')
    expect(childText(body, 'C')).toBe('<raw> & stuff')
    expect(childText(body, 'Missing')).toBeNull()
  })

  it('returns repeated children in order', () => {
    const doc = parseXml('<L><I>1</I><I>2</I><J/><I>3</I></L>')
    expect(childrenNamed(doc, 'I').map((n) => n.text)).toEqual(['1', '2', '3'])
  })

  it.each([
    ['mismatched tags', '<a><b></a></b>'],
    ['unclosed root', '<a><b></b>'],
    ['unknown entity', '<a>&nbsp;</a>'],
    ['bare ampersand', '<a>fish & chips</a>'],
    ['two roots', '<a/><b/>'],
    ['text outside root', 'junk<a/>'],
    ['empty input', ''],
    ['html error page', '<html><body><p>Service Unavailable<br></body></html>'],
  ])('rejects malformed input: %s', (_label, input) => {
    expect(() => parseXml(input)).toThrow()
  })

  it('refuses DOCTYPE declarations (no entity expansion / XXE surface)', () => {
    expect(() => parseXml('<!DOCTYPE a [<!ENTITY x "boom">]><a>&x;</a>')).toThrow()
  })
})
