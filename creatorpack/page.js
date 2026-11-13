import { ensureCreatorAccess } from './access.js';
import { setupCreativePreferences } from './preferences.js';
const endpoint = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? '/__creator-intake'
  : 'https://qoxoutfmmmuzjneyvryi.supabase.co/functions/v1/creator-pack-intake';
const $ = (id) => document.getElementById(id);
const form = $('creator-form');
const status = $('form-status');
const progress = $('upload-progress');
const button = form.querySelector('[type=submit]');
let pending = null;
let busy = false;
const preferences = setupCreativePreferences(document, () => { if (!busy) pending = null; });
let selectedAudio = null;
let recordingInProgress = false;
const previewURLs = { photos: [], audio: [] };

function report(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function showFiles(kind) {
  for (const url of previewURLs[kind]) URL.revokeObjectURL(url);
  previewURLs[kind] = [];
  const list = $(kind === 'photos' ? 'photo-files' : 'audio-files');
  list.replaceChildren();
  for (const file of $(kind).files) {
    const url = URL.createObjectURL(file);
    previewURLs[kind].push(url);
    if (kind === 'photos') {
      const image = new Image();
      image.className = 'file-preview';
      image.alt = file.name;
      image.src = url;
      image.onerror = () => { const text = document.createElement('span'); text.textContent = file.name; image.replaceWith(text); };
      list.append(image);
    } else {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = url;
      audio.setAttribute('aria-label', 'Your voice note');
      list.append(audio);
    }
  }
}
$('photos').addEventListener('change', () => showFiles('photos'));
$('audio').addEventListener('change', () => { selectedAudio = $('audio').files[0] || null; pending = null; updateAudioSelection(); recordStatus.textContent = selectedAudio ? 'Your recording is ready. Listen to it again below or delete it to record it again.' : 'Tap the mic to record · up to 5 minutes'; });
form.addEventListener('input', () => { if (!busy) pending = null; });

const formats = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', m4a: 'audio/mp4', mp3: 'audio/mpeg',
  wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg'
};
function describe(file, kind) {
  const extension = file.name.split('.').pop().toLowerCase();
  const type = formats[extension];
  if (!type || !type.startsWith(kind === 'photo' ? 'image/' : 'audio/')) throw new Error(`Choose a supported ${kind === 'photo' ? 'photo' : 'audio'} file format.`);
  const maximum = (kind === 'photo' ? 10 : 25) * 1024 * 1024;
  if (!file.size || file.size > maximum) throw new Error(`${kind === 'photo' ? 'Each photo must be under 10 MB.' : 'Your voice note must be under 25 MB.'}`);
  return { kind, extension, type, size: file.size };
}
async function request(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (sessionStorage.getItem('creator-pack-session') || '') }, body: JSON.stringify(payload), signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'We couldn’t receive your ideas. Please try again.');
    return result;
  } finally { clearTimeout(timer); }
}
function upload(url, file, type, completed, total) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', type);
    xhr.timeout = 180000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress.value = Math.min(99, Math.round((completed + event.loaded) / total * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('An upload didn’t finish. Please try again.'));
    xhr.onerror = xhr.ontimeout = () => reject(new Error('The connection was interrupted. Your files are still selected; please try again.'));
    xhr.send(file);
  });
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  if (recordingInProgress) { report('Stop your recording before sending your ideas.', true); return; }
  if (!form.reportValidity()) return;
  try {
    const photos = [...$('photos').files];
    if (photos.length < 1 || photos.length > 3) throw new Error('Choose between one and three photos.');
    const audio = selectedAudio;
    if (!audio) throw new Error('Choose a voice recording.');
    const files = [...photos, audio];
    const descriptors = files.map((file, i) => describe(file, i < photos.length ? 'photo' : 'audio'));
    pending ||= { id: crypto.randomUUID(), token: crypto.randomUUID() };
    busy = true;
    for (const element of form.elements) element.disabled = true;
    if (!await ensureCreatorAccess()) { report('Your ideas haven’t been sent. Enter the password when you’re ready.'); return; }
    progress.hidden = false;
    progress.value = 0;
    report('Preparing your upload…');
    const prepared = await request({ action: 'prepare', ...pending, name: $('name').value.trim(), email: $('email').value.trim(), files: descriptors, creative_preferences: preferences.read(), consent: $('consent').checked, website: $('website').value });
    if (!prepared.complete) {
      let completed = 0;
      const total = files.reduce((sum, file) => sum + file.size, 0);
      for (let i = 0; i < files.length; i++) {
        report(`Uploading file ${i + 1} of ${files.length}…`);
        if (prepared.uploads[i].url) await upload(prepared.uploads[i].url, files[i], descriptors[i].type, completed, total);
        completed += files[i].size;
      }
      report('Saving your ideas…');
      await request({ action: 'complete', ...pending });
    }
    progress.value = 100;
    progress.hidden = true;
    form.classList.add('success');
    form.querySelector('h3').textContent = 'Your ideas are in.';
    const thanks = document.createElement('p'); thanks.textContent = 'Thanks for sharing a little of your world.';
    form.querySelector('.form-heading').append(thanks);
    report(`We’ll email ${$('email').value.trim()} with your first quest and illustration for feedback.`);
    status.tabIndex = -1;
    status.focus();
  } catch (error) {
    report(error.name === 'AbortError' ? 'The connection timed out. Please try again.' : error.message, true);
    progress.hidden = true;
  } finally {
    busy = false;
    if (!form.classList.contains('success')) for (const element of form.elements) element.disabled = false;
    button.disabled = form.classList.contains('success');
  }
});


