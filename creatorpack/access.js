// The page is public. Only the server can authorize uploads and submissions.
const endpoint = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? '/__creator-intake'
  : 'https://qoxoutfmmmuzjneyvryi.supabase.co/functions/v1/creator-pack-intake';
const sessionKey = 'creator-pack-session';
async function accessRequest(payload, session = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session } : {}) }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } finally { clearTimeout(timer); }
}
export async function ensureCreatorAccess() {
  const existing = sessionStorage.getItem(sessionKey);
  if (existing) {
    const result = await accessRequest({ action: 'page' }, existing);
    if (result.ok) return true;
    if (result.status !== 401) throw new Error(result.data.error || 'We couldn’t verify access. Please try again.');
    sessionStorage.removeItem(sessionKey);
  }
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'creator-access-dialog';
    dialog.setAttribute('aria-labelledby', 'creator-access-title');
    dialog.innerHTML = `<form class="creator-access-form"><h2 id="creator-access-title">Send your ideas</h2><p>Enter your creator password to securely upload your recording and photos.</p><label for="creator-password">Password</label><input id="creator-password" type="password" autocomplete="current-password" required maxlength="160"><p class="creator-access-status" role="status" aria-live="polite"></p><div class="creator-access-actions"><button type="button" class="creator-access-cancel">Cancel</button><button class="button" type="submit">Continue ↗</button></div></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form');
    const input = dialog.querySelector('input');
    const message = dialog.querySelector('[role=status]');
    let closed = false;
    const finish = (approved) => { if (closed) return; closed = true; dialog.close(); dialog.remove(); resolve(approved); };
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
    dialog.querySelector('.creator-access-cancel').onclick = () => finish(false);
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const submit = form.querySelector('[type=submit]');
      submit.disabled = true;
      message.textContent = 'Checking password…';
      try {
        const result = await accessRequest({ action: 'login', password: input.value });
        if (closed) return;
        if (!result.ok || typeof result.data.session !== 'string') throw new Error(result.data.error || 'We couldn’t verify access. Please try again.');
        sessionStorage.setItem(sessionKey, result.data.session);
        input.value = '';
        finish(true);
      } catch (error) {
        if (!closed) { message.textContent = error.name === 'AbortError' ? 'The connection timed out. Please try again.' : error.message; input.focus(); }
      } finally { submit.disabled = false; }
    };
    dialog.showModal();
    input.focus();
  });
}
