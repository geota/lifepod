// CSS compatibility for web/ against the browserslist floor in package.json. `npm run lint:compat` runs it.
//
// TODO: report-only until these findings are resolved, then drop `severity: 'warning'`. All are "partial support"
// notes that don't apply to how the CSS uses the feature; ignore each line with a comment saying why, or set
// `ignorePartialSupport: true` if no partial note turns out to matter:
//   web/styles.css:249, 1416  clip-path: inset(50%) on HTML elements (css-clip-path and css-masks partial)
//   web/styles.css:337        clip-path: none (the same)
//   web/styles.css:1569       column-gap in a grid or flex layout, read as multi-column (multicolumn partial)
export default {
  plugins: ['stylelint-no-unsupported-browser-features'],
  rules: {
    'plugin/no-unsupported-browser-features': [true, { severity: 'warning' }],
  },
};
