// `npm run preview`: the browser preview (README). Serves web/ at http://127.0.0.1:8080/, or PORT, until stopped. The
// page is ES modules, which browsers don't run from file://, and 127.0.0.1 is a secure context, so the wake lock works.
import { startServer } from './serve.mjs';

const { origin } = await startServer({ port: Number(process.env.PORT) || 8080 });
console.log(`LifePod is at ${origin}/ (Ctrl+C stops it)`);
