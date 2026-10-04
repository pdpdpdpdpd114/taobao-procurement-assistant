import { extractNetworkCandidates } from "./network-parser";

const MESSAGE_TYPE = "TAOBAO_PROCUREMENT_NETWORK_ITEMS_V1";
const CAPTURED = Symbol("taobaoProcurementCaptured");

function shouldInspect(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.includes("cart") ||
    normalized.includes("trade") ||
    normalized.includes("mtop.taobao");
}

function publish(url: string, payload: unknown): void {
  try {
    const items = extractNetworkCandidates(payload);
    if (!items.length) return;
    window.postMessage({ type: MESSAGE_TYPE, url: new URL(url, location.href).origin, items }, location.origin);
  } catch {
    // Network capture is only a fallback. Never interfere with the host page.
  }
}

const originalFetch = window.fetch;
if (!(originalFetch as unknown as Record<symbol, boolean>)[CAPTURED]) {
  const wrappedFetch: typeof window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
    if (shouldInspect(url)) {
      response.clone().json().then((payload) => publish(url, payload)).catch(() => undefined);
    }
    return response;
  };
  (wrappedFetch as unknown as Record<symbol, boolean>)[CAPTURED] = true;
  window.fetch = wrappedFetch;
}

const xhrOpen = XMLHttpRequest.prototype.open;
const xhrSend = XMLHttpRequest.prototype.send;
const xhrUrl = new WeakMap<XMLHttpRequest, string>();

XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: unknown[]) {
  xhrUrl.set(this, String(url));
  return (xhrOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
  const url = xhrUrl.get(this) || "";
  if (shouldInspect(url)) {
    this.addEventListener("load", () => {
      try {
        const payload = typeof this.response === "object" && this.response !== null
          ? this.response
          : JSON.parse(this.responseText);
        publish(url, payload);
      } catch {
        // Ignore non-JSON responses.
      }
    }, { once: true });
  }
  return xhrSend.call(this, body);
};
