const els = {
  coverScreen: document.getElementById("cover-screen"),
  coverEnter: document.getElementById("cover-enter"),
  coverHome: document.getElementById("cover-home"),
  pageMeta: document.getElementById("page-meta"),
  pageTitle: document.getElementById("page-title"),
  content: document.getElementById("content"),
};

const state = {
  pages: [],
  index: 0,
};

function titleFromMd(path) {
  return path
    .split("/")
    .pop()
    .replace(/\.md$/i, "")
    .replace(/^\d+(?:\.\d+)*\.?\s*/, "")
    .trim();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function renderMarkdown(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const parts = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      parts.push(`<h2>${renderInline(line.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(line)) {
      parts.push(`<p>${renderInline(line)}</p>`);
      i += 1;
      continue;
    }
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      const items = [];
      while (i < lines.length) {
        const item = lines[i].trim().match(/^(\d+)\.\s+(.*)$/);
        if (!item) break;
        items.push(`<li>${renderInline(item[2])}</li>`);
        i += 1;
      }
      parts.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    const para = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || next.startsWith("## ") || /^!\[[^\]]*\]\([^)]+\)$/.test(next) || /^\d+\.\s+/.test(next)) {
        break;
      }
      para.push(next);
      i += 1;
    }
    parts.push(`<p>${para.map(renderInline).join("<br>")}</p>`);
  }
  return parts.join("\n");
}

function showCover() {
  document.body.classList.add("cover-open");
  els.coverScreen.classList.remove("cover-hidden");
  els.coverScreen.setAttribute("aria-hidden", "false");
  document.title = "Книга Открытий";
  history.replaceState(null, "", location.pathname);
}

async function openPage(index) {
  const page = state.pages[index];
  if (!page) return;
  state.index = index;
  document.body.classList.remove("cover-open");
  els.coverScreen.classList.add("cover-hidden");
  els.coverScreen.setAttribute("aria-hidden", "true");
  els.pageMeta.textContent = page.id;
  els.pageTitle.textContent = page.title;
  document.title = `${page.title} — Книга Открытий`;
  history.replaceState(null, "", `#${page.id}`);
  els.content.innerHTML = "<p>…</p>";
  try {
    const res = await fetch(encodeURI(page.md), { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    els.content.innerHTML = renderMarkdown(text);
  } catch {
    els.content.innerHTML = '<p class="load-error">Не удалось открыть главу.</p>';
  }
  document.getElementById("reader").scrollTop = 0;
}

function enterBook() {
  openPage(0);
}

async function boot() {
  const manifest = await fetch(`pages.json?v=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
  state.pages = manifest.pages.map((page) => ({
    ...page,
    title: titleFromMd(page.md),
  }));
  els.coverEnter.addEventListener("click", enterBook);
  els.coverEnter.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      enterBook();
    }
  });
  els.coverHome.addEventListener("click", showCover);
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  const fromHash = state.pages.findIndex((p) => p.id === hash);
  if (fromHash >= 0) openPage(fromHash);
}

boot();
