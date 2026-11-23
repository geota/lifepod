// The one static server: the tests, the design and store scripts and `npm run preview` open the app over http through
// it, since browsers don't run ES modules from file://. It serves web/ at / and the pinned test fonts at
// /__tests__/fonts/, binds 127.0.0.1 on a port the system picks (or the one asked for), and answers only GET and HEAD.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const testFonts = fileURLToPath(new URL('../tests/fonts/', import.meta.url));
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

// web is the folder served at / (the design scripts can point it at another copy of web/, and the older ones serve the
// whole repo), and port 0 lets the system pick.
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

// For the design and store scripts: web/, or LIFEPOD_APP's copy, on a free port, with the page's URL and a function that
// stops the server. LIFEPOD_APP names another copy of web/, such as a clean export while web/ is mid-edit: the folder, or
// its index.html.
export async function serveApp() {
  const app = process.env.LIFEPOD_APP;
  const web = app && ((await stat(app).catch(() => null))?.isDirectory() ? app : dirname(app));
  const server = await startServer(web ? { web } : {});
  return { url: `${server.origin}/index.html`, close: server.close };
}
