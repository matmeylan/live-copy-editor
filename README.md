# Live Copy Editor

A tiny Chrome extension for rewriting website copy directly in the browser and handing the result to a coding agent.

Two modes, one log:

- **Edit** — hover any text element to outline it, click to rewrite it in place, press Enter. The before/after is logged.
- **Comment** — hover any element (button, image, section, anything) to outline it, click to attach a note like "remove this" or "make the background blue". The note is logged.

When you're done, **Export prompt** copies a ready-to-paste prompt that tells a coding agent exactly what to change, where, in the source code. Remove any entry you change your mind about before exporting.

![Side panel](screenshot.png)

## Install

No build step, no dependencies, nothing to run. It takes about a minute.

1. **Get the files.** Either download the ZIP (green **Code** button on GitHub → **Download ZIP**, or the `.zip` from the latest release) and unzip it, or clone the repo. You end up with a folder that contains `manifest.json`.
2. **Open Chrome's extensions page.** Paste `chrome://extensions` into the address bar and press Enter.
3. **Turn on Developer mode.** It's the switch in the top-right corner.
4. **Click "Load unpacked"** (top-left) and pick the folder from step 1.
5. **Pin it.** Click the puzzle-piece icon next to the address bar, then the pin next to *Live Copy Editor*. Clicking the icon opens the side panel.

Keep the folder where it is. Chrome loads the extension from there, so deleting or moving it disables the extension. To update, replace the folder's contents and click the refresh icon on the extension's card in `chrome://extensions`.

Works in Chrome, Edge, Brave and Arc (same steps, `edge://extensions` and `brave://extensions` respectively).

## Usage

| Action | How |
| --- | --- |
| Pick a mode | **Off / Edit / Comment** switch in the side panel |
| Edit text | In Edit mode, click any text element on the page, type |
| Save an edit | Press **Enter** or click elsewhere |
| Cancel an edit | Press **Esc** |
| Comment on an element | In Comment mode, click the element, type the note, **⌘/Ctrl+Enter** or **Add** |
| Find an entry on the page | Click the entry in the panel; the element scrolls into view and flashes |
| Remove an entry | Hover the entry, click **×** (a text edit is also reverted on the page) |
| Export | Click **Export prompt**; the prompt is copied to the clipboard |
| Start over | Click **Clear** |

In both modes, links and buttons don't fire, so you can rewrite or annotate them safely.
Editing the same element twice keeps the original text and updates only the new text.

## What the exported prompt looks like

```
You are updating the copy (text content) of a website.
...
## Page: https://example.com/pricing
Title: Pricing – Acme

### Change 1 — text edit
- Element: <h1>  (selector: `#hero`)
- Original text:
```
Simple pricing for everyone
```
- New text:
```
Pricing that scales with you
```

### Change 2 — comment
- Element: <button>  (selector: `#cta-btn`)
- Current text: "Start free trial"
- Request:
```
Make this button green and move it above the pricing text
```
```

## Files

- `manifest.json` – MV3 manifest (side panel, storage, activeTab, scripting)
- `background.js` – opens the side panel on toolbar click
- `content.js` / `content.css` – hover outlines, in-place editing, comment popover, change logging
- `panel.html` / `panel.css` / `panel.js` – the side panel UI and prompt export

Edits are stored in `chrome.storage.local`, so they survive reloads and are shared across tabs until cleared.
