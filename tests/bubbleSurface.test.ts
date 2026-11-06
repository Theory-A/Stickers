import test from 'node:test';
import assert from 'node:assert/strict';
import { surfacePlacement } from '../src/bubbleSurface';

test('a bubble away from the edges grows to triple diameter without moving its center', () => {
 const placement = surfacePlacement({ x: 600, y: 420, size: 155 }, 1200, 900);
 assert.equal(placement.diameter, 465);
 assert.equal(placement.x, 600); assert.equal(placement.y, 420);
 assert.equal(placement.dx, 0); assert.equal(placement.dy, 0);
 assert.equal(placement.scale, 1 / 3);
});
test('edge reveals begin at the clicked center and nudge only enough to keep the back readable', () => {
 const anchor = { x: 50, y: 850, size: 155 };
 const placement = surfacePlacement(anchor, 1200, 900);
 assert.equal(placement.x + placement.dx, anchor.x);
 assert.equal(placement.y + placement.dy, anchor.y);
 assert.equal(placement.x - placement.diameter / 2, 12);
 assert.equal(placement.y + placement.diameter / 2, 840);
});
test('phone reveals retain triple size when it fits and fit narrow or short screens', () => {
 assert.equal(surfacePlacement({ x: 195, y: 400, size: 118 }, 390, 844).diameter, 354);
 for (const [width, height] of [[320, 568], [844, 390]]) {
  const placement = surfacePlacement({ x: width - 30, y: height - 50, size: 155 }, width, height);
  assert.ok(placement.diameter <= width - 24);
  assert.ok(placement.diameter <= height - 80);
  assert.ok(placement.x + placement.diameter / 2 <= width - 12);
  assert.ok(placement.y + placement.diameter / 2 <= height - 60);
 }
});
