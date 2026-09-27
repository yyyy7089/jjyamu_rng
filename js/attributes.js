"use strict";
/* ============================================================
   속성 목록
   p = 확률의 분모 (p:4 → 1/4 확률)
   apply(ctx) 에서 아래 "채널"에 효과를 추가하면 엔진이 합성합니다.
     colors      : 색상 → 모두 평균내어 한 번에 칠함 (빨강+파랑=보라)
     img         : 이미지 필터 (grayscale, sepia …)
     tintK       : 색상 틴트 세기 배율 (필터와 색이 둘 다 보이도록 조절)
     transforms  : 정적 변형 (합성됨)
     anims       : 움직임 (중첩 래퍼로 전부 동시에 재생)
     shadows(u)  : 그림자·외곽선·발광 (drop-shadow 체인)
     overlays    : 이미지 모양으로 마스킹된 무늬 레이어
     bg          : 배경 레이어 (위에 있을수록 먼저)
     frames      : 테두리 (중첩되어 전부 보임)
     particles   : 입자 {type, n, back}
     acc         : 이미지에 붙는 장식
     behind      : 배경 바로 위 특수 레이어
     invisible   : true면 이미지와 이미지 모양 레이어를 숨김 (장식·배경·입자·배지는 그대로)
     satellite   : true면 아무 효과도 받지 않은 작은 기본 이미지가 화면 중심을 공전
     layers      : 직접 그리는 레이어 {back, build} (FX 참고)
     button      : true면 이미지를 클릭하면 '쨔무쨔무' 알림
     explode     : true면 1초 뒤 이미지가 폭발해 사라짐 (도감 썸네일에서는 생략)
     reflect     : 물결 반사   doodle: 선 꿈틀거림   silhouette: 번개 칠 때 검은 실루엣
     frames 항목은 문자열(클래스) 또는 {cls, build:(frame, env)=>{}}
     lens        : 캐릭터에 거는 렌즈 왜곡 ["bulge"|"swirl"]   fisheye: 무대 전체 어안 렌즈
     badges      : 왼쪽 아래 배지 {src, p} — 덜 희귀한 순으로 겹치지 않게 나란히 표시
   ============================================================ */
/* ------------------------------------------------------------
   초희귀 속성용 레이어 빌더 (JS로 직접 그림, 외부 이미지 없음)
   c.layers.push({back:true|false, build:(layer, env)=>{...}})
   env = {u: 무대 1% 크기(px), mini: 미니 미리보기 여부}
   ------------------------------------------------------------ */
