import { sizeTests } from './sizes-checks.mjs';

// The centre pill covers nothing at any count or rotation on the smaller landscape phones, in the Material style
// (sizes-pill-small-glass.test.mjs runs Glass).
sizeTests('material', 'pill-small');
