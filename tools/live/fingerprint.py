"""What a document says, as one hash, so a re-upload is not mistaken for news.

The bytes a county serves change without the figures changing: a PDF is
re-exported with new metadata, a CMS page carries a fresh nonce and a new
«Sist endret» stamp, the sources/ copy of a file had its author fields
stripped. Comparing SHA-256 of bytes would call every one of those new. The
fingerprint is the SHA-256 of the document's content instead:

  pdf   the text of every page (pdfplumber), whitespace collapsed
  xlsx  every sheet's cell values
  html  the page's <h1> and the text of every <table>, whitespace collapsed
  json  a Power BI query result: its decoded rows, sorted (powerbi.rows)

Two files with the same fingerprint carry the same figures; a correction of
one cell changes it.
"""
import hashlib
import io
import json
import re


def _h(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def _squash(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def pdf_pages(body):
    import pdfplumber
    with pdfplumber.open(io.BytesIO(body)) as pdf:
        return [_squash(p.extract_text() or '') for p in pdf.pages]


def html_tables(body):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(body, 'lxml')
    parts = [_squash(h.get_text(' ')) for h in soup.find_all('h1')]
    parts += [_squash(t.get_text(' ')) for t in soup.find_all('table')]
    return parts


def xlsx_cells(body):
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(body), read_only=True, data_only=True)
    out = []
    for ws in wb.worksheets:
        out.append('#' + ws.title)
        for row in ws.iter_rows(values_only=True):
            out.append('\t'.join('' if v is None else str(v) for v in row))
    return out


def environment():
    """The versions of every library a fingerprint depends on: a cache of
    fingerprints is only good for the versions that computed it."""
    from importlib.metadata import version, PackageNotFoundError
    out = []
    for pkg in ('pdfplumber', 'pdfminer-six', 'beautifulsoup4', 'lxml', 'openpyxl'):
        try:
            out.append(f'{pkg}=={version(pkg)}')
        except PackageNotFoundError:
            out.append(f'{pkg}==?')
    return ' '.join(out)


def kind_of(name):
    ext = name.rsplit('.', 1)[-1].lower()
    return {'htm': 'html', 'aspx': 'html'}.get(ext, ext)


def fingerprint(body, kind):
    """The content hash of `body`; kind is pdf, html, xlsx or json."""
    if kind == 'pdf':
        return _h('\f'.join(pdf_pages(body)))
    if kind == 'html':
        # a CMS reorders its tables between saves; the set of tables is the content
        return _h('\n'.join(sorted(html_tables(body))))
    if kind == 'xlsx':
        return _h('\n'.join(xlsx_cells(body)))
    if kind == 'json':
        from live import powerbi
        rows = powerbi.rows(json.loads(body))
        return _h(json.dumps(sorted(rows[1], key=lambda r: [str(c) for c in r]),
                             ensure_ascii=False))
    return hashlib.sha256(body).hexdigest()