// Recording stays in this tab until the normal authenticated submission flow.
const audioInput = $('audio');
audioInput.required = false;
const recorderUI = document.createElement('div');
recorderUI.className = 'voice-recorder';
recorderUI.innerHTML = `<div class="record-actions"><button type="button" id="record-voice">Record a voice note</button><button type="button" id="stop-voice" hidden>Stop recording</button><button type="button" id="pause-voice" hidden>Pause</button><button type="button" id="delete-voice" hidden>Delete</button></div><p id="record-status" role="status" aria-live="polite">Tap the mic to record · up to 5 minutes</p><label class="upload-alternative" for="audio">Or upload a recording</label>`;
audioInput.before(recorderUI);
const pauseButton = $('pause-voice');
const recordButton = $('record-voice'), stopButton = $('stop-voice'), deleteButton = $('delete-voice'), recordStatus = $('record-status');
recordStatus.after($('audio-files'));
const recorderIcons = {
  record: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  resume: '<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none"/>',
  delete: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  cancel: '<path d="m6 6 12 12M18 6 6 18"/>'
};
function setRecorderControl(control, label, icon) {
  control.title = label; control.setAttribute('aria-label', label);
  control.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${recorderIcons[icon]}</svg>`;
}
setRecorderControl(recordButton, 'Record a voice note', 'record');
setRecorderControl(stopButton, 'Stop recording', 'stop');
setRecorderControl(pauseButton, 'Pause recording', 'pause');
setRecorderControl(deleteButton, 'Delete recording', 'delete');
let capture = null, recorder = null, chunks = [], tick = null, startedAt = 0, captureGeneration = 0, stopReason = '';
let activeMilliseconds = 0, recordingPaused = false, audioPreviewURL = null, audioPreview = null;
const maxAudioBytes = 25 * 1024 * 1024;
function updateAudioSelection() {
  if (audioPreview) { audioPreview.pause(); audioPreview.removeAttribute('src'); audioPreview = null; }
  if (audioPreviewURL) { URL.revokeObjectURL(audioPreviewURL); audioPreviewURL = null; }
  $('audio-files').replaceChildren();
  const file = selectedAudio;
  if (file) {
    audioPreviewURL = URL.createObjectURL(file);
    audioPreview = document.createElement('audio'); audioPreview.controls = false; audioPreview.preload = 'metadata'; audioPreview.src = audioPreviewURL; audioPreview.setAttribute('aria-label', 'Listen to your voice note');
    audioPreview.onerror = () => { recordStatus.textContent = 'This browser cannot play the recording. You can still send it, or delete it and try another recording.'; };
    audioPreview.hidden = true;
    const player = document.createElement('div'); player.className = 'voice-player';
    const playButton = document.createElement('button'); playButton.type = 'button'; playButton.className = 'voice-play';
    setRecorderControl(playButton, 'Play recording', 'resume');
    const timeline = document.createElement('div'); timeline.className = 'voice-timeline';
    const seek = document.createElement('input'); seek.type = 'range'; seek.min = '0'; seek.max = '100'; seek.step = '0.1'; seek.value = '0'; seek.disabled = true; seek.setAttribute('aria-label', 'Recording playback position');
    const time = document.createElement('span'); time.className = 'voice-playback-time'; time.textContent = '0:00';
    const preview = audioPreview;
    const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const updatePlayback = () => {
      const duration = preview.duration; const current = preview.currentTime || 0;
      seek.disabled = !Number.isFinite(duration) || duration <= 0;
      if (!seek.disabled) { seek.value = String(current / duration * 100); seek.setAttribute('aria-valuetext', `${formatTime(current)} of ${formatTime(duration)}`); }
      time.textContent = `${formatTime(current)}${!seek.disabled ? ' / ' + formatTime(duration) : ''}`;
      setRecorderControl(playButton, preview.paused ? 'Play recording' : 'Pause playback', preview.paused ? 'resume' : 'pause');
    };
    playButton.addEventListener('click', async () => {
      if (!preview.paused) preview.pause();
      else { try { await preview.play(); } catch { recordStatus.textContent = 'Playback couldn’t start. Try again, or delete this recording and make another.'; } }
      updatePlayback();
    });
    seek.addEventListener('input', () => { if (Number.isFinite(preview.duration) && preview.duration > 0) preview.currentTime = Number(seek.value) / 100 * preview.duration; });
    for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended']) preview.addEventListener(event, updatePlayback);
    timeline.append(seek, time); player.append(playButton, timeline); $('audio-files').append(audioPreview, player);
    const label = document.createElement('span'); label.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · Ready to send`; $('audio-files').append(label); }
  deleteButton.hidden = !file;
  setRecorderControl(recordButton, 'Record a voice note', 'record');
  recordButton.hidden = !!file;
}
function releaseCapture() {
  clearInterval(tick); tick = null;
  if (capture) { for (const track of capture.getTracks()) track.stop(); capture = null; }
}
function idleRecordingUI() {
  recorderUI.classList.remove('is-recording');
  recordingInProgress = false; recordButton.disabled = false; recordButton.hidden = false;
  stopButton.hidden = true; pauseButton.hidden = true; recordingPaused = false; audioInput.disabled = false; button.disabled = false;
  updateAudioSelection();
}
function finishRecording(reason = '') {
  stopReason = reason;
  if (!recorder || recorder.state === 'inactive') {
    captureGeneration++; releaseCapture(); idleRecordingUI();
    recordStatus.textContent = 'Recording canceled. Record again or upload a file.'; return;
  }
  if (recorder?.state === 'recording' || recorder?.state === 'paused') {
    stopButton.disabled = true; pauseButton.disabled = true; recordStatus.textContent = 'Finishing recording…'; recorder.stop();
  }
  releaseCapture();
}
function discardRecording() {
  selectedAudio = null; audioInput.value = ''; pending = null; updateAudioSelection();
}
deleteButton.addEventListener('click', () => { discardRecording(); recordStatus.textContent = 'Recording deleted. Record again or upload a file.'; });
recordButton.addEventListener('click', async () => {
  if (recordingInProgress || busy) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    recordStatus.textContent = 'Recording isn’t available in this browser. Open this page in Safari or Chrome, or upload a recording below.'; return;
  }
  discardRecording();
  recorderUI.classList.add('is-recording');
  recordingInProgress = true; recordButton.disabled = true; audioInput.disabled = true; button.disabled = true;
  recordStatus.textContent = 'Allow microphone access to start recording.';
  stopButton.hidden = false; stopButton.disabled = false; setRecorderControl(stopButton, 'Cancel microphone request', 'cancel');
  recorder = null;
  const generation = ++captureGeneration;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (generation !== captureGeneration) { stream.getTracks().forEach(track => track.stop()); return; }
    if (document.hidden) { stream.getTracks().forEach(track => track.stop()); throw new Error('interrupted'); }
    capture = stream;
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
    if (!type) throw new Error('unsupported');
    recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 128000 });
    chunks = []; let bytes = 0; stopReason = '';
    recorder.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes > maxAudioBytes && recorder.state === 'recording') finishRecording('size'); } };
    recorder.onerror = () => { stopReason = 'error'; finishRecording('error'); };
    recorder.onstop = () => {
      const mime = recorder.mimeType.split(';')[0];
      const blob = new Blob(chunks, { type: mime }); chunks = []; releaseCapture();
      if (blob.size && blob.size <= maxAudioBytes && stopReason !== 'error') {
        const extension = mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : 'webm';
        selectedAudio = new File([blob], `voice-note.${extension}`, { type: mime }); pending = null;
        recordStatus.textContent = stopReason === 'interrupted' ? 'Recording stopped because this page was interrupted. The captured audio is ready to send, or delete it and record again.' : stopReason === 'limit' ? 'Five-minute limit reached. Your recording is ready to send.' : 'Your recording is ready. Listen to it again below or delete it to record it again.';
      } else { selectedAudio = null; recordStatus.textContent = 'We couldn’t save that recording. Please record again or upload a file (up to 25 MB).'; }
      idleRecordingUI();
    };
    capture.getAudioTracks().forEach(track => { track.onended = () => { if (recordingInProgress) finishRecording('interrupted'); }; });
    recorder.start(1000); startedAt = performance.now(); activeMilliseconds = 0; recordingPaused = false;
    pauseButton.hidden = !(typeof recorder.pause === 'function' && typeof recorder.resume === 'function'); pauseButton.disabled = false; setRecorderControl(pauseButton, 'Pause recording', 'pause');
    recordButton.hidden = true; stopButton.hidden = false; stopButton.disabled = false; setRecorderControl(stopButton, 'Stop recording', 'stop'); deleteButton.hidden = true;
    const updateTimer = () => { const seconds = Math.floor((activeMilliseconds + (recordingPaused ? 0 : performance.now() - startedAt)) / 1000); recordStatus.textContent = `${recordingPaused ? 'Paused' : 'Recording'} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} / 5:00. Keep this page open.`; if (seconds >= 300) finishRecording('limit'); };
    updateTimer(); tick = setInterval(updateTimer, 250);
  } catch (error) {
    if (generation !== captureGeneration) return;
    releaseCapture(); idleRecordingUI();
    recordStatus.textContent = error.name === 'NotAllowedError' ? 'Microphone access wasn’t allowed. Enable it in your browser settings, or upload a recording below.' : error.name === 'NotFoundError' ? 'No microphone was found. Connect one, or upload a recording below.' : 'Recording couldn’t start. Please try again in Safari or Chrome, or upload a recording below.';
  }
});
pauseButton.addEventListener('click', () => {
  if (!recorder || !recordingInProgress || pauseButton.disabled) return;
  try {
    if (!recordingPaused && recorder.state === 'recording') {
      recorder.pause(); activeMilliseconds += performance.now() - startedAt; recordingPaused = true;
      capture?.getAudioTracks().forEach(track => { track.enabled = false; });
      setRecorderControl(pauseButton, 'Resume recording', 'resume'); recordStatus.textContent = 'Paused. Tap Resume to continue, or Stop recording to finish.';
    } else if (recordingPaused && recorder.state === 'paused') {
      recorder.resume(); capture?.getAudioTracks().forEach(track => { track.enabled = true; });
      startedAt = performance.now(); recordingPaused = false; setRecorderControl(pauseButton, 'Pause recording', 'pause');
    }
  } catch {
    // If resuming failed, finish safely rather than leave the microphone active.
    if (recordingPaused) finishRecording('interrupted');
    else { pauseButton.hidden = true; recordStatus.textContent = 'Pause isn’t available in this browser. You can stop your recording when you’re done.'; }
  }
});
stopButton.addEventListener('click', () => finishRecording());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && recordingInProgress) finishRecording('interrupted');
});
window.addEventListener('pagehide', () => { captureGeneration++; if (recordingInProgress) finishRecording('interrupted'); releaseCapture(); });

