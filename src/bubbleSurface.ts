export type BubbleAnchor = { x: number; y: number; size: number };

/** Grow around the clicked center; only nudge the back inward if it would be clipped. */
export function surfacePlacement(anchor: BubbleAnchor, width: number, height: number) {
 const diameter = Math.max(1, Math.min(anchor.size * 3, width - 24, height - 80));
 const radius = diameter / 2;
 const x = Math.max(radius + 12, Math.min(width - radius - 12, anchor.x));
 const y = Math.max(radius + 12, Math.min(height - radius - 60, anchor.y));
 return { diameter, x, y, dx: anchor.x - x, dy: anchor.y - y, scale: anchor.size / diameter };
}

type Surface = {
 source: HTMLElement; card: HTMLElement; shell: HTMLDivElement; turn: HTMLDivElement;
 front: HTMLDivElement; back: HTMLDivElement; anchor: BubbleAnchor; animations: Animation[];
};

export class BubbleSurfaces {
 private layer = document.createElement('div');
 private entries = new Map<string, Surface>();
 private ripples = new Set<HTMLDivElement>();
 private z = 0;
 private listeners = new AbortController();
 private resizeFrame = 0;

 constructor(private hold: (node: HTMLElement, held: boolean) => void) {
  this.layer.className = 'bubble-surfaces';
  document.body.append(this.layer);
  window.addEventListener('resize', () => {
   cancelAnimationFrame(this.resizeFrame);
   this.resizeFrame = requestAnimationFrame(() => {
    this.settle();
    for (const entry of this.entries.values()) {
     entry.anchor = this.anchor(entry.source);
     this.place(entry);
    }
   });
  }, { signal: this.listeners.signal });
 }
 private anchor(source: HTMLElement): BubbleAnchor {
  const rect = source.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: source.offsetWidth };
 }
 private place(entry: Surface) {
  const placement = surfacePlacement(entry.anchor, window.innerWidth, window.innerHeight);
  const { diameter, x, y } = placement;
  Object.assign(entry.shell.style, { width: `${diameter}px`, height: `${diameter}px`, left: `${x - diameter / 2}px`, top: `${y - diameter / 2}px` });
  entry.shell.style.setProperty('--surface-diameter', `${diameter}px`);
  return placement;
 }
 private ripple(anchor: BubbleAnchor) {
  const ripple = document.createElement('div');
  ripple.className = 'bubble-ripple'; ripple.setAttribute('aria-hidden', 'true');
  Object.assign(ripple.style, { left: `${anchor.x}px`, top: `${anchor.y}px`, width: `${anchor.size}px`, height: `${anchor.size}px` });
  this.layer.append(ripple); this.ripples.add(ripple);
  const waves = Array.from({ length: 3 }, (_, index) => {
   const ring = document.createElement('span'); ripple.append(ring);
   return ring.animate([
    { transform: 'scale(.85)', opacity: .7, borderWidth: '3px' },
    { transform: 'scale(3.8)', opacity: 0, borderWidth: '1px' }
   ], { duration: 1250, delay: index * 140, easing: 'cubic-bezier(.16,.6,.35,1)', fill: 'both' });
  });
  Promise.allSettled(waves.map(wave => wave.finished)).then(() => { ripple.remove(); this.ripples.delete(ripple); });
 }
 open(id: string, source: HTMLElement, card: HTMLElement, animate: boolean) {
  if (this.entries.has(id)) return;
  const anchor = this.anchor(source);
  this.hold(source, true);
  const shell = document.createElement('div'); shell.className = 'bubble-surface'; shell.tabIndex = -1;
  shell.style.zIndex = String(++this.z);
  const turn = document.createElement('div'); turn.className = 'bubble-turn';
  const front = document.createElement('div'); front.className = 'bubble-front'; front.setAttribute('aria-hidden', 'true');
  front.append(source.querySelector('.person-avatar')!.cloneNode(true));
  const back = document.createElement('div'); back.className = 'bubble-back';
  card.tabIndex = -1; back.append(card); turn.append(front, back); shell.append(turn); this.layer.append(shell);
  const entry: Surface = { source, card, shell, turn, front, back, anchor, animations: [] };
  this.entries.set(id, entry);
  const placement = this.place(entry);
  source.classList.add('bubble-source-open');
  source.tabIndex = -1;
  shell.addEventListener('pointerdown', () => { shell.style.zIndex = String(++this.z); });
  const focusOnReveal = document.activeElement === source;
  if (focusOnReveal) shell.focus({ preventScroll: true });
  if (!animate) { if (focusOnReveal) card.focus({ preventScroll: true }); return; }
  this.ripple(anchor);
  back.inert = true;
  const { dx, dy, scale } = placement;
  const timing: KeyframeAnimationOptions = { duration: 1250, easing: 'linear', fill: 'both' };
  entry.animations = [
   shell.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, offset: 0, easing: 'cubic-bezier(.22,.7,.2,1)' },
    { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: .56 },
    { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: .63 },
    { transform: 'translate(0, 0) scale(1)', offset: 1 }
   ], timing),
   turn.animate([
    { transform: 'rotateY(0deg)', offset: 0 },
    { transform: 'rotateY(0deg)', offset: .60, easing: 'cubic-bezier(.45,0,.2,1)' },
    { transform: 'rotateY(180deg)', offset: 1 }
   ], timing),
   front.animate([
    { borderWidth: `${1 / scale}px`, boxShadow: '0 2px 8px #284f4012', offset: 0 },
    { borderWidth: '18px', boxShadow: '0 25px 65px #284f4030', offset: .56 },
    { borderWidth: '18px', boxShadow: '0 25px 65px #284f4030', offset: 1 }
   ], timing)
  ];
  Promise.allSettled(entry.animations.map(animation => animation.finished)).then(() => {
   if (this.entries.get(id) !== entry) return;
   entry.animations.forEach(animation => animation.cancel()); entry.animations = [];
   back.inert = false;
   if (document.activeElement === shell) card.focus({ preventScroll: true });
  });
 }
 has(id: string) { return this.entries.has(id); }
 close(id: string) {
  const entry = this.entries.get(id);
  if (!entry) return;
  this.entries.delete(id);
  entry.animations.forEach(animation => animation.cancel());
  entry.source.classList.remove('bubble-source-open');
  entry.source.tabIndex = 0;
  this.hold(entry.source, false);
  if (entry.shell.contains(document.activeElement)) entry.source.focus({ preventScroll: true });
  entry.card.remove(); entry.shell.remove();
 }
 settle() {
  for (const entry of this.entries.values()) {
   entry.animations.forEach(animation => animation.finish());
   entry.back.inert = false;
  }
  for (const ripple of this.ripples) {
   ripple.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
   ripple.remove();
  }
  this.ripples.clear();
 }
 destroy() {
  for (const id of [...this.entries.keys()]) this.close(id);
  this.settle(); this.listeners.abort(); cancelAnimationFrame(this.resizeFrame); this.layer.remove();
 }
}
