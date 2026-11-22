import { sizeTests } from './sizes-checks.mjs';

// The centre pill covers nothing at any count or rotation on the smaller landscape phones, in the Glass style
// (sizes-pill-small.test.mjs runs Material).
sizeTests('glass', 'pill-small');
