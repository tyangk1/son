const SHADES = [
  ['Đỏ Gạch', 'Đỏ của gạch nung, ấm và chắc.', '#A3241D', '#FBEDE4', '#F2EBDF'],
  ['Hồng Đất', 'Hồng pha đất, dịu cho ngày thường.', '#C0726C', '#3A1715', '#F7E6E0'],
  ['Cam Cháy', 'Cam như nắng chiều, tươi mà không chói.', '#C9512A', '#FFF1E6', '#2B140C'],
  ['Mận Chín', 'Mận chín, trầm cho buổi tối.', '#6E2236', '#F6E3E6', '#D9A5B2']
].map(([name, sentence, bg, ink, accent], i) => ({
  name, sentence, palette: { bg, ink, accent }, number: String(i + 1).padStart(2, '0'),
  bullet: 'img/lip-bullet-' + (i + 1) + '.webp',
  // The hero stroke (shade 1) is drawn 1.65x the screen width on phones, so it keeps the full 3328 px file;
  // the other strokes span 1.2x and the 2200 px files stay sharp at DPR 3 while decoding half as much.
  swatch: 'img/swatch-' + (i + 1) + (i === 0 || (innerWidth >= 1024 && innerWidth * devicePixelRatio * 1.2 > 2200) ? '-a.webp' : '-a-2200.webp')
}));

const paper = { bg: '#F2EBDF', ink: '#1D1B1A', accent: '#A3241D' };
const $ = selector => document.querySelector(selector);
const root = document.documentElement;
const stage = $('#stage'), lip = $('#lip'), ground = $('.ground');
const undercoat = $('.undercoat'), undercoatTex = $('.undercoat .tex'), paint = $('#paint');
const bandframe = $('.bandframe'), reveal = $('.reveal'), revealIn = $('.reveal-in'), fillwin = $('.fillwin'), fillTex = $('.fillwin .tex');
const halves = [...paint.querySelectorAll('.half')];
const lipTop = $('#lip .lip-top'), tip = $('#lip .bullet'), sleeve = $('#lip .sleeve');
const strokes = [...paint.querySelectorAll('.swipe')];
const light = $('.case-light i'), loupe = $('#loupe'), lens = $('.lens');
const headline = $('.headline'), caption = $('.caption'), cue = $('.cue');
const headerLines = [...headline.querySelectorAll('.line')], chips = [...document.querySelectorAll('.chips i')];
const stack = $('#stack'), paperReturn = $('#paper-return');
const still = new URLSearchParams(location.search).has('still');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const pointer = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)');
const clamp = n => Math.max(0, Math.min(1, n));
const phase = (time, start, duration) => clamp((time - start) / duration);
const mix = (from, to, amount) => from + (to - from) * amount;
const approach = gsap.parseEase('power2.inOut'), travel = gsap.parseEase('power1.inOut');
const inspect = gsap.parseEase('power2.out'), spread = gsap.parseEase('power3.inOut');
const arrive = gsap.parseEase('expo.out'), stackEase = gsap.parseEase('power3.out');
const secondsPerUnit = 40;
// Write a style only when its value changes: unchanged writes still cost style invalidation every frame.
const written = new WeakMap();
function set(element, prop, value) {
  let cache = written.get(element);
  if (!cache) written.set(element, cache = {});
  if (cache[prop] !== value) { cache[prop] = value; element.style[prop] = value; }
}
const show = (element, visible) => set(element, 'visibility', visible ? 'visible' : 'hidden');
const classOn = (element, name, on) => { if (element.classList.contains(name) !== on) element.classList.toggle(name, on); };

function applyPalette(element, palette) {
  for (const [key, value] of Object.entries(palette)) element.style.setProperty('--' + key, value);
}

function product(shade, className) {
  const element = document.createElement('div');
  element.className = className;
  element.setAttribute('aria-hidden', 'true');
  element.append($('#lip .top-mask').cloneNode(true), $('#lip .case').cloneNode());
  element.querySelector('.bullet').src = shade.bullet;
  element.querySelectorAll('[style]').forEach(node => node.removeAttribute('style'));
  element.querySelector('.case').removeAttribute('data-gate-hero');
  return element;
}

