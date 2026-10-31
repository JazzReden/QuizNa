export function allowedOrigins(env: NodeJS.ProcessEnv): string[] {
  // Production permits exactly one configured frontend. Legacy local previews
  // may continue using CORS_ORIGIN without changing their environment files.
  const configured = env.FRONTEND_URL?.trim();
  if (env.NODE_ENV === "production") {
    if (!configured) throw new Error("FRONTEND_URL is required in production");
    let url: URL;
    try { url = new URL(configured); }
    catch { throw new Error("FRONTEND_URL must be an HTTPS origin"); }
    if (url.protocol !== "https:" || url.origin !== configured || url.username || url.password ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error("FRONTEND_URL must be an HTTPS origin without a trailing slash or path");
    }
    return [configured];
  }
  return (configured || env.CORS_ORIGIN || "http://localhost:5173")
    .split(",").map(origin => origin.trim()).filter(Boolean);
}
