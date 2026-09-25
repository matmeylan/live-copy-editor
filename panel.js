// Live Copy Editor — side panel.
// Source of truth is chrome.storage.local["entries"]; the panel renders it
// and talks to the active tab's content script to toggle edit mode / revert.

const STORAGE_KEY = "entries";
const $ = (id) => document.getElementById(id);

const list = $("list");
const empty = $("empty");
const count = $("count");
const modes = $("modes");
const modeButtons = Array.from(modes.querySelectorAll(".mode"));
const statusDot = $("statusDot");
const exportBtn = $("exportBtn");
const clearBtn = $("clearBtn");
const toast = $("toast");
const entryTpl = $("entryTpl");
const groupTpl = $("groupTpl");

let entries = [];

// ---------- tab messaging ----------

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(msg) {
  const tab = await activeTab();
  if (!tab?.id || !/^https?:|^file:/.test(tab.url || "")) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    // Content script not present (page loaded before install) — inject it.
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tab.id, msg);
    } catch {
      return null;
    }
  }
}

function reflectMode(mode, available = true) {
  for (const b of modeButtons) {
    const on = b.dataset.mode === mode;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-checked", String(on));
  }
  modes.classList.toggle("is-disabled", !available);
  statusDot.classList.toggle("on", mode === "edit");
  statusDot.classList.toggle("comment", mode === "comment");
}

async function syncMode() {
  const res = await sendToTab({ type: "lce:getMode" });
  reflectMode(res?.mode || "off", res !== null);
}

modes.addEventListener("click", async (e) => {
  const btn = e.target.closest(".mode");
  if (!btn) return;
  const res = await sendToTab({ type: "lce:setMode", mode: btn.dataset.mode });
  if (res === null) {
    reflectMode("off", false);
    showToast("Can't use this page");
    return;
  }
  reflectMode(res.mode);
});

chrome.tabs.onActivated.addListener(syncMode);
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === "complete") syncMode(); });

// ---------- storage ----------

function load() {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    entries = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    render();
  });
}

function save() {
  chrome.storage.local.set({ [STORAGE_KEY]: entries });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    entries = changes[STORAGE_KEY].newValue || [];
    render();
  }
});

// ---------- render ----------

function render() {
  list.querySelectorAll(".group").forEach((g) => g.remove());
  count.textContent = String(entries.length);
  empty.hidden = entries.length > 0;
  exportBtn.disabled = clearBtn.disabled = entries.length === 0;

  const byUrl = new Map();
  for (const e of entries) {
    if (!byUrl.has(e.url)) byUrl.set(e.url, []);
    byUrl.get(e.url).push(e);
  }

  for (const [url, items] of byUrl) {
    const group = groupTpl.content.firstElementChild.cloneNode(true);
    group.querySelector(".page-title").textContent = items[0].title || url;
    group.querySelector(".page-url").textContent = prettyUrl(url);
    group.querySelector(".page-url").title = url;
    const holder = group.querySelector(".group-entries");
    for (const e of items.slice().sort((a, b) => a.ts - b.ts)) {
      const node = entryTpl.content.firstElementChild.cloneNode(true);
      const kind = e.kind === "comment" ? "comment" : "edit";
      node.classList.add(`is-${kind}`);
      node.querySelector(".tag").textContent = e.tag;
      const sel = node.querySelector(".selector");
      sel.textContent = e.selector;
      sel.title = e.selector;
      if (kind === "edit") {
        node.querySelector(".before").textContent = e.before;
        node.querySelector(".after").textContent = e.after;
      } else {
        node.querySelector(".snippet").textContent = e.snippet || "";
        node.querySelector(".comment").textContent = e.comment;
      }
      node.querySelector(".remove").addEventListener("click", (ev) => { ev.stopPropagation(); removeEntry(e); });
      node.addEventListener("click", () => sendToTab({ type: "lce:locate", entry: e }));
      holder.appendChild(node);
    }
    list.appendChild(group);
  }
}

function prettyUrl(url) {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}

async function removeEntry(entry) {
  if (entry.kind !== "comment") await sendToTab({ type: "lce:revert", entry });
  entries = entries.filter((e) => e.id !== entry.id);
  save();
  render();
}

clearBtn.addEventListener("click", () => {
  if (!entries.length) return;
  entries = [];
  save();
  render();
  showToast("Cleared");
});

// ---------- export ----------

function buildPrompt() {
  const hasEdits = entries.some((e) => e.kind !== "comment");
  const hasComments = entries.some((e) => e.kind === "comment");
  const lines = [];
  lines.push("You are updating a website based on changes I marked up live in the browser.");
  lines.push("");
  lines.push("Below is a list of changes, grouped by page. There are two kinds:");
  if (hasEdits) lines.push("- **Text edit**: find where the ORIGINAL text lives in the source code (templates, components, markdown/content files, i18n/translation files, CMS fixtures, etc.) and replace it with the NEW text.");
  if (hasComments) lines.push("- **Comment**: a request about a specific element (remove it, restyle it, move it, change its behaviour, ...). Find the element in the source using the tag, selector and current text as hints, and implement the request.");
  lines.push("");
  lines.push("Rules:");
  lines.push("- Make only the changes listed. Preserve markup, formatting, variables/interpolations, links, and surrounding code unless a change requires otherwise.");
  lines.push("- If the same text or element appears in several places, update the one that renders on the page/element described; ask if it is ambiguous.");
  lines.push("- The CSS selector and tag come from the rendered DOM and are hints, not necessarily the source structure.");
  lines.push("");

  const byUrl = new Map();
  for (const e of entries) {
    if (!byUrl.has(e.url)) byUrl.set(e.url, []);
    byUrl.get(e.url).push(e);
  }

  let n = 1;
  for (const [url, items] of byUrl) {
    lines.push(`## Page: ${url}`);
    if (items[0].title) lines.push(`Title: ${items[0].title}`);
    lines.push("");
    for (const e of items.slice().sort((a, b) => a.ts - b.ts)) {
      if (e.kind === "comment") {
        lines.push(`### Change ${n++} — comment`);
        lines.push(`- Element: <${e.tag}>  (selector: \`${e.selector}\`)`);
        if (e.snippet) lines.push(`- Current text: "${e.snippet}"`);
        lines.push("- Request:");
        lines.push(quote(e.comment));
      } else {
        lines.push(`### Change ${n++} — text edit`);
        lines.push(`- Element: <${e.tag}>  (selector: \`${e.selector}\`)`);
        lines.push("- Original text:");
        lines.push(quote(e.before));
        lines.push("- New text:");
        lines.push(quote(e.after));
      }
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

function quote(text) {
  return "```\n" + text + "\n```";
}

exportBtn.addEventListener("click", async () => {
  if (!entries.length) return;
  const prompt = buildPrompt();
  try {
    await navigator.clipboard.writeText(prompt);
    showToast(`Prompt copied · ${entries.length} change${entries.length === 1 ? "" : "s"}`);
  } catch {
    // Clipboard blocked: fall back to a download.
    const blob = new Blob([prompt], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "copy-edits-prompt.md";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Prompt downloaded");
  }
});

// ---------- toast ----------

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

// ---------- init ----------

load();
syncMode();
