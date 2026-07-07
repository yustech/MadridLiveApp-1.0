import fs from 'fs';

let content = fs.readFileSync('scripts/test-shifts-api-regression.mjs', 'utf8');

// Find MONTH_TO_INDEX and add numeric month entries
const oldMonthIndex = `const MONTH_TO_INDEX = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
  ENE: 0,
  ABR: 3,
  AGO: 7,
  DIC: 11,
};`;

const newMonthIndex = `const MONTH_TO_INDEX = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  ENE: 0, ABR: 3, AGO: 7, DIC: 11,
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '10': 9, '11': 10, '12': 11,
};`;

content = content.replace(oldMonthIndex, newMonthIndex);
fs.writeFileSync('scripts/test-shifts-api-regression.mjs', content, 'utf8');
console.log('✓ Fixed month parsing to support numeric months');