// Refine the authenticated introduction without changing the intake workflow.
document.querySelector('.intro-copy h1').innerHTML = 'Give your community a new way to <em>connect with you.</em>';
document.querySelector('.intro-copy .lede').innerHTML = '<span>Turn your favorite places, ideas, and adventures into a SideQuest pack your fans can actually go do.</span>';
document.querySelector('.intro-copy .cost').textContent = "It's free, this costs you nothing";
form.querySelector('.form-heading h3').textContent = 'See what your Creator Pack could look like';
form.querySelector('.form-heading p')?.remove();
document.querySelector('.intro-copy > .eyebrow')?.remove();
document.querySelector('.intake-copy > .eyebrow')?.remove();
document.querySelector('#intake-heading').textContent = 'Your ideas, turned into a custom adventure pack.';
const voiceDirections = document.querySelector('.intake-copy > p:not(.review-note)');
if (voiceDirections) {
  const how = document.createElement('section'); how.className = 'how-it-works';
  how.setAttribute('aria-labelledby', 'how-it-works-heading');
  const heading = document.createElement('h3'); heading.id = 'how-it-works-heading'; heading.textContent = 'How it works';
  const list = document.createElement('ol');
  ['Record your voice note here, or upload an existing recording.',
   'Talk for about 1–5 minutes. Think out loud, change your mind. It doesn’t need to be polished.',
   'Add one to three photos of yourself.',
   'Send your ideas when you’re ready.'].forEach(text => { const item = document.createElement('li'); item.textContent = text; list.append(item); });
  const summary = document.createElement('p'); summary.className = 'recording-summary'; summary.textContent = 'Record a quick voice note about the things you love and share a few photos. We’ll turn them into a SideQuest pack for your community.';
  how.append(heading, list); voiceDirections.replaceWith(summary, how);
}

