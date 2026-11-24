import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations"
  },

  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED?.trim() || env("DATABASE_URL")
  }
});
