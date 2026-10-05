import { createRequire } from 'node:module';
import { runtimeLocation } from './runtime-location';
const dependencyRequire = createRequire(runtimeLocation);
// Preserve Crossnote's module directory and native dependencies across Paseo's bundler.
export const crossnote = dependencyRequire('crossnote') as typeof import('crossnote');
export const cheerio = dependencyRequire('cheerio') as typeof import('cheerio');
