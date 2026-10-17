// Writes app/theme.css from lib/theme (tokens + CampusOS default palette). Run: pnpm theme:css
import { writeFileSync } from 'node:fs';
import { themeCss } from '../lib/theme/css.ts';

writeFileSync(new URL('../app/theme.css', import.meta.url), themeCss());
console.log('Wrote app/theme.css');
