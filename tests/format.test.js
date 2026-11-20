import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, fmtNum, fmtMoney, minorToInput, correctionWindowOpen, addMonths, monthLabel, dayLabel } from '../src/lib/format.js';

test('parseMoney: বাংলা/ইংরেজি অঙ্ক, দশমিক, কমা; ভুল ইনপুট null', () => {
  assert.equal(parseMoney('৫০০'), 50000);
  assert.equal(parseMoney('500'), 50000);
  assert.equal(parseMoney('১২.৫'), 1250);
  assert.equal(parseMoney('1,250.75'), 125075);
  assert.equal(parseMoney('0.1'), 10);
  assert.equal(parseMoney('19.99'), 1999);        // float ভুল (1998.99…) হয় না
  assert.equal(parseMoney('১২.৩৪৫'), null);       // ক্ষুদ্রতম এককের নিচে
  assert.equal(parseMoney('12.340'), 1234);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('-5'), null);
  assert.equal(parseMoney('500', 0), 500);
});
test('fmtNum / fmtMoney: বাংলা অঙ্ক, লাখ-কমা', () => {
  assert.equal(fmtNum(70000), '৭০০');
  assert.equal(fmtNum(200000), '২,০০০');
  assert.equal(fmtNum(12345678900), '১২,৩৪,৫৬,৭৮৯');
  assert.equal(fmtNum(1250), '১২.৫০');
  assert.equal(fmtMoney(70000, { currency_decimals: 2, currency_name: 'টাকা' }), '৭০০ টাকা');
  assert.equal(minorToInput(1250), '12.5');
  assert.equal(minorToInput(50000), '500');
});
test('মাস ও সংশোধনের সুযোগ', () => {
  assert.equal(addMonths('2026-12-01', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-01', -1), '2025-12-01');
  assert.equal(monthLabel('2026-11-01'), 'নভেম্বর ২০২৬');
  assert.equal(dayLabel('2026-11-05'), '৫ নভেম্বর');
  assert.equal(correctionWindowOpen('2026-11-01', '2026-11-30'), false);
  assert.equal(correctionWindowOpen('2026-11-01', '2026-12-01'), true);
  assert.equal(correctionWindowOpen('2026-11-01', '2026-12-02'), true);
  assert.equal(correctionWindowOpen('2026-11-01', '2026-12-03'), false);
  assert.equal(correctionWindowOpen('2026-12-01', '2027-01-02'), true);
});
