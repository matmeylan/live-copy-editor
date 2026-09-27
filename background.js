// Live Copy Editor — service worker.
// The toolbar icon mirrors the mode stored in chrome.storage.local ("mode"):
//   - off:  plain icon; clicking it opens the side panel.
//   - on:   green dot on the icon; clicking it turns the mode off.
// Closing the side panel also turns the mode off.

// Chrome sizes the badge to its text, so a single space gives the smallest
// badge: a small green dot on the icon.
const BADGE = {
  off: { text: "", title: "Live Copy Editor" },
  edit: { text: " ", color: "#10b981", title: "Live Copy Editor · Editing (click to turn off)" },
  comment: { text: " ", color: "#10b981", title: "Live Copy Editor · Commenting (click to turn off)" }
};

function reflectMode(mode) {
  const b = BADGE[mode] || BADGE.off;
  chrome.action.setBadgeText({ text: b.text });
  if (b.color) {
    chrome.action.setBadgeBackgroundColor({ color: b.color });
  }
  chrome.action.setTitle({ title: b.title });
  // When off, Chrome opens the panel itself. When on, the click reaches
  // action.onClicked below instead, which turns the mode off.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: b === BADGE.off }).catch(() => {});
}

function setMode(mode) {
  return chrome.storage.local.set({ mode });
}

chrome.action.onClicked.addListener(() => setMode("off"));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.mode) reflectMode(changes.mode.newValue || "off");
});

// A fresh browser session or an extension update starts with no panel open,
// so there's nothing left to turn edit mode off: start from off.
chrome.runtime.onStartup.addListener(() => setMode("off"));
chrome.runtime.onInstalled.addListener(() => setMode("off"));

// Each open side panel holds a port to this worker. When the last one
// disconnects (the panel was closed), turn the mode off.
const panels = new Set();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "panel") return;
  panels.add(port);
  port.onDisconnect.addListener(() => {
    panels.delete(port);
    if (panels.size === 0) setMode("off");
  });
});

chrome.storage.local.get("mode", (data) => reflectMode(data.mode || "off"));