// Enhance the authenticated content only. The server-side password gate and
// original intake form remain unchanged.
async function mountPhonePreview() {
  const example = document.querySelector('.pack-example');
  const originalCover = example?.querySelector('.cover');
  const originalQuests = document.querySelector('.quests');
  if (!example || !originalCover || !originalQuests) return;
  try {
    const response = await fetch('./quests.json');
    if (!response.ok) throw new Error('Quest preview unavailable');
    const quests = await response.json();
    if (!Array.isArray(quests) || quests.length !== 3) throw new Error('Quest preview unavailable');
    const wrapper = document.createElement('div');
    wrapper.className = 'phone-preview';
    wrapper.innerHTML = `
      <div class="phone-halo" aria-hidden="true"></div>
      <div class="phone-frame" role="region" aria-label="SideQuest mobile app preview">
        <div class="phone-status" aria-hidden="true"><span>9:41</span><span class="phone-island"></span><span class="phone-status-icons">▮▮▮ <span class="phone-battery"></span></span></div>
        <div class="phone-track" tabindex="0" aria-label="Four preview screens. Swipe or use the buttons below."></div>
        <div class="phone-home" aria-hidden="true"><span></span></div>
      </div>
      <div class="phone-navigation" aria-label="Preview navigation">
        <button type="button" class="phone-arrow phone-previous" aria-label="Previous screen">←</button>
        <div class="phone-tabs" aria-label="Choose a preview screen"></div>
        <button type="button" class="phone-arrow phone-next" aria-label="Next screen">→</button>
      </div>
      <p class="phone-hint">Swipe through the pack. Scroll each quest to explore.</p>
      <p class="phone-announcement" aria-live="polite"></p>`;
    const track = wrapper.querySelector('.phone-track');
    const coverScreen = document.createElement('section');
    coverScreen.className = 'phone-slide phone-cover-screen';
    coverScreen.setAttribute('aria-label', '1 of 4: Pack cover');
    const cover = originalCover.cloneNode(true);
    cover.querySelector('.cover-title > span')?.remove();
    coverScreen.append(cover);
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'phone-open-pack';
    open.innerHTML = 'Explore the quests <span aria-hidden="true">→</span>';
    coverScreen.append(open);
    const listHeading = document.createElement('h3'); listHeading.className = 'phone-list-heading'; listHeading.textContent = 'Quests in this pack'; coverScreen.append(listHeading);
    quests.forEach((quest, index) => {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'phone-quest-row';
      const number = document.createElement('span'); number.className = 'phone-list-number'; number.textContent = String(index + 1).padStart(2, '0');
      const details = document.createElement('span'); const name = document.createElement('strong'); name.textContent = quest.title;
      const duration = document.createElement('span'); duration.textContent = quest.duration; details.append(name, duration); row.append(number, details);
      row.addEventListener('click', () => goTo(index + 1)); coverScreen.append(row);
    });
    track.append(coverScreen);
    const labels = ['Pack', 'Dance', 'Play', 'Connect'];
    quests.forEach((quest, index) => {
      const screen = document.createElement('section');
      screen.className = 'phone-slide phone-quest-screen';
      screen.setAttribute('aria-label', `${index + 2} of 4: ${quest.title}`);
      const image = new Image(); image.src = `./assets/${quest.image}.jpg`;
      image.width = 1536; image.height = 1024;
      image.alt = originalQuests.querySelectorAll('.quest-card img')[index]?.alt || quest.title;
      const copy = document.createElement('div'); copy.className = 'phone-quest-copy';
      const duration = document.createElement('p'); duration.className = 'phone-duration'; duration.textContent = quest.duration;
      const title = document.createElement('h2'); title.textContent = quest.title;
      const subtitle = document.createElement('p'); subtitle.className = 'phone-subtitle'; subtitle.textContent = quest.subtitle;
      const steps = document.createElement('ol'); steps.className = 'phone-steps';
      quest.steps.forEach(step => { const li = document.createElement('li'); li.textContent = step; steps.append(li); });
      copy.append(title, subtitle);
      const hero = document.createElement('div'); hero.className = 'phone-quest-hero'; hero.append(image, copy);
      const panel = document.createElement('div'); panel.className = 'phone-step-panel';
      const heading = document.createElement('h3'); heading.textContent = 'How to do it'; panel.append(heading, steps);
      if (quest.safety) { const safety = document.createElement('p'); safety.className = 'phone-safety'; safety.textContent = quest.safety; panel.append(safety); }
      screen.append(hero, panel); track.append(screen);
    });
    const tabs = wrapper.querySelector('.phone-tabs');
    let current = 0;
    const buttons = labels.map((label, index) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'phone-tab';
      b.textContent = label; b.setAttribute('aria-label', `Show ${label.toLowerCase()} screen`);
      b.addEventListener('click', () => goTo(index)); tabs.append(b); return b;
    });
    const previous = wrapper.querySelector('.phone-previous');
    const next = wrapper.querySelector('.phone-next');
    const announcement = wrapper.querySelector('.phone-announcement');
    function update(index) {
      current = Math.max(0, Math.min(3, index));
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === current)));
      previous.disabled = current === 0; next.disabled = current === 3;
      announcement.textContent = current === 0 ? 'Pack cover, screen 1 of 4' : `${quests[current - 1].title}, screen ${current + 1} of 4`;
    }
    function goTo(index) {
      index = Math.max(0, Math.min(3, index));
      track.scrollTo({left:index * track.clientWidth, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    }
    previous.addEventListener('click', () => goTo(current - 1));
    next.addEventListener('click', () => goTo(current + 1));
    open.addEventListener('click', () => goTo(1));
    track.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); goTo(current + (event.key === 'ArrowRight' ? 1 : -1));
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); goTo(event.key === 'Home' ? 0 : 3);
      }
    });
    let scrollFrame;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => update(Math.round(track.scrollLeft / track.clientWidth)));
    }, {passive:true});
    // Retain the selected screen when rotating a phone or resizing a window.
    const resize = new ResizeObserver(() => track.scrollTo({left:current * track.clientWidth, behavior:'instant'}));
    resize.observe(track);
    example.replaceWith(wrapper);
    originalQuests.remove();
    $('quest-dialog')?.remove();
    document.querySelector('.intro').classList.add('intro-with-phone');
    update(0);
  } catch (error) {
    // Keep the original three quest cards usable if loading the carousel fails.
    const dialog = $('quest-dialog');
    document.querySelectorAll('[data-quest]').forEach(card => card.addEventListener('click', async () => {
      try {
        const r = await fetch('./quests.json'); if (!r.ok) throw new Error();
        const quest = (await r.json())[Number(card.dataset.quest)];
        $('quest-image').src = `./assets/${quest.image}.jpg`;
        $('quest-image').alt = card.querySelector('img').alt;
        $('quest-title').textContent = quest.title; $('quest-duration').textContent = quest.duration;
        $('quest-subtitle').textContent = quest.subtitle; $('quest-safety').textContent = quest.safety;
        $('quest-steps').replaceChildren(...quest.steps.map(step => {const li=document.createElement('li');li.textContent=step;return li;}));
        if (!dialog.open) dialog.showModal(); dialog.scrollTop=0;
      } catch { card.querySelector('.quest-link').textContent='Couldn’t load the quest. Tap to retry.'; }
    }));
    dialog?.querySelector('button').addEventListener('click', () => dialog.close());
  }
}
mountPhonePreview();

