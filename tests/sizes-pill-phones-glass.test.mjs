import { sizeTests } from './sizes-checks.mjs';

// The centre pill covers nothing at any count or rotation on the larger landscape phones, in the Glass style
// (sizes-pill-phones.test.mjs runs Material).
sizeTests('glass', 'pill-phones');
