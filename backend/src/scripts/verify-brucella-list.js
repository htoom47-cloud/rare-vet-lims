/**
 * Brucella herd list stays on the result engine and does not create sample reports.
 * Usage: node src/scripts/verify-brucella-list.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../services/brucella-list.service.js'), 'utf8');
const routes = fs.readFileSync(path.join(__dirname, '../routes/results.routes.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../../../frontend/src/pages/BrucellaList.jsx'), 'utf8');

assert.ok(src.includes('enterResults'));
assert.ok(src.includes('validateResults'));
assert.ok(!/INSERT INTO reports|generate\(/.test(src));
assert.ok(src.includes("لا توجد مالطيه"));
assert.ok(src.includes('validated_locked'));
assert.ok(src.includes('notDeleted'));
assert.ok(routes.includes("'/brucella-list'"));
assert.ok(routes.indexOf("'/brucella-list'") < routes.indexOf("'/enter'"));
assert.ok(page.includes('printBrucellaList'));
assert.ok(!/reportsAPI\.generate|generateReport/.test(page));

console.log('brucella list wiring ok');
