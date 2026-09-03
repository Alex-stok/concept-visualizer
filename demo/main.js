// demo/main.js
//
// Wires the real <av-visualizer> element to a real <audio> element inside
// a mock track-player page: a hero with a waveform scrubber (default
// state) or the visualizer (toggled via the eye-icon button), and a fixed
// bottom mini-player that mirrors the hero's play state. All of this
// chrome is host-page-owned, not the component's.
import '../src/av-visualizer.js';

const audio = document.getElementById('audio');
const viz = document.getElementById('viz');
const hero = document.getElementById('hero');
const notice = document.getElementById('notice');

const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const eyeBtn = document.getElementById('eyeBtn');

const fullscreenBtn = document.getElementById('fullscreenBtn');
const fullscreenEnterIcon = document.getElementById('fullscreenEnterIcon');
const fullscreenExitIcon = document.getElementById('fullscreenExitIcon');

const waveformBars = document.getElementById('waveformBars');
const waveformPlayed = document.getElementById('waveformPlayed');
const waveformPlayedInner = document.getElementById('waveformPlayedInner');
const waveformTimeCurrent = document.getElementById('waveformTimeCurrent');
const waveformTimeTotal = document.getElementById('waveformTimeTotal');
const waveformMarkers = document.getElementById('waveformMarkers');

const heroVizProgressFill = document.getElementById('heroVizProgressFill');
const heroVizMarkers = document.getElementById('heroVizMarkers');

const miniPlayBtn = document.getElementById('miniPlayBtn');
const miniPlayIcon = document.getElementById('miniPlayIcon');
const miniPauseIcon = document.getElementById('miniPauseIcon');
const miniTimeCurrent = document.getElementById('miniTimeCurrent');
const miniTimeTotal = document.getElementById('miniTimeTotal');
const miniTrackFill = document.getElementById('miniTrackFill');

viz.mediaElement = audio;

// --- graceful degradation when demo/audio/track.mp3 is missing ---
function checkAudioError() {
  if (audio.error) notice.hidden = false;
}
checkAudioError(); // covers the case where the error already fired before this script ran
audio.addEventListener('error', checkAudioError); // covers a later error (e.g. src changed dynamically)

// --- synthetic waveform bars + comment markers ---
// Decorative only (no real waveform analysis of the file) — a seeded
// pseudo-random bar-height pattern, same approach real players use before
// a precise waveform is computed server-side.
function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const BAR_COUNT = 140;
const r = rand(97);
const barHeights = [];
for (let i = 0; i < BAR_COUNT; i++) {
  const f = i / (BAR_COUNT - 1);
  const envelope = 0.35 + 0.65 * Math.min(1, Math.sin(Math.PI * Math.pow(f, 0.75)) * 1.35);
  const h = Math.max(0.08, Math.min(1, envelope * (0.55 + 0.45 * r())));
  barHeights.push(h);
}

function buildBars(container) {
  container.innerHTML = '';
  for (const h of barHeights) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = (h * 100).toFixed(1) + '%';
    container.appendChild(bar);
  }
}
buildBars(waveformBars);
buildBars(waveformPlayedInner);

const COMMENT_COUNT = 32;
const cr = rand(41);
const HUES = [24, 200, 320, 48, 260, 160];
const comments = [];
for (let i = 0; i < COMMENT_COUNT; i++) {
  const pos = 0.02 + (i / COMMENT_COUNT) * 0.94 + cr() * 0.02;
  comments.push({ left: pos, color: `hsl(${HUES[i % HUES.length]}, 55%, 55%)` });
}

for (const c of comments) {
  // waveformMarkers is a flex row (a tight overlapping avatar stack) —
  // order, not an absolute `left`, places each one. heroVizMarkers is a
  // separate overlay spanning the full progress bar, where `left` means
  // "this far through the track", so that one keeps its % positioning.
  const dot = document.createElement('div');
  dot.className = 'comment-marker';
  dot.style.background = c.color;
  waveformMarkers.appendChild(dot);

  const tick = document.createElement('div');
  tick.className = 'marker';
  tick.style.left = (c.left * 100).toFixed(2) + '%';
  tick.style.background = c.color;
  heroVizMarkers.appendChild(tick);
}

// --- shared playback state, driving both the hero and mini-player UI ---
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function togglePlay() {
  if (audio.paused) {
    audio.play().catch(() => {}); // ignore: no file provided yet
    viz.activate();
  } else {
    audio.pause();
  }
}
playBtn.addEventListener('click', togglePlay);
miniPlayBtn.addEventListener('click', togglePlay);

audio.addEventListener('play', () => {
  playIcon.hidden = true;
  pauseIcon.hidden = false;
  miniPlayIcon.hidden = true;
  miniPauseIcon.hidden = false;
});
audio.addEventListener('pause', () => {
  playIcon.hidden = false;
  pauseIcon.hidden = true;
  miniPlayIcon.hidden = false;
  miniPauseIcon.hidden = true;
  viz.deactivate();
});
audio.addEventListener('ended', () => {
  playIcon.hidden = false;
  pauseIcon.hidden = true;
  miniPlayIcon.hidden = false;
  miniPauseIcon.hidden = true;
  viz.deactivate();
});

audio.addEventListener('loadedmetadata', () => {
  const total = formatTime(audio.duration);
  waveformTimeTotal.textContent = total;
  miniTimeTotal.textContent = total;
});

audio.addEventListener('timeupdate', () => {
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  waveformPlayed.style.width = pct + '%';
  heroVizProgressFill.style.width = pct + '%';
  miniTrackFill.style.width = pct + '%';
  const current = formatTime(audio.currentTime);
  waveformTimeCurrent.textContent = current;
  miniTimeCurrent.textContent = current;
});

// --- eye toggle: waveform <-> visualizer ---
function showWaveform() {
  hero.classList.remove('viz-active');
  eyeBtn.setAttribute('aria-pressed', 'false');
  viz.deactivate();
}
function showVisualizer() {
  hero.classList.add('viz-active');
  eyeBtn.setAttribute('aria-pressed', 'true');
  if (!audio.paused) viz.activate();
}
eyeBtn.addEventListener('click', () => {
  if (eyeBtn.getAttribute('aria-pressed') === 'true') showWaveform();
  else showVisualizer();
});
showWaveform();

// --- hover-to-reveal: in visualizer mode, the controls stay hidden until
// the hero is hovered, then fade out again a beat after the pointer
// leaves. Has no effect in waveform mode. ---
let hideTimer = null;
function reveal() {
  clearTimeout(hideTimer);
  hero.classList.add('revealed');
}
function scheduleUnreveal() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => hero.classList.remove('revealed'), 900);
}
hero.addEventListener('mouseenter', reveal);
hero.addEventListener('mouseleave', scheduleUnreveal);

// --- fullscreen toggle: fullscreens the whole hero, chrome included, so
// every control stays reachable once in fullscreen. ---
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    hero.requestFullscreen().catch(() => {}); // ignore: browser/user denied it
  }
}
fullscreenBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const isFullscreen = document.fullscreenElement === hero;
  fullscreenEnterIcon.hidden = isFullscreen;
  fullscreenExitIcon.hidden = !isFullscreen;
  fullscreenBtn.setAttribute('aria-pressed', String(isFullscreen));
});
