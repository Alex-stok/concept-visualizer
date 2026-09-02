// demo/main.js
//
// Wires the real <av-visualizer> element to a real <audio> element and
// builds the outer WAVEFORM/VISUALIZER toggle chrome — the part a host
// page owns, not the component. This is the proof that the component
// works end to end against real playback.
import '../src/av-visualizer.js';

const audio = document.getElementById('audio');
const viz = document.getElementById('viz');
const artPlaceholder = document.getElementById('artPlaceholder');
const notice = document.getElementById('notice');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const waveBtn = document.getElementById('waveBtn');
const vizBtn = document.getElementById('vizBtn');

viz.mediaElement = audio;

audio.addEventListener('error', () => {
  notice.hidden = false;
});

playBtn.addEventListener('click', () => {
  if (audio.paused) {
    audio.play().catch(() => {}); // ignore: no file provided yet
    viz.activate();
  } else {
    audio.pause();
  }
});

audio.addEventListener('play', () => {
  playIcon.hidden = true;
  pauseIcon.hidden = false;
});
audio.addEventListener('pause', () => {
  playIcon.hidden = false;
  pauseIcon.hidden = true;
});

function showWaveform() {
  artPlaceholder.style.display = '';
  viz.style.display = 'none';
  waveBtn.setAttribute('aria-pressed', 'true');
  vizBtn.setAttribute('aria-pressed', 'false');
}
function showVisualizer() {
  artPlaceholder.style.display = 'none';
  viz.style.display = '';
  waveBtn.setAttribute('aria-pressed', 'false');
  vizBtn.setAttribute('aria-pressed', 'true');
}
waveBtn.addEventListener('click', showWaveform);
vizBtn.addEventListener('click', showVisualizer);
showWaveform();
