/**
 * Thử tải PDF từ downloadUrl (Google Drive). Khi API 403 thì thử link công khai uc?export=download.
 */
import https from 'https';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const DATA = {
  downloadUrl:
    'https://www.googleapis.com/drive/v2/files/1dhwyhHeV3Ac9CHJP9b4ZI2buQjkd3qU8?alt=media&source=downloadUrl',
  key: 'U2FsdGVkX18AvA+yf3cMa+3RIt/FuRAurBGaWQFMpAYZBeHu0ujx3yvuit+VhMSunaj6awVcMJXpsqKaTxu90Nr50S8RelgUKmBxqHqrpQ0K5XlBOYGn6Ayep69UmzKCYDHu1nxYUGpNYeGibCclnYnvzsyyFC9szo4IH6b1rbN7kLTYXtj3ym+sFltYKy3cKSjAu+gych3kfJ0uv8GKmVSHvtu1+eOF7Xxchvv0FJC+R44eoxFAz9dbcCSFaOV0VQBeY4m7XwWiu5A5TtdW5WVDe/WgUHM3fgDKvemQBLGoswVXznx337Gm7CUCyLc54P8o4dUcFxM0qKcbVEgInjv+BRbjM82UhbK/+A4wf4tMEdxSnN6XOW7R2xRKXFKK',
  mime: 'application/pdf',
};

