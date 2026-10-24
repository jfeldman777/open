const els = {
  coverScreen: document.getElementById("cover-screen"),
  coverEnter: document.getElementById("cover-enter"),
  coverHome: document.getElementById("cover-home"),
  pageMeta: document.getElementById("page-meta"),
  pageTitle: document.getElementById("page-title"),
  pagePrev: document.getElementById("page-prev"),
  pageNext: document.getElementById("page-next"),
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

function renderTable(rows) {
  const parsed = rows
    .filter((row) => !/^\|\s*-/.test(row))
    .map((row) =>
      row
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
  if (!parsed.length) return "";
  const [head, ...body] = parsed;
  const thead = `<thead><tr>${head.map((c) => `<th>${renderInline(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div>`;
}

function renderMarkdown(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const parts = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (line === "---") {
      parts.push("<hr>");
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      parts.push(`<h2>${renderInline(line.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim());
        i += 1;
      }
      parts.push(renderTable(rows));
      continue;
    }
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(line)) {
      parts.push(`<p>${renderInline(line)}</p>`);
      i += 1;
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
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
      if (
        !next ||
        next === "---" ||
        next.startsWith("## ") ||
        next.startsWith("|") ||
        /^!\[[^\]]*\]\([^)]+\)$/.test(next) ||
        /^\d+\.\s+/.test(next)
      ) {
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
  history.replaceState(null, "", location.pathname + location.search);
}

function syncNav() {
  els.pagePrev.disabled = state.index <= 0;
  els.pageNext.disabled = state.index >= state.pages.length - 1;
}

async function openPage(index) {
  const page = state.pages[index];
  if (!page) return;
  state.index = index;
  document.body.classList.remove("cover-open");
  els.coverScreen.classList.add("cover-hidden");
  els.coverScreen.setAttribute("aria-hidden", "true");
  els.pageMeta.textContent = `${page.id} / ${state.pages.length}`;
  els.pageTitle.textContent = page.title;
  document.title = `${page.title} — Книга Открытий`;
  history.replaceState(null, "", `${location.pathname}${location.search}#${page.id}`);
  syncNav();
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

function goPrev() {
  if (state.index > 0) openPage(state.index - 1);
}

function goNext() {
  if (state.index < state.pages.length - 1) openPage(state.index + 1);
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
  els.pagePrev.addEventListener("click", goPrev);
  els.pageNext.addEventListener("click", goNext);
  document.addEventListener("keydown", (e) => {
    if (document.body.classList.contains("cover-open")) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === "ArrowLeft") goPrev();
    if (e.code === "ArrowRight") goNext();
  });
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  const fromHash = state.pages.findIndex((p) => p.id === hash);
  if (fromHash >= 0) openPage(fromHash);
}

boot();
