// The design and store scripts open the app over http, as the tests do: the page is ES modules, which browsers don't
// run from file://. LIFEPOD_APP points them at another copy of web/ (the path of its index.html), such as a clean
// checkout while web/ is mid-edit.
import { dirname } from 'node:path';
import { startServer } from '../tests/server.mjs';

/** Serves web/ (or LIFEPOD_APP's copy) on a free local port, with the page's URL and a function that stops it. */
export async function serveApp() {
  const server = await startServer(process.env.LIFEPOD_APP ? { web: dirname(process.env.LIFEPOD_APP) } : {});
  return { url: `${server.origin}/index.html`, origin: server.origin, close: server.close };
}