const FX = {
  /* ---- 방송사고: TV 화면 효과 (f-tv 프레임 안쪽에 그림) ---- */
  tv(frame,env){
    frame.insertAdjacentHTML("beforeend",`<div class="tv-scr"><div class="tv-scan"></div><div class="tv-vig"></div><div class="tv-glare"></div>
      <div class="tv-bars"></div><canvas class="tv-noise" width="72" height="72"></canvas></div>`);
    if(!env.live) return;
    const cv=frame.querySelector(".tv-noise"), g=cv.getContext("2d"), bars=frame.querySelector(".tv-bars");
    const img=g.createImageData(72,72); let running=false;
    const loop=()=>{ if(!running||!frame.isConnected) return;
      for(let i=0;i<img.data.length;i+=4){const v=Math.random()*255|0;img.data[i]=img.data[i+1]=img.data[i+2]=v;img.data[i+3]=255}
      g.putImageData(img,0,0); requestAnimationFrame(loop); };
    const noise=ms=>{cv.style.opacity=".92";env.el.classList.add("tv-glitch");running=true;loop();
      env.el._timers.push(setTimeout(()=>{cv.style.opacity="0";env.el.classList.remove("tv-glitch");running=false},ms))};
    const next=()=>env.el._timers.push(setTimeout(()=>{ if(!frame.isConnected) return;
      if(Math.random()<.4){bars.style.opacity="1";env.el._timers.push(setTimeout(()=>{bars.style.opacity="0";noise(160)},480))}
      else noise(260+Math.random()*260);
      next(); },3000+Math.random()*3500));
    next();
  },
  /* ---- 카드: 트레이딩 카드 테두리와 명판 ---- */
  card(frame,env){
    const d=denOf(env.ids), t=tier(d);
    const serial=env.serial!=null?Number(env.serial).toLocaleString("ko-KR"):"???";
    frame.insertAdjacentHTML("beforeend",`<div class="card-win"></div><div class="card-sheen"></div>
      <div class="card-plate top"><span>쨔무쨔무</span><span>${t?t.n:""}</span></div>
      <div class="card-plate bot"><span>No. ${serial}</span><span>1 / ${fmtDen(d)}</span></div>`);
    if(!env.live) return;
    const el=env.el; frame.style.transition="transform .18s ease-out";
    const mv=e=>{const r=frame.getBoundingClientRect();
      const x=Math.max(-.6,Math.min(.6,(e.clientX-r.left)/r.width-.5)),y=Math.max(-.6,Math.min(.6,(e.clientY-r.top)/r.height-.5));
      frame.style.transform=`perspective(900px) rotateY(${(x*26).toFixed(1)}deg) rotateX(${(-y*20).toFixed(1)}deg)`;
      frame.style.setProperty("--mx",(50+x*120).toFixed(0)+"%");frame.style.setProperty("--my",(50+y*120).toFixed(0)+"%")};
    const lv=()=>{frame.style.transform="";frame.style.setProperty("--mx","50%");frame.style.setProperty("--my","50%")};
    el.addEventListener("pointermove",mv); el.addEventListener("pointerleave",lv);
    el._cleanup.push(()=>{el.removeEventListener("pointermove",mv);el.removeEventListener("pointerleave",lv)});
  },
  /* ---- 번개: 먹구름, 무작위 번개, 섬광, 실루엣 ---- */
  storm(layer,env){
    layer.innerHTML=`<div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div>
      <svg class="bolts" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg><div class="storm-flash"></div>`;
    layer.querySelectorAll(".cloud").forEach(c=>c.style.filter=`blur(${2.5*env.u}px)`);
    const svg=layer.querySelector(".bolts"), fl=layer.querySelector(".storm-flash");
    const bolt=()=>{ let x=12+Math.random()*76,y=-2,pts=[[x,y]],br="";
      const end=60+Math.random()*28;
      while(y<end){ y+=4+Math.random()*6; x+=(Math.random()-.5)*10; pts.push([x,y]);
        if(Math.random()<.18){let bx=x,by=y,bp=[[bx,by]];for(let k=0;k<3;k++){by+=3+Math.random()*5;bx+=(Math.random()<.5?-1:1)*(2+Math.random()*5);bp.push([bx,by])}
          br+=`<polyline points="${bp.map(p=>p.map(v=>v.toFixed(1)).join(",")).join(" ")}" stroke-width=".45"/>`} }
      return `<g>${br}<polyline points="${pts.map(p=>p.map(v=>v.toFixed(1)).join(",")).join(" ")}" stroke-width=".9"/></g>`; };
    if(!env.live){ svg.innerHTML=bolt(); svg.style.opacity=".55"; return; }
    const strike=()=>{ if(!layer.isConnected) return; svg.innerHTML=bolt();
      svg.animate([{opacity:0},{opacity:1,offset:.08},{opacity:.15,offset:.22},{opacity:1,offset:.34},{opacity:0}],{duration:520});
      fl.animate([{opacity:0},{opacity:.7,offset:.08},{opacity:.1,offset:.22},{opacity:.55,offset:.34},{opacity:0}],{duration:620});
      env.el.classList.add("bolt"); env.el._timers.push(setTimeout(()=>env.el.classList.remove("bolt"),360));
      env.el._timers.push(setTimeout(strike,1400+Math.random()*2800)); };
    env.el._timers.push(setTimeout(strike,500+Math.random()*900));
  },
  /* ---- 블랙홀 ---- */
  blackhole(layer,env){
    let inf=""; const n=env.mini?8:22;
    for(let i=0;i<n;i++){const d=3+Math.random()*3;inf+=`<span class="infall" style="--a:${(Math.random()*360).toFixed(0)}deg;--d:${d.toFixed(2)}s;--dl:${(-Math.random()*d).toFixed(2)}s"><i></i></span>`}
    layer.innerHTML=`<div class="bh"><div class="bh-disk"></div><div class="bh-lens"></div><div class="bh-core"></div><div class="bh-disk front"></div></div>${inf}`;
  },
  /* ---- 차원문: 포털과, 무작위 특성을 단 작은 쨔무쨔무들 ---- */
  portal(layer,env){
    layer.innerHTML=`<div class="portal"><div class="ptl-swirl"></div><div class="ptl-ring"></div></div>`;
    const pos=[[-34,-26],[33,-24],[-30,28],[34,26]];
    pos.forEach(([dx,dy],i)=>{
      const sp=document.createElement("div"); sp.className="ptl-sprite";
      sp.style.setProperty("--dx",dx+"cqw"); sp.style.setProperty("--dy",dy+"cqh"); sp.style.animationDelay=(env.mini?-(1.6+i*1.5):-i*1.5)+"s";
      const st=document.createElement("div"); st.className="stage"; sp.appendChild(st); layer.appendChild(sp);
      const draw=()=>renderStage(st,portalIds(),{bare:true,size:env.u*24});
      draw();
      if(env.live) sp.addEventListener("animationiteration",e=>{if(e.target===sp)draw()});
    });
  },
  /* ---- 어안: 둥근 렌즈 테두리와 유리 반사 ---- */
  fisheye(layer){layer.innerHTML=`<div class="fe-ring"></div><div class="fe-glass"></div>`},
  /* ---- 대행진: 줄지어 행진하는 작은 쨔무쨔무들 ---- */
  parade(layer,env){
    const rows=[{top:50,size:11,dur:30,op:.6,n:9},{top:63,size:14,dur:24,op:.8,n:8},{top:78,size:18,dur:18,op:1,n:7}];
    let html="";
    rows.forEach((r,ri)=>{ const n=env.mini?Math.ceil(r.n/2):r.n; let items="";
      for(let k=0;k<n*2;k++){const hue=Math.random()<.35?`filter:hue-rotate(${(Math.random()*360)|0}deg);`:"";
        items+=`<img src="${BASE_IMAGE}" alt="" style="width:${(50/n).toFixed(2)}%;animation-delay:${(-(k%2)*.25-ri*.1).toFixed(2)}s;${hue}">`}
      html+=`<div class="pr-row" style="top:${r.top}%;height:${r.size}%;opacity:${r.op};animation-duration:${r.dur}s">${items}</div>`; });
    layer.innerHTML=html;
  },
  el(tag,cls,style){const d=document.createElement(tag);if(cls)d.className=cls;if(style)Object.assign(d.style,style);return d},
  aurora(layer,{u}){
    [["#39ffb0","#2fd2ff"],["#8dffcf","#a66bff"],["#2fd2ff","#ff7bd5"]].forEach((c,i)=>{
      layer.appendChild(FX.el("div","aurora-band",{top:(6+i*13)+"%",
        background:`linear-gradient(90deg,transparent,${c[0]} 30%,${c[1]} 68%,transparent)`,
        filter:`blur(${2.4*u}px)`,animationDuration:(7+i*2.5)+"s",animationDelay:(-i*2.2)+"s"}));
    });
  },
  bokeh(layer,{u,mini}){
    const n=mini?3:7;
    for(let i=0;i<n;i++){const z=10+Math.random()*16;
      layer.appendChild(FX.el("div","bokeh",{width:z+"cqw",height:z+"cqw",left:Math.random()*90+"%",top:Math.random()*90+"%",
        filter:`blur(${1.2*u}px)`,animationDuration:(8+Math.random()*6)+"s",animationDelay:(-Math.random()*8)+"s"}));}
  },
  meteors(layer,{mini}){
    const n=mini?4:11;
    for(let i=0;i<n;i++){const d=2.4+Math.random()*2.6;
      layer.appendChild(FX.el("span","meteor",{top:(Math.random()*45)+"%",left:(40+Math.random()*70)+"%",
        width:(22+Math.random()*18)+"cqw",animationDuration:d+"s",animationDelay:(-Math.random()*d)+"s"}));}
    layer.appendChild(FX.el("div","horizon"));
  },
  prismRays(layer){layer.appendChild(FX.el("div","prism-rays"))},
  shards(front){
    return (layer,{u})=>{
      layer.style.filter=`drop-shadow(0 0 ${u}px #ffffff) drop-shadow(0 0 ${2.5*u}px #9fd8ff)`;
      for(let i=0;i<10;i++){
        const a=i/10*Math.PI*2+.3, s=Math.sin(a);
        if((s>0)!==front) continue;               // 아래쪽 조각은 앞, 위쪽 조각은 뒤
        const z=5+(i%3)*2.2;
        const w=FX.el("div","shard-wrap",{left:(50+41*Math.cos(a))+"%",top:(50+36*s)+"%",width:z+"cqw",height:(z*1.6)+"cqw",
          animationDelay:(-i*0.7)+"s"});
        w.appendChild(FX.el("div","shard",{animationDelay:(-i*0.9)+"s"}));
        layer.appendChild(w);
      }
    };
  },
  pillar(layer){layer.appendChild(FX.el("div","pillar"));layer.appendChild(FX.el("div","pillar-top"))},
  magicCircle(layer,{u}){
    const tri=(r,rot)=>[0,1,2].map(k=>{const a=(k*120+rot-90)*Math.PI/180;return (r*Math.cos(a)).toFixed(1)+","+(r*Math.sin(a)).toFixed(1)}).join(" ");
    const sq=(r,rot)=>[0,1,2,3].map(k=>{const a=(k*90+rot)*Math.PI/180;return (r*Math.cos(a)).toFixed(1)+","+(r*Math.sin(a)).toFixed(1)}).join(" ");
    let dots="";for(let k=0;k<6;k++){const a=(k*60-90)*Math.PI/180;dots+=`<circle cx="${(74*Math.cos(a)).toFixed(1)}" cy="${(74*Math.sin(a)).toFixed(1)}" r="5.5"/><circle cx="${(74*Math.cos(a)).toFixed(1)}" cy="${(74*Math.sin(a)).toFixed(1)}" r="2" class="mc-fill"/>`}
    let runes="";for(let k=0;k<24;k++){const a=k*15;runes+=`<path d="M0,-80 l-2.2,-4 l2.2,-2.6 l2.2,2.6 z" transform="rotate(${a})" class="mc-fill"/>`}
    const w=FX.el("div","mcircle-wrap",{filter:`drop-shadow(0 0 ${.6*u}px #fff6d0) drop-shadow(0 0 ${2*u}px #ffcf5a)`});
    w.innerHTML=`<svg class="mcircle" viewBox="-100 -100 200 200" aria-hidden="true">
      <g class="mc-r1"><circle r="95" stroke-width="1.4"/><circle r="90" stroke-width="3.2" stroke-dasharray="0.8 3.9"/><circle r="86" stroke-width=".7"/>${runes}</g>
      <g class="mc-r2"><circle r="74" stroke-width="1"/><polygon points="${tri(74,0)}" stroke-width="1.1"/><polygon points="${tri(74,180)}" stroke-width="1.1"/>${dots}</g>
      <g class="mc-r3"><circle r="37" stroke-width="1.6" stroke-dasharray="5 3"/><polygon points="${sq(30,0)}" stroke-width=".9"/><polygon points="${sq(30,45)}" stroke-width=".9"/><circle r="12" stroke-width="1"/></g>
    </svg>`;
    layer.appendChild(w);
  },
};

