export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    /[\\\r\n]/.test(value)
  )
    return "/";
  // Keep login redirects within supported app pages, including the selected sheet.
  return /^\/(?:teacher(?:\/|\?|#|$)|student(?:\/|\?|#|$)|take\/|result\/)/.test(
    value,
  )
    ? value
    : "/";
}
