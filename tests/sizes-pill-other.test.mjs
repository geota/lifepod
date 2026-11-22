import { sizeTests } from './sizes-checks.mjs';

// The centre pill covers nothing at any count or rotation in portrait, on the foldable and on the tablet, in the
// Material style (sizes-pill-other-glass.test.mjs runs Glass).
sizeTests('material', 'pill-other');
