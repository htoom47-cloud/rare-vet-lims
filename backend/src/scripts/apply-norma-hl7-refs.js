/**
 * Apply reference ranges from the latest Norma HL7 import into test_reference_ranges.
 * Use after changing reference profiles on the Norma device.
 *
 * Usage:
 *   node src/scripts/apply-norma-hl7-refs.js           # all species from latest imports
 *   node src/scripts/apply-norma-hl7-refs.js camel     # one species only
 */
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'pull-norma-species-refs.js');
const species = process.argv[2];
const args = [script];
if (species && !species.startsWith('--')) args.push(species);

const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: path.join(__dirname, '../..') });
child.on('exit', (code) => process.exit(code ?? 0));
