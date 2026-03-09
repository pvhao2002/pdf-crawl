/**
 * 1. Fetch trang series, lấy toàn bộ link từ article.blog-post ol li
 * 2. Với từng link: vào trang → chỉ giữ article.blog-post → div cha class = col-12 order-1 order-sm-1 order-md-2 → export PDF
 */
import puppeteer from 'puppeteer';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const SERIES_URL = 'https://yourhomework.net/quiz/series/00003081';
const OUT_DIR = join(process.cwd(), 'pdfs');

// Logic chạy trong page: giữ lại chỉ article, set class div cha
function getPrepareArticleScript() {
  return function () {
    const article =
      document.querySelector('article.blog-post#idarticle') ||
      document.querySelector('article.blog-post');
    if (!article) return { ok: false, reason: 'Không tìm thấy article.blog-post' };

    let parentDiv = article.parentElement;
    if (!parentDiv || parentDiv.tagName !== 'DIV') {
      parentDiv = document.createElement('div');
      article.parentNode.insertBefore(parentDiv, article);
      parentDiv.appendChild(article);
    }
    parentDiv.className = 'col-12 order-1 order-sm-1 order-md-2';

    document.body.innerHTML = '';
    document.body.appendChild(parentDiv);

    const style = document.createElement('style');
    style.textContent = `
      body { margin: 0; padding: 16px; font-family: inherit; }
      .col-12 { width: 100%; box-sizing: border-box; }
      @media print { body { padding: 0; } }
    `;
    document.head.appendChild(style);
    return { ok: true };
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  try {
    // Bước 1: Vào trang series, lấy toàn bộ link bài tập
    console.log('Đang fetch:', SERIES_URL);
    await page.goto(SERIES_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const links = await page.evaluate(() => {
      const items = document.querySelectorAll('article.blog-post ol li');
      return Array.from(items)
        .map((li) => {
          const a = li.querySelector('a[href*="/quiz/test/"]');
          return a ? a.href : null;
        })
        .filter(Boolean);
    });

    if (!links.length) {
      console.warn('Không tìm thấy link nào trong article.blog-post ol li. Thử selector khác...');
      const fallback = await page.evaluate(() => {
        const as = document.querySelectorAll('article.blog-post a[href*="/quiz/test/"]');
        return Array.from(as).map((a) => a.href);
      });
      const unique = [...new Set(fallback)];
      links.push(...unique);
    }

    const uniqueLinks = [...new Set(links)];
    console.log('Số link bài tập:', uniqueLinks.length);

    const prepareArticle = getPrepareArticleScript();

    for (let i = 0; i < uniqueLinks.length; i++) {
      const url = uniqueLinks[i];
      const safeName = `quiz-${String(i + 1).padStart(2, '0')}.pdf`;
      const pdfPath = join(OUT_DIR, safeName);

      try {
        console.log(`[${i + 1}/${uniqueLinks.length}]`, url);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        const result = await page.evaluate(prepareArticle);
        if (!result.ok) {
          console.warn('  → Bỏ qua:', result.reason || 'Không có article');
          continue;
        }

        await page.pdf({
          path: pdfPath,
          format: 'A4',
          printBackground: true,
          margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
        });
        console.log('  → Đã lưu:', pdfPath);
      } catch (err) {
        console.warn('  → Lỗi:', err.message);
      }
    }
  } finally {
    await browser.close();
  }

  console.log('Xong. PDF nằm trong thư mục:', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
