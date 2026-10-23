chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.info(`Bookmark Organizer ${chrome.runtime.getManifest().version}: ${reason}`);
});