const scenes = SHADES.map((shade, i) => {
  const title = document.createElement('div');
  title.className = 'shade-title';
  title.innerHTML = '<div class="mask"><small class="line"></small></div><h2 class="mask"><span class="line"></span></h2><p class="mask"><span class="line"></span></p>';
  const lines = [...title.querySelectorAll('.line')];
  [shade.number, shade.name, shade.sentence].forEach((value, row) => { lines[row].textContent = value; });
  $('#shade-titles').append(title);
  const strip = document.createElement('div');
  strip.className = 'stack-stroke';
  strip.style.top = (16 + 17 * i) + '%';
  strip.style.backgroundImage = 'url("' + shade.swatch + '")';
  stack.append(strip);
  return { ...shade, title, lines, strip };
});

let geometry, assembly, master, lenis, observer, intro, currentPalette, currentBullet, currentBand;
let tiltAllowed = false;
const playhead = { p: 0 };
const tilt = gsap.quickTo('#lipTilt', 'rotation', { duration: .2, ease: 'power2.out' });
stage.addEventListener('pointermove', event => {
  if (tiltAllowed) tilt(3 * (2 * event.clientX / geometry.w - 1));
});
stage.addEventListener('pointerleave', () => { if (tiltAllowed) tilt(0); });

function measure() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const css = getComputedStyle(stage);
  const lipH = lip.offsetHeight, lipW = lipH * assembly.w / assembly.h;
  const foot = h * parseFloat(css.getPropertyValue('--foot')) / 100;
  const hero = w * parseFloat(css.getPropertyValue('--hero-x')) / 100;
  const desktop = w >= 1024;
  function band(deg, cy, length, height) {
    const rad = deg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    // Both ends stay outside the viewport as each unscaled half moves vertically.
    length = Math.max(length, (w + height * Math.abs(sin) + 4) / cos);
    // Frame in band coordinates (u along the stroke, v across it), centred on (w/2, cy).
    // It must cover every viewport corner once the flood is complete.
    let maxU = 0, maxV = 0;
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
      maxU = Math.max(maxU, Math.abs((x - w / 2) * cos + (y - cy) * sin));
      maxV = Math.max(maxV, Math.abs(-(x - w / 2) * sin + (y - cy) * cos));
    }
    const frameL = Math.max(length, 2 * maxU + 8), frameC = maxV + height + 4;
    return { deg, cy, length, height, cos, sin, start: (w - length * cos) / 2,
      startY: cy - length * sin / 2, frameL, frameC, clearance: maxV + height / 2 + 2,
      texSize: 2 * Math.hypot(w, h) };
  }
  geometry = { w, h, foot, hero, lipH, lipW,
    heroBand: band(desktop ? -16 : -20, h * (desktop ? .635 : .5025), w * (desktop ? 1.2 : 1.65), h * (desktop ? .17 : .125)),
    swipeBand: band(-8, .52 * h, 1.2 * w, .22 * h) };
  currentBand = null;
}

// The texture square sits at the band centre, rotated with the band, so the moving flood and the
// settled undercoat show the macro in exactly the same place (no jump when the flood is swapped out).
function texBox(band) {
  const S = band.texSize;
  return { left: geometry.w / 2 - S / 2, top: band.cy - S / 2, S };
}

function placeBand(scene, band) {
  if (currentBand === scene) return;
  currentBand = scene;
  const L = band.frameL, C = band.frameC, bh = band.height, k = bh * .125;
  Object.assign(bandframe.style, { width: L + 'px', height: 2 * C + 'px', left: geometry.w / 2 - L / 2 + 'px',
    top: band.cy - C + 'px', transform: 'rotate(' + band.deg + 'deg)' });
  const imgLeft = (L - band.length) / 2;
  halves.forEach((half, i) => {
    // Each half is a static window on one half of the photographed stroke; moving the window moves its edge.
    Object.assign(half.style, { width: L + 'px', height: bh / 2 + 'px', top: (i ? C : C - bh / 2) + 'px' });
    const img = half.firstElementChild;
    if (img.getAttribute('src') !== scene.swatch) img.src = scene.swatch;
    Object.assign(img.style, { left: imgLeft + 'px', width: band.length + 'px', height: bh + 'px', top: (i ? -bh / 2 : 0) + 'px' });
  });
  // The fill grows from inside the opaque pigment (k) to past every corner (C); its edges stay under the halves.
  Object.assign(fillwin.style, { width: L + 'px', height: 2 * (C + k) + 'px', top: -k + 'px' });
  const t = texBox(band);
  Object.assign(fillTex.style, { width: t.S + 'px', height: t.S + 'px', left: L / 2 - t.S / 2 + 'px',
    top: C + k - t.S / 2 + 'px', backgroundColor: scene.palette.bg });
  band.fillK = k;
}

