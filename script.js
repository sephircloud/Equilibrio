(function(){
  const LS = { growth:'runner_growth_v2', last:'runner_last_v2', streak:'runner_streak_v2', bgImg:'runner_bgimg_v2', bgDim:'runner_bgdim_v2', bgBlur:'runner_bgblur_v2' };

  // Modal controls
  const openBtn = document.getElementById('openSettings');
  const closeBtn = document.getElementById('closeSettings');
  const modal = document.getElementById('settingsModal');
  openBtn.addEventListener('click', ()=> modal.classList.add('show'));
  closeBtn.addEventListener('click', ()=> modal.classList.remove('show'));
  modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('show'); });

  // DOM
  const startBtn=document.getElementById('startBtn'), stopBtn=document.getElementById('stopBtn'), resultText=document.getElementById('resultText');
  const bubble=document.getElementById('bubble'), phaseText=document.getElementById('phaseText'), timerText=document.getElementById('timerText'), phaseCountdown=document.getElementById('phaseCountdown');
  const meterFill=document.getElementById('meterFill'), runner=document.getElementById('runner'), runnerShadow=document.getElementById('runnerShadow'), ribbon=document.getElementById('ribbon');
  const bgImgEl=document.getElementById('bgImg');
  const bgFile=document.getElementById('bgFile'), bgThumb=document.getElementById('bgThumb'), bgDim=document.getElementById('bgDim'), bgBlur=document.getElementById('bgBlur');
  const applyBg=document.getElementById('applyBg'), resetBg=document.getElementById('resetBg');

  let growth = parseInt(localStorage.getItem(LS.growth)||'0',10);
  let last = localStorage.getItem(LS.last)||null;
  let streak = parseInt(localStorage.getItem(LS.streak)||'0',10);

  function isYesterday(d1,d2){const a=new Date(d1),b=new Date(d2);const d=(new Date(b.getFullYear(),b.getMonth(),b.getDate())-new Date(a.getFullYear(),a.getMonth(),a.getDate()))/(1000*60*60*24);return d===1;}
  function sameDay(d1,d2){const a=new Date(d1),b=new Date(d2);return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
  if(last){const now=new Date(); if(!sameDay(last,now)&&!isYesterday(last,now)) streak=0;}

  let running=false, pressed=false, phase='IDLE', expectedPressed=false;
  let inMs=5000, outMs=5000, totalMs=300000;
  let tStart=0, rafId=null, sampler=null;
  let phaseStart=0, phaseTargetMs=0, phaseElapsedMs=0;
  let playableMs=0, goodMs=0;
  const SCALE_MIN=0.70, SCALE_MAX=1.40;

  function ms(n){return Math.max(0,Math.floor(n));}
  function setDurations(){
    const ins=parseInt(document.getElementById('inSecs').value||'5',10);
    const outs=parseInt(document.getElementById('outSecs').value||'5',10);
    const mins=parseInt(document.getElementById('mins').value||'5',10);
    inMs=ms(ins*1000); outMs=ms(outs*1000); totalMs=ms(mins*60000);
  }

  // Background handlers — use real element for robustness
  function setBgUrl(url){ bgImgEl.style.backgroundImage = url ? `url(${url})` : 'none'; bgThumb.style.backgroundImage = url ? `url(${url})` : 'none'; }
  (function initBg(){
    const saved = localStorage.getItem(LS.bgImg);
    const dim = parseFloat(localStorage.getItem(LS.bgDim)||'0.25');
    const blur = parseInt(localStorage.getItem(LS.bgBlur)||'0',10);
    setBgUrl(saved); document.documentElement.style.setProperty('--dim', isNaN(dim)?0.25:dim); document.documentElement.style.setProperty('--blur', (isNaN(blur)?0:blur)+'px');
    bgDim.value = isNaN(dim)?0.25:dim; bgBlur.value = isNaN(blur)?0:blur;
  })();
  bgDim.addEventListener('input', ()=>{ const v=parseFloat(bgDim.value||'0.25'); document.documentElement.style.setProperty('--dim', v); localStorage.setItem(LS.bgDim, String(v)); });
  bgBlur.addEventListener('input', ()=>{ const v=parseInt(bgBlur.value||'0',10); document.documentElement.style.setProperty('--blur', v+'px'); localStorage.setItem(LS.bgBlur, String(v)); });
  applyBg.addEventListener('click', ()=>{
    const f = bgFile.files?.[0]; if(!f) return;
    const r = new FileReader();
    r.onload = e => {
      const dataUrl = e.target.result;
      setBgUrl(dataUrl);
      try { localStorage.setItem(LS.bgImg, dataUrl); } catch(err){ console.warn('Image trop lourde pour le stockage local', err); }
    };
    r.readAsDataURL(f);
  });
  resetBg.addEventListener('click', ()=>{ localStorage.removeItem(LS.bgImg); setBgUrl(null); });

  function setPressed(v){ if(!running) return; if(pressed===v) return; pressed=v; bubble.classList.toggle('hold', v); if(v && phase!=='INHALE') startPhase('INHALE'); if(!v && phase!=='EXHALE') startPhase('EXHALE'); }
  bubble.addEventListener('pointerdown', e=>{e.preventDefault(); setPressed(true);});
  bubble.addEventListener('pointerup', e=>{e.preventDefault(); setPressed(false);});
  bubble.addEventListener('pointercancel', e=>{e.preventDefault(); setPressed(false);});
  bubble.addEventListener('pointerleave', e=>{e.preventDefault(); setPressed(false);});
  bubble.addEventListener('keydown', e=>{ if(e.code==='Space'||e.code==='Enter'){ e.preventDefault(); setPressed(true); } });
  bubble.addEventListener('keyup', e=>{ if(e.code==='Space'||e.code==='Enter'){ e.preventDefault(); setPressed(false); } });

  function startPhase(kind){ phase=kind; expectedPressed=(kind==='INHALE'); phaseStart=performance.now(); phaseTargetMs=(kind==='INHALE')?inMs:outMs; phaseElapsedMs=0; phaseText.textContent=(kind==='INHALE')?'Inspire…':'Expire…'; }
  function autoSwitchIfReached(){ if(phaseElapsedMs>=phaseTargetMs){ if(phase==='INHALE' && pressed) startPhase('EXHALE'); else if(phase==='EXHALE' && !pressed) startPhase('INHALE'); } }

  function startSession(){
    if(running) return;
    setDurations();
    running=true; resultText.textContent=''; ribbon.style.display='none'; ribbon.classList.remove('split');
    startBtn.disabled=true; stopBtn.disabled=false; tStart=performance.now();
    phaseText.textContent='Prépare-toi…'; timerText.textContent='00:00'; phaseCountdown.textContent='Phase: — • Reste: —';
    meterFill.style.width='0%'; setRunnerX(0);
    setTimeout(()=>{ if(running && phase==='IDLE') startPhase('INHALE'); },800);
    playableMs=0; goodMs=0;
    sampler=setInterval(()=>{ if(!running) return; if(phase==='INHALE'||phase==='EXHALE'){ playableMs+=50; if(pressed===expectedPressed) goodMs+=50; } },50);
    rafId=requestAnimationFrame(tick);
  }
  function stopSession(manual=false){
    if(!running) return;
    running=false; startBtn.disabled=false; stopBtn.disabled=true;
    bubble.style.transform='scale(1)'; bubble.style.setProperty('--glow','0');
    expectedPressed=false; phase='IDLE'; if(rafId) cancelAnimationFrame(rafId); if(sampler) clearInterval(sampler);
    const precision = playableMs>0 ? Math.max(0,Math.min(1,goodMs/playableMs)) : 0;
    // Simple GR (facultatif)
    const pct=Math.round(precision*100);
    resultText.innerHTML=`Précision : <strong>${pct}%</strong>${manual?' (arrêt)':''}`;
  }
  function setRunnerX(percent){ const p=Math.max(0,Math.min(100,percent)); const left=p+'%'; runner.style.left=left; runnerShadow.style.left=left; }
  function tick(now){
    if(!running) return;
    const elapsed=now - tStart; const s=Math.floor(elapsed/1000); timerText.textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
    const p=Math.max(0,Math.min(1, elapsed / Math.max(1,totalMs))); meterFill.style.width=(p*100).toFixed(1)+'%'; setRunnerX(p*100);
    if(phase!=='IDLE'){
      phaseElapsedMs=now - phaseStart;
      const q=Math.max(0,Math.min(1, phaseElapsedMs / Math.max(1,phaseTargetMs)));
      const scale=(phase==='INHALE') ? (0.70 + (1.40-0.70)*q) : (1.40 - (1.40-0.70)*q);
      bubble.style.transform=`scale(${scale.toFixed(3)})`; bubble.style.setProperty('--glow',(q*(phase==='INHALE'?1:0.4)).toFixed(2));
      const remain=Math.max(0, phaseTargetMs - phaseElapsedMs); phaseCountdown.textContent=`Phase: ${phase==='INHALE'?'Inspire':'Expire'} • Reste: ${Math.ceil(remain/1000)}s`;
      autoSwitchIfReached();
    }
    if(elapsed>=totalMs){ meterFill.style.width='100%'; setRunnerX(100); ribbon.style.display='block'; setTimeout(()=>{ ribbon.classList.add('split'); },60); stopSession(false); return; }
    rafId=requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && running){ stopSession(true); } });
  startBtn.addEventListener('click', startSession); stopBtn.addEventListener('click', ()=> stopSession(true));
})();