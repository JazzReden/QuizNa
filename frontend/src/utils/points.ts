/** Keep editing as text: clearing a field must not silently award zero points. */
export function readPoints(
  value: string,
  maximum = 99999999.99,
): number | null {
  const text = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const points = Number(text);
  return Number.isFinite(points) && points >= 0 && points <= maximum
    ? points
    : null;
}
