/** Legacy profiles have a full name only. Comma-form names explicitly identify
 * the whole family name; otherwise use the final word and adjacent particles.
 * This is a sorting hint, not a change to the student's registered name.
 */
export function studentLastName(fullName: string): string {
  const name = fullName.trim().replace(/\s+/g, " ");
  const suffix = /^(?:jr\.?|sr\.?|ii|iii|iv|v)$/i;
  const commaParts = name.split(",").map((part) => part.trim());
  if (commaParts.length > 1 && !suffix.test(commaParts[1]))
    return commaParts[0];
  const words = commaParts[0].split(" ");
  while (words.length > 1 && suffix.test(words[words.length - 1])) words.pop();
  const particles = new Set([
    "de",
    "del",
    "dela",
    "la",
    "las",
    "los",
    "da",
    "das",
    "do",
    "dos",
    "di",
    "du",
    "van",
    "von",
    "den",
    "der",
    "bin",
    "al",
  ]);
  let start = words.length - 1;
  while (start > 0 && particles.has(words[start - 1].toLowerCase())) start--;
  return words.slice(start).join(" ");
}
