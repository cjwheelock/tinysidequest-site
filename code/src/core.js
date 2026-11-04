// No campaign codes, organization inventory or quest content belongs in this module.
export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 8;

export class GateError extends Error {
  constructor(kind, message) { super(message); this.name = 'GateError'; this.kind = kind; }
}

export const messages = Object.freeze({
  invalid: 'That SideQuest code isn’t valid. Check it and try again.',
  malformed: 'Check the code in your link, or enter your code below.',
  inactive: 'Sorry, this code is no longer active.',
  exhausted: 'Sorry, all redemptions for this code have been used.',
  rate_limited: 'Try again in a minute.',
  unavailable: 'SideQuest could not confirm your code. Check your connection and try again.',
  expired: 'Your session has expired. Enter your code to continue.',
  missing: 'This preview is not available yet. Please try again later.',
  preview: 'The preview could not load. Please try again.',
});

export function normalizeCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_CODE_LENGTH);
}

export function isCompleteCode(value) { return /^[A-Z0-9]{6,8}$/.test(value); }

export function codeFromSearch(search) {
  const values = new URLSearchParams(search).getAll('code');
  if (!values.length) return { explicit: false, invalid: false, code: '' };
  const code = values.length === 1 ? values[0].trim().toUpperCase() : '';
  return isCompleteCode(code)
    ? { explicit: true, invalid: false, code }
    : { explicit: true, invalid: true, code: '' };
}

const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 160;

// The only pack selection input is the authenticated server response, never query/local storage.
export function selectEnterprisePack(value) {
  const kind = value?.enterprise_intro_kind;
  const packs = value?.edition_packs;
  if (!['city', 'campus'].includes(kind) || !Array.isArray(packs)
    || packs.length !== (kind === 'city' ? 2 : 1)
    || packs.some(pack => !plainObject(pack) || !id(pack.id) || pack.kind !== kind
      || typeof pack.cityId !== 'string' || !pack.cityId)
    || new Set(packs.map(pack => pack.id)).size !== packs.length
    || packs.some(pack => pack.cityId !== packs[0].cityId)) {
    throw new GateError('unavailable', messages.unavailable);
  }
  if (kind === 'city') {
    if (!packs.some(pack => pack.editionScope === 'citywide') || !packs.some(pack => pack.editionScope === 'neighborhood'))
      throw new GateError('unavailable', messages.unavailable);
    return { packId: packs.find(pack => pack.editionScope === 'neighborhood').id, kind };
  }
  if (packs[0].editionScope && packs[0].editionScope !== 'campus') throw new GateError('unavailable', messages.unavailable);
  return { packId: packs[0].id, kind };
}

export function parseRedeemedAccess(value) {
  if (value?.status === 'rate_limited') throw new GateError('rate_limited', messages.rate_limited);
  if (value?.status === 'invalid') {
    const kind = ['inactive', 'exhausted'].includes(value.reason) ? value.reason : 'invalid';
    throw new GateError(kind, messages[kind]);
  }
  if (!['granted', 'already_redeemed'].includes(value?.status)) throw new GateError('invalid', messages.invalid);
  return selectEnterprisePack(value);
}

export function safeAssetPath(value) {
  if (typeof value !== 'string' || value.length > 200) return null;
  const path = value.replace(/^\.\//, '');
  if (!/^assets\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:png|jpe?g|webp)$/i.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return path;
}

export function checkedConfig(value) {
  if (!plainObject(value) || typeof value.supabaseUrl !== 'string' || typeof value.publishableKey !== 'string'
    || !isPublishableKey(value.publishableKey)
    || typeof value.assetBucket !== 'string' || !/^[a-z0-9][a-z0-9-]{2,80}$/.test(value.assetBucket)) return null;
  let url;
  try { url = new URL(value.supabaseUrl); } catch { return null; }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
    || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') return null;
  return { supabaseUrl: url.origin, publishableKey: value.publishableKey, assetBucket: value.assetBucket };
}

export function isPublishableKey(value) {
  if (typeof value !== 'string' || value.length > 4096) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(value)) return true;
  const pieces = value.split('.');
  if (pieces.length !== 3 || !pieces.every(piece => /^[A-Za-z0-9_-]+$/.test(piece))) return false;
  try { return JSON.parse(atob(pieces[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; }
  catch { return false; }
}

export function checkedPreview(value, config, now = Date.now()) {
  if (!plainObject(value) || typeof value.html !== 'string' || !value.html || value.html.length > 160000
    || typeof value.css !== 'string' || !value.css || value.css.length > 100000
    || /<|@import\b|url\s*\(|expression\s*\(|@font-face\b/i.test(value.css)
    || !plainObject(value.assets) || typeof value.expiresAt !== 'string') {
    throw new GateError('preview', messages.preview);
  }
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 3600000) throw new GateError('expired', messages.expired);
  const keys = Object.keys(value.assets);
  if (!keys.length || keys.length > 32) throw new GateError('preview', messages.preview);
  const assets = Object.create(null);
  for (const key of keys) {
    const normalized = safeAssetPath(key);
    let url;
    try { url = new URL(value.assets[key]); } catch { throw new GateError('preview', messages.preview); }
    if (!normalized || Object.hasOwn(assets, normalized) || url.origin !== config.supabaseUrl
      || url.protocol !== 'https:' || url.username || url.password || url.hash
      || !url.pathname.startsWith(`/storage/v1/object/sign/${config.assetBucket}/`)
      || !url.searchParams.get('token')) throw new GateError('preview', messages.preview);
    assets[normalized] = url.href;
  }
  return { html: value.html, css: value.css, assets, expiresAt: value.expiresAt };
}

export class GateController {
  constructor({ api, view, render }) { this.api = api; this.view = view; this.render = render; this.pending = false; this.current = null; }
  async start(search) {
    const initial = codeFromSearch(search);
    // A valid link opens its page directly. Automated browsers wait for Continue so
    // link scanners cannot use up a code's redemptions.
    if (initial.explicit && !initial.invalid && !this.view.automated?.()) {
      this.view.opening?.();
      await this.run(async () => this.load(await this.api.redeem(initial.code)), 'Opening…');
      return;
    }
    this.view.entry(initial.code, initial.invalid ? messages.malformed : '');
    if (initial.explicit) return;
    await this.run(async () => {
      const access = await this.api.resume();
      if (access) await this.load(access);
    }, 'Checking access…');
  }
  async submit(value) {
    const code = normalizeCode(value);
    if (!isCompleteCode(code)) { this.view.error(messages.invalid); return; }
    await this.run(async () => this.load(await this.api.redeem(code)), 'Checking code…');
  }
  async load(access) {
    const payload = await this.api.preview(access.packId);
    const source = this.render(payload);
    await this.view.stage(source, payload.assets); // Keep existing content until images/frame are ready.
    this.current = access;
    this.view.loaded();
  }
  async run(action, label) {
    if (this.pending) return;
    this.pending = true; this.view.busy(true, label);
    try { await action(); }
    catch (failure) { this.view.error(failure instanceof GateError ? failure.message : messages.unavailable); }
    finally { this.pending = false; this.view.busy(false); }
  }
}
