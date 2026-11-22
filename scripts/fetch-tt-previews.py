"""Cache publisher-provided OG/Twitter previews for the fixed tt.json directory.
Run from the repo root: python3 scripts/fetch-tt-previews.py
No scraping happens in the browser or on user-supplied URLs.
"""
import concurrent.futures
import hashlib
import html.parser
import ipaddress
import json
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.parse
from email.parser import BytesParser

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'people-previews'
OUT.mkdir(parents=True, exist_ok=True)

SKIP_DOMAINS = (
    'x.com',
    'twitter.com',
    'okjk.co',
    'okjike.com',
    'xhslink.cn',
    'xiaohongshu.com',
    'linkedin.com',
    'mp.weixin.qq.com',
    'weixin.qq.com',
    'feishu.cn',
    'instagram.com',
    'facebook.com',
    'tiktok.com',
    'douyin.com',
    'weibo.com',
    'zhihu.com',
    'discord.gg',
    'discord.com',
    't.me',
)

SKIP_EXTENSIONS = ('.pdf', '.zip', '.dmg', '.pkg', '.exe', '.mp4', '.mp3', '.mov', '.apk', '.ipa', '.tar', '.gz')
SAFE_PREVIEW_RE = re.compile(r'^/people-previews/[a-z0-9-]+\.webp$')


def normalize_url(raw_url: str) -> str:
    parsed = urllib.parse.urlsplit(raw_url.strip())
    scheme = parsed.scheme.lower()
    host = (parsed.hostname or '').lower()
    if host.startswith('www.'):
        host = host[4:]
    port = ''
    if parsed.port and not ((scheme == 'http' and parsed.port == 80) or (scheme == 'https' and parsed.port == 443)):
        port = f':{parsed.port}'
    path = parsed.path.rstrip('/')
    query = f'?{parsed.query}' if parsed.query else ''
    return f'{scheme}://{host}{port}{path}{query}'


def hostname_of(raw_url: str) -> str:
    host = (urllib.parse.urlsplit(raw_url).hostname or '').lower()
    return host[4:] if host.startswith('www.') else host


def is_skipped_url(raw_url: str) -> bool:
    parsed = urllib.parse.urlsplit(raw_url)
    host = (parsed.hostname or '').lower()
    if any(host == domain or host.endswith('.' + domain) for domain in SKIP_DOMAINS):
        return True
    path_lower = parsed.path.lower()
    if any(path_lower.endswith(ext) for ext in SKIP_EXTENSIONS):
        return True
    return False


def public_url(url: str) -> str:
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


def preview_filename(norm_url: str) -> str:
    host = hostname_of(norm_url)
    slug = re.sub(r'[^a-z0-9]+', '-', host).strip('-')[:24] or 'site'
    digest = hashlib.sha256(norm_url.encode('utf-8')).hexdigest()[:10]
    return f'{slug}-{digest}.webp'


def read_url(url: str, limit: int):
    with tempfile.TemporaryDirectory(prefix='tt-preview-') as temporary:
        body = Path(temporary) / 'body'
        headers = Path(temporary) / 'headers'
        result = subprocess.run(
            [
                'curl', '--fail', '--location', '--max-redirs', '5',
                '--proto', '=https,http', '--proto-redir', '=https,http',
                '--connect-timeout', '6', '--max-time', '12',
                '--max-filesize', str(limit), '--silent', '--show-error',
                '--user-agent', 'Mozilla/5.0 (compatible; TabThursdayPreview/1.0)',
                '--dump-header', str(headers), '--output', str(body),
                '--write-out', '%{url_effective}',
                public_url(url),
            ],
            check=True,
            capture_output=True,
            timeout=18,
        )
        data = body.read_bytes()
        if len(data) > limit:
            raise ValueError('Response too large')
        blocks = [block for block in headers.read_bytes().split(b'\r\n\r\n') if block.startswith(b'HTTP/')]
        header = BytesParser().parsebytes(blocks[-1].split(b'\r\n', 1)[1]) if blocks else BytesParser().parsebytes(b'')
        return data, result.stdout.decode('utf-8', errors='replace'), header


