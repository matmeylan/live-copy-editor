// Live Copy Editor — content script.
// Modes:
//   "edit"    – click any text element and rewrite it in place.
//   "comment" – click any element and attach a note (remove it, restyle it, ...).
//   "off"     – do nothing.
// Every committed edit or comment is stored in chrome.storage.local under "entries".

(() => {
  if (window.__lceLoaded) return;
  window.__lceLoaded = true;

  const STORAGE_KEY = "entries";
  const MODES = ["off", "edit", "comment"];
  let mode = "off";
  let hovered = null;
  let active = null; // edit: { el, before, selector }
  let popover = null; // comment: { root, el, selector }
  let badge = null;

  // ---------- helpers ----------

  const isOurs = (el) => Boolean(el && el.closest && el.closest(".lce-badge, .lce-popover"));

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1");
  }

  // Build a reasonably stable, readable selector for the element.
  function selectorFor(el) {
    if (el.id && document.querySelectorAll("#" + cssEscape(el.id)).length === 1) {
      return "#" + cssEscape(el.id);
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      if (node.id && document.querySelectorAll("#" + cssEscape(node.id)).length === 1) {
        parts.unshift("#" + cssEscape(node.id));
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  // Short human-readable description of an element for the log / prompt.
  function snippetFor(el) {
    const text = normalize(el.innerText || el.textContent || el.getAttribute("alt") || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "");
    return text.length > 120 ? text.slice(0, 117) + "…" : text;
  }

  // Element that should become editable for a click target (edit mode).
  function editableTarget(target) {
    let el = target;
    if (el.nodeType === 3) el = el.parentElement;
    if (!el || isOurs(el)) return null;
    const blocked = ["HTML", "BODY", "SCRIPT", "STYLE", "IMG", "VIDEO", "SVG", "CANVAS", "INPUT", "TEXTAREA", "SELECT", "IFRAME"];
    if (blocked.includes(el.tagName)) return null;
    if (!(el.textContent || "").trim()) return null;
    return el;
  }

  // Any element can be commented on (comment mode).
  function commentTarget(target) {
    let el = target;
    if (el.nodeType === 3) el = el.parentElement;
    if (!el || isOurs(el)) return null;
    if (["HTML", "BODY", "SCRIPT", "STYLE"].includes(el.tagName)) return null;
    // Inner SVG parts are noisy; comment on the <svg> itself.
    if (el.closest("svg")) el = el.closest("svg");
    return el;
  }

  function normalize(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---------- storage ----------

  function saveEntry(entry) {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      const entries = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
      if (entry.kind === "edit") {
        const existing = entries.find((e) => e.kind === "edit" && e.url === entry.url && e.selector === entry.selector);
        if (existing) {
          // Same element edited again: keep the original "before", update "after".
          existing.after = entry.after;
          existing.ts = entry.ts;
          if (normalize(existing.before) === normalize(existing.after)) {
            entries.splice(entries.indexOf(existing), 1);
          }
          chrome.storage.local.set({ [STORAGE_KEY]: entries });
          return;
        }
      }
      entries.push(entry);
      chrome.storage.local.set({ [STORAGE_KEY]: entries });
    });
  }

  // ---------- edit mode ----------

  function beginEdit(el) {
    if (active) commitEdit();
    active = { el, before: el.innerText, selector: selectorFor(el) };
    el.classList.remove("lce-hover");
    el.classList.add("lce-editing");
    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "false");
    el.focus();
    // Place caret at end.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function endEdit() {
    if (!active) return null;
    // Clear state first: removing contenteditable fires a synchronous blur,
    // and onBlur must not treat that as a second commit.
    const done = active;
    active = null;
    const { el } = done;
    el.removeAttribute("contenteditable");
    el.removeAttribute("spellcheck");
    el.classList.remove("lce-editing");
    return done;
  }

  function commitEdit() {
    const done = endEdit();
    if (!done) return;
    const after = done.el.innerText;
    if (normalize(after) === normalize(done.before)) return;
    saveEntry({
      id: newId(),
      kind: "edit",
      url: location.href,
      title: document.title,
      tag: done.el.tagName.toLowerCase(),
      selector: done.selector,
      before: done.before.trim(),
      after: after.trim(),
      ts: Date.now()
    });
  }

  function cancelEdit() {
    const done = endEdit();
    if (!done) return;
    done.el.innerText = done.before;
  }

  // ---------- comment mode ----------

  function openPopover(el) {
    closePopover();
    const selector = selectorFor(el);
    el.classList.remove("lce-hover-comment");
    el.classList.add("lce-commenting");

    const root = document.createElement("div");
    root.className = "lce-popover";
    root.innerHTML = `
      <span class="lce-popover-target"></span>
      <textarea placeholder="What should change here? e.g. remove this, make it blue, move it above the title…" rows="3"></textarea>
      <div class="lce-popover-actions">
        <span class="lce-popover-hint">⌘/Ctrl + Enter to add</span>
        <button type="button" class="lce-cancel">Cancel</button>
        <button type="button" class="lce-save" disabled>Add</button>
      </div>`;
    root.querySelector(".lce-popover-target").textContent = `<${el.tagName.toLowerCase()}>  ${selector}`;
    const textarea = root.querySelector("textarea");
    const saveBtn = root.querySelector(".lce-save");
    textarea.addEventListener("input", () => { saveBtn.disabled = !textarea.value.trim(); });
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closePopover(); }
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitComment(); }
      e.stopPropagation();
    });
    root.querySelector(".lce-cancel").addEventListener("click", closePopover);
    saveBtn.addEventListener("click", commitComment);

    document.documentElement.appendChild(root);
    positionPopover(root, el);
    popover = { root, el, selector };
    textarea.focus();
  }

  function positionPopover(root, el) {
    const r = el.getBoundingClientRect();
    const w = root.offsetWidth, h = root.offsetHeight, gap = 8, pad = 8;
    let top = r.bottom + gap;
    if (top + h > window.innerHeight - pad) top = Math.max(pad, r.top - h - gap);
    let left = r.left;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (left < pad) left = pad;
    root.style.top = `${top}px`;
    root.style.left = `${left}px`;
  }

  function closePopover() {
    if (!popover) return;
    const { root, el } = popover;
    popover = null;
    root.remove();
    el.classList.remove("lce-commenting");
  }

  function commitComment() {
    if (!popover) return;
    const { root, el, selector } = popover;
    const comment = root.querySelector("textarea").value.trim();
    closePopover();
    if (!comment) return;
    saveEntry({
      id: newId(),
      kind: "comment",
      url: location.href,
      title: document.title,
      tag: el.tagName.toLowerCase(),
      selector,
      snippet: snippetFor(el),
      comment,
      ts: Date.now()
    });
  }

  // ---------- events ----------

  const hoverClass = () => (mode === "comment" ? "lce-hover-comment" : "lce-hover");

  function clearHover() {
    if (hovered) hovered.classList.remove("lce-hover", "lce-hover-comment");
    hovered = null;
  }

  function onMouseOver(e) {
    if (mode === "off" || active || popover) return;
    const el = mode === "edit" ? editableTarget(e.target) : commentTarget(e.target);
    if (hovered && hovered !== el) clearHover();
    hovered = el;
    if (el) el.classList.add(hoverClass());
  }

  function onMouseOut() {
    clearHover();
  }

  function onClick(e) {
    if (mode === "off") return;
    if (isOurs(e.target)) return; // clicks inside the popover are normal clicks
    if (mode === "edit") {
      if (active && (e.target === active.el || active.el.contains(e.target))) return;
      e.preventDefault();
      e.stopPropagation();
      if (active) commitEdit();
      const el = editableTarget(e.target);
      if (el) beginEdit(el);
    } else {
      e.preventDefault();
      e.stopPropagation();
      if (popover) { closePopover(); return; }
      const el = commentTarget(e.target);
      if (el) openPopover(el);
    }
  }

  function onKeyDown(e) {
    if (mode === "edit" && active) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitEdit();
      }
    } else if (mode === "comment" && popover && !isOurs(e.target)) {
      if (e.key === "Escape") { e.preventDefault(); closePopover(); }
    }
  }

  function onBlur(e) {
    if (active && e.target === active.el) commitEdit();
  }

  function onScrollOrResize() {
    if (popover) positionPopover(popover.root, popover.el);
  }

  const BADGES = {
    edit: "Editing copy · click any text · Enter to save · Esc to cancel",
    comment: "Commenting · click any element · Esc to close"
  };

  function setMode(next) {
    if (!MODES.includes(next)) next = "off";
    if (mode === next) return;
    // Leave the current mode cleanly.
    if (active) commitEdit();
    closePopover();
    clearHover();
    if (mode !== "off") {
      document.removeEventListener("mouseover", onMouseOver, true);
      document.removeEventListener("mouseout", onMouseOut, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("blur", onBlur, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      badge?.remove();
      badge = null;
    }
    mode = next;
    if (mode !== "off") {
      document.addEventListener("mouseover", onMouseOver, true);
      document.addEventListener("mouseout", onMouseOut, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("blur", onBlur, true);
      window.addEventListener("scroll", onScrollOrResize, true);
      window.addEventListener("resize", onScrollOrResize);
      badge = document.createElement("div");
      badge.className = "lce-badge" + (mode === "comment" ? " lce-badge-comment" : "");
      badge.textContent = BADGES[mode];
      document.documentElement.appendChild(badge);
    }
  }

  // Restore an edited element's original text (best effort, if it's still on the page).
  function revert(entry) {
    if (entry.kind !== "edit" || entry.url !== location.href) return false;
    const el = document.querySelector(entry.selector);
    if (!el) return false;
    el.innerText = entry.before;
    return true;
  }

  // Briefly flash an element so the user can find it from the panel.
  function locate(entry) {
    if (entry.url !== location.href) return false;
    const el = document.querySelector(entry.selector);
    if (!el) return false;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("lce-commenting");
    setTimeout(() => el.classList.remove("lce-commenting"), 1200);
    return true;
  }

  // ---------- messaging ----------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case "lce:getMode":
        sendResponse({ mode });
        break;
      case "lce:setMode":
        setMode(msg.mode);
        sendResponse({ mode });
        break;
      case "lce:revert":
        sendResponse({ ok: revert(msg.entry) });
        break;
      case "lce:locate":
        sendResponse({ ok: locate(msg.entry) });
        break;
      case "lce:ping":
        sendResponse({ ok: true });
        break;
    }
    return false;
  });
})();
