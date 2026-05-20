import { buildApp } from './app.js';
import { initDB } from '../db/index.js';

const port = Number(process.env.PORT ?? 3002);

async function main() {
  await initDB();
  const app = await buildApp();
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Cultivate running on port ${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
