#!/usr/bin/env node

/**
 * Runner wrapper for Activity 3 DSA Verification Test Suite
 */
const { spawnSync } = require('child_process');
const path = require('path');

const tsScript = path.join(__dirname, 'verify-dsa.ts');
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const result = spawnSync(cmd, ['tsx', tsScript], {
  encoding: 'utf8',
  env: process.env,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

process.exit(result.status ?? 0);
