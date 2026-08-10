/**
 * The connection strings, loaded into the test worker.
 *
 * `.env.local` is Next's own convention and is where a developer's four
 * connection strings live (`.env.example` says so); Next loads it for the
 * application, and nothing loads it for Vitest, which runs each test file in its
 * own process. So this runs first in each of them.
 *
 * When the file is absent the Seam 1 tests skip themselves rather than fail —
 * see `db/write/test-world.ts`. That is what keeps `db/machine-states.test.ts`,
 * which needs no database at all, running in CI.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
