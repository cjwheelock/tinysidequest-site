import { GateError, messages, safeAssetPath } from './core.js';

const allowedTags = new Set(['A', 'HEADER', 'NAV', 'MAIN', 'SECTION', 'DIV', 'SPAN', 'P', 'H1', 'H2', 'H3', 'FIGURE', 'IMG', 'FIGCAPTION', 'ARTICLE', 'FOOTER', 'UL', 'LI', 'BR', 'STRONG', 'EM']);
const safeAttributes = new Set(['class', 'id', 'role', 'aria-label', 'aria-labelledby', 'aria-hidden', 'tabindex', 'data-quest-id', 'alt', 'width', 'height', 'loading', 'decoding', 'fetchpriority', 'sizes']);
const destinations = new Set(['https://tinysidequest.com/', 'https://tinysidequest.com/contact/', 'https://tinysidequest.com/privacy/', 'https://apps.apple.com/us/app/sidequest-tiny-adventures/id6781441096']);
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// Template contents are inert; no source resources are inserted into the live document.
export function previewDocument(preview, config, document = window.document) {
  const template = document.createElement('template');
  template.innerHTML = preview.html;
  const title = template.content.querySelector('title')?.textContent?.trim() || 'SideQuest';
  for (const node of template.content.querySelectorAll('meta, link, title, style')) node.remove();
  for (const element of template.content.querySelectorAll('*')) {
    if (!allowedTags.has(element.tagName)) throw new GateError('preview', messages.preview);
    for (const attribute of [...element.attributes]) {
      const key = attribute.name;
      if (key.startsWith('on') || key === 'style' || !safeAttributes.has(key) && !['href', 'src', 'srcset'].includes(key))
        throw new GateError('preview', messages.preview);
      if (key === 'href' && element.tagName !== 'A' || ['src', 'srcset'].includes(key) && element.tagName !== 'IMG')
        throw new GateError('preview', messages.preview);
    }
    if (element.tagName === 'A') {
      const href = element.getAttribute('href');
      if (!href || !/^#[A-Za-z][\w-]*$/.test(href) && !destinations.has(href)) throw new GateError('preview', messages.preview);
      if (!href.startsWith('#')) {
        element.setAttribute('target', '_top');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (element.tagName === 'IMG') {
      const source = safeAssetPath(element.getAttribute('src'));
      if (!source || !Object.hasOwn(preview.assets, source)) throw new GateError('preview', messages.preview);
      element.setAttribute('src', preview.assets[source]);
      const srcset = element.getAttribute('srcset');
      if (srcset) {
        const rewritten = srcset.split(',').map(candidate => {
          const pair = candidate.trim().match(/^(\S+)\s+([1-9]\d*w)$/);
          const path = pair && safeAssetPath(pair[1]);
          if (!path || !Object.hasOwn(preview.assets, path)) throw new GateError('preview', messages.preview);
          return `${preview.assets[path]} ${pair[2]}`;
        });
        element.setAttribute('srcset', rewritten.join(', '));
      }
      // Expiring signed images are loaded together, instead of relying on later lazy fetches.
      element.setAttribute('loading', 'eager');
      element.setAttribute('referrerpolicy', 'no-referrer');
    }
  }
  const csp = `default-src 'none'; img-src ${config.supabaseUrl}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-src 'none'; font-src 'none'`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${escape(csp)}"><title>${escape(title)}</title><style>${preview.css}</style></head><body>${template.innerHTML}</body></html>`;
}
