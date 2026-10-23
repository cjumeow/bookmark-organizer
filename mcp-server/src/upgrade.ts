import type { IncomingHttpHeaders } from "node:http";

/**
 * Whether the bridge accepts a WebSocket upgrade with these headers: only from the extension (its `Origin`, which a web
 * page cannot set) and only addressed to the bridge itself (its `Host`, which a page reaching 127.0.0.1 through a
 * rebound domain name does not have). See docs/adr/0002-websocket-bridge.md.
 */
export function isUpgradeAllowed(headers: IncomingHttpHeaders, allowed: { origin: string; host: string }): boolean {
  return headers.origin === allowed.origin && headers.host === allowed.host;
}