function drawBand(scene, band, swipe, fill) {
  show(paint, fill < 1);
  if (fill >= 1) return;
  placeBand(scene, band);
  const L = band.frameL, C = band.frameC, k = band.fillK;
  const d = fill * band.clearance;
  // Reveal up to the lipstick tip: the window slides, its content slides back, so the stroke stays put.
  const tip = (L - band.length) / 2 + swipe * band.length;
  const tx = swipe >= 1 ? 0 : tip - L;
  set(reveal, 'transform', 'translate3d(' + tx + 'px,0,0)');
  set(revealIn, 'transform', 'translate3d(' + -tx + 'px,0,0)');
  set(halves[0], 'transform', 'translate3d(0,' + -d + 'px,0)');
  set(halves[1], 'transform', 'translate3d(0,' + d + 'px,0)');
  show(fillwin, d > 0);
  if (!d) return;
  const sy = (d + k) / (C + k);
  set(fillwin, 'transform', 'scaleY(' + sy + ')');
  set(fillTex, 'transform', 'scaleY(' + 1 / sy + ')');
}

function paintPose(x, y, rotation, scale) {
  // Source pixel (390, 1) is the photographed tip's contact point.
  const tipX = geometry.lipW * 390 / assembly.w, tipY = geometry.lipH / assembly.h;
  set(lip, 'transformOrigin', tipX + 'px ' + tipY + 'px');
  set(lip, 'transform', 'translate3d(' + (x - tipX) + 'px,' + (y - tipY) + 'px,0) rotate(' + rotation + 'deg) scale(' + scale + ')');
}

function renderProduct(p, index, t, band, swipe) {
  const g = geometry, homeY = g.foot - g.lipH, homeX = g.hero + g.lipW * (390 / assembly.w - .5);
  const heroTwist = phase(p, .04, .08);
  let x = homeX, y = homeY, rotation = 0, scale = 1, shadow = 1;
  let bullet = index, retract = 0, shine = heroTwist * 2;
  if (index === 0) {
    const lift = approach(phase(t, 0, .04));
    const back = arrive(phase(t, .12, .05));
    const offset = lift * (1 - back);
    x += g.w * .22 * offset;
    y += g.h * .08 * offset;
    scale -= .1 * offset;
    rotation = 6 * offset;
    shadow = 1 - offset;
  } else {
    const down = approach(phase(t, 0, .035)), up = approach(phase(t, .035, .035));
    retract = down * (1 - up);
    bullet = t < .035 ? index - 1 : index;
    shine = up;
    const lean = approach(phase(t, .07, .02));
    const tap = t >= .09 && t <= .093 ? 4 * Math.sin(Math.PI * phase(t, .09, .003)) : 0;
    const leave = approach(phase(t, .13, .017));
    x = mix(homeX, band.start + band.length * band.cos * swipe, lean) + leave * g.lipW;
    y = mix(homeY, band.startY + band.length * band.sin * swipe, lean) + tap;
    scale = mix(1, .82, lean);
    rotation = -32 * lean;
    shadow = 1 - lean;
    if (t >= .15) {
      const back = arrive(phase(t, .15, .03));
      x = homeX;
      y = homeY + (g.h - homeY + 8) * (1 - back);
      rotation = 0;
      scale = 1;
      shadow = back;
    }
  }
  // Let the final label clear its mask before the case crosses that area.
  const exit = stackEase(phase(p, .868, .072));
  y += exit * 1.2 * g.h;
  paintPose(x, y, rotation, scale);
  set(ground, 'transform', 'translate(' + (g.hero - g.lipW * .21) + 'px,' + (g.foot - g.lipH * .022) + 'px) rotate(-7deg) scale(' + (1 - (1 - shadow) * .28) + ')');
  set(ground, 'opacity', String(shadow * (1 - exit)));
  classOn(ground, 'breathe', !still && !reduced.matches && p < .04 && !document.hidden);
  if (bullet !== currentBullet) { tip.src = scenes[bullet].bullet; currentBullet = bullet; }
  set(tip, 'transform', 'translateY(' + (1 - heroTwist) * .34 * assembly.parts.case.y / assembly.parts.bullet.h * 100 + '%)');
  set(lipTop, 'transform', 'translateY(' + 101 * retract + '%)');
  const overlap = assembly.parts.bullet.h - assembly.parts.sleeve.y - 1;
  set(sleeve, 'clipPath', 'inset(' + (heroTwist * overlap / assembly.parts.sleeve.h * 100).toFixed(2) + '% 0 0)');
  set(light, 'opacity', String(Math.sin(Math.PI * (shine % 1)) * .7));
  set(light, 'transform', 'translateX(' + mix(-120, 310, shine % 1) + '%)');
  const upright = p <= .14 || (t >= (index ? .178 : .17) && p < .86);
  const allow = !still && !reduced.matches && pointer.matches && upright;
  if (tiltAllowed && !allow) { tilt.tween.pause(); gsap.set('#lipTilt', { rotation: 0 }); }
  tiltAllowed = allow;
}

