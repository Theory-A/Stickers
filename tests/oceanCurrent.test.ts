import test from 'node:test';
import assert from 'node:assert/strict';
import { OceanCurrent } from '../src/oceanCurrent';

class Bubble extends EventTarget {
 style = { transform: '' };
 hidden = false;
 offsetWidth = 240;
 hovered = false;
 captured = new Set<number>();
 classes = new Set<string>();
 classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name) };
 matches() { return this.hovered; }
 setPointerCapture(id: number) { this.captured.add(id); }
 hasPointerCapture(id: number) { return this.captured.has(id); }
 releasePointerCapture(id: number) { this.captured.delete(id); }
}
function fire(node: Bubble, type: string, x = 0, y = 0, pointerId = 1, detail = 1) {
 const event = Object.assign(new Event(type, { cancelable: true }), { button: 0, clientX: x, clientY: y, pointerId, detail });
 node.dispatchEvent(event);
 return event;
}
function center(node: Bubble) {
 const match = node.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/)!;
 return { x: Number(match[1]) + node.offsetWidth / 2, y: Number(match[2]) + node.offsetWidth / 2 };
}

test('bubble drag preserves taps, suppresses drag clicks, resumes at the drop, and cleans up', () => {
 let frame: FrameRequestCallback = () => {};
 const replacements = {
  requestAnimationFrame: (callback: FrameRequestCallback) => { frame = callback; return 1; },
  cancelAnimationFrame: () => {},
  ResizeObserver: class { observe() {} disconnect() {} },
  getComputedStyle: () => ({ width: '240px' }),
  document: { hidden: false }
 };
 const originals = Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
 for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true });
 let current: OceanCurrent | undefined;
 try {
  const bubble = new Bubble();
  current = new OceanCurrent({ clientWidth: 1200, clientHeight: 800 } as HTMLElement, [bubble as unknown as HTMLElement]);
  let opens = 0;
  bubble.addEventListener('click', () => opens++);
  fire(bubble, 'pointerdown', 200, 200); fire(bubble, 'pointerup', 201, 201); fire(bubble, 'click');
  assert.equal(opens, 1, 'a tap still opens a card');

  const before = center(bubble);
  fire(bubble, 'pointerdown', 200, 200);
  fire(bubble, 'pointermove', 260, 230);
  assert.ok(bubble.classes.has('dragging'));
  fire(bubble, 'pointerup', 260, 230);
  const drop = center(bubble);
  assert.ok(Math.abs(drop.x - before.x) > 1 || Math.abs(drop.y - before.y) > 1);
  assert.equal(bubble.captured.size, 0);
  assert.equal(bubble.classes.has('dragging'), false);
  assert.equal(fire(bubble, 'click').defaultPrevented, true);
  assert.equal(opens, 1, 'dropping must not open or close a card');
  frame(1000);
  assert.ok(Math.abs(center(bubble).x - drop.x) < .001, 'resume starts at the dropped position');

  current.setHeld(bubble as unknown as HTMLElement, true);
  const held = center(bubble);
  for (let now = 1050; now <= 1500; now += 50) frame(now);
  assert.deepEqual(center(bubble), held, 'an opened bubble stays at its clicked location');
  current.setHeld(bubble as unknown as HTMLElement, false);
  frame(1550);
  assert.ok(Math.abs(center(bubble).x - held.x) < .001, 'closing resumes without jumping ahead in the current');

  current.setPaused(true);
  fire(bubble, 'pointerdown', 0, 0); fire(bubble, 'pointermove', 10000, -10000); fire(bubble, 'pointerup', 10000, -10000);
  const bounded = center(bubble);
  assert.ok(bounded.x <= 1075 && bounded.y >= 125, 'dragging stays inside the ocean even while paused');
  fire(bubble, 'click');
  fire(bubble, 'pointerdown', 0, 0); fire(bubble, 'pointercancel');
  assert.equal(bubble.captured.size, 0);
  fire(bubble, 'click', 0, 0, 1, 0);
  assert.equal(opens, 2, 'keyboard activation still works after pointer cancellation');

  current.destroy(); current = undefined;
  fire(bubble, 'pointerdown');
  assert.equal(bubble.captured.size, 0, 'destroy removes pointer handlers');
 } finally {
  current?.destroy();
  for (const [key, descriptor] of originals) {
   if (descriptor) Object.defineProperty(globalThis, key, descriptor);
   else Reflect.deleteProperty(globalThis, key);
  }
 }
});