class Metadata(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self._in_title = False
        self._title_parts = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attrs_dict = dict(attrs)
        if tag == 'meta':
            key = (attrs_dict.get('property') or attrs_dict.get('name') or '').strip().lower()
            content = (attrs_dict.get('content') or '').strip()
            if key and content:
                self.meta.setdefault(key, content)
        elif tag == 'title':
            self._in_title = True

    def handle_endtag(self, tag):
        if tag.lower() == 'title':
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self._title_parts.append(data)

    @property
    def doc_title(self):
        text = ' '.join(''.join(self._title_parts).split()).strip()
        return text or None


def clean_text(value):
    if not value or not isinstance(value, str):
        return None
    text = ' '.join(value.split()).strip()
    return text[:240] if text else None


def existing_webp_exists(image_path) -> bool:
    if not isinstance(image_path, str) or not SAFE_PREVIEW_RE.match(image_path):
        return False
    return (ROOT / 'public' / image_path.lstrip('/')).is_file()


def convert_to_webp(raw: bytes, destination: Path) -> None:
    # Decode and re-encode actual raster images; reject tiny icons/trackers or non-images.
    script = (
        "import sharp from 'sharp'; "
        "const chunks=[]; for await(const c of process.stdin) chunks.push(c); "
        "const img = sharp(Buffer.concat(chunks), {limitInputPixels:40000000}); "
        "const meta = await img.metadata(); "
        "if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64) { "
        "  throw new Error('Image too small'); "
        "} "
        "await img.rotate().resize(960,600,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(process.argv[1]);"
    )
    subprocess.run(
        ['node', '--input-type=module', '-e', script, str(destination)],
        input=raw,
        cwd=ROOT,
        check=True,
        capture_output=True,
        timeout=20,
    )


def fetch_preview(item, root_fallback):
    norm_url = item['norm']
    url = item['url']
    label = item['label']
    host = hostname_of(url)

    if is_skipped_url(url):
        return norm_url, {
            'url': url,
            'imageAlt': label,
            'siteName': host,
            'status': 'skipped',
        }

    entry = {
        'url': url,
        'imageAlt': label,
        'siteName': host,
        'status': 'fetch_failed',
    }
    try:
        page, final_url, headers = read_url(url, 2_500_000)
        content_type = (headers.get_content_type() or '').lower()
        if content_type and not any(t in content_type for t in ('html', 'xhtml', 'xml', 'text/plain')):
            raise ValueError(f'Unsupported content type {content_type}')
        parser = Metadata()
        parser.feed(page.decode(headers.get_content_charset() or 'utf-8', errors='replace'))
        meta = parser.meta
        title = clean_text(meta.get('og:title') or meta.get('twitter:title') or parser.doc_title)
        site_name = clean_text(meta.get('og:site_name')) or host
        entry['siteName'] = site_name
        if title:
            entry['title'] = title
        entry['status'] = 'no_image'

        image_url = (
            meta.get('og:image:secure_url')
            or meta.get('og:image')
            or meta.get('twitter:image')
            or meta.get('twitter:image:src')
        )
        if image_url:
            image_url = urllib.parse.urljoin(final_url, image_url)
            raw, _, _ = read_url(image_url, 8_000_000)
            filename = preview_filename(norm_url)
            destination = OUT / filename
            try:
                convert_to_webp(raw, destination)
                entry['image'] = f'/people-previews/{filename}'
                entry['imageAlt'] = clean_text(
                    meta.get('og:image:alt') or meta.get('twitter:image:alt') or title or label
                ) or label
                entry['status'] = 'found'
            except Exception:
                if destination.exists():
                    destination.unlink()
    except Exception:
        entry['status'] = 'fetch_failed'

    # Fall back to an already-cached same-host root preview from HEAD if fresh fetch had no image.
    if entry['status'] != 'found' and root_fallback and existing_webp_exists(root_fallback.get('image')):
        entry = {
            'url': url,
            'image': root_fallback['image'],
            'imageAlt': clean_text(entry.get('title') or root_fallback.get('imageAlt') or label) or label,
            **({'title': entry.get('title') or clean_text(root_fallback.get('title'))}
               if (entry.get('title') or clean_text(root_fallback.get('title'))) else {}),
            'siteName': entry.get('siteName') or clean_text(root_fallback.get('siteName')) or host,
            'status': 'found',
        }

    return norm_url, entry


def collect_directory_urls(directory):
    collected = {}
    for person in directory.get('people', []):
        website = person.get('website')
        if isinstance(website, str) and website.startswith(('http://', 'https://')):
            norm = normalize_url(website)
            collected.setdefault(norm, {'norm': norm, 'url': website, 'label': person['name']})
        for appearance in person.get('appearances', []):
            for link in appearance.get('links', []):
                href = link.get('href')
                if isinstance(href, str) and href.startswith(('http://', 'https://')):
                    norm = normalize_url(href)
                    collected.setdefault(norm, {'norm': norm, 'url': href, 'label': link.get('label') or person['name']})
    return collected


def load_existing_cache(cache_path: Path):
    by_norm = {}
    by_host_root = {}
    if not cache_path.exists():
        return by_norm, by_host_root
    raw_cache = json.loads(cache_path.read_text(encoding='utf-8'))
    for key, val in raw_cache.items():
        if not isinstance(val, dict):
            continue
        url = val.get('url') or (key if key.startswith(('http://', 'https://')) else None)
        if not url:
            continue
        norm = normalize_url(url)
        if val.get('status') == 'found' and existing_webp_exists(val.get('image')):
            cleaned = {
                'url': url,
                'image': val['image'],
                'imageAlt': clean_text(val.get('imageAlt') or val.get('title')) or hostname_of(url),
                **({'title': clean_text(val.get('title'))} if clean_text(val.get('title')) else {}),
                'siteName': clean_text(val.get('siteName')) or hostname_of(url),
                'status': 'found',
            }
            by_norm[norm] = cleaned
            parsed = urllib.parse.urlsplit(norm)
            if not parsed.path and not parsed.query:
                by_host_root[hostname_of(norm)] = cleaned
    return by_norm, by_host_root


def main():
    directory = json.loads((ROOT / 'tt.json').read_text(encoding='utf-8'))
    cache_path = ROOT / 'assets' / 'tt-previews.json'
    existing_by_norm, existing_root_by_host = load_existing_cache(cache_path)
    targets = collect_directory_urls(directory)

    manifest = {}
    to_fetch = []
    reused = 0

    for norm, item in targets.items():
        cached = existing_by_norm.get(norm)
        if cached:
            manifest[norm] = {**cached, 'url': item['url']}
            reused += 1
        else:
            to_fetch.append(item)

    print(f'Reused {reused} cached WebPs; fetching {len(to_fetch)} URLs...', flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        futures = {
            pool.submit(fetch_preview, item, existing_root_by_host.get(hostname_of(item['url']))): item
            for item in to_fetch
        }
        for future in concurrent.futures.as_completed(futures):
            norm_url, preview = future.result()
            manifest[norm_url] = preview
            print(f"{preview['status']:12s} {norm_url}", flush=True)

    # Remove orphaned WebPs not referenced by the current manifest.
    referenced_files = {
        Path(entry['image']).name
        for entry in manifest.values()
        if entry.get('status') == 'found' and isinstance(entry.get('image'), str)
    }
    removed_orphans = 0
    for webp in OUT.glob('*.webp'):
        if webp.name not in referenced_files:
            webp.unlink()
            removed_orphans += 1

    sorted_manifest = dict(sorted(manifest.items()))
    cache_path.write_text(json.dumps(sorted_manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    found_count = sum(1 for entry in sorted_manifest.values() if entry.get('status') == 'found')
    skipped_count = sum(1 for entry in sorted_manifest.values() if entry.get('status') == 'skipped')
    no_image_count = sum(1 for entry in sorted_manifest.values() if entry.get('status') == 'no_image')
    failed_count = sum(1 for entry in sorted_manifest.values() if entry.get('status') == 'fetch_failed')
    print(
        f'Done: {found_count} found, {no_image_count} no_image, {skipped_count} skipped, '
        f'{failed_count} fetch_failed (total {len(sorted_manifest)} URLs, removed {removed_orphans} orphan WebPs).'
    )


if __name__ == '__main__':
    main()