// 차원문의 작은 쨔무쨔무에 붙일 특성: 이미 발견한 것 중, 캐릭터 자체만 바꾸는 특성
const SIMPLE_KEYS=["colors","img","transforms","anims","fxAnims","shadows","overlays","acc"];
function isSimpleTrait(a){const c=newCtx();a.apply(c);const base=newCtx();
  for(const k in c){const v=c[k],b=base[k];
    if(Array.isArray(v)){if(v.length&&!SIMPLE_KEYS.includes(k))return false}
    else if(k!=="tintK"&&k!=="opacity"&&v!==b)return false}
  return true}
function portalIds(){
  const pool=ATTRS.filter(a=>discovered(a.id)&&isSimpleTrait(a)).map(a=>a.id);
  const k=Math.min(pool.length,1+(Math.random()*3|0)), out=[];
  while(out.length<k){const id=pool[Math.random()*pool.length|0];if(!out.includes(id))out.push(id)}
  return out;
}
const ATTRS = [
  {id:"shadow",  name:"그림자",     p:3,      apply:c=>c.shadows.push(u=>`drop-shadow(${2*u}px ${2.6*u}px 0 rgba(34,28,69,.3))`)},
  {id:"mirror",  name:"거울",       p:7,      apply:c=>c.transforms.push("scaleX(-1)")},
  {id:"tilt",    name:"기울기",     p:12,      apply:c=>c.transforms.push("rotate(-12deg)")},
  {id:"gray",    name:"흑백",       p:15,      apply:c=>{c.img.push("grayscale(1)");c.tintK*=.5}},
  {id:"outline", name:"외곽선",     p:20,      apply:c=>c.shadows.push(u=>{const d=.7*u,k="#221C45";return `drop-shadow(${d}px 0 0 ${k}) drop-shadow(-${d}px 0 0 ${k}) drop-shadow(0 ${d}px 0 ${k}) drop-shadow(0 -${d}px 0 ${k})`})},
  {id:"red",     name:"빨강",       p:25,      apply:c=>c.colors.push("#ff3040")},
  {id:"float",   name:"둥실",       p:25,     apply:c=>c.anims.push("a-float")},
  {id:"blue",    name:"파랑",       p:30,      apply:c=>c.colors.push("#2f6bff")},
  {id:"dashed",  name:"점선", p:45,    apply:c=>c.frames.push("f-dashed")},
  {id:"yellow",  name:"노랑",       p:50,      apply:c=>c.colors.push("#ffd000")},
  {id:"sepia",   name:"세피아",     p:60,     apply:c=>{c.img.push("sepia(.85)");c.tintK*=.7}},
  {id:"sunset",  name:"노을",       p:70,     apply:c=>c.bg.push({image:"linear-gradient(180deg,#ff8f8b,#ffbf86 55%,#ffe39a)"})},
  {id:"bounce",  name:"통통",       p:90,     apply:c=>c.anims.push("a-bounce")},
  {id:"skull",   name:"해골",       p:100,    apply:c=>c.badges.push({src:BADGE_IMAGES.skull,p:100})},
  {id:"vivid",   name:"쨍함",       p:120,     apply:c=>c.img.push("contrast(1.45) saturate(1.9)")},
  {id:"grid",    name:"모눈",       p:150,     apply:c=>c.bg.push({image:"linear-gradient(rgba(60,50,150,.22) 1px,transparent 1px),linear-gradient(90deg,rgba(60,50,150,.22) 1px,transparent 1px)",size:"8% 8%,8% 8%"})},
  {id:"green",   name:"초록",       p:200,     apply:c=>c.colors.push("#1fbf5b")},
  {id:"squash",  name:"납작",       p:200,     apply:c=>c.transforms.push("scale(1.25,.72)")},
  {id:"bones",   name:"해골뼈",     p:200,    apply:c=>c.badges.push({src:BADGE_IMAGES.bones,p:200})},
  {id:"psparkle",name:"스파클",     p:211,    apply:c=>c.particles.push({type:"psparkle",n:18})},
  {id:"sparkle", name:"반짝",       p:250,     apply:c=>c.particles.push({type:"sparkle",n:10})},
  {id:"harder",  name:"하더",       p:300,    apply:c=>c.badges.push({src:BADGE_IMAGES.harder,p:300})},
  {id:"stripes", name:"줄무늬",     p:350,     apply:c=>c.overlays.push("o-stripes")},
  {id:"pulse",   name:"두근",       p:450,     apply:c=>c.anims.push("a-pulse")},
  {id:"easy",    name:"이지",       p:500,    apply:c=>c.badges.push({src:BADGE_IMAGES.easy,p:500})},
  {id:"invert",  name:"반전",       p:600,     apply:c=>{c.img.push("invert(1)");c.tintK*=.8}},
  {id:"worship", name:"숭배",       p:750,    apply:c=>c.badges.push({src:BADGE_IMAGES.worship,p:750})},
  {id:"dots",    name:"물방울",     p:800,     apply:c=>c.overlays.push("o-dots")},
  {id:"tiny",    name:"꼬마",       p:1000,     apply:c=>c.transforms.push("scale(.62)")},
  {id:"blink",   name:"점멸",       p:1234,   apply:c=>c.overlays.push("o-flash")},
  {id:"shake",   name:"덜덜",       p:1300,     apply:c=>c.anims.push("a-shake")},
  {id:"button",  name:"버튼",       p:1500,   apply:c=>{c.button=true}},
  {id:"bang",    name:"느낌표",     p:1700,     apply:c=>c.acc.push({cls:"acc-bang",text:"!"})},
  {id:"giant",   name:"거대",       p:2000,   apply:c=>c.transforms.push("scale(2)")},
  {id:"wood",    name:"액자",       p:2200,     apply:c=>c.frames.push("f-wood")},
  {id:"dori",    name:"도리도리",   p:2500,   apply:c=>c.anims.push("a-dori")},
  {id:"snow",    name:"눈",         p:3000,     apply:c=>c.particles.push({type:"snow",n:24})},
  {id:"neon",    name:"네온",       p:4000,    apply:c=>c.shadows.push(u=>`drop-shadow(0 0 ${1.2*u}px #3cf6ff) drop-shadow(0 0 ${3*u}px #3cf6ff)`)},
  {id:"convex",  name:"볼록",       p:4800,   apply:c=>c.lens.push("bulge")},
  {id:"ghost",   name:"유령",       p:5000,    apply:c=>{c.opacity*=.42}},
  {id:"upside",  name:"거꾸로",     p:7000,    apply:c=>c.transforms.push("rotate(180deg)")},
  {id:"fisheye", name:"어안",       p:7200,   apply:c=>{c.fisheye=true;c.layers.push({back:false,build:FX.fisheye})}},
  {id:"double",  name:"겹테두리", p:9000,   apply:c=>c.frames.push("f-double")},
  {id:"demon",   name:"데몬",       p:10000,  apply:c=>c.badges.push({src:BADGE_IMAGES.demon,p:10000})},
  {id:"pixel",   name:"픽셀",       p:12000,    apply:c=>{c.pixel=true}},
  {id:"threed",  name:"3d",         p:14400,  apply:c=>c.anims.push("a-3d")},
  {id:"bubble",  name:"거품",       p:15000,    apply:c=>c.particles.push({type:"bubble",n:10})},
  {id:"moon",    name:"위성",       p:17500,  apply:c=>{c.satellite=true}},
  {id:"scan",    name:"스캔라인",   p:20000,    apply:c=>c.overlays.push("o-scan")},
  {id:"spin",    name:"빙글",       p:25000,    apply:c=>c.anims.push("a-spin")},
  {id:"night",   name:"밤하늘",     p:30000,    apply:c=>{c.bg.push({image:"linear-gradient(rgba(14,10,52,.8),rgba(40,26,96,.72))"});c.particles.push({type:"star",n:34,back:true})}},
  {id:"jelly",   name:"말랑",       p:40000,    apply:c=>c.anims.push("a-jelly")},
  {id:"heart",   name:"하트",       p:50000,   apply:c=>c.particles.push({type:"heart",n:9})},
  {id:"glitch",  name:"잔상",       p:70000,   apply:c=>{c.shadows.push(u=>`drop-shadow(${1.3*u}px 0 0 rgba(255,0,90,.75)) drop-shadow(-${1.3*u}px 0 0 rgba(0,225,255,.75))`);c.anims.push("a-jitter")}},
  {id:"ripple",  name:"물결",       p:80000,   apply:c=>{c.reflect=true}},
  {id:"crown",   name:"왕관",       p:90000,   apply:c=>c.acc.push({cls:"acc-crown"})},
  {id:"swirl",   name:"소용돌이",   p:100000,  apply:c=>c.lens.push("swirl")},
  {id:"rframe",  name:"오색테두리", p:120000, apply:c=>c.frames.push("f-rainbow")},
  {id:"invis",   name:"투명",       p:125000, apply:c=>{c.invisible=true}},
  {id:"ember",   name:"불씨",       p:150000,   apply:c=>c.particles.push({type:"ember",n:16})},
  {id:"holo",    name:"홀로그램",   p:200000,  apply:c=>c.overlays.push("o-holo")},
  {id:"gold",    name:"금박",       p:250000,  apply:c=>{c.overlays.push("o-gold");c.overlays.push("o-shine")}},
  {id:"doodle",  name:"낙서",       p:300000,   apply:c=>{c.doodle=true;c.bg.push({image:"linear-gradient(90deg,transparent 11%,rgba(255,90,110,.5) 11%,rgba(255,90,110,.5) 11.6%,transparent 11.6%),repeating-linear-gradient(180deg,transparent 0 7.4%,rgba(90,140,220,.32) 7.4% 7.8%),linear-gradient(#fffdf6,#fff9ee)"})}},
  {id:"halo",    name:"후광",       p:350000,  apply:c=>c.acc.push({cls:"acc-halo"})},
  {id:"rainbow", name:"무지개",     p:450000, apply:c=>c.fxAnims.push("a-hue")},
  {id:"storm",   name:"번개",       p:500000,   apply:c=>{c.bg.push({image:"radial-gradient(ellipse at 50% 0,#3b4363,transparent 70%),linear-gradient(180deg,#121524,#252a42 60%,#1a1e31)"});c.layers.push({back:true,build:FX.storm});c.particles.push({type:"rain",n:46});c.silhouette=true}},
  {id:"clone",   name:"분신",       p:600000, apply:c=>{c.clone=true}},
  {id:"tv",      name:"방송사고",   p:640000,   apply:c=>c.frames.push({cls:"f-tv",build:FX.tv})},
  {id:"galaxy",  name:"은하",       p:800000, apply:c=>{c.bg.push({image:"radial-gradient(ellipse at 28% 35%,rgba(190,90,255,.75),transparent 55%),radial-gradient(ellipse at 75% 72%,rgba(40,220,230,.6),transparent 50%),linear-gradient(#0b0826,#1a0f45)"});c.particles.push({type:"star",n:40,back:true});c.shadows.push(u=>`drop-shadow(0 0 ${2.5*u}px rgba(200,120,255,.9))`)}},
  {id:"divine",  name:"신성",       p:1000000,apply:c=>{c.behind.push("rays");c.particles.push({type:"gold",n:12});c.shadows.push(u=>`drop-shadow(0 0 ${2*u}px #ffe07a) drop-shadow(0 0 ${5*u}px #ffc93a)`)}},
  {id:"boom",    name:"폭발",       p:1337000,apply:c=>{c.explode=true}},
  {id:"aurora",  name:"오로라",     p:2000000,  apply:c=>{c.bg.push({image:"linear-gradient(180deg,#04121f,#0b2440 55%,#123f55)"});c.particles.push({type:"star",n:26,back:true});c.layers.push({back:true,build:FX.aurora});c.overlays.push("o-aurora");c.shadows.push(u=>`drop-shadow(0 0 ${1.2*u}px rgba(120,255,210,.9)) drop-shadow(0 0 ${3.5*u}px rgba(60,220,255,.55))`)}},
  {id:"card",    name:"카드",       p:3000000,  apply:c=>c.frames.push({cls:"f-card",build:FX.card})},
  {id:"sakura",  name:"벚꽃",       p:5000000,  apply:c=>{c.bg.push({image:"radial-gradient(circle at 50% 20%,#fff8fb,transparent 60%),linear-gradient(180deg,#fff0f5,#ffe0eb 55%,#fff6f9)"});c.layers.push({back:true,build:FX.bokeh});c.particles.push({type:"petal",n:10,back:true});c.particles.push({type:"petal",n:18});c.shadows.push(u=>`drop-shadow(0 0 ${1.4*u}px #fff) drop-shadow(0 0 ${3.5*u}px rgba(255,140,185,.75))`)}},
  {id:"blackhole",name:"블랙홀",    p:7000000,  apply:c=>{c.bg.push({image:"radial-gradient(circle at 50% 50%,#1c1030,#05030c 70%)"});c.particles.push({type:"star",n:40,back:true});c.layers.push({back:true,build:FX.blackhole});c.anims.push("a-bh")}},
  {id:"meteor",  name:"유성우",     p:12000000, apply:c=>{c.bg.push({image:"linear-gradient(180deg,#050822,#171352 58%,#3b2170)"});c.particles.push({type:"star",n:44,back:true});c.layers.push({back:true,build:FX.meteors});c.overlays.push("o-starlit");c.shadows.push(u=>`drop-shadow(0 0 ${1.2*u}px #dfe9ff) drop-shadow(0 0 ${3.5*u}px rgba(120,160,255,.8))`)}},
  {id:"portal",  name:"차원문",     p:25000000, apply:c=>c.layers.push({back:true,build:FX.portal})},
  {id:"crystal", name:"크리스탈",   p:35000000, apply:c=>{c.bg.push({image:"linear-gradient(160deg,#eef8ff,#f1e9ff 50%,#ffeaf6)"});c.layers.push({back:true,build:FX.prismRays});c.layers.push({back:true,build:FX.shards(false)});c.layers.push({back:false,build:FX.shards(true)});c.overlays.push("o-prism");c.shadows.push(u=>`drop-shadow(0 0 ${1*u}px #fff) drop-shadow(0 0 ${3*u}px #9fd8ff)`)}},
  {id:"parade",  name:"대행진",     p:60000000, apply:c=>{c.layers.push({back:true,build:FX.parade});c.acc.push({cls:"acc-flag",html:`<div class="pole"></div><div class="cloth"><img src="${BASE_IMAGE}" alt=""></div>`});c.anims.push("a-march")}},
  {id:"descent", name:"강림",       p:100000000,apply:c=>{c.bg.push({image:"radial-gradient(circle at 50% 46%,rgba(255,236,180,.35),transparent 58%),linear-gradient(180deg,#140d2e,#2e1d57 60%,#4a2c6e)"});c.layers.push({back:true,build:FX.magicCircle});c.layers.push({back:true,build:FX.pillar});c.particles.push({type:"mote",n:22});c.overlays.push("o-sheen");c.shadows.push(u=>`drop-shadow(0 0 ${1.2*u}px #fffbe8) drop-shadow(0 0 ${3*u}px #ffd76a) drop-shadow(0 0 ${7*u}px rgba(255,200,90,.55))`)}},
];
