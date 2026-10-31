import { BadRequestException } from "@nestjs/common";
/** Stored as readable rubric text so snapshots, exports and legacy guides remain compatible. */
export function validateEssayCriteria(
  guide: string | undefined,
  type: string,
  points: number,
) {
  if (!guide?.startsWith("Essay criteria\n")) return;
  if (type !== "essay")
    throw new BadRequestException(
      "Criteria are only available for essay questions",
    );
  const lines = guide.trim().split("\n").slice(1);
  if (!lines.length || lines.length > 8)
    throw new BadRequestException("Use 1 to 8 essay criteria");
  let total = 0;
  const names = new Set<string>();
  for (const line of lines) {
    const match =
      /^(.{1,80}) \((\d+(?:\.\d{1,2})?) points?\): (.{1,500})$/.exec(line);
    if (
      !match ||
      !match[1].trim() ||
      !match[3].trim() ||
      !Number.isFinite(Number(match[2])) ||
      Number(match[2]) > 99999999.99 ||
      names.has(match[1].trim().toLowerCase())
    )
      throw new BadRequestException(
        "Each criterion needs a unique name, valid points and a description",
      );
    names.add(match[1].trim().toLowerCase());
    total += Math.round(Number(match[2]) * 100);
  }
  if (total !== Math.round(points * 100))
    throw new BadRequestException(
      "Criteria points must equal the essay points",
    );
}
