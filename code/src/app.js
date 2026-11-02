import { checkedConfig, GateController, GateError, messages } from './core.js';
import { createGateApi } from './client.js';
import { previewDocument } from './render.js?v=20261102-fragments';

const form = document.querySelector('#code-form');
const input = document.querySelector('#code');
const submit = document.querySelector('#continue');
const entry = document.querySelector('#entry');
const alert = document.querySelector('#error');
const status = document.querySelector('#status');
const viewer = document.querySelector('#viewer');
const toolbar = document.querySelector('#viewer-toolbar');
let activeFrame = null;

function preloadImages(assets) {
  return Promise.all(Object.values(assets).map(url => new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new GateError('preview', messages.preview)), 20000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new GateError('preview', messages.preview)); };
    image.referrerPolicy = 'no-referrer';
    image.src = url;
  })));
}

const view = {
  entry(code, message = '') {
    input.value = code;
    entry.hidden = false;
    entry.classList.toggle('overlay', Boolean(activeFrame));
    alert.textContent = message;
    input.focus();
  },
  error(message) {
    entry.hidden = false;
    entry.classList.toggle('overlay', Boolean(activeFrame));
    alert.textContent = message;
    input.focus();
  },
  busy(value, label = '') {
    input.disabled = value; submit.disabled = value;
    form.setAttribute('aria-busy', String(value));
    status.textContent = value ? label : '';
    submit.textContent = value ? 'Please wait…' : 'Continue';
  },
  async stage(source, assets) {
    await preloadImages(assets);
    const frame = document.createElement('iframe');
    frame.title = 'SideQuest preview';
    frame.className = 'preview-frame staging';
    frame.sandbox = 'allow-top-navigation-by-user-activation allow-popups';
    frame.referrerPolicy = 'no-referrer';
    frame.tabIndex = 0;
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new GateError('preview', messages.preview)), 15000);
      frame.onload = () => { clearTimeout(timer); resolve(); };
      frame.onerror = () => { clearTimeout(timer); reject(new GateError('preview', messages.preview)); };
    });
    frame.srcdoc = source;
    viewer.append(frame);
    try { await loaded; }
    catch (failure) { frame.remove(); throw failure; }
    // Switching is atomic after the full document and images have loaded.
    const previous = activeFrame;
    activeFrame = frame;
    frame.classList.remove('staging');
    previous?.remove();
  },
  loaded() {
    entry.hidden = true; toolbar.hidden = false;
    activeFrame?.focus();
    document.title = 'SideQuest';
  },
};

const config = checkedConfig(window.SIDEQUEST_TEASER_CONFIG);
if (!config || !window.supabase?.createClient) {
  view.error(messages.missing);
  submit.disabled = true;
} else {
  // Same SDK/default session storage key as the existing enterprise web client.
  const client = window.supabase.createClient(config.supabaseUrl, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
  });
  const controller = new GateController({ api: createGateApi(client, config), view,
    render: payload => previewDocument(payload, config) });
  form.addEventListener('submit', event => { event.preventDefault(); void controller.submit(input.value); });
  document.querySelector('#change-code').addEventListener('click', () => view.entry(''));
  void controller.start(window.location.search);
}
