type Drag = { pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean };
type Particle = {
 node: HTMLElement; seed: number; x: number; y: number; size: number;
 renderedX: number; renderedY: number; heldAt?: number; pausedFor: number;
 drag?: Drag; suppressClick: boolean;
 held?: boolean;
};

/** Independent currents with pointer capture, so dragging works with mouse, pen, and touch. */
export class OceanCurrent {
 private frame = 0;
 private time = 0;
 private lastTime = 0;
 private width = 0;
 private height = 0;
 private paused = false;
 private observer: ResizeObserver;
 private listeners = new AbortController();
 private particles: Particle[];

 constructor(private stage: HTMLElement, nodes: HTMLElement[]) {
  this.particles = nodes.map((node, index) => ({ node, seed: index * 2.399963 + .8, x: 0, y: 0, size: 0, renderedX: 0, renderedY: 0, pausedFor: 0, suppressClick: false }));
  this.particles.forEach(particle => this.bindDrag(particle));
  this.observer = new ResizeObserver(() => this.resize());
  this.observer.observe(stage);
  this.resize();
  this.frame = requestAnimationFrame(this.tick);
 }
 private bindDrag(particle: Particle) {
  const { node } = particle;
  const options = { signal: this.listeners.signal };
  node.addEventListener('pointerdown', event => {
   if (event.button !== 0 || particle.drag) return;
   particle.suppressClick = false;
   particle.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: particle.renderedX, originY: particle.renderedY, moved: false };
   particle.heldAt ??= this.time;
   node.setPointerCapture(event.pointerId);
  }, options);
  node.addEventListener('pointermove', event => {
   const drag = particle.drag;
   if (!drag || drag.pointerId !== event.pointerId) return;
   const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
   if (!drag.moved && Math.hypot(dx, dy) < 6) return;
   drag.moved = true;
   node.classList.add('dragging');
   const x = this.bound(drag.originX + dx, this.width, particle.size);
   const y = this.bound(drag.originY + dy, this.height, particle.size);
   this.draw(particle, x, y, 0);
  }, options);
  const finish = (event: PointerEvent) => {
   const drag = particle.drag;
   if (!drag || drag.pointerId !== event.pointerId) return;
   particle.suppressClick = drag.moved || event.type === 'pointercancel';
   particle.drag = undefined;
   if (drag.moved) {
    // Start a fresh current at the drop point, instead of snapping to the old path.
    particle.x = particle.renderedX; particle.y = particle.renderedY;
    particle.pausedFor = this.time; particle.heldAt = undefined;
   }
   node.classList.remove('dragging');
   if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
  };
  node.addEventListener('pointerup', finish, options);
  node.addEventListener('pointercancel', finish, options);
  node.addEventListener('lostpointercapture', finish, options);
  node.addEventListener('click', event => {
   if (!particle.suppressClick || event.detail === 0) return;
   particle.suppressClick = false;
   event.preventDefault(); event.stopImmediatePropagation();
  }, { ...options, capture: true });
  node.addEventListener('dragstart', event => event.preventDefault(), options);
 }
 private bound(value: number, extent: number, size: number) {
  const padding = Math.min(size / 2 + 5, extent / 2);
  return Math.max(padding, Math.min(extent - padding, value));
 }
 private draw(particle: Particle, x: number, y: number, tilt: number) {
  particle.renderedX = x; particle.renderedY = y;
  particle.node.style.transform = `translate3d(${x - particle.size / 2}px, ${y - particle.size / 2}px, 0) rotate(${tilt}deg)`;
 }
 private resize() {
  this.width = this.stage.clientWidth;
  this.height = this.stage.clientHeight;
  const placed: { x: number; y: number }[] = [];
  const fraction = (value: number) => value - Math.floor(value);
  for (let index = 0; index < this.particles.length; index++) {
   const particle = this.particles[index];
   particle.size = parseFloat(getComputedStyle(particle.node).width) || particle.node.offsetWidth;
   let best = { x: this.width / 2, y: this.height / 2 }, bestDistance = -1;
   for (let sample = 0; sample < 36; sample++) {
    const n = 1 + index * 36 + sample;
    const x = this.bound(fraction(Math.sin(n * 127.1) * 43758.5453) * this.width, this.width, particle.size);
    const y = this.bound(fraction(Math.sin(n * 311.7) * 19341.719) * this.height, this.height, particle.size);
    const distance = placed.length ? Math.min(...placed.map(other => (other.x - x) ** 2 + (other.y - y) ** 2)) : 1;
    if (distance > bestDistance) { best = { x, y }; bestDistance = distance; }
   }
   particle.x = best.x; particle.y = best.y;
   particle.pausedFor = this.time; particle.heldAt = particle.held ? this.time : undefined;
   this.draw(particle, best.x, best.y, 0);
   placed.push(best);
  }
  this.paint();
 }
 private paint() {
  for (const particle of this.particles) {
   const { node, seed, size } = particle;
   if (node.hidden || particle.drag || particle.held) continue;
   if (node.style.transform && node.matches(':hover, :focus-visible')) {
    particle.heldAt ??= this.time;
    continue;
   }
   if (particle.heldAt !== undefined) {
    particle.pausedFor += this.time - particle.heldAt;
    particle.heldAt = undefined;
   }
   const t = this.time - particle.pausedFor;
   const paddingX = Math.min(size / 2 + 5, this.width / 2);
   const paddingY = Math.min(size / 2 + 5, this.height / 2);
   const width = Math.max(0, this.width - paddingX * 2);
   const height = Math.max(0, this.height - paddingY * 2);
   const reflect = (value: number, span: number) => span ? span / 2 * (1 - Math.cos(value / span * Math.PI)) : 0;
   const homeX = width ? Math.acos(1 - Math.min(1, Math.max(0, (particle.x - paddingX) / width)) * 2) * width / Math.PI : 0;
   const homeY = height ? Math.acos(1 - Math.min(1, Math.max(0, (particle.y - paddingY) / height)) * 2) * height / Math.PI : 0;
   const travelX = (Math.sin(t * .10 + seed) - Math.sin(seed)) * Math.min(140, this.width * .20)
    + (Math.sin(t * .041 + seed * 2) - Math.sin(seed * 2)) * 75;
   const travelY = (Math.cos(t * .083 + seed * 1.3) - Math.cos(seed * 1.3)) * Math.min(90, this.height * .25)
    + (Math.sin(t * .035 + seed) - Math.sin(seed)) * 45;
   this.draw(particle, paddingX + reflect(homeX + travelX, width), paddingY + reflect(homeY + travelY, height), Math.sin(t * .13 + seed) * 3);
  }
 }
 private tick = (now: number) => {
  if (!this.paused && !document.hidden) {
   this.time += this.lastTime ? Math.min((now - this.lastTime) / 1000, .05) : 0;
   this.paint();
  }
  this.lastTime = now;
  this.frame = requestAnimationFrame(this.tick);
 };
 setPaused(paused: boolean) { this.paused = paused; }
 setHeld(node: HTMLElement, held: boolean) {
  const particle = this.particles.find(particle => particle.node === node);
  if (!particle) return;
  particle.held = held;
  if (held) particle.heldAt ??= this.time;
 }
 refresh() { this.paint(); }
 destroy() { cancelAnimationFrame(this.frame); this.observer.disconnect(); this.listeners.abort(); }
}
