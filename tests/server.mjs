import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// A read-only static server for the tests: web/ at /, and the pinned test fonts at /__tests__/fonts/. It binds
// 127.0.0.1 on a port the system picks and answers only GET and HEAD. The tests load the app over http rather than
// file://, as ES modules need.
//
// `npm test` starts one server for the whole run (globalSetup below, through --test-global-setup) and passes its origin
// to every test file in LIFEPOD_TEST_ORIGIN. A file run on its own (`node --test tests/x.test.mjs`) starts its own.

const testFonts = fileURLToPath(new URL('./fonts/', import.meta.url));
const webRoot = fileURLToPath(new URL('../web/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// The file a request path names, or null if it is outside the served folders.
function fileFor(roots, pathname) {
  const [prefix, root] = roots.find(([mount]) => pathname.startsWith(mount));
  const file = resolve(root, `.${pathname.slice(prefix.length - 1)}`);
  return file === root || file.startsWith(root.endsWith(sep) ? root : root + sep) ? file : null;
}

async function respond(roots, request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = fileFor(roots, pathname);
  const info = file && await stat(file).catch(() => null);
  if (!info?.isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-store',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
}

// web is the folder served at / (the design scripts can point it at another copy of web/), and port 0 lets the system pick.
export async function startServer({ web = webRoot, port: listen = 0 } = {}) {
  const roots = [['/__tests__/fonts/', testFonts], ['/', resolve(web) + sep]];
  const server = createServer((request, response) => {
    respond(roots, request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  // Don't keep a test process alive for a browser's idle keep-alive connection.
  server.keepAliveTimeout = 1000;
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(listen, '127.0.0.1', done);
  });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise(done => {
      server.closeAllConnections();
      server.close(() => done());
    }),
  };
}

let shared;

export async function globalSetup() {
  shared = await startServer();
  process.env.LIFEPOD_TEST_ORIGIN = shared.origin;
}

export async function globalTeardown() {
  await shared?.close();
}