function render() {
  const p = playhead.p;
  const index = Math.min(3, Math.max(0, Math.floor((p - .14 + 1e-8) / .18)));
  const scene = scenes[index], t = p - (.14 + index * .18);
  const band = index ? geometry.swipeBand : geometry.heroBand;
  const swipe = index ? travel(phase(t, .09, .04)) : 1;
  const fill = index ? spread(phase(t, .12, .04)) : spread(phase(t, .08, .05));
  drawBand(scene, band, swipe, fill);
  renderProduct(p, index, t, band, swipe);

  const heroExit = phase(p, .14, .032);
  headerLines.forEach((line, i) => set(line, 'translate', '0 ' + 125 * approach(clamp(heroExit * 1.1 - i * .1)) + '%'));
  show(headline, heroExit < 1);
  set(caption, 'opacity', String(1 - heroExit));
  set(cue, 'opacity', String(1 - phase(p, .04, .08)));
  const settled = fill >= 1 ? index : index - 1;
  set(undercoat, 'display', settled < 0 ? 'none' : 'block');
  if (settled >= 0 && undercoat.dataset.scene !== settled + '/' + geometry.w + 'x' + geometry.h) {
    undercoat.dataset.scene = settled + '/' + geometry.w + 'x' + geometry.h;
    const ub = settled ? geometry.swipeBand : geometry.heroBand, t = texBox(ub);
    Object.assign(undercoatTex.style, { width: t.S + 'px', height: t.S + 'px', left: t.left + 'px', top: t.top + 'px',
      transform: 'rotate(' + ub.deg + 'deg)', backgroundColor: scenes[settled].palette.bg });
  }
  const palette = p >= .975 ? paper : fill >= .78 ? scene.palette : scenes[index - 1]?.palette || paper;
  if (currentPalette !== palette) { applyPalette(root, palette); currentPalette = palette; }
  const enterStart = index ? .16 : .148;
  for (const [i, s] of scenes.entries()) {
    const previous = i === index - 1 && t < .024;
    const visible = (i === index && t >= enterStart && p < .868) || previous;
    show(s.title, visible);
    if (visible) s.lines.forEach((line, row) => {
      const delay = row * .04 / secondsPerUnit;
      const offset = previous || p >= .86 ? approach(phase(previous ? t : p - .86, delay, previous ? .02 : .006))
        : 1 - arrive(phase(t, enterStart + delay, index ? .014 : .017));
      set(line, 'transform', 'translateY(' + 125 * offset + '%)');
    });
    classOn(chips[i], 'active', i === Math.max(0, settled) && p < .86);
  }
  const hasLoupe = !index && t >= .04 && t < .08;
  show(loupe, hasLoupe);
  if (hasLoupe) {
    const v = inspect(phase(t, .04, .04)), pos = .28 + .4 * v;
    set(loupe, 'transform', 'translate(' + (band.start + band.length * band.cos * pos - 60) + 'px,' +
      (band.startY + band.length * band.sin * pos - 60) + 'px)');
    set(lens, 'backgroundPosition', (23 + v * 40) + '% 30%');
    set(loupe, 'opacity', String(Math.min(phase(t, .04, .004), 1 - phase(t, .076, .004))));
  }
  show(stack, p >= .86);
  if (p >= .86) scenes.forEach((s, i) => {
    const v = stackEase(phase(p, .86 + i * .05 / secondsPerUnit, .076));
    set(s.strip, 'transform', 'translateX(calc(' + ((v - 1) * 122) + 'vw + ' + [1, 11, 5, 0][i] + 'px)) scaleX(-1)');
  });
  set(paperReturn, 'transform', 'translate3d(0,' + (101 * (1 - approach(phase(p, .94, .06)))) + '%,0)');
}

