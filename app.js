const els = {
  coverScreen: document.getElementById("cover-screen"),
  coverEnter: document.getElementById("cover-enter"),
  coverHome: document.getElementById("cover-home"),
  pageMetas: document.querySelectorAll(".page-meta"),
  pageTitle: document.getElementById("page-title"),
  pagePrevs: document.querySelectorAll(".page-prev"),
  pageNexts: document.querySelectorAll(".page-next"),
  galaMetas: document.querySelectorAll(".gala-meta"),
  galaPrevs: document.querySelectorAll(".gala-prev"),
  galaNexts: document.querySelectorAll(".gala-next"),
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
  tocQuery: "",
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
  setGalaMeta("");
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
  setOpenMetaForGala();
  setGalaMeta(meta);
  syncNav();
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

function galaPageTitle(page) {
  const src = page?.sourcePage || page;
  if (!src) return "";
  return titleFromMd(src.md).replace(/^-\s*/, "").trim() || src.id;
}

function appendGalaGroup(out, key, group, byId) {
  let n = 0;
  for (const gid of group.pages || []) {
    const src = byId.get(gid);
    if (!src) continue;
    n += 1;
    out.push({
      id: `gala/${gid}`,
      kind: "gala",
      galaId: gid,
      galaIndex: n,
      galaGroup: key,
      galaGroupTitle: group.title || key,
      galaHideLabel: Boolean(group.hideLabel),
      title: galaPageTitle(src),
      source: src,
    });
  }
}

function spliceGalaPages(openPages, groups, catalog) {
  const byId = new Map((catalog || []).map((page) => [page.id, page]));
  const pending = { ...(groups || {}) };
  const out = [];
  for (const page of openPages) {
    out.push(page);
    for (const [key, group] of Object.entries(pending)) {
      const atHub = page.galaHub && !group.after;
      const atAfter = group.after && group.after === page.id;
      if (!atHub && !atAfter) continue;
      appendGalaGroup(out, key, group, byId);
      delete pending[key];
    }
  }
  return out;
}

function findGalaPageIndex(id) {
  const groupFirst = state.pages.findIndex((page) => page.kind === "gala" && page.galaGroup === id);
  if (groupFirst >= 0) return groupFirst;
  return state.pages.findIndex((page) => page.kind === "gala" && (page.galaId === id || page.id === `gala/${id}`));
}

async function openGalaBookPage(index) {
  const page = state.pages[index];
  if (!page || page.kind !== "gala") return;
  const hub = state.pages.findIndex((item) => item.galaHub);
  state.index = index;
  state.galaId = page.galaId;
  state.galaFromIndex = hub >= 0 ? hub : null;
  hideCover();
  document.body.classList.remove("view-toc");
  document.body.classList.remove("view-part");
  document.body.classList.add("view-gala");
  document.title = `${page.title} — Дискурс в Книге Открытий`;
  history.replaceState(null, "", `${location.pathname}${location.search}#${page.id}`);
  setOpenMetaForGala();
  setGalaMeta(`Дискурс ${page.galaId}`);
  syncNav();
  els.pageTitle.textContent = page.title;
  els.content.innerHTML = `${galaBannerHtml()}<p>…</p>`;
  bindGalaChrome();
  try {
    const text = await fetchGalaMarkdown(page.source);
    if (state.index !== index) return;
    els.content.innerHTML = galaBannerHtml() + renderGalaMarkdown(text);
    bindGalaChrome();
  } catch {
    if (state.index !== index) return;
    els.content.innerHTML = `${galaBannerHtml()}<p class="load-error">Не удалось открыть страницу Дискурса.</p>`;
    bindGalaChrome();
  }
  document.getElementById("reader").scrollTop = 0;
}

function openGalaPage(id) {
  const index = findGalaPageIndex(id);
  if (index >= 0) {
    openPage(index);
    return;
  }
  beginGalaView(id, `Дискурс ${id}`);
  loadGalaCatalog()
    .then(async (catalog) => {
      if (state.galaId !== id) return;
      const page = catalog.find((item) => item.id === id);
      if (!page) throw new Error("missing");
      els.pageTitle.textContent = galaPageTitle(page);
      document.title = `${els.pageTitle.textContent} — Дискурс в Книге Открытий`;
      const text = await fetchGalaMarkdown(page);
      if (state.galaId !== id) return;
      els.content.innerHTML = galaBannerHtml() + renderGalaMarkdown(text);
      bindGalaChrome();
    })
    .catch(() => {
      if (state.galaId !== id) return;
      els.content.innerHTML = `${galaBannerHtml()}<p class="load-error">Не удалось открыть страницу Дискурса.</p>`;
      bindGalaChrome();
    });
}

function titleFromMd(path) {
  return path
    .split("/")
    .pop()
    .replace(/\.md$/i, "")
    .replace(/^(?:\d+(?:\.\d+)*(?:-\d+(?:\.\d+)*)?|А\d+|Б\d+|В\d+|B|В|[IVX]+)\.?\s*/, "")
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

function setGalaMeta(text) {
  els.galaMetas.forEach((el) => {
    el.textContent = text;
  });
}

function bookLen() {
  return state.pages.filter((item) => item.kind !== "gala").length;
}

function currentPage() {
  return state.pages[state.index];
}

function nearestPageIndex(from, dir, pred) {
  for (let i = from + dir; i >= 0 && i < state.pages.length; i += dir) {
    if (pred(state.pages[i])) return i;
  }
  return -1;
}

function galaGroupLen(group) {
  return state.pages.filter((item) => item.kind === "gala" && item.galaGroup === group).length;
}

function setOpenMetaForGala(page) {
  const current = page || currentPage();
  if (current?.kind === "gala" && current.galaIndex != null) {
    setMeta(`${current.galaIndex} / ${galaGroupLen(current.galaGroup)}`);
    return;
  }
  setMeta("");
}

function setNavDisabled(prevsDisabled, nextsDisabled) {
  els.pagePrevs.forEach((el) => {
    el.disabled = prevsDisabled;
  });
  els.pageNexts.forEach((el) => {
    el.disabled = nextsDisabled;
  });
}

function setGalaNavDisabled(prevsDisabled, nextsDisabled) {
  els.galaPrevs.forEach((el) => {
    el.disabled = prevsDisabled;
  });
  els.galaNexts.forEach((el) => {
    el.disabled = nextsDisabled;
  });
}

function syncNav() {
  if (isTocView()) {
    setNavDisabled(false, state.pages.length === 0);
    setGalaNavDisabled(true, true);
    return;
  }
  setNavDisabled(false, state.index >= state.pages.length - 1);
  const page = currentPage();
  if (page?.kind === "gala") {
    const prevGala = nearestPageIndex(state.index, -1, (item) => item.kind === "gala");
    const nextGala = nearestPageIndex(state.index, 1, (item) => item.kind === "gala");
    setGalaNavDisabled(prevGala < 0, nextGala < 0);
    return;
  }
  setGalaNavDisabled(true, true);
}

function foldSearch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е");
}

function tocSearchHay(page) {
  return foldSearch(
    [page.id, page.title, page.subtitle, page.galaId, page.galaIndex, page.galaGroup, page.galaGroupTitle]
      .filter((value) => value != null && value !== "")
      .join(" "),
  );
}

function seedSearchText() {
  for (const page of state.pages) {
    page.searchText = tocSearchHay(page);
  }
}

function pageMarkdownUrl(page) {
  if (page.kind === "gala") {
    const src = page.source?.sourcePage || page.source;
    if (!src?.md) return null;
    return `${galaBase()}/${encodeURI(src.md)}`;
  }
  if (!page.md) return null;
  return encodeURI(page.md);
}

function pageMatchesQuery(page, query) {
  if (!query) return true;
  return foldSearch(page.searchText || tocSearchHay(page)).includes(query);
}

async function mapPool(items, limit, fn) {
  let i = 0;
  const n = Math.min(limit, items.length);
  if (!n) return;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const item = items[i];
      i += 1;
      await fn(item);
    }
  }));
}

