type SeaCreature = {
 node: HTMLDivElement; kind: 'fish' | 'ray' | 'jellyfish';
 x: number; y: number; speed: number; size: number; phase: number; direction: 1 | -1;
};

/** Decorative life below the people: slow schools, a passing ray, and drifting jellies. */
export class OceanLife {
 private layer = document.createElement('div');
 private creatures: SeaCreature[] = [];
 private frame = 0;
 private previous = 0;
 private time = 0;
 private paused = false;
 private observer: ResizeObserver;
 private width = 0;
 private height = 0;
 private scale = 1;

 constructor(parent: HTMLElement) {
  this.layer.className = 'ocean-life';
  this.layer.setAttribute('aria-hidden', 'true');
  parent.prepend(this.layer);
  // School members share a current but keep their own small fin/body rhythm.
  for (let school = 0; school < 2; school++) {
   for (let member = 0; member < 3; member++) {
    this.add('fish', 'coral-fish', {
     x: .14 + school * .49 - member * .052, y: .55 + school * .25 + (member % 2) * .047,
     speed: 12 + school * 3, size: 68 + member * 10,
     phase: school * 3.1 + member * .38, direction: school ? -1 : 1
    });
   }
  }
  this.add('ray', 'manta-ray', { x: .75, y: .66, speed: 8, size: 245, phase: 2.4, direction: -1 });
  this.add('jellyfish', 'jellyfish', { x: .10, y: .42, speed: 0, size: 104, phase: .5, direction: 1 });
  this.add('jellyfish', 'jellyfish', { x: .87, y: .82, speed: 0, size: 80, phase: 3.2, direction: 1 });
  for (let i = 0; i < 3; i++) {
   const plant = document.createElement('img');
   plant.className = `sea-kelp sea-kelp-${i}`;
   plant.src = '/ocean/kelp.webp'; plant.alt = ''; plant.draggable = false;
   plant.addEventListener('error', () => plant.remove(), { once: true });
   this.layer.append(plant);
  }
  for (let i = 0; i < 6; i++) {
   const bubble = document.createElement('span');
   bubble.className = 'sea-air';
   bubble.style.setProperty('--air-left', `${9 + i * 17}%`);
   bubble.style.setProperty('--air-delay', `${-i * 4.7}s`);
   bubble.style.setProperty('--air-duration', `${22 + i * 3}s`);
   this.layer.append(bubble);
  }
  this.observer = new ResizeObserver(() => {
   this.width = this.layer.clientWidth;
   this.height = this.layer.clientHeight;
   this.scale = this.width <= 700 ? .68 : 1;
   this.creatures.forEach(creature => { creature.node.style.width = `${creature.size * this.scale}px`; });
   this.paint();
  });
  this.observer.observe(this.layer);
  this.frame = requestAnimationFrame(this.tick);
 }
 private add(kind: SeaCreature['kind'], asset: string, values: Omit<SeaCreature, 'node' | 'kind'>) {
  const node = document.createElement('div');
  node.className = `sea-creature sea-${kind}`;
  const image = document.createElement('img');
  image.src = `/ocean/${asset}.webp`; image.alt = ''; image.draggable = false;
  image.style.setProperty('--creature-phase', `${-values.phase}s`);
  image.addEventListener('error', () => node.remove(), { once: true });
  node.append(image); this.layer.append(node);
  this.creatures.push({ node, kind, ...values });
 }
 private paint() {
  if (!this.width || !this.height) return;
  for (const creature of this.creatures) {
   const { node, kind, phase, direction } = creature;
   const size = creature.size * this.scale;
   const wave = Math.sin(this.time * .095 + phase);
   let x: number, y: number, angle: number;
   if (kind === 'jellyfish') {
    x = creature.x * this.width + Math.sin(this.time * .045 + phase) * 30 * this.scale;
    y = creature.y * this.height + Math.cos(this.time * .07 + phase) * 35 * this.scale;
    angle = wave * 9;
   } else {
    const span = this.width + size * 2;
    // Wrap only when the entire sprite has left the screen.
    const travel = creature.x * span + this.time * creature.speed * this.scale;
    const along = ((travel % span) + span) % span - size;
    x = direction === 1 ? along : this.width - along;
    y = creature.y * this.height + wave * (kind === 'ray' ? 38 : 22) * this.scale;
    angle = Math.cos(this.time * .095 + phase) * (kind === 'ray' ? 7 : 10);
   }
   node.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0) scaleX(${direction}) rotate(${angle}deg)`;
  }
 }
 private tick = (now: number) => {
  if (!this.paused && !document.hidden) {
   if (this.previous) this.time += Math.min((now - this.previous) / 1000, .05);
   this.paint();
  }
  this.previous = now;
  this.frame = requestAnimationFrame(this.tick);
 };
 setPaused(value: boolean) { this.paused = value; }
 destroy() { cancelAnimationFrame(this.frame); this.observer.disconnect(); this.layer.remove(); }
}
