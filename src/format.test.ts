// Run with `npm test` (Node's built-in runner, TypeScript types stripped by Node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, examWhen, healthLabel, isoWeek, resetText, tramRows, wmo } from "./format.ts";

test("esc neutralises HTML from mail subjects and Notion titles", () => {
  assert.equal(esc(`<img src=x onerror="alert(1)">'&`), "&#60;img src=x onerror=&#34;alert(1)&#34;&#62;&#39;&#38;");
});

test("isoWeek handles year boundaries", () => {
  const w = (d: string) => isoWeek(new Date(`${d}T12:00`));
  assert.equal(w("2026-11-15"), 46);
  assert.equal(w("2021-01-03"), 53); // Sunday still in the previous ISO year
  assert.equal(w("2024-12-30"), 1); // Monday already in the next ISO year
});

test("examWhen counts calendar days, across a DST change", () => {
  const now = new Date("2026-11-15T23:30");
  assert.equal(examWhen("2026-11-26", now), "Jeudi 26 nov · J-11");
  assert.equal(examWhen("2026-11-15", now), "Dimanche 15 nov · aujourd'hui");
  assert.equal(examWhen("2027-03-30", now), "Mardi 30 mars · J-135");
});

test("healthLabel thresholds match the Notion dashboard", () => {
  assert.deepEqual([80, 79, 60, 59].map(healthLabel), ["Bonne forme", "Correct", "Correct", "À surveiller"]);
});

test("wmo maps codes to label and icon, night aware", () => {
  assert.deepEqual(wmo(0, true), ["Ensoleillé", "sun"]);
  assert.deepEqual(wmo(0, false), ["Ciel dégagé", "moon"]);
  assert.deepEqual(wmo(3, true), ["Couvert", "cloud"]);
  assert.deepEqual(wmo(63, true), ["Pluie", "rain"]);
  assert.deepEqual(wmo(95, true), ["Orage", "storm"]);
});

test("tramRows groups by line+direction, keeps the next two, drops past ones", () => {
  const now = new Date("2026-11-15T16:00:00").getTime();
  const rows = tramRows([
    { line: "T4", direction: "Feyzin", at: "2026-11-15 16:09:00" },
    { line: "T1", direction: "Debourg", at: "2026-11-15 16:03:30" },
    { line: "T1", direction: "Debourg", at: "2026-11-15 15:50:00" }, // already gone
    { line: "T1", direction: "Debourg", at: "2026-11-15 16:00:20" },
    { line: "T1", direction: "Debourg", at: "2026-11-15 17:35:00" },
  ], now);
  assert.deepEqual(rows, [
    { line: "T1", dest: "Debourg", next: "Proche", after: "3 min" },
    { line: "T4", dest: "Feyzin", next: "9 min", after: "" },
  ]);
  assert.equal(tramRows([{ line: "T1", direction: "X", at: "2026-11-15 17:35:00" }], now)[0].next, "17h35");
});

test("resetText switches from countdown to weekday after 24 h", () => {
  const now = Date.parse("2026-11-15T17:49:00+01:00");
  assert.equal(resetText("2026-11-15T19:59:59+00:00", now), "Réinitialisation dans 3 h 11");
  assert.equal(resetText("2026-11-15T16:59:00+00:00", now), "Réinitialisation dans 10 min");
  assert.equal(resetText("2026-11-19T14:59:59+00:00", now), "Réinitialisation jeudi à 15 h");
  assert.equal(resetText(null, now), "");
});