async function indexPageText(page) {
  const url = pageMarkdownUrl(page);
  const meta = tocSearchHay(page);
  if (!url) {
    page.searchText = meta;
    return;
  }
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    page.searchText = foldSearch(`${meta}\n${text}`);
  } catch {
    page.searchText = meta;
  }
}

async function indexBookSearch() {
  const gala = [];
  const own = [];
  for (const page of state.pages) {
    if (!pageMarkdownUrl(page)) continue;
    if (page.kind === "gala") gala.push(page);
    else own.push(page);
  }
  let indexed = 0;
  await mapPool([...gala, ...own], 6, async (page) => {
    await indexPageText(page);
    indexed += 1;
    if (indexed === gala.length || indexed % 12 === 0) {
      if (isTocView()) applyTocFilter();
    }
  });
  if (isTocView()) applyTocFilter();
}

function escapeAttr(text) {
  return escapeHtml(String(text)).replace(/"/g, "&quot;");
}

function renderTocPage() {
  const query = escapeAttr(state.tocQuery || "");
  const parts = [
    `<button type="button" class="toc-page-cover-link">← К обложке</button>`,
    `<label class="toc-search-wrap">
      <span class="search-loupe" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="6.5"></circle>
          <path d="M20 20l-3.2-3.2"></path>
        </svg>
      </span>
      <input id="toc-search" type="search" value="${query}" placeholder="Поиск по книге…" autocomplete="off" spellcheck="false" aria-label="Поиск по книге">
    </label>`,
    `<p class="toc-search-empty" hidden>Ничего не найдено</p>`,
  ];
  let lastGroup = null;
  state.pages.forEach((page, index) => {
    if (page.kind === "gala") {
      if (page.galaGroup !== lastGroup) {
        lastGroup = page.galaGroup;
        if (!page.galaHideLabel && page.galaGroupTitle) {
          parts.push(
            `<button type="button" class="toc-gala-label toc-row" data-index="${index}">${escapeHtml(page.galaGroupTitle)}</button>`,
          );
        }
      }
      parts.push(
        `<button type="button" class="toc-page-item toc-gala-item toc-row" data-index="${index}"><span class="num">${page.galaIndex}</span><span class="title">${escapeHtml(page.title)}</span><span class="gala-page-id">(${escapeHtml(page.galaId)})</span></button>`,
      );
      return;
    }
    lastGroup = null;
    if (page.kind === "part") {
      const label = page.subtitle ? `<span class="toc-part-label">${escapeHtml(page.subtitle)}</span>` : "";
      parts.push(
        `<button type="button" class="toc-part toc-row" data-index="${index}">${label}<span class="title">${escapeHtml(page.title)}</span></button>`,
      );
      return;
    }
    parts.push(
      `<button type="button" class="toc-page-item toc-row" data-index="${index}"><span class="num">${escapeHtml(page.id)}</span><span class="title">${escapeHtml(page.title)}</span></button>`,
    );
  });
  return `<div class="toc-page">${parts.join("")}</div>`;
}

function applyTocFilter() {
  const input = els.content.querySelector("#toc-search");
  const empty = els.content.querySelector(".toc-search-empty");
  const query = foldSearch((input?.value || state.tocQuery || "").trim());
  const rows = [...els.content.querySelectorAll(".toc-row")];
  if (!query) {
    rows.forEach((el) => el.classList.remove("toc-filter-hide"));
    if (empty) empty.hidden = true;
    return;
  }

  const matches = rows.map((el) => {
    const page = state.pages[Number(el.dataset.index)];
    return Boolean(page && pageMatchesQuery(page, query));
  });
  const shown = matches.slice();

  for (let i = 0; i < rows.length; i += 1) {
    if (!matches[i]) continue;
    const el = rows[i];
    if (el.classList.contains("toc-part")) {
      for (let j = i + 1; j < rows.length && !rows[j].classList.contains("toc-part"); j += 1) {
        shown[j] = true;
      }
    }
    if (el.classList.contains("toc-gala-label")) {
      for (let j = i + 1; j < rows.length && rows[j].classList.contains("toc-gala-item"); j += 1) {
        shown[j] = true;
      }
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    if (shown[i]) continue;
    const el = rows[i];
    if (el.classList.contains("toc-gala-label")) {
      for (let j = i + 1; j < rows.length && rows[j].classList.contains("toc-gala-item"); j += 1) {
        if (shown[j]) {
          shown[i] = true;
          break;
        }
      }
    }
    if (el.classList.contains("toc-part")) {
      for (let j = i + 1; j < rows.length && !rows[j].classList.contains("toc-part"); j += 1) {
        if (shown[j]) {
          shown[i] = true;
          break;
        }
      }
    }
  }

  rows.forEach((el, i) => el.classList.toggle("toc-filter-hide", !shown[i]));
  if (empty) empty.hidden = shown.some(Boolean);
}

function firstVisibleTocPageIndex() {
  const btn = els.content.querySelector(".toc-page-item:not(.toc-filter-hide)");
  const index = Number(btn?.dataset.index);
  return Number.isFinite(index) ? index : -1;
}

function bindTocPageClicks() {
  els.content.querySelector(".toc-page-cover-link")?.addEventListener("click", showCover);
  els.content.querySelectorAll(".toc-page-item, .toc-part, .toc-gala-label").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      if (Number.isFinite(index)) openPage(index);
    });
  });
  const input = els.content.querySelector("#toc-search");
  if (!input) return;
  input.addEventListener("input", () => {
    state.tocQuery = input.value;
    applyTocFilter();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && input.value) {
      e.preventDefault();
      input.value = "";
      state.tocQuery = "";
      applyTocFilter();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const index = firstVisibleTocPageIndex();
      if (index >= 0) openPage(index);
    }
  });
  applyTocFilter();
  queueMicrotask(() => input.focus());
}

