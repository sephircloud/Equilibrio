(function(){
  const LS = { growth:'runner_growth_v1', last:'runner_last_v1', streak:'runner_streak_v1', bgImg:'runner_bgimg_v1', bgDim:'runner_bgdim_v1', bgBlur:'runner_bgblur_v1' };
  let growth = parseInt(localStorage.getItem(LS.growth)||'0',10);
  let last = localStorage.getItem(LS.last)||null;
  let streak = parseInt(localStorage.getItem(LS.streak)||'0',10);
  function isYesterday(d1,d2){const a=new Date(d1),b=new Date(d2);const d=(new Date(b.getFullYear(),b.getMonth(),b.getDate())-new Date(a.getFullYear(),a.getMonth(),a.getDate()))/(1000*60*60*24);return d===1;}
  function sameDay(d1,d2){const a=new Date(d1),b=new Date(d2);return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
  if(last){const now=new Date(); if(!sameDay(last,now)&&!isYesterday(last,now)) streak=0;}

  const startBtn=document.getElementById('startBtn'), stopBtn=document.getElementById('stopBtn'), resultText=document.getElementById('resultText');
  const bubble=document.getElementById('bubble'), phaseText=document.getElementById('phaseText'), timerText=document.getElementById('timerText'), phaseCountdown=document.getElementById('phaseCountdown');
  const meterFill=document.getElementById('meterFill'), runner=document.getElementById('runner'), runnerShadow=document.getElementById('runnerShadow'), ribbon=document.getElementById('ribbon');

  const bgFile=document.getElementById('bgFile'), bgThumb=document.getElementById('bgThumb'), bgDim=document.getElementById('bgDim'), bgBlur=document.getElementById('bgBlur'), applyBg=document.getElementById('applyBg'), resetBg=document.getElementById('resetBg');

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

  function applyBgVars(url){ document.documentElement.style.setProperty('--bg-url', url?`url(${url})`:'none'); bgThumb.style.backgroundImage = url?`url(${url})`:'none'; }
  (function initBg(){
    const saved=localStorage.getItem(LS.bgImg);
    const dim=parseFloat(localStorage.getItem(LS.bgDim)||'0.2');
    const blur=parseInt(localStorage.getItem(LS.bgBlur)||'0',10);
    if(saved) applyBgVars(saved);
    document.documentElement.style.setProperty('--bg-dim', isNaN(dim)?0.2:dim);
    document.documentElement.style.setProperty('--bg-blur', (isNaN(blur)?0:blur)+'px');
    bgDim.value=isNaN(dim)?0.2:dim; bgBlur.value=isNaN(blur)?0:blur;
  })();
  bgDim.addEventListener('input', ()=>{ const v=parseFloat(bgDim.value||'0.2'); document.documentElement.style.setProperty('--bg-dim', v); localStorage.setItem(LS.bgDim, String(v)); });
  bgBlur.addEventListener('input', ()=>{ const v=parseInt(bgBlur.value||'0',10); document.documentElement.style.setProperty('--bg-blur', v+'px'); localStorage.setItem(LS.bgBlur, String(v)); });
  applyBg.addEventListener('click', ()=>{ const f=bgFile.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=e=>{ const data=e.target.result; applyBgVars(data); try{localStorage.setItem(LS.bgImg,data);}catch(err){console.warn('Image trop lourde',err);} }; r.readAsDataURL(f); });
  resetBg.addEventListener('click', ()=>{ localStorage.removeItem(LS.bgImg); applyBgVars(null); });

  function setPressed(v){ if(!running) return; if(pressed===v) return; pressed=v; bubble.classList.toggle('hold', v); if(v && phase!=='INHALE') startPhase('INHALE'); if(!v && phase!=='EXHALE') startPhase('EXHALE'); }
  bubble.addEventListener('pointerdown', e=>{e.preventDefault(); setPressed(true);});
  bubble.addEventListener('pointerup', e=>{e.preventDefault(); setPressed(false);});
  bubble.addEventListener('pointercancel', e=>{e.preventDefault(); setPressed(false);});
  bubble.addEventListener('pointerleave', e=>{e.preventDefault(); setPressed(false);});
  bubble.addEventListener('keydown', e=>{ if(e.code==='Space'||e.code==='Enter'){ e.preventDefault(); setPressed(true); } });
  bubble.addEventListener('keyup', e=>{ if(e.code==='Space'||e.code==='Enter'){ e.preventDefault(); setPressed(false); } });

  function startPhase(kind){ phase=kind; expectedPressed=(kind==='INHALE'); phaseStart=performance.now(); phaseTargetMs=(kind==='INHALE')?inMs:outMs; phaseElapsedMs=0; phaseText.textContent=(kind==='INHALE')?'Inspire…':'Expire…'; }
  function autoSwitchIfReached(){ if(phaseElapsedMs>=phaseTargetMs){ if(phase==='INHALE'&&pressed) startPhase('EXHALE'); else if(phase==='EXHALE'&&!pressed) startPhase('INHALE'); } }

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
    const now=new Date(); if(last){ if(isYesterday(last,now)) streak=Math.min(streak+1,999); else if(!sameDay(last,now)) streak=0; } else { streak=1; }
    const streakBonus=Math.min(0.25,0.05*Math.max(0,streak-1));
    const baseGr=parseInt(document.getElementById('baseGr').value||'10',10);
    const earned=Math.round(precision*baseGr*(1+streakBonus));
    growth+=earned; last=now.toISOString(); localStorage.setItem(LS.growth,String(growth)); localStorage.setItem(LS.last,last); localStorage.setItem(LS.streak,String(streak));
    const pct=Math.round(precision*100);
    resultText.innerHTML=`Précision&nbsp;: <span class="${pct>=75?'ok':(pct>=40?'warn':'')}">${pct}%</span> • +<strong>${earned} GR</strong>${manual?' (arrêt)':''}`;
  }
  function setRunnerX(percent){ const p=Math.max(0,Math.min(100,percent)); const left=p+'%'; runner.style.left=left; runnerShadow.style.left=left; }
  function tick(now){
    if(!running) return;
    const elapsed=now - tStart; const s=Math.floor(elapsed/1000); timerText.textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
    const p=Math.max(0,Math.min(1, elapsed / Math.max(1,totalMs))); meterFill.style.width=(p*100).toFixed(1)+'%'; setRunnerX(p*100);
    if(phase!=='IDLE'){
      phaseElapsedMs=now - phaseStart;
      const q=Math.max(0,Math.min(1, phaseElapsedMs / Math.max(1,phaseTargetMs)));
      const scale=(phase==='INHALE') ? (SCALE_MIN + (SCALE_MAX-SCALE_MIN)*q) : (SCALE_MAX - (SCALE_MAX-SCALE_MIN)*q);
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