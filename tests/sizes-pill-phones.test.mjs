import { sizeTests } from './sizes-checks.mjs';

// The centre pill covers nothing at any count or rotation on the larger landscape phones, in the Material style
// (sizes-pill-phones-glass.test.mjs runs Glass).
sizeTests('material', 'pill-phones');
