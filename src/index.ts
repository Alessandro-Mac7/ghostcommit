import { main } from "./cli.js";

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`ghostcommit: ${msg}`);
  process.exit(1);
});
