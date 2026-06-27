import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

export default defineConfig({
  datasource: {
    adapter: () => new PrismaPg(process.env.DATABASE_URL!),
  },
});
