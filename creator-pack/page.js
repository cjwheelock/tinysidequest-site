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
for (const kind of ['photos', 'audio']) $(kind).addEventListener('change', () => showFiles(kind));
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
  if (!form.reportValidity()) return;
  try {
    const photos = [...$('photos').files];
    if (photos.length < 1 || photos.length > 3) throw new Error('Choose between one and three photos.');
    const audio = $('audio').files[0];
    if (!audio) throw new Error('Choose a voice recording.');
    const files = [...photos, audio];
    const descriptors = files.map((file, i) => describe(file, i < photos.length ? 'photo' : 'audio'));
    pending ||= { id: crypto.randomUUID(), token: crypto.randomUUID() };
    busy = true;
    for (const element of form.elements) element.disabled = true;
    progress.hidden = false;
    progress.value = 0;
    report('Preparing your upload…');
    const prepared = await request({ action: 'prepare', ...pending, name: $('name').value.trim(), email: $('email').value.trim(), files: descriptors, consent: $('consent').checked, website: $('website').value });
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
    form.querySelector('.form-heading p').textContent = 'Thanks for sharing a little of your world.';
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

const dialog = $('quest-dialog');
const quests = fetch('./quests.json').then((r) => { if (!r.ok) throw new Error('Quest unavailable'); return r.json(); });
let questSelection = 0;
document.querySelectorAll('[data-quest]').forEach((card) => card.addEventListener('click', async () => {
  const selection = ++questSelection;
  card.setAttribute('aria-busy', 'true');
  try {
    const quest = (await quests)[Number(card.dataset.quest)];
    const preload = new Image(); preload.src = `./assets/${quest.image}.jpg`; await preload.decode();
    if (selection !== questSelection) return;
    $('quest-image').src = preload.src;
    $('quest-image').alt = card.querySelector('img').alt;
    $('quest-title').textContent = quest.title;
    $('quest-duration').textContent = quest.duration;
    $('quest-subtitle').textContent = quest.subtitle;
    $('quest-safety').textContent = quest.safety;
    $('quest-steps').replaceChildren(...quest.steps.map((step) => { const li = document.createElement('li'); li.textContent = step; return li; }));
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  } catch { card.querySelector('.quest-link').textContent = 'Couldn’t load the quest. Tap to retry.'; }
  finally { card.removeAttribute('aria-busy'); }
}));
dialog.querySelector('button').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
