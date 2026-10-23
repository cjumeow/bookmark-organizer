import type { ChromeNode } from "@bookmark-organizer/shared";

import { connect, type Handler } from "./bridge.js";

/** The alarm that wakes the service worker to connect while it is not connected. */
const CONNECT_ALARM = "connect";

/** A node with only the fields the server uses, unchanged otherwise. */
function toChromeNode(node: chrome.bookmarks.BookmarkTreeNode): ChromeNode {
  return {
    id: node.id,
    title: node.title,
    url: node.url,
    children: node.children?.map(toChromeNode),
    folderType: node.folderType,
    syncing: node.syncing,
    unmodifiable: node.unmodifiable,
  };
}

const handlers: Record<string, Handler> = {
  async getTree(): Promise<{ tree: ChromeNode[] }> {
    const [root] = await chrome.bookmarks.getTree();
    return { tree: (root?.children ?? []).map(toChromeNode) };
  },
};

function start(): void {
  // Alarms may not survive a browser restart, so create it again on every start. 30 seconds is the shortest period
  // Chrome allows.
  void chrome.alarms.create(CONNECT_ALARM, { periodInMinutes: 0.5 });
  connect(handlers);
}

chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);
chrome.alarms.onAlarm.addListener(({ name }) => {
  if (name === CONNECT_ALARM) connect(handlers);
});
