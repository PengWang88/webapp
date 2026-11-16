/**
 * 角尺 GONLAB — angle core tests
 * Run with: node tests/angle.test.js
 */
"use strict";

const assert = require("node:assert/strict");
const A = require("../js/angle.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ✓ " + name);
  } catch (error) {
    failed += 1;
    console.error("  ✗ " + name);
    console.error("    " + error.message);
  }
}

function almost(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${expected}, got ${actual}`);
}

console.log("\nGONLAB angle core\n");

test("normalize360 wraps positive and negative values", () => {
  almost(A.normalize360(-30), 330);
  almost(A.normalize360(360), 0);
  almost(A.normalize360(725), 5);
});

test("dmsToDecimal adds sexagesimal parts", () => {
  almost(A.dmsToDecimal(45, 30, 15), 45.50416666666667);
  almost(A.dmsToDecimal(-45, 30, 0), -45.5);
  almost(A.dmsToDecimal(-0, 30, 0), -0.5);
});

test("formatDms produces readable seconds", () => {
  assert.equal(A.formatDms(45.5041666667, { secondsDecimals: 1 }), "45°30′15.0″");
  assert.equal(A.formatDms(-0.5, { secondsDecimals: 1 }), "-0°30′00.0″");
  assert.equal(A.formatDms(12 + 59 / 60 + 59.96 / 3600, { secondsDecimals: 1 }), "13°00′00.0″");
});

test("formatSignedSeconds uses an explicit sign", () => {
  assert.equal(A.formatSignedSeconds(63, 1), "+63.0″");
  assert.equal(A.formatSignedSeconds(-12.6, 1), "-12.6″");
  assert.equal(A.formatSignedSeconds(0, 1), "0.0″");
});

test("parseDmsString accepts common pasted formats", () => {
  almost(A.parseDmsString("45°30′15″"), 45.50416666666667);
  almost(A.parseDmsString("45 30 15"), 45.50416666666667);
  almost(A.parseDmsString("45:30:15"), 45.50416666666667);
  almost(A.parseDmsString("-45°30′"), -45.5);
  almost(A.parseDmsString("45.5"), 45.5);
});

test("azimuthFromDelta returns quadrant, distance and back azimuth", () => {
  const ne = A.azimuthFromDelta(30, 40);
  assert.equal(ne.valid, true);
  almost(ne.azimuth, 53.13010235415598);
  almost(ne.distance, 50);
  almost(ne.backAzimuth, 233.13010235415598);
  assert.equal(ne.quadrant.name, "北东");
  almost(ne.quadrantAngle, 53.13010235415598);

  const se = A.azimuthFromDelta(-30, 40);
  almost(se.azimuth, 126.86989764584402);
  assert.equal(se.quadrant.name, "南东");

  const sw = A.azimuthFromDelta(-30, -40);
  almost(sw.azimuth, 233.13010235415598);
  assert.equal(sw.quadrant.name, "南西");

  const nw = A.azimuthFromDelta(30, -40);
  almost(nw.azimuth, 306.869897645844);
  assert.equal(nw.quadrant.name, "北西");
});

test("azimuthFromDelta handles axes and coincident points", () => {
  almost(A.azimuthFromDelta(0, 5).azimuth, 90);
  assert.equal(A.azimuthFromDelta(0, 5).quadrant.name, "正东");
  almost(A.azimuthFromDelta(0, -5).azimuth, 270);
  almost(A.azimuthFromDelta(5, 0).azimuth, 0);
  assert.equal(A.azimuthFromDelta(0, 0).valid, false);
});

test("azimuthFromPoints computes from reversed coordinate signs", () => {
  const result = A.azimuthFromPoints(1000, 1000, 970, 1030);
  almost(result.azimuth, 135);
  almost(result.distance, Math.hypot(30, 30));
});

test("includedAngles returns clockwise, counterclockwise and smaller angle", () => {
  const right = A.includedAngles(45, 135);
  almost(right.right, 90);
  almost(right.left, 270);
  almost(right.smaller, 90);
  almost(right.larger, 270);

  const wrap = A.includedAngles(350, 10);
  almost(wrap.right, 20);
  almost(wrap.left, 340);
  almost(wrap.smaller, 20);
});

test("traverseClosure detects a passing angular closure", () => {
  const angles = [
    108 + 12 / 3600,
    112 + 18 / 3600,
    95 + 5 / 3600,
    120 + 20 / 3600,
    105 + 8 / 3600
  ];
  const result = A.traverseClosure(angles, 40);
  assert.equal(result.valid, true);
  assert.equal(result.n, 5);
  almost(result.measuredSum, 540 + 63 / 3600);
  almost(result.theoreticalSum, 540);
  almost(result.closureSeconds, 63);
  almost(result.toleranceSeconds, 40 * Math.sqrt(5));
  almost(result.correctionSeconds, -12.6);
  assert.equal(result.passed, true);
  almost(result.correctedSum, 540);
});

test("traverseClosure flags an over-limit closure and rejects short polygons", () => {
  const angles = [100, 110, 120, 130];
  const result = A.traverseClosure(angles, 10);
  almost(result.closureSeconds, 360000);
  assert.equal(result.passed, false);
  assert.equal(A.traverseClosure([90, 90], 40).valid, false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exitCode = 1;
