import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getDBUrl } from "./utils/get-url.ts";
import * as schema from "./schema.ts";
export * from "./schema.ts";
export * from "./redis.ts";

export const dbClient = createClient({
  url: getDBUrl(),
});

export const db = drizzle(dbClient, { schema });
