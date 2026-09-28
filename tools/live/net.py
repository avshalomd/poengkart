"""HTTP for the live watch, through curl.

curl rather than urllib: the python.org builds on macOS ship without a CA
bundle, and curl is on every runner and every Mac already. A fetch retries
twice on a network error or a 5xx, so one hiccup never reads as "the county
took the page down"; a 4xx is an answer and is returned as one.
"""
import os
import subprocess
import tempfile
import time
from dataclasses import dataclass, field

#: Honest about who is asking, and still a browser string, because two county
#: CMSs answer a bare bot user-agent with a challenge page.
UA = 'Mozilla/5.0 (compatible; PoengkartSourceWatch/1.0; +https://poengkart.no/)'
TIMEOUT = 60


@dataclass
class Response:
    url: str                       # the URL asked for
    status: int                    # 0 when the request never got an answer
    body: bytes = b''
    headers: dict = field(default_factory=dict)   # lower-case names, last value wins
    final_url: str = ''
    error: str = ''

    @property
    def ok(self):
        return 200 <= self.status < 300

    @property
    def content_type(self):
        return self.headers.get('content-type', '').split(';')[0].strip().lower()

    def text(self):
        return self.body.decode('utf-8', errors='replace')


def _parse_headers(raw):
    """The last response's headers from curl -D (redirects write several blocks)."""
    blocks = [b for b in raw.replace('\r\n', '\n').split('\n\n') if b.strip()]
    if not blocks:
        return {}
    out = {}
    for line in blocks[-1].split('\n')[1:]:
        if ':' in line:
            k, v = line.split(':', 1)
            out[k.strip().lower()] = v.strip()
    return out


def fetch(url, *, method='GET', data=None, headers=None, retries=2, timeout=TIMEOUT):
    """GET (or POST `data`) `url`; never raises for HTTP or network failures."""
    last = None
    for attempt in range(retries + 1):
        with tempfile.TemporaryDirectory() as tmp:
            body_f, head_f = os.path.join(tmp, 'body'), os.path.join(tmp, 'head')
            cmd = ['curl', '-sS', '-L', '--max-redirs', '5', '--compressed',
                   '--max-time', str(timeout), '-A', UA, '-o', body_f, '-D', head_f,
                   '-w', '%{http_code} %{url_effective}', '-X', method]
            for k, v in (headers or {}).items():
                cmd += ['-H', f'{k}: {v}']
            if data is not None:
                data_f = os.path.join(tmp, 'data')
                with open(data_f, 'wb') as fh:
                    fh.write(data if isinstance(data, bytes) else data.encode())
                cmd += ['--data-binary', '@' + data_f]
            cmd.append(url)
            r = subprocess.run(cmd, capture_output=True, text=True)
            code, _, final = (r.stdout or '000 ').partition(' ')
            status = int(code) if code.isdigit() else 0
            body = open(body_f, 'rb').read() if os.path.exists(body_f) else b''
            hdrs = _parse_headers(open(head_f, encoding='latin-1').read()) if os.path.exists(head_f) else {}
            last = Response(url, status, body, hdrs, final or url,
                            (r.stderr or '').strip() if r.returncode else '')
        if last.status and last.status < 500:
            return last
        if attempt < retries:
            time.sleep(3 * (attempt + 1))
    return last
