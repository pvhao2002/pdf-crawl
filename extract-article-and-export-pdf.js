/**
 * Script: Giữ lại chỉ article#idarticle, đặt class cho div cha, rồi export PDF
 * Chạy trong DevTools Console trên trang có <article class="blog-post" id="idarticle">
 */

(function () {
  const ARTICLE_SELECTOR = 'article.blog-post#idarticle';

  const article = document.querySelector(ARTICLE_SELECTOR);
  if (!article) {
    console.error('Không tìm thấy element: ' + ARTICLE_SELECTOR);
    return;
  }

  // 1. Lấy div cha (parent) của article
  let parentDiv = article.parentElement;

  // Nếu parent không phải div thì bọc article trong một div mới
  if (!parentDiv || parentDiv.tagName !== 'DIV') {
    parentDiv = document.createElement('div');
    article.parentNode.insertBefore(parentDiv, article);
    parentDiv.appendChild(article);
  }

  // 2. Thay class của div cha
  parentDiv.className = 'col-12 order-1 order-sm-1 order-md-2';

  // 3. Xóa toàn bộ element khác: chỉ giữ lại div cha (chứa article)
  document.body.innerHTML = '';
  document.body.appendChild(parentDiv);

  // Style tối thiểu để in/PDF đẹp
  const style = document.createElement('style');
  style.textContent = `
    body { margin: 0; padding: 16px; font-family: inherit; }
    .col-12 { width: 100%; box-sizing: border-box; }
    @media print { body { padding: 0; } }
  `;
  document.head.appendChild(style);

  // 4. Export PDF (dùng Print → Save as PDF)
  setTimeout(function () {
    window.print();
  }, 300);
})();