function showToc() {
  leaveGala();
  hideCover();
  document.body.classList.remove("view-part");
  document.body.classList.add("view-toc");
  setMeta("Оглавление");
  setGalaMeta("");
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
  if (page.kind === "gala") {
    await openGalaBookPage(index);
    return;
  }
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
  setMeta(`${page.id} / ${bookLen()}`);
  setGalaMeta("");
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

function goGalaPrev() {
  const index = nearestPageIndex(state.index, -1, (item) => item.kind === "gala");
  if (index >= 0) openPage(index);
}

function goGalaNext() {
  const index = nearestPageIndex(state.index, 1, (item) => item.kind === "gala");
  if (index >= 0) openPage(index);
}

async function boot() {
  const manifest = await fetch(`pages.json?v=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
  state.pages = manifest.pages.map((page) => ({
    ...page,
    title: page.title || titleFromMd(page.md),
  }));
  try {
    const [groups, catalog] = await Promise.all([loadGalaGroups(), loadGalaCatalog()]);
    state.pages = spliceGalaPages(state.pages, groups, catalog);
  } catch {
    // Guest pages stay omitted if Discourse is unreachable.
  }
  seedSearchText();
  indexBookSearch();
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
  els.galaPrevs.forEach((el) => el.addEventListener("click", goGalaPrev));
  els.galaNexts.forEach((el) => el.addEventListener("click", goGalaNext));
  els.tocTop.addEventListener("click", showToc);
  els.tocBottom.addEventListener("click", showToc);
  document.addEventListener("keydown", (e) => {
    if (document.body.classList.contains("cover-open")) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === "ArrowLeft") {
      if (currentPage()?.kind === "gala") goGalaPrev();
      else goPrev();
    }
    if (e.code === "ArrowRight") {
      if (currentPage()?.kind === "gala") goGalaNext();
      else goNext();
    }
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
    const rest = hash.slice(5);
    const index = findGalaPageIndex(rest);
    if (index >= 0) {
      openPage(index);
      return;
    }
    openGalaPage(rest);
    return;
  }
  const fromHash = state.pages.findIndex((p) => p.id === hash);
  if (fromHash >= 0) openPage(fromHash);
}

boot();
