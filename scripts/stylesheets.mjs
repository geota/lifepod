// The page's stylesheets, web/css/*.css, in the order web/index.html links them, which is the cascade order. The tests,
// the Mana font scripts and the design scripts read the CSS through here rather than naming the files.
import { readFileSync } from 'node:fs';

const web = new URL('../web/', import.meta.url);

/** @returns {string[]} The stylesheets' paths under web/, such as 'css/tokens.css', in link order. */
export function stylesheets() {
  const html = readFileSync(new URL('index.html', web), 'utf8');
  return [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match => match[1]);
}

/** @param {string} path @returns {URL} A stylesheet's file, from its path under web/. */
export const stylesheetUrl = path => new URL(path, web);

/** @returns {string} Every stylesheet's text, joined in link order: the page's CSS as one source. */
export const readStyles = () => stylesheets().map(path => readFileSync(stylesheetUrl(path), 'utf8')).join('');
