const els = {
  coverScreen: document.getElementById("cover-screen"),
  coverEnter: document.getElementById("cover-enter"),
  coverHome: document.getElementById("cover-home"),
  pageMetas: document.querySelectorAll(".page-meta"),
  pageTitle: document.getElementById("page-title"),
  pagePrevs: document.querySelectorAll(".page-prev"),
  pageNexts: document.querySelectorAll(".page-next"),
  tocTop: document.getElementById("toc-top"),
  tocBottom: document.getElementById("toc-bottom"),
  content: document.getElementById("content"),
};

const state = {
  pages: [],
  index: 0,
  galaId: null,
  galaFromIndex: null,
  galaRender: false,
};

let galaCatalogPromise = null;
let galaGroupsPromise = null;

function galaBase() {
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return `${location.protocol}//${host}:8768`;
  }
  return "https://jfeldman777.github.io/gala";
}

function toGalaHash(href) {
  const raw = String(href || "").trim();
  if (/^gala:/i.test(raw)) return `#gala/${raw.slice(5)}`;
  if (/^#gala\//i.test(raw)) return raw;
  if (!state.galaRender) return null;
  if (/^\?p=[\w.-]+$/i.test(raw)) return `#gala/${raw.slice(3)}`;
  try {
    const url = new URL(raw, `${galaBase()}/`);
    if (/jfeldman777\.github\.io$/i.test(url.hostname) && /\/gala\/?/i.test(url.pathname)) {
      const id = url.searchParams.get("p");
      if (id) return `#gala/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

function parseIncludeFromMd(path) {
  const name = String(path || "")
    .split("/")
    .pop()
    .replace(/\.md$/i, "");
  const match = name.match(/^(\d+(?:\.\d+)*)-(\d+(?:\.\d+)*)/);
  if (!match) return null;
  return { id: match[1], include: match[2] };
}

function resolveGalaPages(rawPages) {
  const pages = rawPages.map((page) => {
    const parsed = parseIncludeFromMd(page.md);
    const include = page.include || parsed?.include || null;
    const id = include && parsed?.id ? parsed.id : page.id;
    return { ...page, id, include, sourcePage: null };
  });
  const byId = new Map(pages.map((page) => [page.id, page]));
  for (const page of pages) {
    if (!page.include) continue;
    const source = byId.get(page.include);
    if (!source || source.include) continue;
    page.sourcePage = source;
  }
  return pages;
}

function loadGalaCatalog() {
  if (!galaCatalogPromise) {
    galaCatalogPromise = fetch(`${galaBase()}/pages.json?v=${Date.now()}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => resolveGalaPages(data.pages || []))
      .catch((err) => {
        galaCatalogPromise = null;
        throw err;
      });
  }
  return galaCatalogPromise;
}

function loadGalaGroups() {
  if (!galaGroupsPromise) {
    galaGroupsPromise = fetch(`gala-groups.json?v=${Date.now()}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .catch((err) => {
        galaGroupsPromise = null;
        throw err;
      });
  }
  return galaGroupsPromise;
}

function galaBannerHtml() {
  return `<div class="gala-banner"><p>Это страница из книги «Дискурс».</p><button type="button" class="gala-back">← Вернуться</button></div>`;
}

function bindGalaChrome() {
  els.content.querySelector(".gala-back")?.addEventListener("click", () => {
    if (state.galaFromIndex != null) {
      openPage(state.galaFromIndex);
      return;
    }
    showToc();
  });
  els.content.querySelectorAll(".gala-jump").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(a.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function leaveGala() {
  state.galaId = null;
  state.galaRender = false;
  document.body.classList.remove("view-gala");
}

function beginGalaView(id, meta) {
  if (!state.galaId) {
    state.galaFromIndex = isTocView() || document.body.classList.contains("cover-open")
      ? null
      : state.index;
  }
  state.galaId = id;
  hideCover();
  document.body.classList.remove("view-toc");
  document.body.classList.remove("view-part");
  document.body.classList.add("view-gala");
  document.title = "Дискурс — Книга Открытий";
  history.replaceState(null, "", `${location.pathname}${location.search}#gala/${id}`);
  syncNav();
  setMeta(meta);
  els.pageTitle.textContent = "…";
  els.content.innerHTML = `${galaBannerHtml()}<p>…</p>`;
  bindGalaChrome();
}

function renderGalaMarkdown(text) {
  state.galaRender = true;
  const html = renderMarkdown(text);
  state.galaRender = false;
  return html;
}

async function fetchGalaMarkdown(page) {
  const src = page.sourcePage || page;
  const res = await fetch(`${galaBase()}/${encodeURI(src.md)}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

function galaPageLabel(page) {
  const src = page.sourcePage || page;
  const title = titleFromMd(src.md).replace(/^-\s*/, "").trim() || src.id;
  return `${escapeHtml(title)} <span class="gala-page-id">(${escapeHtml(page.id)})</span>`;
}

function galaSectionHtml(page, text) {
  const sid = `gala-p-${page.id}`;
  const body = text == null
    ? '<p class="load-error">Не удалось открыть страницу.</p>'
    : renderGalaMarkdown(text);
  return `<section class="gala-section" id="${escapeHtml(sid)}"><h2 class="gala-section-title">${galaPageLabel(page)}</h2>${body}</section>`;
}

async function openGalaGroup(id, group) {
  const title = group.title || id;
  const ids = Array.isArray(group.pages) ? group.pages : [];
  beginGalaView(id, `Дискурс · ${ids.length}`);
  els.pageTitle.textContent = title;
  document.title = `${title} — Дискурс в Книге Открытий`;
  try {
    const catalog = await loadGalaCatalog();
    if (state.galaId !== id) return;
    const items = ids
      .map((pageId) => catalog.find((item) => item.id === pageId))
      .filter(Boolean);
    const parts = await Promise.all(items.map(async (page) => {
      try {
        return { page, text: await fetchGalaMarkdown(page) };
      } catch {
        return { page, text: null };
      }
    }));
    if (state.galaId !== id) return;
    const nav = `<ul class="gala-group-nav">${parts
      .map(({ page }) => `<li><a class="gala-jump" href="#gala-p-${escapeHtml(page.id)}" data-target="gala-p-${escapeHtml(page.id)}">${galaPageLabel(page)}</a></li>`)
      .join("")}</ul>`;
    const sections = parts.map(({ page, text }) => galaSectionHtml(page, text)).join("");
    els.content.innerHTML = galaBannerHtml() + nav + (sections || '<p class="load-error">В группе нет страниц.</p>');
    bindGalaChrome();
  } catch {
    if (state.galaId !== id) return;
    els.content.innerHTML = `${galaBannerHtml()}<p class="load-error">Не удалось открыть группу Дискурса.</p>`;
    bindGalaChrome();
  }
  document.getElementById("reader").scrollTop = 0;
}

async function openGalaPage(id) {
  try {
    const groups = await loadGalaGroups();
    if (groups && groups[id]) {
      await openGalaGroup(id, groups[id]);
      return;
    }
  } catch {
    // Fall through to a single Discourse page.
  }
  beginGalaView(id, `Дискурс ${id}`);
  try {
    const catalog = await loadGalaCatalog();
    if (state.galaId !== id) return;
    const page = catalog.find((item) => item.id === id);
    if (!page) throw new Error("missing");
    const title = titleFromMd(page.md);
    els.pageTitle.textContent = title;
    document.title = `${title} — Дискурс в Книге Открытий`;
    const text = await fetchGalaMarkdown(page);
    if (state.galaId !== id) return;
    els.content.innerHTML = galaBannerHtml() + renderGalaMarkdown(text);
    bindGalaChrome();
  } catch {
    if (state.galaId !== id) return;
    els.content.innerHTML = `${galaBannerHtml()}<p class="load-error">Не удалось открыть страницу Дискурса.</p>`;
    bindGalaChrome();
  }
  document.getElementById("reader").scrollTop = 0;
}

function titleFromMd(path) {
  return path
    .split("/")
    .pop()
    .replace(/\.md$/i, "")
    .replace(/^(?:\d+(?:\.\d+)*(?:-\d+(?:\.\d+)*)?|А\d+|Б\d+|B|[IVX]+)\.?\s*/, "")
    .trim();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function imageTag(src, alt) {
  const file = src.trim();
  if (state.galaRender) {
    const path = /^(https?:)?\/\//i.test(file) || file.startsWith("/")
      ? file
      : `${galaBase()}/${file.replace(/^\.\//, "")}`;
    return `<img src="${escapeHtml(path)}" alt="${escapeHtml(alt || "")}">`;
  }
  const path = /[\\/]/.test(file) ? file : `images/${file}`;
  return `<img src="${escapeHtml(path)}" alt="${escapeHtml(alt || "")}">`;
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, src) => imageTag(src, ""));
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => imageTag(src, alt));
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const galaHref = toGalaHash(href);
    if (galaHref) {
      return `<a href="${galaHref}">${label}</a>`;
    }
    if (href.startsWith("#")) {
      return `<a href="${href}">${label}</a>`;
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  html = html.replace(/(^|[^"'>=])(https?:\/\/[^\s<]+)/g, (_, prefix, url) => {
    const trimmed = url.replace(/[.,;:!?)]+$/, "");
    const suffix = url.slice(trimmed.length);
    return `${prefix}<a href="${trimmed}" target="_blank" rel="noopener noreferrer">${trimmed}</a>${suffix}`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function youtubeId(text) {
  const m = text
    .trim()
    .replace(/\s+\(embedded\)\s*$/i, "")
    .match(
      /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})(?:[?&]\S*)?$/i,
    );
  return m ? m[1] : null;
}

function youtubeEmbed(id) {
  return `<div class="yt-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
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
    if (line.startsWith(">")) {
      const quotes = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quotes.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      parts.push(`<blockquote>${quotes.map(renderInline).join("<br>")}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const item = lines[i].trim().match(/^[-*]\s+(.*)$/);
        if (!item) break;
        items.push(`<li>${renderInline(item[1])}</li>`);
        i += 1;
      }
      parts.push(`<ul>${items.join("")}</ul>`);
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
    if (/^!\[\[.+\]\]$/.test(line) || /^!\[[^\]]*\]\([^)]+\)$/.test(line)) {
      parts.push(`<p>${renderInline(line)}</p>`);
      i += 1;
      continue;
    }
    const yt = youtubeId(line);
    if (yt) {
      parts.push(youtubeEmbed(yt));
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
        next.startsWith(">") ||
        next.startsWith("|") ||
        /^[-*]\s+/.test(next) ||
        /^!\[\[.+\]\]$/.test(next) ||
        /^!\[[^\]]*\]\([^)]+\)$/.test(next) ||
        youtubeId(next) ||
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

function hideCover() {
  document.body.classList.remove("cover-open");
  els.coverScreen.classList.add("cover-hidden");
  els.coverScreen.setAttribute("aria-hidden", "true");
}

function showCover() {
  leaveGala();
  document.body.classList.add("cover-open");
  document.body.classList.remove("view-toc");
  document.body.classList.remove("view-part");
  els.coverScreen.classList.remove("cover-hidden");
  els.coverScreen.setAttribute("aria-hidden", "false");
  document.title = "Книга Открытий";
  history.replaceState(null, "", location.pathname + location.search);
}

function isTocView() {
  return document.body.classList.contains("view-toc");
}

function setMeta(text) {
  els.pageMetas.forEach((el) => {
    el.textContent = text;
  });
}

function setNavDisabled(prevsDisabled, nextsDisabled) {
  els.pagePrevs.forEach((el) => {
    el.disabled = prevsDisabled;
  });
  els.pageNexts.forEach((el) => {
    el.disabled = nextsDisabled;
  });
}

function syncNav() {
  if (isTocView()) {
    setNavDisabled(false, state.pages.length === 0);
    return;
  }
  setNavDisabled(false, state.index >= state.pages.length - 1);
}

function renderTocPage() {
  const parts = [
    `<button type="button" class="toc-page-cover-link">← К обложке</button>`,
  ];
  state.pages.forEach((page, index) => {
    if (page.kind === "part") {
      const label = page.subtitle ? `<span class="toc-part-label">${escapeHtml(page.subtitle)}</span>` : "";
      parts.push(
        `<button type="button" class="toc-part" data-index="${index}">${label}<span class="title">${escapeHtml(page.title)}</span></button>`,
      );
      return;
    }
    const num = escapeHtml(page.id);
    const title = escapeHtml(page.title);
    parts.push(
      `<button type="button" class="toc-page-item" data-index="${index}"><span class="num">${num}</span><span class="title">${title}</span></button>`,
    );
  });
  return `<div class="toc-page">${parts.join("")}</div>`;
}

function bindTocPageClicks() {
  els.content.querySelector(".toc-page-cover-link")?.addEventListener("click", showCover);
  els.content.querySelectorAll(".toc-page-item, .toc-part").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      if (Number.isFinite(index)) openPage(index);
    });
  });
}

