import { sizeTests } from './sizes-checks.mjs';

// The centre pill covers nothing at any count or rotation in portrait, on the foldable and on the tablet, in the Glass
// style (sizes-pill-other.test.mjs runs Material).
sizeTests('glass', 'pill-other');
