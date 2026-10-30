(() => {
  const cities = JSON.parse(document.querySelector('#city-data').textContent);
  const stage = document.querySelector('.stage');
  const cards = [...document.querySelectorAll('.city-card')];
  const input = document.querySelector('#city-search');
  const results = document.querySelector('#search-results');
  const clear = document.querySelector('.clear-search');
  const content = document.querySelector('#city-content');
  const status = document.querySelector('#city-announcement');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = 0, requested = 0, revision = 0, drag = null, suppressClick = false;
  const mod = n => (n % cities.length + cities.length) % cities.length;
  const normal = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const loading = new Map();
  function ready(src) {
    if (!loading.has(src)) {
      const image = new Image();
      image.src = src;
      const promise = image.decode().catch(error => { loading.delete(src); throw error; });
      loading.set(src, promise);
    }
    return loading.get(src);
  }
  function render(position = current, instant = false) {
    const step = parseFloat(getComputedStyle(stage).getPropertyValue('--step'));
    cards.forEach((card, index) => {
      const distance = mod(index - position + cities.length / 2) - cities.length / 2;
      const d = Math.abs(distance), visible = d < 2.65;
      card.style.transition = instant ? 'none' : '';
      card.style.transform = `translateX(calc(-50% + ${distance * step}px)) translateY(${d * 9}px) rotateY(${-distance * 12}deg) scale(${1 - Math.min(d, 3) * .10})`;
      card.style.opacity = visible ? Math.max(.42, 1 - d * .18) : 0;
      card.style.zIndex = String(100 - Math.round(d * 10));
      card.style.pointerEvents = visible ? 'auto' : 'none';
      card.setAttribute('aria-hidden', String(!visible));
      card.setAttribute('aria-pressed', String(index === current));
      card.tabIndex = index === current ? 0 : -1;
    });
  }
  function updateDetails(city) {
    content.querySelector('h2').textContent = city.name;
    content.querySelectorAll('.pack-row').forEach((row, i) => {
      const pack = city.packs[i], img = row.querySelector('img');
      img.src = pack.image; img.alt = pack.alt;
      row.querySelector('.tag').textContent = pack.role;
      row.querySelector('.count').textContent = `${pack.questCount} quests`;
      row.querySelector('h3').textContent = pack.title;
      row.querySelector('.pack-copy > p').textContent = pack.description;
      row.querySelector('.area').textContent = pack.area;
    });
  }
  async function select(index, scroll = false, updateUrl = true) {
    requested = mod(index);
    const selected = requested, token = ++revision, city = cities[selected];
    try { await Promise.all([ready(city.cover.image), ...city.packs.map(p => ready(p.image))]); }
    catch { if (token === revision) status.textContent = 'Could not load this city. Try again.'; return; }
    if (token !== revision) return;
    const cardFocused = cards.includes(document.activeElement);
    current = selected;
    // All incoming images are decoded. Update existing nodes together; the shell stays mounted.
    updateDetails(city); render();
    document.querySelector('#city-position').textContent = String(current + 1);
    status.textContent = `${city.name} selected. Citywide and local packs shown below.`;
    if (updateUrl) history.replaceState(null, '', '#city=' + city.id);
    if (cardFocused) cards[current].focus({preventScroll:true});
    if (scroll) document.querySelector('#city-details').scrollIntoView({behavior:reduced ? 'instant' : 'smooth',block:'start'});
  }
  document.querySelector('.previous').addEventListener('click', () => select(requested - 1));
  document.querySelector('.next').addEventListener('click', () => select(requested + 1));
  cards.forEach((card, i) => card.addEventListener('click', () => { if (!suppressClick) select(i, i === current); }));
  stage.addEventListener('keydown', e => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault(); select(e.key === 'Home' ? 0 : e.key === 'End' ? cities.length - 1 : requested + (e.key === 'ArrowRight' ? 1 : -1));
  });
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = {id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,active:false,origin:current};
    suppressClick = false;
  });
  stage.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.active && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { drag = null; return; }
    if (Math.abs(dx) > 8 && !drag.active) { drag.active = true; stage.setPointerCapture(e.pointerId); }
    if (!drag.active) return;
    drag.dx = dx;
    render(drag.origin - dx / parseFloat(getComputedStyle(stage).getPropertyValue('--step')), true);
  });
  function endDrag(e, cancel = false) {
    if (!drag || e.pointerId !== drag.id) return;
    const old = drag; drag = null;
    if (old.active) {
      suppressClick = true;
      const step = parseFloat(getComputedStyle(stage).getPropertyValue('--step'));
      const delta = cancel || Math.abs(old.dx) < 28 ? 0 : Math.sign(old.dx) * Math.max(1, Math.round(Math.abs(old.dx) / step));
      select(old.origin - delta);
      setTimeout(() => { suppressClick = false; }, 0);
    }
  }
  stage.addEventListener('pointerup', e => endDrag(e));
  stage.addEventListener('pointercancel', e => endDrag(e, true));
  stage.addEventListener('lostpointercapture', e => endDrag(e, true));
  let wheel = 0, wheelAt = 0;
  stage.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault(); if (performance.now() - wheelAt < 400) return;
    wheel += e.deltaX;
    if (Math.abs(wheel) > 40) { select(requested + Math.sign(wheel)); wheel = 0; wheelAt = performance.now(); }
  }, {passive:false});
  function matches() { const q = normal(input.value); return cities.filter(c => normal([c.name,c.region,...c.aliases].join(' ')).includes(q)); }
  function closeSearch() { results.hidden = true; input.setAttribute('aria-expanded','false'); }
  function choose(city) { input.value = city.name; clear.hidden = false; closeSearch(); input.focus({preventScroll:true}); select(cities.indexOf(city), true); }
  function search() {
    const list = matches(); results.replaceChildren(); clear.hidden = !input.value;
    list.forEach(city => {
      const li = document.createElement('li'), button = document.createElement('button'), place = document.createElement('span');
      button.type = 'button'; button.textContent = city.name; place.textContent = city.region; button.append(place); button.addEventListener('click', () => choose(city)); li.append(button); results.append(li);
    });
    if (!list.length) { const li = document.createElement('li'); li.className = 'no-results'; li.textContent = 'No matching cities. Try another name.'; results.append(li); }
    results.hidden = false; input.setAttribute('aria-expanded','true');
  }
  input.addEventListener('input', search); input.addEventListener('focus', search);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSearch();
    if (e.key === 'ArrowDown') { e.preventDefault(); if (results.hidden) search(); results.querySelector('button')?.focus(); }
    if (e.key === 'Enter' && matches().length) { e.preventDefault(); choose(matches()[0]); }
  });
  results.addEventListener('keydown', e => {
    const buttons = [...results.querySelectorAll('button')], i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { input.focus(); closeSearch(); }
    if (['ArrowDown','ArrowUp'].includes(e.key)) { e.preventDefault(); buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
  });
  clear.addEventListener('click', () => { input.value = ''; input.focus(); search(); });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) closeSearch(); });
  document.querySelector('.search').addEventListener('focusout', e => { if (!e.currentTarget.contains(e.relatedTarget)) closeSearch(); });
  function fromHash() { const id = new URLSearchParams(location.hash.slice(1)).get('city'), index = cities.findIndex(c => c.id === id); if (index >= 0) select(index, false, false); }
  window.addEventListener('hashchange', fromHash);
  new ResizeObserver(() => render(current, true)).observe(stage);
  cities.forEach(c => { ready(c.cover.image).catch(() => {}); c.packs.forEach(p => { ready(p.image).catch(() => {}); }); });
  render(current, true); fromHash();
})();
