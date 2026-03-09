/**
 * Fetch trang giaoanxanh.com, đợi #vuePdfApp load, lấy link PDF hoặc export nội dung đó thành file PDF.
 * Trang có thể yêu cầu đăng nhập để xem PDF.
 */
import puppeteer from 'puppeteer';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { writeFileSync } from 'fs';
import https from 'https';
import http from 'http';

const PAGE_URL =
  'https://giaoanxanh.com/tai-lieu/tai-tron-bo-de-kiem-tra-theo-tung-unit-tieng-anh-7-global-success-form-2025-co-dap-an';
const OUT_DIR = join(process.cwd(), 'downloads');
const OUT_FILE = join(OUT_DIR, 'de-kiem-tra-tieng-anh-7-global-success.pdf');

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  try {
    console.log('Đang mở:', PAGE_URL);
    await page.goto(PAGE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Đợi #vuePdfApp xuất hiện (Vue có thể mount sau vài giây)
    await page.waitForSelector('#vuePdfApp', { timeout: 15000 }).catch(() => null);

    // Đợi thêm để PDF/viewer load (iframe hoặc embed)
    await new Promise((r) => setTimeout(r, 3000));

    const result = await page.evaluate(() => {
      const app = document.getElementById('vuePdfApp');
      if (!app) return { found: false, reason: 'Không tìm thấy #vuePdfApp' };

      // Tìm iframe chứa PDF
      const iframe = app.querySelector('iframe[src]');
      if (iframe && iframe.src && (iframe.src.includes('.pdf') || iframe.src.includes('pdf'))) {
        return { found: true, pdfUrl: iframe.src, method: 'iframe' };
      }
      if (iframe && iframe.src) {
        return { found: true, pdfUrl: iframe.src, method: 'iframe-other' };
      }

      // Một số site dùng embed hoặc object
      const embed = app.querySelector('embed[src*=".pdf"], embed[src*="pdf"]');
      if (embed && embed.src) return { found: true, pdfUrl: embed.src, method: 'embed' };

      const obj = app.querySelector('object[data]');
      if (obj && obj.data) return { found: true, pdfUrl: obj.data, method: 'object' };

      // Link tải PDF
      const link = app.querySelector('a[href*=".pdf"], a[href*="download"], a[href*="pdf"]');
      if (link && link.href) return { found: true, pdfUrl: link.href, method: 'link' };

      // Vue/JS có thể inject URL vào data attribute
      const withData = app.querySelector('[data-pdf-url], [data-src]');
      if (withData) {
        const url = withData.getAttribute('data-pdf-url') || withData.getAttribute('data-src');
        if (url) return { found: true, pdfUrl: url, method: 'data-attr' };
      }

      return { found: true, exportElement: true, reason: 'Chỉ có nội dung viewer, không có URL PDF' };
    });

    if (!result.found) {
      console.warn(result.reason || 'Không lấy được PDF.');
      console.log('Thử export toàn bộ nội dung #vuePdfApp ra PDF...');
    } else if (result.pdfUrl) {
      console.log('Tìm thấy URL PDF:', result.method, result.pdfUrl);
      try {
        const buf = await downloadFile(result.pdfUrl);
        writeFileSync(OUT_FILE, buf);
        console.log('Đã lưu PDF:', OUT_FILE);
        await browser.close();
        return;
      } catch (e) {
        console.warn('Tải trực tiếp PDF thất bại:', e.message);
      }
    }

    // Fallback: chỉ giữ lại #vuePdfApp, xóa phần còn lại, export trang thành PDF
    await page.evaluate(() => {
      const app = document.getElementById('vuePdfApp');
      if (!app) return;
      document.body.innerHTML = '';
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      const wrap = document.createElement('div');
      wrap.style.width = '100%';
      wrap.style.minHeight = '100vh';
      wrap.appendChild(app);
      document.body.appendChild(wrap);
    });

    await page.pdf({
      path: OUT_FILE,
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    console.log('Đã export PDF (từ viewer):', OUT_FILE);
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
