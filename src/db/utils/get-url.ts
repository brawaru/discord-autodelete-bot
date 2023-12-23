import { resolve } from "pathe";
import { pathToFileURL } from "node:url";
import { isPartOfPath } from "../../utils/paths.ts";

export function getDBUrl() {
  if (process.env.DB_URL) {
    return process.env.DB_URL;
  } else if (process.env.DB_FILE) {
    const resolved = resolve(process.env.DB_FILE);
    if (!isPartOfPath(resolved, "")) {
      throw new Error("DB file is outside the working directory");
    }
    return pathToFileURL(resolved).toString();
  }
  throw new Error("Neither DB URL nor file are set");
}
