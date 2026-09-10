#!/usr/bin/env python3
"""
Extract text from a PDF, without poppler or any third-party library.

Written because the vendor's material arrives as PDFs — the BTECH guides and the
DA-7X2 user manual — and this machine has neither pdftotext nor a Python PDF
package. It handles the two shapes those files actually use:

  * Text as LITERAL strings — `(baofengtech.com) Tj` and `[(A)5(B)] TJ`.
    The user manual is entirely this.
  * Text as HEX strings through a subset font's /ToUnicode CMap — `<0102> Tj`.
    The V1.05 guides are entirely this.

Three traps, each of which produced an empty file before it was fixed:

  1. A PDF that uses only literal strings yields NOTHING if you write the hex
     path first and forget the literal one. Silence, not an error.
  2. Font resources are not always named /F1. This manual names them /R10, /R12
     and so on, so matching /F\\w+ finds no fonts and every glyph decodes to
     nothing.
  3. A /ToUnicode bfrange destination can be outside the BMP, and chr() throws
     on it — killing the whole document rather than one glyph.

Usage:  python3 tools/pdf-text.py file.pdf [--grep WORD]
"""
import re
import sys
import zlib

def objects(data):
    """object number -> raw body, for `N 0 obj … endobj`."""
    out = {}
    for m in re.finditer(rb'(\d+)\s+0\s+obj\b', data):
        end = data.find(b'endobj', m.end())
        out[int(m.group(1))] = data[m.end():end if end > 0 else len(data)]
    return out

def stream_of(body):
    m = re.search(rb'stream\r?\n', body)
    if not m:
        return None
    raw = body[m.end():body.find(b'endstream', m.end())]
    try:
        return zlib.decompress(raw)
    except Exception:
        return raw

def parse_cmap(text):
    """code -> unicode, from a /ToUnicode CMap's bfchar and bfrange sections."""
    cmap = {}
    for blk in re.findall(rb'beginbfchar(.*?)endbfchar', text, re.S):
        for src, dst in re.findall(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', blk):
            try:
                cmap[int(src, 16)] = bytes.fromhex(dst.decode()).decode('utf-16-be', 'replace')
            except ValueError:
                pass
    for blk in re.findall(rb'beginbfrange(.*?)endbfrange', text, re.S):
        for lo, hi, dst in re.findall(
                rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', blk):
            base = int(dst, 16)
            for i, code in enumerate(range(int(lo, 16), int(hi, 16) + 1)):
                value = base + i
                # Trap 3: a non-BMP destination must not abort the document.
                if 0 <= value < 0x110000:
                    cmap[code] = chr(value)
    return cmap

def unescape(raw):
    """PDF literal-string escapes."""
    out = bytearray()
    i = 0
    while i < len(raw):
        c = raw[i]
        if c == 0x5c and i + 1 < len(raw):          # backslash
            nxt = raw[i + 1]
            if nxt in b'nrtbf':
                out += {0x6e: b'\n', 0x72: b'\r', 0x74: b'\t',
                        0x62: b'\b', 0x66: b'\f'}[nxt]
                i += 2
                continue
            if 0x30 <= nxt <= 0x37:                 # octal
                digits = raw[i + 1:i + 4]
                m = re.match(rb'[0-7]{1,3}', digits)
                out.append(int(m.group(0), 8) & 0xFF)
                i += 1 + len(m.group(0))
                continue
            out.append(nxt)
            i += 2
            continue
        out.append(c)
        i += 1
    return bytes(out)

# Font selection, hex string, literal string, and the operators that end a line.
TOKENS = re.compile(
    rb'/([A-Za-z]\w*)\s+[\d.]+\s+Tf'          # 1: font  (trap 2: any name)
    rb'|<([0-9A-Fa-f\s]+)>\s*(?:Tj|TJ)'        # 2: hex string
    rb'|\(((?:\\.|[^\\()])*)\)'                # 3: literal string (trap 1)
    rb'|(T\*|Td|TD|ET)',                       # 4: line break
    re.S)

def extract(path):
    data = open(path, 'rb').read()
    objs = objects(data)

    font_cmap = {}
    for num, body in objs.items():
        m = re.search(rb'/ToUnicode\s+(\d+)\s+0\s+R', body)
        if m:
            s = stream_of(objs.get(int(m.group(1)), b''))
            if s:
                font_cmap[num] = parse_cmap(s)

    name_font = {}
    for body in objs.values():
        for name, ref in re.findall(rb'/([A-Za-z]\w*)\s+(\d+)\s+0\s+R', body):
            name_font[name.decode()] = int(ref)

    out = []
    for body in objs.values():
        if b'/ToUnicode' in body or b'/Type/Font' in body:
            continue
        s = stream_of(body)
        if not s or (b'Tj' not in s and b'TJ' not in s):
            continue
        cmap = {}
        for tok in TOKENS.finditer(s):
            if tok.group(1):
                cmap = font_cmap.get(name_font.get(tok.group(1).decode(), -1), {})
            elif tok.group(2):
                hexed = re.sub(rb'\s', b'', tok.group(2)).decode()
                # Two hex digits per code unless the font maps wider codes.
                out.append(''.join(cmap.get(int(hexed[i:i + 2], 16), '')
                                   for i in range(0, len(hexed) - 1, 2)))
            elif tok.group(3) is not None:
                raw = unescape(tok.group(3))
                # A literal string is NOT always plain text. Subset fonts encode
                # through their /ToUnicode CMap here too — this manual has fonts
                # where every glyph is unicode minus 0x1d, so taking the bytes at
                # face value yields "DQG" where the page says "and". Try the
                # CMap as 2-byte codes, then 1-byte, and only fall back to raw
                # bytes when neither maps anything.
                if cmap:
                    two = ''.join(cmap.get((raw[i] << 8) | raw[i + 1], '')
                                  for i in range(0, len(raw) - 1, 2))
                    if two.strip():
                        out.append(two)
                        continue
                    one = ''.join(cmap.get(b, '') for b in raw)
                    if one.strip():
                        out.append(one)
                        continue
                out.append(raw.decode('latin-1'))
            elif tok.group(4):
                out.append('\n')
    return re.sub(r'\n{3,}', '\n\n', ''.join(out))

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__.strip().splitlines()[-1])
        sys.exit(1)
    text = extract(sys.argv[1])
    if '--grep' in sys.argv:
        needle = sys.argv[sys.argv.index('--grep') + 1].lower()
        for line in text.split('\n'):
            if needle in line.lower():
                print(line.strip())
    else:
        print(text)
