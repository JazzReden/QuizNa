// An empty value uses the same origin, including the HTTPS phone-testing proxy.
// Local setup supplies VITE_API_URL in frontend/.env; production validates it at build time.
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
