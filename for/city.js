(() => {
  const CDN = 'https://qoxoutfmmmuzjneyvryi.supabase.co/storage/v1/object/public/sidequest-city-previews/';
  const FEATURED = ['chicago', 'new-york', 'boston', 'miami', 'new-orleans', 'san-francisco', 'paris', 'london', 'rome', 'tokyo'];
  const cfg = JSON.parse(document.querySelector('#page-config').textContent);
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const normal = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = $('.stage'), input = $('#city-search'), results = $('#search-results'), clear = $('.clear-search');
  const track = $('.phone-track'), tabs = $$('.phone-tab'), status = $('#city-announcement');
  let index = [], order = [], current = 0, revision = 0, drag = null, suppressClick = false, phoneScreen = 0;
  const cache = new Map();
  const cityInfo = id => index.find(c => c[0] === id);
  const portrait = info => CDN + 'v1/' + info[4];
  const full = h => CDN + 'creator-previews/v1/' + h + '-960.jpg';
  const thumb = h => CDN + 'v1/' + h + '-240-q60.jpg';
  const load = id => { if (!cache.has(id)) cache.set(id, fetch(`../cities/${id}.json`).then(r => { if (!r.ok) throw Error(); return r.json(); }).catch(e => { cache.delete(id); throw e; })); return cache.get(id); };
  const mod = n => (n % order.length + order.length) % order.length;

  // Quest art: full-size preview art when published, the public 240px preview until then.
  function art(img, h) { img.onerror = () => { img.onerror = null; img.src = thumb(h); }; img.src = full(h); }

  function buildCards() {
    $('.side-cards').innerHTML = order.map(id => { const c = cityInfo(id); return `<button class="city-card" data-city="${c[0]}" aria-label="Explore ${esc(c[1])}" aria-pressed="false"><span class="card-art"><img src="${portrait(c)}" alt="" draggable="false" loading="lazy"></span><span class="card-label"><span><strong>${esc(c[1])}</strong><small>${esc(c[2])}</small></span><span class="card-arrow" aria-hidden="true">↓</span></span></button>`; }).join('');
    $$('.city-card').forEach((card, i) => card.addEventListener('click', () => { if (!suppressClick && i !== current) select(i); }));
    $('#city-total').textContent = String(order.length);
  }
  function render(instant = false) {
    const cs = getComputedStyle(stage), first = parseFloat(cs.getPropertyValue('--first')), step = parseFloat(cs.getPropertyValue('--step'));
    $$('.city-card').forEach((card, i) => {
      const distance = mod(i - current + order.length / 2) - order.length / 2, d = Math.abs(distance), visible = d >= 1 && d < 2.65;
      // The phone is the centre card; neighbours fan out on either side of it.
      const x = d === 0 ? 0 : Math.sign(distance) * (first + (d - 1) * step);
      card.style.transition = instant ? 'none' : '';
      card.style.transform = `translateX(calc(-50% + ${x}px)) translateY(${d * 12}px) rotateY(${-Math.sign(distance) * 14}deg) scale(${1 - Math.min(d, 3) * .09})`;
      card.style.opacity = visible ? Math.max(.5, 1.12 - d * .25) : 0;
      card.style.zIndex = String(100 - Math.round(d * 10));
      card.style.pointerEvents = visible ? 'auto' : 'none';
      card.setAttribute('aria-hidden', String(!visible));
      card.setAttribute('aria-pressed', String(i === current));
      card.tabIndex = i === current ? 0 : -1;
    });
    $('#city-position').textContent = String(current + 1);
  }

  function pickPack(city) {
    const want = cfg.pack === 'local' ? 'Local' : 'Citywide';
    return city.packs.find(p => p.role === want) || city.packs[0];
  }
  function fill(city) {
    const pack = pickPack(city), q = pack.q.slice(0, 3);
    $$('[data-city-name]').forEach(n => n.textContent = city.name);
    $('#phone-cover').src = city.portrait;
    $('#phone-cover').alt = `${city.name} City Edition illustrated cover`;
    $('#phone-pack-title').textContent = city.name;
    $('#phone-pack-promise').textContent = pack.promise;
    $$('.phone-quest-row').forEach((row, i) => { row.querySelector('strong').textContent = q[i].t; row.querySelector('strong + span').textContent = q[i].d; });
    $$('.phone-quest-screen').forEach((s, i) => {
      s.setAttribute('aria-label', q[i].t);
      art(s.querySelector('img'), q[i].h); s.querySelector('img').alt = `${q[i].t} illustration`;
      s.querySelector('h2').textContent = q[i].t;
      s.querySelector('.phone-subtitle').textContent = q[i].s;
      s.querySelector('.phone-steps').innerHTML = q[i].st.map(x => `<li>${esc(x)}</li>`).join('');
      s.scrollTop = 0;
    });
    go(0);
    $$('.quest-pick').forEach((b, i) => { art(b.querySelector('img'), q[i].h); b.querySelector('strong').textContent = q[i].t; b.querySelector('.qp-sub').textContent = q[i].s; b.querySelector('.qp-dur').textContent = q[i].d; });
    $$('.why-post').forEach((p, i) => {
      art(p.querySelector('img'), q[i].h);
      p.querySelector('figcaption').innerHTML = cfg.posts[i].replace('{q}', `<b>${esc(q[i].t)}</b>`).replaceAll('{city}', esc(city.name));
    });
    const params = new URLSearchParams(location.search); params.set('city', city.id);
    history.replaceState(null, '', location.pathname + '?' + params + location.hash);
    status.textContent = `${city.name} selected.`;
  }
  async function select(i, center = true) {
    current = mod(i); render();
    const token = ++revision, id = order[current];
    try { const city = await load(id); if (token === revision) fill(city); }
    catch { if (token === revision) status.textContent = 'Could not load this city. Try again.'; }
    // Warm the neighbours so swiping feels instant.
    [current - 1, current + 1].forEach(n => load(order[mod(n)]).catch(() => {}));
  }
  function choose(id) {
    if (!order.includes(id)) { order.splice(mod(current) + 1, 0, id); buildCards(); render(true); select(current + 1); }
    else select(order.indexOf(id));
    closeSearch(); input.value = ''; clear.hidden = true;
  }

  // Search
  function closeSearch() { results.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  input.addEventListener('input', () => {
    const term = normal(input.value); clear.hidden = !term;
    if (!term) return closeSearch();
    const hits = index.filter(c => normal(c[1]).startsWith(term)).concat(index.filter(c => !normal(c[1]).startsWith(term) && normal(c[1] + ' ' + c[2] + ' ' + c[3]).includes(term))).slice(0, 8);
    results.innerHTML = hits.length ? hits.map(c => `<li><button type="button" data-id="${c[0]}">${esc(c[1])}<span>${esc(c[2])}</span></button></li>`).join('') : `<li class="no-results">No City Edition there yet. We can make one together.</li>`;
    results.querySelectorAll('button').forEach(b => b.addEventListener('click', () => choose(b.dataset.id)));
    results.hidden = false; input.setAttribute('aria-expanded', 'true');
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = results.querySelector('button'); if (b) { e.preventDefault(); b.click(); } } if (e.key === 'Escape') closeSearch(); });
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; closeSearch(); input.focus(); });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) closeSearch(); });

  // Carousel controls and dragging
  $('.previous').addEventListener('click', () => select(current - 1));
  $('.next').addEventListener('click', () => select(current + 1));
  stage.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select(current + (e.key === 'ArrowRight' ? 1 : -1)); } });
  stage.addEventListener('pointerdown', e => { if (!e.target.closest('.phone-preview')) drag = { x: e.clientX }; });
  addEventListener('pointerup', e => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 40) { suppressClick = true; select(current + (dx < 0 ? 1 : -1)); setTimeout(() => suppressClick = false, 0); } drag = null; });
  addEventListener('resize', () => render(true));

  // Phone screens
  function go(n) { n = Math.max(0, Math.min(3, n)); track.scrollTo({ left: n * track.clientWidth, behavior: reduced ? 'instant' : 'smooth' }); }
  function updatePhone(n) { phoneScreen = n; tabs.forEach((b, i) => b.setAttribute('aria-pressed', String(i === n))); $('#previous').disabled = n === 0; $('#next').disabled = n === 3; $$('.quest-pick').forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === n))); }
  $('#previous').onclick = () => go(phoneScreen - 1); $('#next').onclick = () => go(phoneScreen + 1);
  $$('[data-screen]').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.screen))));
  track.addEventListener('scroll', () => updatePhone(Math.round(track.scrollLeft / track.clientWidth)), { passive: true });
  new ResizeObserver(() => track.scrollTo({ left: phoneScreen * track.clientWidth, behavior: 'instant' })).observe(track);
  updatePhone(0);

  fetch('../cities/index.json').then(r => r.json()).then(data => {
    index = data;
    const want = new URLSearchParams(location.search).get('city');
    const start = want && cityInfo(normal(want).replace(/\s+/g, '-')) ? normal(want).replace(/\s+/g, '-') : cfg.defaultCity;
    order = FEATURED.filter(id => cityInfo(id));
    if (!order.includes(start)) order.unshift(start);
    buildCards(); current = order.indexOf(start); render(true); select(current);
  });
})();
