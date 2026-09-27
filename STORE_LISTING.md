# Chrome Web Store listing

Copy-paste material for the Developer Dashboard. The first submission is manual; after that CI ships every push to `main`.

## Store listing tab

**Name:** Live Copy Editor

**Summary** (132 chars max):
Rewrite text and comment on any element, live on any page. Export every change as a prompt for your AI coding agent.

**Category:** Developer Tools

**Description:**

Mark up a live website the way you'd mark up a document, then hand the whole thing to an AI coding agent.

EDIT MODE
Hover any text to outline it, click, and rewrite it in place. Enter saves, Esc cancels. Every change is logged with the original and new text.

COMMENT MODE
Hover any element — a button, an image, a section — and click to leave a note: "remove this", "make it green", "move it above the title".

ONE LOG, ONE PROMPT
Every edit and comment lands in a small side panel, grouped by page. Remove what you change your mind about. Click Export prompt and paste the result into Claude Code, Cursor, Copilot or any agent: it lists each change with its page URL, element, selector and exact wording, so the agent can find and apply it in your source code.

- Works on any site, including localhost and staging
- Stays on as you navigate, so you can review a whole site in one pass
- Nothing leaves your browser: no account, no server, no tracking

**Screenshots** (1280×800, 24-bit, no alpha, ready to upload), PNG or JPEG:
`docs/store/1-edit`, `docs/store/2-comment`, `docs/store/3-export`, `docs/store/4-dark`

**Small promo tile** (440×280): `docs/store/promo-440x280`

Don't upload anything from `docs/screens/`: those are 2× captures for the README and the store rejects their size.

**Icon:** `icons/icon128.png`

## Privacy tab

**Single purpose:**
Lets a user edit text and annotate elements on the current web page, keeps a log of those changes, and exports them as a text prompt.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `sidePanel` | The change log and mode switch live in Chrome's side panel. |
| `storage` | Saves the user's logged changes and current mode locally so they survive navigation and reloads. |
| `activeTab` | Talks to the page the user is currently viewing to toggle editing and locate logged elements. |
| `scripting` | Injects the editor into tabs that were already open before the extension was installed. |
| `tabs` | Reads the active tab's URL so each logged change records which page it belongs to, and so the panel can tell when the user switches tabs. |
| Host permission `<all_urls>` | The user can edit copy on any website they are reviewing, including their own staging and localhost sites; there is no fixed list of domains. |

**Remote code:** No, I am not using remote code.

**Data usage:** Check nothing. The extension does not collect or transmit user data. Certify the three disclosures.

**Privacy policy URL:** https://github.com/matmeylan/live-copy-editor-/blob/main/PRIVACY.md
