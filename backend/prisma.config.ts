import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prisma CLI (migrate, studio) usa la conexión directa, sin pgbouncer.
    url: env('DIRECT_URL'),
  },
});
