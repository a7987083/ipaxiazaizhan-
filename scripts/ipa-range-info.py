#!/usr/bin/env python3
import base64
import io
import json
import plistlib
import re
import socket
import sys
import time
import urllib.error
import urllib.request
import zipfile

BLOCK = 512 * 1024
MAX_FETCH = 32 * 1024 * 1024
TIMEOUT = 20
MAX_ATTEMPTS = 3
LAST_METRICS = {'range_bytes': 0, 'range_requests': 0}


class ParserError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class HttpRangeFile(io.RawIOBase):
    def __init__(self, url, size):
        self.url = str(url)
        self.size = int(size)
        self.pos = 0
        self.cache = {}
        self.fetched = 0
        self.requests = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=io.SEEK_SET):
        if whence == io.SEEK_SET:
            pos = offset
        elif whence == io.SEEK_CUR:
            pos = self.pos + offset
        elif whence == io.SEEK_END:
            pos = self.size + offset
        else:
            raise ValueError('invalid whence')
        self.pos = max(0, min(self.size, int(pos)))
        return self.pos

    def _validate_content_range(self, header, start, end):
        m = re.fullmatch(r'bytes\s+(\d+)-(\d+)/(\d+|\*)', str(header or '').strip(), re.I)
        if not m:
            raise ParserError('RANGE_MISMATCH', 'HTTP Range 响应缺少有效 Content-Range')
        got_start, got_end, total = int(m.group(1)), int(m.group(2)), m.group(3)
        if got_start != start or got_end != end:
            raise ParserError(
                'RANGE_MISMATCH',
                f'HTTP Range 区间不匹配：请求 {start}-{end}，返回 {got_start}-{got_end}'
            )
        if total != '*' and int(total) != self.size:
            raise ParserError(
                'RANGE_SIZE_MISMATCH',
                f'HTTP Range 文件大小不匹配：OpenList={self.size}，远端={total}'
            )

    def _fetch_once(self, start, end):
        req = urllib.request.Request(
            self.url,
            headers={
                'Range': f'bytes={start}-{end}',
                'User-Agent': 'zonoe-ipa-range-parser/1.2',
                'Accept-Encoding': 'identity',
                'Cache-Control': 'no-transform',
            },
        )
        self.requests += 1
        LAST_METRICS['range_requests'] = self.requests
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            status = getattr(res, 'status', None) or res.getcode()
            if status != 206:
                raise ParserError('RANGE_UNSUPPORTED', f'远端不支持 HTTP Range (HTTP {status})')
            self._validate_content_range(res.headers.get('Content-Range'), start, end)
            expected = end - start + 1
            data = res.read(expected + 1)
            if len(data) != expected:
                raise ParserError(
                    'RANGE_TRUNCATED',
                    f'HTTP Range 数据长度异常：期望 {expected}，实际 {len(data)}'
                )
            return data

    def _block(self, index):
        if index in self.cache:
            return self.cache[index]
        start = index * BLOCK
        end = min(self.size - 1, start + BLOCK - 1)
        if start > end:
            return b''
        expected = end - start + 1
        if self.fetched + expected > MAX_FETCH:
            raise ParserError('RANGE_LIMIT', 'IPA Range 读取超过 32MB 安全上限')

        last_error = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                data = self._fetch_once(start, end)
                self.fetched += len(data)
                LAST_METRICS['range_bytes'] = self.fetched
                self.cache[index] = data
                return data
            except ParserError as e:
                last_error = e
                if e.code not in ('RANGE_TRUNCATED',):
                    raise
            except (urllib.error.URLError, TimeoutError, socket.timeout, ConnectionError) as e:
                last_error = ParserError('NETWORK_TIMEOUT', f'HTTP Range 网络异常：{e}')
            if attempt < MAX_ATTEMPTS:
                time.sleep(0.35 * attempt)

        if isinstance(last_error, ParserError):
            raise last_error
        raise ParserError('NETWORK_ERROR', 'HTTP Range 请求失败')

    def read(self, n=-1):
        if self.pos >= self.size:
            return b''
        if n is None or n < 0:
            n = self.size - self.pos
        n = min(int(n), self.size - self.pos)
        out = bytearray()
        while n > 0:
            idx = self.pos // BLOCK
            block = self._block(idx)
            off = self.pos % BLOCK
            take = min(n, max(0, len(block) - off))
            if take <= 0:
                raise ParserError('RANGE_TRUNCATED', 'HTTP Range 数据提前结束')
            out.extend(block[off:off + take])
            self.pos += take
            n -= take
        return bytes(out)


