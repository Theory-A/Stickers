"""Cache publisher-provided social previews for the fixed tt.json directory.
Run from the repo root: python3 scripts/fetch-tt-previews.py
No scraping happens in the browser or on user-supplied URLs.
"""
import concurrent.futures
import html.parser
import ipaddress
import json
from pathlib import Path
import subprocess
import urllib.parse
import tempfile
from email.parser import BytesParser

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'people-previews'
OUT.mkdir(parents=True, exist_ok=True)


def public_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Not a public web URL')
    if '.' not in parsed.hostname or parsed.hostname.endswith(('.local', '.localhost', '.internal')):
        raise ValueError('Not a public hostname')
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError('Not a public address')
    return url


def read_url(url, limit):
    with tempfile.TemporaryDirectory(prefix='tt-preview-') as temporary:
        body = Path(temporary) / 'body'
        headers = Path(temporary) / 'headers'
        # curl handles the HTTP proxy's chunked transfers reliably and retries failures.
        result = subprocess.run(['curl', '--fail', '--location', '--max-redirs', '5',
            '--proto', '=https,http', '--proto-redir', '=https,http', '--retry', '1',
            '--max-time', '20', '--max-filesize', str(limit), '--silent', '--show-error',
            '--user-agent', 'Mozilla/5.0 (compatible; TabThursdayPreview/1.0)',
            '--dump-header', str(headers), '--output', str(body), '--write-out', '%{url_effective}',
            public_url(url)], check=True, capture_output=True, timeout=45)
        data = body.read_bytes()
        if len(data) > limit:
            raise ValueError('Response too large')
        blocks = [block for block in headers.read_bytes().split(b'\r\n\r\n') if block.startswith(b'HTTP/')]
        header = BytesParser().parsebytes(blocks[-1].split(b'\r\n', 1)[1])
        return data, result.stdout.decode(), header


class Metadata(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.icon = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            key = attrs.get('property', attrs.get('name', '')).lower()
            if key and attrs.get('content'):
                self.meta.setdefault(key, attrs['content'])
        if tag == 'link' and 'icon' in attrs.get('rel', '').lower() and attrs.get('href'):
            self.icon = self.icon or attrs['href']


def fetch_preview(link):
    result = {'url': link['url'], 'status': 'fetch_failed'}
    try:
        page, final_url, headers = read_url(link['url'], 2_500_000)
        parser = Metadata()
        parser.feed(page.decode(headers.get_content_charset() or 'utf-8', errors='replace'))
        meta = parser.meta
        result.update(status='no_image', title=meta.get('og:title') or meta.get('twitter:title'),
                      description=meta.get('og:description') or meta.get('description'), siteName=meta.get('og:site_name'))
        image_url = meta.get('og:image:secure_url') or meta.get('og:image') or meta.get('twitter:image') or meta.get('twitter:image:src')
        if image_url:
            image_url = urllib.parse.urljoin(final_url, image_url)
            raw, _, _ = read_url(image_url, 8_000_000)
            destination = OUT / (link['id'] + '.webp')
            # Decode and re-encode actual raster images; never publish downloaded HTML/SVG.
            subprocess.run(['node', '--input-type=module', '-e',
                "import sharp from 'sharp'; const chunks=[]; for await(const c of process.stdin) chunks.push(c); await sharp(Buffer.concat(chunks), {limitInputPixels:40000000}).rotate().resize(960,600,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(process.argv[1]);",
                str(destination)], input=raw, cwd=ROOT, check=True, capture_output=True, timeout=20)
            result.update(status='found', image=f'/people-previews/{destination.name}', sourceImage=image_url,
                          imageAlt=meta.get('og:image:alt') or meta.get('twitter:image:alt') or link['label'])
    except Exception as error:
        result['status'] = 'fetch_failed'
        result['error'] = type(error).__name__
    return link['id'], result


def main():
    directory = json.loads((ROOT / 'tt.json').read_text())
    # Project/talk destinations first; skip generic social landing pages and login walls.
    selected = [link for link in directory['links'] if link['type'] in ('project', 'tool', 'personal_site', 'slides', 'writing') or
                (link['type'] == 'github' and len(urllib.parse.urlsplit(link['url']).path.strip('/').split('/')) >= 2)]
    cache_path = ROOT / 'assets' / 'tt-previews.json'
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    selected = [link for link in selected if cache.get(link['id'], {}).get('status') != 'found' or cache[link['id']].get('url') != link['url']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for id, preview in pool.map(fetch_preview, selected):
            cache[id] = preview
            print(f"{id}: {preview['status']}", flush=True)
    cache_path.write_text(json.dumps(dict(sorted(cache.items())), ensure_ascii=False, indent=2) + '\n')
    print(f"Cached {sum(item.get('status') == 'found' for item in cache.values())} previews of {len(cache)} links.")


if __name__ == '__main__':
    main()
