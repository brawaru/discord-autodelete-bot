import { createClient } from "redis";

async function initRedisClient() {
  if (!process.env.REDIS_URL) return null;
  return createClient({
    url: process.env.REDIS_URL,
  }).connect();
}

export const redis = await initRedisClient();

export {};
