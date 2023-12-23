import "dotenv/config";
import { defineConfig as defineDrizzleConfig } from "drizzle-kit";
import { getDBUrl } from "./src/db/utils/get-url.ts";

export default defineDrizzleConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  driver: "libsql",
  dbCredentials: {
    url: getDBUrl(),
  },
});