function buildStaticSections() {
  for (const scene of scenes) {
    const section = document.createElement('section');
    section.className = 'static-shade';
    section.dataset.gate = '';
    section.setAttribute('aria-label', scene.name);
    applyPalette(section, scene.palette);
    const stroke = new Image();
    stroke.className = 'static-swatch';
    stroke.alt = '';
    stroke.src = scene.swatch;
    const copy = scene.title.cloneNode(true);
    copy.className = 'static-copy';
    copy.removeAttribute('style');
    copy.querySelectorAll('.line').forEach(line => line.removeAttribute('style'));
    section.append(stroke, product(scene, 'static-lip'), copy);
    $('#static-shades').append(section);
  }
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.style.opacity = entry.isIntersecting ? '1' : '.72';
  }, { threshold: .08 });
  document.querySelectorAll('.static-shade').forEach(section => observer.observe(section));
}

const tick = time => lenis?.raf(time * 1000);
function configure() {
  master?.scrollTrigger?.kill();
  master?.kill();
  master = null;
  lenis?.destroy();
  gsap.ticker.remove(tick);
  observer?.disconnect();
  $('#static-shades').replaceChildren();
  intro?.progress(1).kill();
  playhead.p = 0;
  measure();
  render();
  if (reduced.matches) { buildStaticSections(); return; }
  lenis = new Lenis({ prevent: () => false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  master = gsap.timeline({
    scrollTrigger: { trigger: stage, start: 'top top', end: () => '+=' + innerHeight * 9, pin: true, scrub: matchMedia('(pointer: coarse)').matches ? .35 : true, invalidateOnRefresh: true },
    onUpdate: render
  });
  master.fromTo(playhead, { p: 0 }, { p: 1, duration: secondsPerUnit, ease: 'none' });
  ScrollTrigger.refresh();
  if (!still && !scrollY) {
    intro = gsap.timeline({ defaults: { ease: 'expo.out' } })
      .from('h1 .line', { yPercent: 120, duration: .7, stagger: .06 }, 0)
      .from('.lip-intro', { y: 24, opacity: 0, duration: .9 }, .455)
      .from('.masthead, .caption, .cue, .folio', { autoAlpha: 0, duration: .4, clearProps: 'opacity,visibility' }, .535);
  }
}

async function init() {
  assembly = await (await fetch('img/lip.json')).json();
  root.style.setProperty('--cut', 100 * assembly.parts.case.y / assembly.h + '%');
  root.style.setProperty('--sleeve-top', 100 * assembly.parts.sleeve.y / assembly.parts.case.y + '%');
  gsap.registerPlugin(ScrollTrigger);
  configure();
  // Decode every bullet and stroke now, so no image is decoded for the first time in the middle of a swipe.
  const warm = () => scenes.forEach(scene => [scene.bullet, scene.swatch].forEach(src => { const im = new Image(); im.src = src; im.decode().catch(() => {}); }));
  'requestIdleCallback' in window ? requestIdleCallback(warm, { timeout: 1200 }) : setTimeout(warm, 300);
  reduced.addEventListener('change', configure);
  let resizeFrame, savedPosition;
  const resize = () => {
    const trigger = master?.scrollTrigger;
    if (trigger && !savedPosition) savedPosition = { progress: trigger.progress, pastEnd: Math.max(0, scrollY - trigger.end) };
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      ScrollTrigger.refresh();
      measure();
      if (trigger && savedPosition) {
        lenis.resize();
        lenis.scrollTo(mix(trigger.start, trigger.end, savedPosition.progress) + savedPosition.pastEnd, { immediate: true, force: true });
        ScrollTrigger.update();
      }
      savedPosition = null;
      render();
    });
  };
  ScrollTrigger.addEventListener('refresh', () => { measure(); render(); });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', render);
  await setupDrawing();
}
init();

