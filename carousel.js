(() => {
  document.querySelectorAll('a[href^="/#"]').forEach(link => link.addEventListener('click', event => {
    if (location.pathname !== '/') return;
    const target = document.querySelector(link.hash);
    if (!target) return;
    event.preventDefault();
    history.pushState(null, '', link.hash);
    target.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }));
  const carousel = document.querySelector('.carousel');
  if (!carousel) return;
  const stage = carousel.querySelector('.pack-stage');
  const cards = [...carousel.querySelectorAll('.pack-card')];
  const dots = [...carousel.querySelectorAll('.pack-dot')];
  const count = cards.length;
  const accents = ['#9767ff','#f27aa1','#63b499','#dd9166','#efb067','#7976e9','#58a9d4','#b894fa','#6cabbb','#d6a361','#90b66e'];
  let current = 0;
  let drag = null;
  let suppressClick = false;
  let frame = 0;
  const mod = n => ((n % count) + count) % count;
  const stepSize = () => parseFloat(getComputedStyle(carousel).getPropertyValue('--step'));
  function render(position = current, immediate = false) {
    cards.forEach((card, index) => {
      let distance = mod(index - position + count / 2) - count / 2;
      let d = Math.abs(distance);
      const visible = d < 3.1;
      const scale = Math.max(.68, 1 - d * .105);
      card.style.transition = immediate ? 'none' : '';
      card.style.transform = `translateX(calc(-50% + ${distance * stepSize()}px)) translateY(${Math.min(d,3)*16}px) rotateY(${-Math.max(-2,Math.min(2,distance))*15}deg) scale(${scale})`;
      card.style.opacity = visible ? Math.max(.28,1-d*.23) : 0;
      card.style.filter = `brightness(${Math.max(.53,1-d*.14)})`;
      card.style.zIndex = String(100-Math.round(d*10));
      card.style.pointerEvents = visible ? 'auto' : 'none';
      card.setAttribute('aria-pressed',String(index === mod(current)));
      card.setAttribute('aria-hidden',String(!visible));
      card.tabIndex = index===mod(current) ? 0 : -1;
    });
    dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===mod(current))));
    carousel.style.setProperty('--accent',accents[mod(current)]);
    document.querySelector('#pack-count').textContent=String(mod(current)+1).padStart(2,'0');
  }
  function select(index, announce = true) {
    const packFocused = document.activeElement?.classList.contains('pack-card');
    current = mod(index);
    render();
    if (packFocused) cards[current].focus({preventScroll:true});
    if (announce) document.querySelector('#pack-announcement').textContent = `${cards[current].getAttribute('aria-label')}, ${current+1} of ${count}`;
  }
  carousel.querySelector('.previous').addEventListener('click',()=>select(current-1));
  carousel.querySelector('.next').addEventListener('click',()=>select(current+1));
  dots.forEach((dot,i)=>dot.addEventListener('click',()=>select(i)));
  cards.forEach((card,i)=>card.addEventListener('click',()=>{if(!suppressClick) select(i)}));
  carousel.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    select(event.key==='Home'?0:event.key==='End'?count-1:current+(event.key==='ArrowRight'?1:-1));
  });
  stage.addEventListener('pointerdown',event=>{
    if (event.button !== 0) return;
    drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,dx:0,origin:current,horizontal:false,time:performance.now()};
    suppressClick=false;
  });
  stage.addEventListener('pointermove',event=>{
    if (!drag || drag.id!==event.pointerId) return;
    const dx=event.clientX-drag.startX, dy=event.clientY-drag.startY;
    if(!drag.horizontal && Math.abs(dy)>Math.abs(dx) && Math.abs(dy)>8){drag=null;return;}
    if(Math.abs(dx)>7 && !drag.horizontal){drag.horizontal=true;stage.setPointerCapture(event.pointerId);stage.classList.add('dragging');}
    if(!drag.horizontal) return;
    drag.dx=dx;
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{if(drag)render(drag.origin-drag.dx/stepSize(),true)});
  });
  function endDrag(event,cancelled=false){
    if(!drag || drag.id!==event.pointerId)return;
    cancelAnimationFrame(frame);
    const saved=drag;
    drag=null;
    stage.classList.remove('dragging');
    if(saved.horizontal){
      suppressClick=true;
      const delta=saved.dx/stepSize();
      const fast=Math.abs(saved.dx)>18 && performance.now()-saved.time<250;
      const shift=cancelled?0:Math.abs(delta)>.18||fast?Math.sign(delta)*Math.max(1,Math.round(Math.abs(delta))):0;
      select(saved.origin-shift);
      setTimeout(()=>{suppressClick=false},0);
    }
  }
  stage.addEventListener('pointerup',event=>endDrag(event));
  stage.addEventListener('pointercancel',event=>endDrag(event,true));
  stage.addEventListener('lostpointercapture',event=>endDrag(event,true));
  let wheelAmount=0, wheelTimer, lastWheel=0;
  stage.addEventListener('wheel',event=>{
    if(Math.abs(event.deltaX)<=Math.abs(event.deltaY))return;
    event.preventDefault();
    if(performance.now()-lastWheel<450)return;
    wheelAmount+=event.deltaX;
    clearTimeout(wheelTimer);
    wheelTimer=setTimeout(()=>{wheelAmount=0},130);
    if(Math.abs(wheelAmount)>45){select(current+Math.sign(wheelAmount));lastWheel=performance.now();wheelAmount=0}
  },{passive:false});
  new ResizeObserver(()=>render(current,true)).observe(stage);
  render(current,true);
})();
