// CSS compatibility for web/ against the browserslist floor in package.json. `npm run lint:compat` runs it.
//
// Findings are errors. Where a "partial support" note doesn't apply to how web/css/ uses a feature, the line says
// why in a `/* stylelint-disable-next-line plugin/no-unsupported-browser-features -- <reason> */` comment.
export default {
  plugins: ['stylelint-no-unsupported-browser-features'],
  rules: {
    'plugin/no-unsupported-browser-features': true,
  },
};
