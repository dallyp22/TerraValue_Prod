// API base URL.
// Empty string = same-origin: /api/* is served by the host (Cloudflare Pages
// Function proxies to the terravalue-api Worker, or local dev server).
// Override with VITE_API_URL only if you need to point at a remote API.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";
