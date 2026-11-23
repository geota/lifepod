// Shared by settings.mjs and style7.mjs: the shipped full-screen settings page (#settings in web/index.html), opened the
// way the setup button opens it, in the states the strips show. It drives the page's own controls, so a strip draws what
// the app draws. (Until layout B shipped, this file built mock-ups A, B and C from clones of the old setup dialog's
// controls; renders/settings-a.png, -b, -c and -more and the committed style7 renders come from those.)
import { game } from './lib.mjs';

export const seed = game(4, {
  counters: { commander: true, poison: true, energy: false, experience: false, rad: false },
  manaPool: true, autoEmpty: true, turns: 'turns', identity: { show: { indicator: true, symbol: false, name: true }, background: 'symbol' },
});

// Page code that opens settings. pending: 6 players picked, so Done reads "Start new game" and the Game section says what
// it will do. lifeEdit: the starting life field open with 25 typed. scrollToEnd: the page scrolled to its end. It sets
// window.mkFull() to the window height that shows the whole page without scrolling.
export const settingsJs = ({ pending = false, lifeEdit = false, scrollToEnd = false } = {}) => `
  document.querySelector('#setup-button').click();
  const sheet = document.querySelector('#settings');
  const body = sheet.querySelector('#settings-body');
  if (${pending}) sheet.querySelector('#player-choices [value="6"]').click();
  if (${lifeEdit}) {
    sheet.querySelector('#life-edit').click();
    sheet.querySelector('#life-input').value = '25';
  } else {
    // No focus ring on the close button settings focuses as it opens.
    document.activeElement?.blur();
  }
  if (${scrollToEnd}) body.scrollTop = body.scrollHeight;
  window.mkFull = () => body.scrollHeight + sheet.querySelector('.fs-head').offsetHeight + 16;`;

// Page code for the life field with a keyboard: a placeholder for the system number pad over the bottom 46% of the
// screen, as on a 427px-tall phone, and the page scrolled so the field shows above it. Run it after settingsJs({ lifeEdit:
// true }).
export const keyboardJs = `{
  const sheet = document.querySelector('#settings');
  const pad = document.createElement('div');
  pad.className = 'mk-keyboard';
  pad.textContent = 'System number pad (Gboard / iOS): about 46% of a 427px-tall screen';
  sheet.append(pad);
  const body = sheet.querySelector('#settings-body');
  body.style.paddingBottom = '46vh';
  const field = sheet.querySelector('#life-editor');
  body.scrollTop = field.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 60;
  sheet.querySelector('#life-input').focus();
}`;

// The placeholder keyboard's look, for keyboardJs.
export const keyboardCss = `
  .mk-keyboard { position: fixed; left: 0; right: 0; bottom: 0; height: 46%; z-index: 9; display: grid; place-items: center;
    background: #2a2c30; color: #9aa0a8; font: 600 14px/1.3 system-ui; border-top: 1px solid #444; }`;
