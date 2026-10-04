import { ProcurementAssistant } from "./ui";
import type { NetworkCandidate } from "./types";

const MESSAGE_TYPE = "TAOBAO_PROCUREMENT_NETWORK_ITEMS_V1";
const networkItems: NetworkCandidate[] = [];

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = event.data as { type?: string; items?: NetworkCandidate[] };
  if (message?.type !== MESSAGE_TYPE || !Array.isArray(message.items)) return;
  for (const item of message.items.slice(0, 200)) {
    if (!item || typeof item.id !== "string" || typeof item.name !== "string") continue;
    const index = networkItems.findIndex((existing) => existing.id === item.id);
    if (index >= 0) networkItems[index] = item;
    else networkItems.push(item);
  }
});

async function start(): Promise<void> {
  if (window.top !== window) return;
  if (location.hostname === "buy.taobao.com" && !/confirm.?order|order.?confirm/i.test(location.pathname)) return;
  if (document.getElementById("taobao-procurement-assistant-host")) return;
  const assistant = new ProcurementAssistant(networkItems);
  await assistant.mount();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
} else {
  void start();
}
