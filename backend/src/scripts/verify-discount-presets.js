const assert = require('assert');
const { countDistinctAnimals, isPresetAllowed } = require('../services/discount-presets.service');

assert.strictEqual(countDistinctAnimals([
  { animal_id: 'a' },
  { animal_id: 'a' },
  { animal_id: 'b' },
  { description: 'no animal' },
]), 2);
assert.strictEqual(countDistinctAnimals([]), 0);

assert.strictEqual(isPresetAllowed({ min_animal_count: 0 }, 0), true);
assert.strictEqual(isPresetAllowed({ min_animal_count: 10 }, 10), false);
assert.strictEqual(isPresetAllowed({ min_animal_count: 10 }, 11), true);
assert.strictEqual(isPresetAllowed({ min_animal_count: '10' }, 11), true);

console.log('discount preset rules ok');