def clean(v):
    if v is None:
        return ''
    if isinstance(v, (str, int, float)):
        return str(v).strip()
    return ''


def icon_priority(name):
    lower = name.lower()
    size_key = 0 if lower.startswith('appicon60x60') else 1
    if '@3x' in lower:
        scale_key = 0
    elif '@2x' in lower:
        scale_key = 1
    else:
        scale_key = 2
    return (size_key, scale_key, len(name))


def main():
    req = json.loads(sys.stdin.read() or '{}')
    url = str(req.get('url') or '')
    size = int(req.get('size') or 0)
    if not url.startswith(('http://', 'https://')) or size <= 0:
        raise ParserError('INVALID_INPUT', 'url/size 参数无效')

    remote = HttpRangeFile(url, size)

    remote.seek(0)
    magic = remote.read(4)
    if magic not in (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'):
        raise ParserError('NOT_ZIP', f'文件头不是 ZIP/IPA，magic={magic.hex() or "empty"}')

    remote.seek(0)
    icon = None
    try:
        with zipfile.ZipFile(remote, 'r') as zf:
            candidates = [
                x for x in zf.infolist()
                if re.match(r'^Payload/[^/]+\.app/Info\.plist$', x.filename, re.I)
            ]
            if not candidates:
                raise ParserError('IPA_INFO_MISSING', 'IPA 中未找到 Payload/*.app/Info.plist')
            info = sorted(candidates, key=lambda x: len(x.filename))[0]
            if info.file_size > 4 * 1024 * 1024:
                raise ParserError('IPA_INFO_TOO_LARGE', 'Info.plist 异常过大')
            raw = zf.read(info)
            plist = plistlib.loads(raw)

            app_root = info.filename.rsplit('/', 1)[0] + '/'
            icon_entries = []
            for entry in zf.infolist():
                if not entry.filename.startswith(app_root) or entry.is_dir():
                    continue
                base = entry.filename.rsplit('/', 1)[-1]
                if not re.match(r'^AppIcon(?:60x60|76x76)[^/]*\.png$', base, re.I):
                    continue
                icon_entries.append((icon_priority(base), entry))

            if icon_entries:
                icon_entry = sorted(icon_entries, key=lambda x: x[0])[0][1]
                if icon_entry.file_size <= 2 * 1024 * 1024:
                    icon_bytes = zf.read(icon_entry)
                    if icon_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
                        icon = {
                            'name': icon_entry.filename.rsplit('/', 1)[-1],
                            'mime': 'image/png',
                            'base64': base64.b64encode(icon_bytes).decode('ascii'),
                        }
    except zipfile.BadZipFile as e:
        raise ParserError('ZIP_CORRUPTED', f'ZIP 中央目录无效或文件损坏：{e}') from e

    name = clean(plist.get('CFBundleDisplayName')) or clean(plist.get('CFBundleName'))
    result = {
        'ok': True,
        'name': name,
        'version': clean(plist.get('CFBundleShortVersionString')),
        'build': clean(plist.get('CFBundleVersion')),
        'bundle_id': clean(plist.get('CFBundleIdentifier')),
        'minimum_ios': clean(plist.get('MinimumOSVersion')),
        'executable': clean(plist.get('CFBundleExecutable')),
        'icon': icon,
        'range_bytes': remote.fetched,
        'range_requests': remote.requests,
    }
    print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        code = getattr(e, 'code', 'PARSER_ERROR')
        print(json.dumps({
            'ok': False,
            'error_code': str(code)[:80],
            'error': str(e)[:500],
            'range_bytes': int(LAST_METRICS.get('range_bytes') or 0),
            'range_requests': int(LAST_METRICS.get('range_requests') or 0),
        }, ensure_ascii=False, separators=(',', ':')))
        sys.exit(1)