async function prepareBrush(scene) {
  const image = new Image();
  image.src = scene.swatch;
  await image.decode();
  const stamp = document.createElement('canvas');
  stamp.width = 56;
  stamp.height = 128;
  const brush = stamp.getContext('2d');
  // Frame the pigment at the center of the image, excluding the empty margins.
  const h = image.naturalHeight * .8, w = h * stamp.width / stamp.height;
  brush.drawImage(image, (image.naturalWidth - w) / 2, (image.naturalHeight - h) / 2, w, h,
    0, 0, stamp.width, stamp.height);
  brush.globalCompositeOperation = 'destination-in';
  const falloff = brush.createLinearGradient(0, 0, stamp.width, 0);
  falloff.addColorStop(0, 'transparent');
  falloff.addColorStop(.25, 'black');
  falloff.addColorStop(.75, 'black');
  falloff.addColorStop(1, 'transparent');
  brush.fillStyle = falloff;
  brush.fillRect(0, 0, stamp.width, stamp.height);
  return stamp;
}

function bindPaperButton(button, activate) {
  // A browser may suppress its synthetic click immediately after a drag on the
  // paper. Accept a completed touch tap directly, including its release bounds.
  let start = null;
  button.addEventListener('pointerdown', event => {
    if (event.isPrimary && event.pointerType === 'touch') start = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  button.addEventListener('pointercancel', () => { start = null; });
  button.addEventListener('pointerup', event => {
    const tap = start;
    start = null;
    if (!tap || tap.id !== event.pointerId || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) return;
    if (button.contains(document.elementFromPoint(event.clientX, event.clientY))) activate();
  });
  button.addEventListener('click', event => {
    if (event.pointerType !== 'touch' || !event.detail) activate();
  });
}

async function setupDrawing() {
  const canvas = $('#drawing'), ctx = canvas.getContext('2d');
  const tailCanvas = document.createElement('canvas'), preview = tailCanvas.getContext('2d');
  const wet = document.createElement('canvas'), gloss = wet.getContext('2d');
  tailCanvas.className = 'stroke-tail';
  wet.className = 'wet-ink';
  for (const layer of [tailCanvas, wet]) layer.setAttribute('aria-hidden', 'true');
  canvas.after(tailCanvas, wet);
  const desktop = matchMedia('(min-width: 1024px) and (pointer: fine)');
  const taperLength = 20;
  const tail = [];
  let selected = 0, active = null, last = null, shade = 0;
  let distance = 0, nextDab = 0;
  let width = 0, height = 0, thickness = 0, sampleFrame = 0, sampleUsed = false;
  const choices = $('#choices');
  const buttons = scenes.map((scene, i) => {
    const figure = document.createElement('figure'), label = document.createElement('figcaption');
    label.textContent = scene.name;
    figure.append(product(scene, 'mini-lip'), label);
    $('#lineup').append(figure);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.title = scene.name;
    btn.setAttribute('aria-label', scene.name);
    btn.setAttribute('aria-pressed', String(i === selected));
    btn.style.setProperty('--sample', scene.palette.bg);
    btn.style.setProperty('--texture', 'url("' + scene.swatch + '")');
    choices.append(btn);
    bindPaperButton(btn, () => {
      selected = i;
      buttons.forEach((b, n) => b.setAttribute('aria-pressed', String(n === i)));
    });
    return btn;
  });
  const brushes = await Promise.all(scenes.map(prepareBrush));

  function resizePaper() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const size = desktop.matches ? 64 : 44;
    const dpr = Math.min(window.devicePixelRatio || 1, desktop.matches ? Infinity : 2);
    const pixelWidth = Math.round(w * dpr), pixelHeight = Math.round(h * dpr);
    if (!w || !h || (w === width && h === height && size === thickness &&
      canvas.width === pixelWidth && canvas.height === pixelHeight)) return;
    if (last) dry();
    const previous = document.createElement('canvas');
    previous.width = canvas.width;
    previous.height = canvas.height;
    if (width) previous.getContext('2d').drawImage(canvas, 0, 0);
    const hadDrawing = width > 0;
    width = w;
    height = h;
    thickness = size;
    for (const context of [ctx, preview, gloss]) {
      context.canvas.width = pixelWidth;
      context.canvas.height = pixelHeight;
      context.setTransform(pixelWidth / w, 0, 0, pixelHeight / h, 0, 0);
    }
    if (hadDrawing) ctx.drawImage(previous, 0, 0, w, h);
  }
  resizePaper();
  new ResizeObserver(resizePaper).observe(canvas);
  desktop.addEventListener('change', resizePaper);

  function stamp(context, dab, end) {
    const brush = brushes[shade];
    const taper = clamp(Math.min(dab.distance, end - dab.distance) / taperLength);
    const h = thickness * mix(.6, 1, taper * taper * (3 - 2 * taper));
    const w = h * brush.width / brush.height;
    context.save();
    context.translate(dab.x, dab.y);
    context.rotate(dab.angle);
    context.drawImage(brush, -w / 2, -h / 2, w, h);
    context.restore();
  }
  function drawTail(context) {
    for (const dab of tail) stamp(context, dab, distance);
    const latest = tail.at(-1);
    if (distance - latest.distance > thickness * .075) {
      stamp(context, { ...last, distance }, distance);
    }
  }
  function previewTail() {
    preview.clearRect(0, 0, width, height);
    drawTail(preview);
  }
  function begin(point, direction = 0) {
    shade = selected;
    distance = 0;
    nextDab = thickness * .15;
    last = { ...point, angle: direction };
    tail.push({ ...last, distance });
    gloss.clearRect(0, 0, width, height);
    wet.style.transition = 'none';
    wet.style.opacity = '.19';
  }
  function extend(point) {
    if (!last) { begin(point); return; }
    const dx = point.x - last.x, dy = point.y - last.y, length = Math.hypot(dx, dy);
    if (!length) return;
    const angle = Math.atan2(dy, dx), end = distance + length;
    if (!distance) tail[0].angle = angle;
    for (; nextDab <= end; nextDab += thickness * .15) {
      const t = (nextDab - distance) / length;
      tail.push({ x: mix(last.x, point.x, t), y: mix(last.y, point.y, t), angle, distance: nextDab });
    }
    distance = end;
    last = { ...point, angle };
    // Keep the latest 20 CSS pixels editable while the stroke is still growing.
    while (distance - tail[0].distance >= taperLength) {
      const dab = tail.shift();
      stamp(ctx, dab, distance);
      stamp(gloss, dab, distance);
    }
  }
  function dry() {
    if (last) {
      drawTail(ctx);
      drawTail(gloss);
      tail.length = 0;
      preview.clearRect(0, 0, width, height);
    }
    last = null;
    wet.style.transition = 'opacity 300ms ease-out';
    wet.style.opacity = '0';
  }
  function stopSample() {
    sampleUsed = true;
    cancelAnimationFrame(sampleFrame);
  }
  const position = event => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  canvas.addEventListener('pointerdown', event => {
    if (active !== null || event.button !== 0) return;
    stopSample();
    if (last) dry();
    active = event.pointerId;
    canvas.setPointerCapture(active);
    begin(position(event));
    previewTail();
  });
  canvas.addEventListener('pointermove', event => {
    if (active !== event.pointerId) return;
    const coalesced = event.getCoalescedEvents?.() || [];
    for (const e of coalesced) extend(position(e));
    extend(position(event));
    previewTail();
  });
  function release(event) {
    if (active !== event.pointerId) return;
    if (event.type === 'pointerup') extend(position(event));
    active = null;
    dry();
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, release);
  bindPaperButton($('#erase'), () => {
    stopSample();
    if (active !== null && canvas.hasPointerCapture(active)) canvas.releasePointerCapture(active);
    active = null;
    dry();
    ctx.clearRect(0, 0, width, height);
    gloss.clearRect(0, 0, width, height);
  });

  const sampleObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting) || sampleUsed) return;
    sampleObserver.disconnect();
    sampleUsed = true;
    const point = t => ({ x: width * (.16 + .68*t),
      y: height * (.62 - .22*t - .09*Math.sin(t * Math.PI * 2)) });
    begin(point(0), -.45);
    let cursor = 1;
    const start = performance.now();
    function draw(now) {
      const progress = still || reduced.matches ? 1 : inspect(clamp((now-start) / 900));
      while (cursor <= Math.floor(progress * 140)) extend(point(cursor++ / 140));
      if (cursor <= 140) {
        previewTail();
        sampleFrame = requestAnimationFrame(draw);
      } else dry();
    }
    draw(start);
  }, { threshold: .08 });
  sampleObserver.observe(canvas);
}
