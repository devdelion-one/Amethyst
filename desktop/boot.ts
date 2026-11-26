'use strict';

const { app } = require('electron');
const path = require('path');

const SRC = app.isPackaged ? path.join(process.resourcesPath, 'app-src') : path.join(__dirname, '..');
const hookArg = process.argv.find((a) => path.resolve(a).toLowerCase() === path.join(SRC, 'hook.js').toLowerCase());
if (hookArg) require(hookArg);
else require('./main.ts');