const OUT_DIR = join(process.cwd(), 'downloads');
const OUT_FILE = join(OUT_DIR, 'downloaded-drive.pdf');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getDriveFileId(url) {
  const m = url.match(/\/files\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': UA, Accept: '*/*' } },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const loc = res.headers.location;
          if (loc) {
            return downloadFile(loc).then(resolve).catch(reject);
          }
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ buffer: Buffer.concat(chunks), statusCode: res.statusCode })
        );
        res.on('error', reject);
      }
    );
    req.on('error', reject);
  });
}

/** Dùng fetch (Node 18+) để theo mọi redirect, kể cả sang http. */
async function downloadWithFetch(url, opts = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: '*/*', ...opts.headers },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { buffer: buf, statusCode: res.status };
}

/** Tải từ Drive API với Bearer token (giống curl từ giaoanxanh). */
async function downloadWithBearer(url, bearerToken) {
  const res = await fetch(url, {
    headers: {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': `Bearer ${bearerToken}`,
      'cache-control': 'no-cache',
      'origin': 'https://giaoanxanh.com',
      'pragma': 'no-cache',
      'referer': 'https://giaoanxanh.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0',
    },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { buffer: buf, statusCode: res.status };
}

function isPdf(buffer) {
  return buffer.length >= 5 && buffer.slice(0, 5).toString() === '%PDF-';
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let bearerToken = process.env.BEARER_TOKEN;
  if (!bearerToken) {
    const tokenFile = join(process.cwd(), 'bearer-token.txt');
    if (existsSync(tokenFile)) bearerToken = readFileSync(tokenFile, 'utf8').trim();
  }
  if (bearerToken) {
    console.log('Đang tải với Bearer token (Drive API)...');
    const { buffer, statusCode } = await downloadWithBearer(DATA.downloadUrl, bearerToken);
    console.log('Status:', statusCode, 'Size:', buffer.length, 'bytes');
    if (statusCode === 200 && isPdf(buffer)) {
      writeFileSync(OUT_FILE, buffer);
      console.log('Đã lưu PDF:', OUT_FILE);
      return;
    }
    if (statusCode !== 200) {
      console.log('Lỗi:', buffer.slice(0, 200).toString());
      return;
    }
    console.log('Response không phải PDF, thử cách khác...');
  }

  let url = DATA.downloadUrl;
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey) {
    url += (url.includes('?') ? '&' : '?') + 'key=' + apiKey;
    console.log('Dùng GOOGLE_API_KEY từ env.');
  }
  console.log('Đang tải:', DATA.downloadUrl);
  const { buffer, statusCode } = await downloadFile(url);

  console.log('Status:', statusCode, 'Size:', buffer.length, 'bytes');

  if (statusCode === 403) {
    const fileId = getDriveFileId(DATA.downloadUrl);
    if (fileId) {
      const publicUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      console.log('Thử link công khai:', publicUrl);
      try {
        const r2 = await downloadWithFetch(publicUrl);
        console.log('Link công khai → Status:', r2.statusCode, 'Size:', r2.buffer.length);
        if (r2.statusCode === 200 && isPdf(r2.buffer)) {
          writeFileSync(OUT_FILE, r2.buffer);
          console.log('Đã tải PDF qua link công khai:', OUT_FILE);
          return;
        }
        if (r2.statusCode === 200 && r2.buffer.length > 500 && !r2.buffer.slice(0, 50).toString().includes('<!')) {
          writeFileSync(OUT_FILE, r2.buffer);
          console.log('Đã lưu file:', OUT_FILE);
          return;
        }
        if (r2.statusCode === 200 && r2.buffer.slice(0, 100).toString().includes('<!')) {
          const html = r2.buffer.toString('utf8');
          if (html.includes('accounts.google')) {
            console.log('File Drive yêu cầu đăng nhập Google. Link công khai không dùng được.');
          } else {
            const confirmMatch =
              html.match(/href="([^"]*export=download[^"]*confirm=[^"]+)"/) ||
              html.match(/"(https:\/\/[^"]*confirm=[^"]+)"/) ||
              html.match(/\/uc\?[^"']*export=download[^"']*confirm=[^"'\s]+/);
            if (confirmMatch) {
              let confirmUrl = (confirmMatch[1] || confirmMatch[0]).replace(/&amp;/g, '&');
              if (!confirmUrl.startsWith('http')) confirmUrl = 'https://drive.google.com' + (confirmUrl.startsWith('/') ? '' : '/') + confirmUrl;
              console.log('Đang tải qua link xác nhận...');
              const r3 = await downloadWithFetch(confirmUrl);
              if (r3.statusCode === 200 && isPdf(r3.buffer)) {
                writeFileSync(OUT_FILE, r3.buffer);
                console.log('Đã tải PDF:', OUT_FILE);
                return;
              }
              if (r3.statusCode === 200 && r3.buffer.length > 500) {
                writeFileSync(OUT_FILE, r3.buffer);
                console.log('Đã lưu file:', OUT_FILE);
                return;
              }
            } else {
              console.log('Link công khai trả về HTML. Không tìm thấy link tải.');
            }
          }
        }
      } catch (e) {
        console.log('Link công khai lỗi:', e.message);
      }
    }
    const msg = buffer.toString('utf8');
    if (msg.includes('API key')) {
      console.log('Google Drive trả về 403. File có thể không public hoặc cần API key.');
    }
    try {
      const err = JSON.parse(msg);
      if (err.error?.message) console.log('Lỗi:', err.error.message);
    } catch (_) {}
    writeFileSync(join(OUT_DIR, 'drive-response-403.json'), buffer);
    return;
  }

  if (isPdf(buffer)) {
    writeFileSync(OUT_FILE, buffer);
    console.log('Đã lưu PDF:', OUT_FILE);
    return;
  }

  const start = buffer.slice(0, 100).toString('utf8');
  if (start.includes('<!DOCTYPE') || start.includes('<html')) {
    console.log('URL trả về HTML (có thể cần đăng nhập/API key). 100 ký tự đầu:', start.slice(0, 200));
    writeFileSync(join(OUT_DIR, 'response.html'), buffer);
    console.log('Đã lưu response vào response.html để kiểm tra.');
    return;
  }

  // Có thể là nội dung đã mã hóa (key = CryptoJS Salted)
  const maybeEncrypted = buffer.toString('base64').startsWith('U2FsdGVk');
  if (maybeEncrypted && DATA.key) {
    console.log('Dữ liệu có vẻ được mã hóa. Cần thư viện giải mã (ví dụ crypto-js).');
    try {
      const CryptoJS = (await import('crypto-js')).default;
      const decrypted = CryptoJS.AES.decrypt(buffer.toString('base64'), DATA.key);
      const raw = decrypted.toString(CryptoJS.enc.Utf8);
      if (!raw) {
        console.log('Giải mã bằng key trong JSON không ra UTF-8 (key có thể là passphrase khác).');
      } else {
        const out = Buffer.from(raw, 'binary');
        if (isPdf(out)) {
          writeFileSync(OUT_FILE, out);
          console.log('Đã giải mã và lưu PDF:', OUT_FILE);
          return;
        }
        writeFileSync(join(OUT_DIR, 'decrypted.bin'), out);
        console.log('Đã giải mã, lưu decrypted.bin (chưa chắc là PDF).');
        return;
      }
    } catch (e) {
      if (e.code === 'ERR_MODULE_NOT_FOUND') {
        console.log('Chưa cài crypto-js. Chạy: npm install crypto-js');
      } else {
        console.log('Lỗi giải mã:', e.message);
      }
    }
  }

  writeFileSync(OUT_FILE, buffer);
  console.log('Đã lưu raw vào:', OUT_FILE, '(kiểm tra xem mở được không).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