function showToc() {
  leaveGala();
  hideCover();
  document.body.classList.remove("view-part");
  document.body.classList.add("view-toc");
  setMeta("Оглавление");
  els.pageTitle.textContent = "Оглавление";
  document.title = "Оглавление — Книга Открытий";
  history.replaceState(null, "", `${location.pathname}${location.search}#toc`);
  syncNav();
  els.content.innerHTML = renderTocPage();
  bindTocPageClicks();
  document.getElementById("reader").scrollTop = 0;
}

async function openPage(index) {
  const page = state.pages[index];
  if (!page) return;
  leaveGala();
  state.index = index;
  hideCover();
  document.body.classList.remove("view-toc");
  document.body.classList.toggle("view-part", page.kind === "part");
  document.title = `${page.title} — Книга Открытий`;
  history.replaceState(null, "", `${location.pathname}${location.search}#${page.id}`);
  syncNav();
  if (page.kind === "part") {
    setMeta("");
    els.pageTitle.textContent = "";
    const sub = page.subtitle
      ? `<span class="part-cover-sub">${escapeHtml(page.subtitle)}</span>`
      : "";
    els.content.innerHTML = `<button type="button" class="cover-image-btn part-cover" title="Открыть" aria-label="Открыть">${sub}<span class="part-cover-title">${escapeHtml(page.title)}</span></button>`;
    els.content.querySelector(".part-cover")?.addEventListener("click", goNext);
    document.getElementById("reader").scrollTop = 0;
    return;
  }
  setMeta(`${page.id} / ${state.pages.length}`);
  els.pageTitle.textContent = page.title;
  els.content.innerHTML = "<p>…</p>";
  try {
    const res = await fetch(`${encodeURI(page.md)}?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    els.content.innerHTML = renderMarkdown(text);
  } catch {
    els.content.innerHTML = '<p class="load-error">Не удалось открыть главу.</p>';
  }
  document.getElementById("reader").scrollTop = 0;
}

function enterBook() {
  showToc();
}

function goPrev() {
  if (isTocView()) {
    showCover();
    return;
  }
  if (state.index <= 0) {
    showToc();
    return;
  }
  openPage(state.index - 1);
}

function goNext() {
  if (isTocView()) {
    openPage(0);
    return;
  }
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
  els.pagePrevs.forEach((el) => el.addEventListener("click", goPrev));
  els.pageNexts.forEach((el) => el.addEventListener("click", goNext));
  els.tocTop.addEventListener("click", showToc);
  els.tocBottom.addEventListener("click", showToc);
  document.addEventListener("keydown", (e) => {
    if (document.body.classList.contains("cover-open")) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === "ArrowLeft") goPrev();
    if (e.code === "ArrowRight") goNext();
  });
  window.addEventListener("hashchange", applyHash);
  applyHash();
}

function applyHash() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (hash === "toc") {
    showToc();
    return;
  }
  if (hash.startsWith("gala/")) {
    openGalaPage(hash.slice(5));
    return;
  }
  const fromHash = state.pages.findIndex((p) => p.id === hash);
  if (fromHash >= 0) openPage(fromHash);
}

boot();
