import { sizeTests } from './sizes-checks.mjs';

// The board fits and scales on foldables, the largest phone and tablets, in the Material style
// (sizes-fit-large-glass.test.mjs runs Glass).
sizeTests('material', 'fit-large');
