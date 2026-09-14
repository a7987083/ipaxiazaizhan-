#!/usr/bin/env python3
import io
import json
import plistlib
import re
import sys
import urllib.request
import zipfile

BLOCK = 256 * 1024
MAX_FETCH = 16 * 1024 * 1024
TIMEOUT = 20
LAST_METRICS = {'range_bytes': 0, 'range_requests': 0}

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

    def _block(self, index):
        if index in self.cache:
            return self.cache[index]
        start = index * BLOCK
        end = min(self.size - 1, start + BLOCK - 1)
        if start > end:
            return b''
        if self.fetched + (end - start + 1) > MAX_FETCH:
            raise RuntimeError('IPA Range 读取超过 16MB 安全上限')
        req = urllib.request.Request(
            self.url,
            headers={
                'Range': f'bytes={start}-{end}',
                'User-Agent': 'zonoe-ipa-range-parser/1.1',
                'Accept-Encoding': 'identity',
            },
        )
        self.requests += 1
        LAST_METRICS['range_requests'] = self.requests
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            status = getattr(res, 'status', None) or res.getcode()
            if status != 206:
                raise RuntimeError(f'远端不支持 HTTP Range (HTTP {status})')
            data = res.read(end - start + 1)
        self.fetched += len(data)
        LAST_METRICS['range_bytes'] = self.fetched
        self.cache[index] = data
        return data

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
                break
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


def main():
    req = json.loads(sys.stdin.read() or '{}')
    url = str(req.get('url') or '')
    size = int(req.get('size') or 0)
    if not url.startswith(('http://', 'https://')) or size <= 0:
        raise RuntimeError('url/size 参数无效')

    remote = HttpRangeFile(url, size)
    with zipfile.ZipFile(remote, 'r') as zf:
        candidates = [x for x in zf.infolist() if re.match(r'^Payload/[^/]+\.app/Info\.plist$', x.filename, re.I)]
        if not candidates:
            raise RuntimeError('IPA 中未找到 Payload/*.app/Info.plist')
        info = sorted(candidates, key=lambda x: len(x.filename))[0]
        if info.file_size > 4 * 1024 * 1024:
            raise RuntimeError('Info.plist 异常过大')
        raw = zf.read(info)
        plist = plistlib.loads(raw)

    name = clean(plist.get('CFBundleDisplayName')) or clean(plist.get('CFBundleName'))
    result = {
        'ok': True,
        'name': name,
        'version': clean(plist.get('CFBundleShortVersionString')),
        'build': clean(plist.get('CFBundleVersion')),
        'bundle_id': clean(plist.get('CFBundleIdentifier')),
        'minimum_ios': clean(plist.get('MinimumOSVersion')),
        'executable': clean(plist.get('CFBundleExecutable')),
        'range_bytes': remote.fetched,
        'range_requests': remote.requests,
    }
    print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(json.dumps({
            'ok': False,
            'error': str(e)[:500],
            'range_bytes': int(LAST_METRICS.get('range_bytes') or 0),
            'range_requests': int(LAST_METRICS.get('range_requests') or 0),
        }, ensure_ascii=False, separators=(',', ':')))
        sys.exit(1)
