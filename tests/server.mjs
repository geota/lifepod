// `npm test` starts one server (scripts/serve.mjs) for the whole run, through --test-global-setup, and passes its origin
// to every test file in LIFEPOD_TEST_ORIGIN. A file run on its own (`node --test tests/x.test.mjs`) starts its own.
import { startServer } from '../scripts/serve.mjs';

let shared;

export async function globalSetup() {
  shared = await startServer();
  process.env.LIFEPOD_TEST_ORIGIN = shared.origin;
}

export async function globalTeardown() {
  await shared?.close();
}
