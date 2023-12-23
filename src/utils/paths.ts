import { isAbsolute, normalize, relative } from "pathe";
export function isPartOfPath(filename: string, parent: string) {
  const rel = relative(parent, normalize(filename));
  return rel.length > 0 && !isAbsolute(rel) && !rel.startsWith("../");
}
