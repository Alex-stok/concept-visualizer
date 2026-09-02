// demo/main.js
//
// Wires the real <av-visualizer> element to a real <audio> element and
// builds the outer icon-row chrome, including the eye-icon WAVEFORM/VISUALIZER
// toggle — the part a host page owns, not the component. This is the proof
// that the component works end to end against real playback.
import '../src/av-visualizer.js';

const audio = document.getElementById('audio');
const viz = document.getElementById('viz');
const artPlaceholder = document.getElementById('artPlaceholder');
const notice = document.getElementById('notice');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const eyeBtn = document.getElementById('eyeBtn');

viz.mediaElement = audio;

function checkAudioError() {
  if (audio.error) notice.hidden = false;
}
checkAudioError(); // covers the case where the error already fired before this script ran
audio.addEventListener('error', checkAudioError); // covers a later error (e.g. src changed dynamically)

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
  eyeBtn.setAttribute('aria-pressed', 'false');
}
function showVisualizer() {
  artPlaceholder.style.display = 'none';
  viz.style.display = '';
  eyeBtn.setAttribute('aria-pressed', 'true');
}
eyeBtn.addEventListener('click', () => {
  if (eyeBtn.getAttribute('aria-pressed') === 'true') showWaveform();
  else showVisualizer();
});
showWaveform();
