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
