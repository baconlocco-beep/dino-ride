/* Dino Ride: a little tap-and-play toy. No network, no ads, nothing collected. */
(function () {
  'use strict';

  var ASSETS = {
    rider: 'img/rider.webp',
    ptero: 'img/ptero.webp',
    trike: 'img/trike.webp',
    egg: 'img/egg.webp'
  };

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var startEl = document.getElementById('start');
  var playBtn = document.getElementById('play');
  var muteBtn = document.getElementById('mute');
  var fullBtn = document.getElementById('full');

  var W = 0, H = 0, DPR = 1;
  var bg = document.createElement('canvas');
  var bgx = bg.getContext('2d');
  var images = {};
  var running = false;
  var t = 0;

  // ---------- helpers ----------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }

  function loadImages(cb) {
    var keys = Object.keys(ASSETS), left = keys.length;
    keys.forEach(function (k) {
      var im = new Image();
      im.onload = im.onerror = function () { if (--left === 0) cb(); };
      im.src = ASSETS[k];
      images[k] = im;
    });
  }

  // ---------- sound (made on the fly, no audio files) ----------
  var AC = null, master = null;
  var muted = false;
  try { muted = localStorage.getItem('dino-muted') === '1'; } catch (e) {}

  function audioInit() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    AC = new Ctor();
    master = AC.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(AC.destination);
  }
  function setMuted(m) {
    muted = m;
    muteBtn.textContent = m ? '🔇' : '🔊';
    if (master) master.gain.value = m ? 0 : 0.35;
    try { localStorage.setItem('dino-muted', m ? '1' : '0'); } catch (e) {}
  }
  function tone(type, f0, f1, dur, vol, delay) {
    if (!AC || muted) return;
    var now = AC.currentTime + (delay || 0);
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(master);
    o.start(now); o.stop(now + dur + 0.05);
  }
  var sfx = {
    boing: function () { tone('sine', 220, 740, 0.18, 0.6); tone('sine', 740, 330, 0.25, 0.4, 0.17); },
    chime: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tone('triangle', f, f, 0.28, 0.35, i * 0.07); });
    },
    pop: function () { tone('sine', 900, 300, 0.09, 0.5); },
    squawk: function () {
      tone('sawtooth', 700, 1200, 0.12, 0.18); tone('sawtooth', 1100, 600, 0.18, 0.15, 0.12);
    },
    growl: function () {
      tone('sawtooth', 110, 70, 0.45, 0.25); tone('square', 55, 45, 0.45, 0.12);
    },
    peep: function () { tone('sine', 1600, 2000, 0.08, 0.3); tone('sine', 1700, 2200, 0.08, 0.3, 0.13); },
    fanfare: function () {
      [523, 659, 784, 659, 784, 1047].forEach(function (f, i) {
        tone('square', f, f, i === 5 ? 0.5 : 0.14, 0.12, i * 0.13);
      });
    },
    step: function () { tone('sine', 90, 60, 0.07, 0.25); }
  };

  // ---------- scene layout ----------
  var groundTop = 0, groundBot = 0;
  function layout() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    groundTop = H * 0.62; groundBot = H * 0.97;
    drawBackground();
    if (rider.x === undefined) placeActors();
    rider.x = clamp(rider.x, 0, W); rider.y = clamp(rider.y, groundTop, groundBot);
    trike.y = groundTop + (groundBot - groundTop) * 0.12;
    egg.x = W * 0.08; egg.y = groundBot - H * 0.02;
  }

  // background painted once per resize
  function seeded(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function drawBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    var g = bgx; g.setTransform(DPR, 0, 0, DPR, 0, 0);
    var R = seeded(42);
    var horizon = H * 0.5;
    // sky
    var sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#5a4fcf'); sky.addColorStop(0.45, '#c86fc4');
    sky.addColorStop(0.8, '#ff9e9e'); sky.addColorStop(1, '#ffc770');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#86b45a'; g.fillRect(0, horizon, W, H - horizon);
    // sun
    var sx = W * 0.58, sy = horizon * 0.98, sr = Math.min(W, H) * 0.09;
    var glow = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 3);
    glow.addColorStop(0, 'rgba(255,230,140,.8)'); glow.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, horizon);
    g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
    // far mesas
    g.fillStyle = '#b0607e';
    g.beginPath(); g.moveTo(0, horizon);
    for (var x = 0; x <= W; x += W / 12) g.lineTo(x, horizon - H * (0.04 + R() * 0.1));
    g.lineTo(W, horizon); g.closePath(); g.fill();
    // volcano
    var vx = W * 0.82, vt = H * 0.18, vw = W * 0.2;
    g.fillStyle = '#7a3f38';
    g.beginPath(); g.moveTo(vx - vw, horizon + 4); g.lineTo(vx - vw * 0.12, vt);
    g.lineTo(vx + vw * 0.12, vt); g.lineTo(vx + vw, horizon + 4); g.closePath(); g.fill();
    g.strokeStyle = '#ff7a1a'; g.lineCap = 'round'; g.lineWidth = Math.max(3, W * 0.006);
    [[-0.08, 0.45], [0.02, 0.75], [0.09, 0.5]].forEach(function (l) {
      g.beginPath(); g.moveTo(vx + vw * l[0] * 0.8, vt + 2);
      g.quadraticCurveTo(vx + vw * l[0] * 2, vt + (horizon - vt) * 0.4, vx + vw * l[0] * 3, vt + (horizon - vt) * l[1]);
      g.stroke();
    });
    g.fillStyle = '#ffb02e'; g.beginPath(); g.ellipse(vx, vt + 2, vw * 0.12, H * 0.012, 0, 0, Math.PI * 2); g.fill();
    // waterfall cliff
    g.fillStyle = '#8b6f86';
    g.beginPath(); g.ellipse(W * 0.655, horizon + H * 0.01, W * 0.06, H * 0.075, 0, Math.PI, 0); g.fill();
    var wf = g.createLinearGradient(0, horizon - H * 0.06, 0, horizon + H * 0.06);
    wf.addColorStop(0, '#e9fbff'); wf.addColorStop(1, '#6fcff5');
    g.fillStyle = wf; g.beginPath();
    g.moveTo(W * 0.645, horizon - H * 0.055); g.lineTo(W * 0.665, horizon - H * 0.055);
    g.lineTo(W * 0.672, horizon + H * 0.06); g.lineTo(W * 0.638, horizon + H * 0.06); g.closePath(); g.fill();
    // green hills
    [['#5f9d43', 0.04], ['#4a8a37', 0.08]].forEach(function (h, i) {
      g.fillStyle = h[0]; g.beginPath(); g.moveTo(0, H);
      for (var x2 = 0; x2 <= W + 20; x2 += 20) {
        g.lineTo(x2, horizon + H * h[1] + Math.sin(x2 / W * Math.PI * (3 + i) + i) * H * 0.03);
      }
      g.lineTo(W, H); g.closePath(); g.fill();
    });
    // trees
    for (var i = 0; i < 7; i++) {
      var tx = W * (0.05 + R() * 0.9), ty = horizon + H * (0.03 + R() * 0.06), ts = H * (0.04 + R() * 0.04);
      g.fillStyle = '#6b4a2f'; g.fillRect(tx - ts * 0.08, ty - ts * 0.9, ts * 0.16, ts);
      g.fillStyle = i % 2 ? '#7fb347' : '#6aa33d';
      g.beginPath(); g.ellipse(tx, ty - ts, ts * 0.9, ts * 0.45, 0, 0, Math.PI * 2); g.fill();
    }
    // dirt ground
    var dirt = g.createLinearGradient(0, groundTop - H * 0.04, 0, H);
    dirt.addColorStop(0, '#d99858'); dirt.addColorStop(1, '#b8673a');
    g.fillStyle = dirt;
    g.beginPath(); g.moveTo(0, H);
    for (var x3 = 0; x3 <= W + 30; x3 += 30) g.lineTo(x3, groundTop - H * 0.05 + Math.sin(x3 / W * 9) * H * 0.012);
    g.lineTo(W, H); g.closePath(); g.fill();
    // pebbles
    for (var p = 0; p < 40; p++) {
      var px = R() * W, py = groundTop + R() * (H - groundTop), pr = 2 + R() * H * 0.012;
      g.fillStyle = R() > 0.5 ? '#a9714a' : '#c98d5f';
      g.beginPath(); g.ellipse(px, py, pr * 1.4, pr, 0, 0, Math.PI * 2); g.fill();
    }
    // ferns on the edges
    function fern(x, y, s, flip) {
      g.save(); g.translate(x, y); g.scale(flip ? -s : s, s);
      g.fillStyle = '#3f8a3a';
      for (var k = 0; k < 5; k++) {
        g.save(); g.rotate(-1.1 + k * 0.45);
        g.beginPath(); g.ellipse(0, -60, 14, 60, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      g.restore();
    }
    var fs = H / 600;
    fern(-10, H + 10, fs * 1.4, false); fern(W + 10, H + 10, fs * 1.6, true);
    fern(W * 0.93, groundTop - H * 0.02, fs * 0.8, true);
    // purple curly plants
    function curl(x, y, s) {
      g.save(); g.translate(x, y); g.strokeStyle = '#8a4fc0'; g.lineWidth = 9 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(8 * s, -50 * s, 0, -80 * s);
      var cx = -18 * s, cy = -80 * s;
      for (var a = 0; a <= Math.PI * 3.2; a += 0.2) {
        var rr = 18 * s * (1 - a / (Math.PI * 4));
        g.lineTo(cx + Math.cos(a) * rr, cy - Math.sin(a) * rr);
      }
      g.stroke(); g.restore();
    }
    curl(W * 0.75, groundTop + H * 0.02, fs); curl(W * 0.79, groundTop + H * 0.03, fs * 0.8);
    curl(W * 0.03, H * 0.9, fs * 1.2);
  }

  // ---------- actors ----------
  var rider = { facing: 1, sx: 1, speed: 0, jumpT: -1, tx: 0, ty: 0, wait: 0, stepPhase: 0, taps: 0 };
  var ptero = { x: -300, y: 0, dir: 1, timer: 2, flying: false, loopT: -1 };
  var trike = { x: 0, y: 0, facing: -1, sx: -1, tx: 0, wait: 2, hopT: -1 };
  var egg = { x: 0, y: 0, wobT: -1 };
  var stars = [];
  var particles = [];
  var clouds = [];
  var smoke = [];

  function placeActors() {
    rider.x = W * 0.45; rider.y = groundTop + (groundBot - groundTop) * 0.6;
    rider.tx = rider.x; rider.ty = rider.y; rider.wait = 1;
    trike.x = W * 0.8; trike.tx = trike.x;
    for (var i = 0; i < 4; i++) clouds.push({ x: rand(0, W), y: rand(H * 0.04, H * 0.17), s: rand(0.6, 1.2), v: rand(6, 14) });
  }

  function riderSize(y) {
    var depth = (y - groundTop) / (groundBot - groundTop);
    var base = Math.min(H * 0.42, W * 0.36);
    return base * (0.72 + 0.4 * depth);
  }
  function riderBox() {
    var s = riderSize(rider.y), w = s * (640 / 600);
    var lift = rider.jumpT >= 0 ? Math.sin(Math.PI * rider.jumpT / 0.7) * H * 0.14 : 0;
    return { x: rider.x - w / 2, y: rider.y - s - lift, w: w, h: s };
  }
  function spriteBox(im, cx, by, h) {
    var w = h * (im.naturalWidth || 1) / (im.naturalHeight || 1);
    return { x: cx - w / 2, y: by - h, w: w, h: h };
  }
  function hit(b, x, y, shrink) {
    var sx = b.w * shrink, sy = b.h * shrink;
    return x > b.x + sx && x < b.x + b.w - sx && y > b.y + sy && y < b.y + b.h - sy;
  }
  function trikeH() { return Math.min(H * 0.2, W * 0.17); }
  function eggH() { return Math.min(H * 0.2, W * 0.15); }
  function pteroH() { return Math.min(H * 0.13, W * 0.1); }

  // ---------- particles ----------
  var COLORS = ['#ffd23f', '#ff6fb5', '#7cf0ff', '#9bff7a', '#ffffff', '#ff8a3d', '#c69bff'];
  function burst(x, y, n, kind) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, Math.PI * 2), sp = rand(H * 0.25, H * 0.7);
      particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - H * 0.3, g: H * 1.4,
        life: 0, max: rand(0.7, 1.3), kind: kind || (Math.random() < 0.3 ? 'heart' : 'star'),
        c: COLORS[(Math.random() * COLORS.length) | 0], s: rand(H * 0.015, H * 0.03), r: rand(0, 6), vr: rand(-6, 6)
      });
    }
  }
  function confetti() {
    for (var i = 0; i < 80; i++) {
      particles.push({ x: rand(0, W), y: rand(-H * 0.3, 0), vx: rand(-40, 40), vy: rand(H * 0.2, H * 0.4), g: 0,
        life: 0, max: rand(2.5, 4), kind: 'confetti', c: COLORS[(Math.random() * COLORS.length) | 0],
        s: rand(H * 0.012, H * 0.022), r: rand(0, 6), vr: rand(-8, 8) });
    }
  }
  function dust(x, y, s) {
    particles.push({ x: x, y: y, vx: rand(-20, 20), vy: rand(-30, -10), g: 0, life: 0, max: rand(0.5, 0.9),
      kind: 'dust', c: '#c98a55', s: s * rand(0.04, 0.07), r: 0, vr: 0 });
  }
  function drawStar(g, r) {
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }
  function drawHeart(g, r) {
    g.beginPath(); g.moveTo(0, r * 0.35);
    g.bezierCurveTo(-r * 1.2, -r * 0.4, -r * 0.4, -r * 1.2, 0, -r * 0.45);
    g.bezierCurveTo(r * 0.4, -r * 1.2, r * 1.2, -r * 0.4, 0, r * 0.35);
    g.fill();
  }

  // ---------- input ----------
  function onTap(e) {
    if (!running) return;
    e.preventDefault();
    audioInit();
    var x = e.clientX, y = e.clientY;

    if (hit(riderBox(), x, y, 0.12)) {
      if (rider.jumpT < 0) { rider.jumpT = 0; sfx.boing(); }
      burst(x, y, 16);
      rider.taps++;
      if (rider.taps % 6 === 0) { confetti(); sfx.fanfare(); }
      return;
    }
    if (ptero.flying && hit(spriteBox(images.ptero, ptero.x, ptero.y + pteroH() / 2, pteroH()), x, y, 0)) {
      if (ptero.loopT < 0) ptero.loopT = 0;
      sfx.squawk(); burst(x, y, 10, 'star');
      return;
    }
    if (hit(spriteBox(images.trike, trike.x, trike.y, trikeH()), x, y, 0.1)) {
      if (trike.hopT < 0) trike.hopT = 0;
      sfx.growl(); burst(x, y, 8, 'heart');
      return;
    }
    if (hit(spriteBox(images.egg, egg.x, egg.y, eggH()), x, y, 0.05)) {
      egg.wobT = 0; sfx.peep(); burst(x, y, 10, 'heart');
      return;
    }
    // empty spot: drop a star for the dino to run to
    if (stars.length >= 5) stars.shift();
    stars.push({ x: clamp(x, W * 0.08, W * 0.92), y: clamp(y, groundTop + H * 0.03, groundBot), t: 0 });
    sfx.pop();
  }

  // ---------- update ----------
  function update(dt) {
    t += dt;

    // rider: chase the nearest star, or wander
    var target = null, best = 1e9;
    stars.forEach(function (s) { var d = Math.hypot(s.x - rider.x, s.y - rider.y); if (d < best) { best = d; target = s; } });
    if (target) { rider.tx = target.x; rider.ty = target.y; rider.wait = 0; }
    var dx = rider.tx - rider.x, dy = rider.ty - rider.y, dist = Math.hypot(dx, dy);
    var maxSp = W * (target ? 0.32 : 0.16);
    if (dist > 6 && rider.wait <= 0) {
      rider.speed = lerp(rider.speed, maxSp, Math.min(1, dt * 3));
      var step = Math.min(dist, rider.speed * dt);
      rider.x += dx / dist * step; rider.y += dy / dist * step;
      if (Math.abs(dx) > 4) rider.facing = dx > 0 ? 1 : -1;
    } else {
      rider.speed = lerp(rider.speed, 0, Math.min(1, dt * 6));
      if (target && dist <= 30) {
        stars.splice(stars.indexOf(target), 1);
        burst(target.x, target.y - riderSize(rider.y) * 0.3, 18); sfx.chime();
      } else if (!target) {
        rider.wait -= dt;
        if (rider.wait <= 0 && dist <= 6) {
          rider.tx = rand(W * 0.15, W * 0.85); rider.ty = rand(groundTop, groundBot);
          rider.wait = rand(0.4, 1.8);
        }
      }
    }
    rider.sx = lerp(rider.sx, rider.facing, Math.min(1, dt * 7));
    if (rider.speed > 20) {
      var prev = rider.stepPhase;
      rider.stepPhase += dt * (6 + rider.speed / W * 14);
      if (Math.floor(prev) !== Math.floor(rider.stepPhase) && rider.jumpT < 0) {
        dust(rider.x - rider.facing * riderSize(rider.y) * 0.35, rider.y - 4, riderSize(rider.y));
        if (Math.floor(rider.stepPhase) % 2 === 0) sfx.step();
      }
    }
    if (rider.jumpT >= 0) { rider.jumpT += dt; if (rider.jumpT > 0.7) { rider.jumpT = -1; dust(rider.x, rider.y, riderSize(rider.y) * 2); } }

    // pterodactyl crosses the sky now and then
    if (!ptero.flying) {
      ptero.timer -= dt;
      if (ptero.timer <= 0) {
        ptero.flying = true; ptero.dir = Math.random() < 0.5 ? 1 : -1;
        ptero.x = ptero.dir > 0 ? -W * 0.15 : W * 1.15; ptero.y = rand(H * 0.08, H * 0.28);
      }
    } else {
      ptero.x += ptero.dir * W * 0.12 * dt;
      if (ptero.loopT >= 0) { ptero.loopT += dt; if (ptero.loopT > 1) ptero.loopT = -1; }
      if (ptero.x < -W * 0.2 || ptero.x > W * 1.2) { ptero.flying = false; ptero.timer = rand(4, 9); }
    }

    // triceratops ambles along the back
    if (Math.abs(trike.tx - trike.x) < 4) {
      trike.wait -= dt;
      if (trike.wait <= 0) { trike.tx = rand(W * 0.2, W * 0.9); trike.wait = rand(2, 5); }
    } else {
      var d2 = trike.tx - trike.x; trike.facing = d2 > 0 ? 1 : -1;
      trike.x += Math.sign(d2) * Math.min(Math.abs(d2), W * 0.05 * dt);
    }
    trike.sx = lerp(trike.sx, trike.facing, Math.min(1, dt * 5));
    if (trike.hopT >= 0) { trike.hopT += dt; if (trike.hopT > 0.5) trike.hopT = -1; }
    if (egg.wobT >= 0) { egg.wobT += dt; if (egg.wobT > 0.8) egg.wobT = -1; }

    // stars, particles, clouds, smoke
    stars.forEach(function (s) { s.t += dt; });
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt; if (p.life > p.max) { particles.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.kind === 'confetti') p.x += Math.sin(t * 3 + i) * 30 * dt;
    }
    clouds.forEach(function (c) { c.x += c.v * dt; if (c.x > W + 150) c.x = -150; });
    if (Math.random() < dt * 2.5) smoke.push({ x: W * 0.82 + rand(-8, 8), y: H * 0.17, r: H * 0.02, life: 0 });
    for (var j = smoke.length - 1; j >= 0; j--) {
      var s2 = smoke[j]; s2.life += dt; s2.y -= H * 0.03 * dt; s2.x += 6 * dt; s2.r += H * 0.012 * dt;
      if (s2.life > 5) smoke.splice(j, 1);
    }
  }

  // ---------- draw ----------
  function drawSprite(im, cx, by, h, sx, rot, squash) {
    if (!im.naturalWidth) return;
    var w = h * im.naturalWidth / im.naturalHeight;
    ctx.save();
    ctx.translate(cx, by);
    ctx.rotate(rot || 0);
    ctx.scale((Math.abs(sx) < 0.08 ? 0.08 * Math.sign(sx || 1) : sx), squash || 1);
    ctx.drawImage(im, -w / 2, -h, w, h);
    ctx.restore();
  }
  function shadow(x, y, w) {
    ctx.fillStyle = 'rgba(80,40,20,.25)';
    ctx.beginPath(); ctx.ellipse(x, y, w * 0.38, w * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  }

  function draw() {
    ctx.drawImage(bg, 0, 0, W, H);

    // smoke + clouds
    smoke.forEach(function (s) {
      ctx.fillStyle = 'rgba(120,100,130,' + (0.5 * (1 - s.life / 5)) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = 'rgba(255,190,220,.85)';
    clouds.forEach(function (c) {
      var r = H * 0.035 * c.s;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.arc(c.x + r * 1.1, c.y - r * 0.4, r * 1.2, 0, Math.PI * 2);
      ctx.arc(c.x + r * 2.3, c.y, r, 0, Math.PI * 2); ctx.fill();
    });

    // pterodactyl
    if (ptero.flying) {
      var ph = pteroH(), flap = 0.8 + 0.2 * Math.sin(t * 10);
      var rot = ptero.loopT >= 0 ? ptero.dir * Math.PI * 2 * ptero.loopT : Math.sin(t * 2) * 0.08;
      var lift = ptero.loopT >= 0 ? -Math.sin(Math.PI * ptero.loopT) * H * 0.08 : Math.sin(t * 3) * H * 0.01;
      drawSprite(images.ptero, ptero.x, ptero.y + ph / 2 + lift, ph, ptero.dir, rot, flap);
    }

    // ground things, back to front
    var things = [
      { y: trike.y, f: function () {
        var th = trikeH(), hop = trike.hopT >= 0 ? Math.sin(Math.PI * trike.hopT / 0.5) * H * 0.06 : 0;
        var walk = Math.abs(trike.tx - trike.x) > 4 ? Math.abs(Math.sin(t * 7)) * th * 0.03 : 0;
        shadow(trike.x, trike.y, th * 1.3);
        drawSprite(images.trike, trike.x, trike.y - hop - walk, th, -trike.sx, Math.sin(t * 7) * 0.02, 1);
      } },
      { y: egg.y, f: function () {
        var eh = eggH(), w = egg.wobT >= 0 ? Math.sin(egg.wobT * 30) * 0.2 * (1 - egg.wobT / 0.8) : Math.sin(t * 1.5) * 0.03;
        var pop = egg.wobT >= 0 ? 1 + 0.15 * Math.sin(Math.PI * egg.wobT / 0.8) : 1;
        shadow(egg.x, egg.y, eh * 0.9);
        drawSprite(images.egg, egg.x, egg.y, eh * pop, 1, w, 1);
      } },
      { y: rider.y, f: function () {
        var s = riderSize(rider.y), moving = rider.speed > 20 && rider.jumpT < 0;
        var bob = moving ? Math.abs(Math.sin(rider.stepPhase * Math.PI)) * s * 0.035 : Math.sin(t * 2.5) * s * 0.006;
        var tilt = moving ? Math.sin(rider.stepPhase * Math.PI) * 0.035 : 0;
        var lift = rider.jumpT >= 0 ? Math.sin(Math.PI * rider.jumpT / 0.7) * H * 0.14 : 0;
        var squash = rider.jumpT >= 0 ? 1 + 0.06 * Math.sin(Math.PI * rider.jumpT / 0.7) : 1;
        shadow(rider.x, rider.y, s * (1 - lift / (H * 0.5)));
        drawSprite(images.rider, rider.x, rider.y - bob - lift, s, rider.sx, tilt, squash);
      } }
    ];
    stars.forEach(function (st) {
      things.push({ y: st.y, f: function () {
        var r = H * 0.035 * (1 + 0.12 * Math.sin(st.t * 6)), appear = Math.min(1, st.t * 4);
        ctx.save(); ctx.translate(st.x, st.y - r * 1.2); ctx.rotate(Math.sin(st.t * 2) * 0.3);
        ctx.scale(appear, appear);
        ctx.fillStyle = 'rgba(255,240,150,.35)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd23f'; drawStar(ctx, r);
        ctx.restore();
      } });
    });
    things.sort(function (a, b) { return a.y - b.y; });
    things.forEach(function (th) { th.f(); });

    // particles
    particles.forEach(function (p) {
      var k = 1 - p.life / p.max;
      ctx.save(); ctx.globalAlpha = p.kind === 'dust' ? 0.5 * k : Math.min(1, k * 1.5);
      ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      if (p.kind === 'star') drawStar(ctx, p.s);
      else if (p.kind === 'heart') drawHeart(ctx, p.s * 1.2);
      else if (p.kind === 'confetti') ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      else { ctx.beginPath(); ctx.arc(0, 0, p.s * (1.5 - k), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
  }

  var last = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    update(dt); draw();
    requestAnimationFrame(frame);
  }

  // ---------- start, fullscreen, keep screen awake ----------
  var wakeLock = null;
  function keepAwake() {
    try {
      if (navigator.wakeLock && document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
      }
    } catch (e) {}
  }
  function goFull() {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
      try {
        var p = req.call(el);
        if (p && p.then) p.then(function () {
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
        }).catch(function () {});
      } catch (e) {}
    }
  }

  playBtn.addEventListener('click', function () {
    audioInit(); sfx.chime(); goFull(); keepAwake();
    startEl.classList.add('hidden');
    muteBtn.classList.remove('hidden'); fullBtn.classList.remove('hidden');
    running = true;
  });
  muteBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); audioInit(); setMuted(!muted); });
  fullBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); goFull(); });
  canvas.addEventListener('pointerdown', onTap, { passive: false });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && running) keepAwake();
  });
  window.addEventListener('resize', layout);
  setMuted(muted);

  loadImages(function () {
    layout();
    requestAnimationFrame(function (n) { last = n; requestAnimationFrame(frame); });
  });

  // offline support when served over https
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