// Approved community-sharing section, below the submission experience.
const sharing = document.createElement('section');
sharing.className = 'community-sharing';
sharing.setAttribute('aria-labelledby', 'community-sharing-heading');
sharing.innerHTML = `<h2 id="community-sharing-heading">Get your community sharing</h2><p>Encourage your community to post their quests on social media and tag you, so you can see and share the adventures you inspired.</p>`;
document.querySelector('.intake').after(sharing);

// Why-make-a-pack section under the hero, with the share options folded in as a compact strip.
const why = document.createElement('section');
why.className = 'why-pack';
why.setAttribute('aria-labelledby', 'why-pack-heading');
why.innerHTML = `<div class="why-intro"><h2 id="why-pack-heading">What is this, and why should I care?</h2><p>SideQuest was built to help people get out of the house and try new things. A pack is a handful of real-life quests, written in your voice and starring an illustrated you.</p></div>
<ul class="why-grid">
<li class="why-feature"><strong>Followers who show up, not just scroll.</strong><span>Your community does your quests, posts about it and tags you. Every post puts you in front of their friends, and that’s how your audience grows.</span></li>
<li><strong>Content to repost, all week.</strong><span>Their posts become yours to share. Real people out doing the things you love, with no filming on your end.</span></li>
<li><strong>Your next videos, already planned.</strong><span>Every quest is a ready-made video idea. Do one yourself and invite your community to join you.</span></li>
<li><strong>A gift for your community.</strong><span>Give the people who follow you something good to do this weekend, not another link to buy something.</span></li>
</ul>
<div class="share-strip" aria-labelledby="share-strip-heading"><h3 id="share-strip-heading">Decide how to share your pack.</h3><div class="share-options">
<article class="share-option"><div class="share-art"><svg viewBox="30 14 166 120" aria-hidden="true" focusable="false"><ellipse cx="115" cy="126" rx="71" ry="9" fill="#d1b7ed" opacity=".4"/><rect x="60" y="28" width="110" height="94" rx="14" fill="#fff" transform="rotate(9 115 75)"/><rect x="56" y="22" width="110" height="94" rx="14" fill="#7040f5" transform="rotate(-8 110 70)"/><path d="M82 61h58v40H82zM78 51h66v16H78z" fill="#fff"/><path d="M111 51v50M111 51C88 51 86 32 98 35C107 37 111 51 111 51ZM111 51C134 51 136 32 124 35C115 37 111 51 111 51Z" fill="none" stroke="#d7c6ff" stroke-width="4"/><path d="M179 23v17M171 31h17M38 86v11M33 92h11" stroke="#e7b638" stroke-width="4" stroke-linecap="round"/></svg></div><div><h4>Give it away for free</h4><p>Free for your community to enjoy.</p></div></article>
<article class="share-option"><div class="share-art"><svg viewBox="30 14 166 120" aria-hidden="true" focusable="false"><ellipse cx="115" cy="126" rx="71" ry="9" fill="#d1b7ed" opacity=".4"/><rect x="60" y="28" width="110" height="94" rx="14" fill="#fff" transform="rotate(9 115 75)"/><rect x="56" y="22" width="110" height="94" rx="14" fill="#7040f5" transform="rotate(-8 110 70)"/><path d="M111 91S85 76 85 60C85 45 102 42 111 54C120 42 137 45 137 60C137 76 111 91 111 91Z" fill="#fff"/><path d="M179 23v17M171 31h17M38 86v11M33 92h11" stroke="#e7b638" stroke-width="4" stroke-linecap="round"/></svg></div><div><h4>Raise funds for charity</h4><p>Price it at $4.99 or $9.99. All proceeds go to a charity.</p></div></article>
<article class="share-option"><div class="share-art"><svg viewBox="30 14 166 120" aria-hidden="true" focusable="false"><ellipse cx="115" cy="126" rx="71" ry="9" fill="#d1b7ed" opacity=".4"/><rect x="60" y="28" width="110" height="94" rx="14" fill="#fff" transform="rotate(9 115 75)"/><rect x="56" y="22" width="110" height="94" rx="14" fill="#7040f5" transform="rotate(-8 110 70)"/><circle cx="99" cy="63" r="19" fill="#d9c6ff"/><circle cx="121" cy="77" r="19" fill="#fff"/><path d="M116 77h10M121 72v10" stroke="#7040f5" stroke-width="3" stroke-linecap="round"/><path d="M179 23v17M171 31h17M38 86v11M33 92h11" stroke="#e7b638" stroke-width="4" stroke-linecap="round"/></svg></div><div><h4>50/50 rev share</h4><p>Sell your pack and split the revenue with SideQuest.</p></div></article>
</div></div>`;
document.querySelector('.intro').after(why);

// Keep upload guidance concise and the privacy link on its own line.
form.querySelector('label[for="photos"] span')?.remove();
form.querySelector('#photo-help').textContent = 'One to three clear photos help us get your illustrated character right.';
