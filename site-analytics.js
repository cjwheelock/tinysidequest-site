/* Public-page measurement only. No SDK, cookies, storage, replay, or form capture. */
(() => {
  'use strict';
  if (location.hostname !== 'tinysidequest.com' || location.protocol !== 'https:') return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  if (!crypto.randomUUID) return;

  // Canonical markup supplies a public page path; never send the visited query/hash.
  const canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) return;
  let page;
  try { page = new URL(canonical.href); } catch { return; }
  const publicPath = /^(?:\/$|\/blog\/(?:[a-z0-9-]+\/)?$|\/(?:support|privacy|terms|contact)\/$)/;
  const actualPath = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
  if (page.origin !== 'https://tinysidequest.com' || !publicPath.test(page.pathname) || actualPath !== page.pathname) return;

  const referralSource = () => {
    if (!document.referrer) return 'direct_or_unknown';
    let host;
    try { host = new URL(document.referrer).hostname.toLowerCase(); } catch { return 'other'; }
    const matches = domain => host === domain || host.endsWith('.' + domain);
    if (matches('tinysidequest.com') || matches('ohsidequest.com')) return 'internal';
    if (matches('google.com') || /^www\.google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host)) return 'google';
    if (matches('bing.com')) return 'bing';
    if (matches('chatgpt.com') || host === 'chat.openai.com') return 'chatgpt';
    if (matches('perplexity.ai')) return 'perplexity';
    if (matches('claude.ai')) return 'claude';
    if (matches('duckduckgo.com')) return 'duckduckgo';
    return 'other';
  };
  const pageId = 'web-page-' + crypto.randomUUID();
  const common = {
    site_host: 'tinysidequest.com', page_path: page.pathname,
    referral_source: referralSource(), surface: 'marketing_website', schema_version: 1,
    $process_person_profile: false, $geoip_disable: true, $ip: '0.0.0.0',
  };
  let config;
  const pendingClicks = [];
  const send = (event, properties = {}) => {
    if (!config) return;
    const body = JSON.stringify({api_key: config.projectToken, event, distinct_id: pageId, properties: {...common, ...properties}});
    // text/plain is a CORS-safelisted content type; keepalive preserves ordinary
    // link navigation without waiting for an analytics response.
    fetch(config.apiHost + '/i/v0/e/', {
      method: 'POST', headers: {'Content-Type': 'text/plain'}, body,
      credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
    }).catch(() => {});
  };
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    let target;
    try { target = new URL(link.href); } catch { return; }
    if (target.protocol !== 'https:' || target.hostname !== 'apps.apple.com' || !/\/id6781441096$/.test(target.pathname)) return;
    const placement = link.closest('.hero') ? 'hero' : link.closest('.closing') ? 'closing' : link.closest('.product-faq') ? 'product_answers' : 'other';
    const properties = {store: 'apple_app_store', placement};
    if (config) send('website_store_link_clicked', properties);
    else if (pendingClicks.length < 5) pendingClicks.push(properties);
  });
  fetch('/analytics-config.json', {credentials: 'omit'}).then(response => {
    if (!response.ok) throw new Error('Analytics unavailable');
    return response.json();
  }).then(value => {
    // Only public ingestion hosts; never accept arbitrary configuration targets.
    if (!/^phc_[A-Za-z0-9]+$/.test(value.projectToken) || !['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(value.apiHost)) return;
    config = value;
    send('website_page_viewed');
    pendingClicks.splice(0).forEach(properties => send('website_store_link_clicked', properties));
  }).catch(() => {});
})();
