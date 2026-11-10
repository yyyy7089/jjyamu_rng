"use strict";
const AMAP = Object.fromEntries(ATTRS.map((a,i)=>[a.id,{...a,idx:i}]));

/* ---------------- utilities ---------------- */
const $ = s=>document.querySelector(s);
const esc = s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function rand(){ // 53-bit crypto random in [0,1)
  const a=new Uint32Array(2); crypto.getRandomValues(a);
  return ((a[0]>>>5)*67108864+(a[1]>>>6))/9007199254740992;
}
const SUP="⁰¹²³⁴⁵⁶⁷⁸⁹";
// 확률 분모 표기. big = 정확한 BigInt 값(있으면 사용). 표기 방식은 설정의 "확률 표기"
function fmtDen(d,big){
  const mode=(typeof state!=="undefined"&&owns("fmt"))?(state.cfg.fmt||"auto"):"auto";
  const B=()=>big!=null?big:BigInt(Math.round(d));
  if(mode==="full") return B().toLocaleString("ko-KR");
  if(mode==="kor") return korNum(B());
  if(mode==="exp"?d>=1e4:d>=1e12){
    const e=Math.floor(Math.log10(d)); const m=d/Math.pow(10,e);
    return m.toFixed(2)+" × 10"+String(e).split("").map(x=>SUP[+x]).join("");
  }
  return Math.round(d).toLocaleString("ko-KR");
}
const KOR_UNIT=["","만","억","조","경","해","자","양","구","간","정","재","극"];
function korNum(b){
  if(b<10000n) return b.toString();
  const g=[]; let x=b; while(x>0n){g.push(Number(x%10000n)); x/=10000n;}
  const out=[]; for(let i=g.length-1;i>=0&&out.length<2;i--) if(g[i]) out.push(g[i].toLocaleString("ko-KR")+KOR_UNIT[i]);
  return out.join(" ");
}
const denBig = ids=>ids.reduce((m,id)=>m*BigInt(AMAP[id]?AMAP[id].p:1),1n);
const denOf = ids=>ids.reduce((m,id)=>m*(AMAP[id]?AMAP[id].p:1),1);
/* 등급: 확률 1/N의 N이 min 이상이면 해당 등급 */
const TIERS=[
  {min:1,   n:"흔함"},  // 1/1 (기본 이미지 포함)
  {min:1e2, n:"드묾"},  // 1/100
  {min:1e4, n:"희귀"},  // 1/1만
  {min:1e6, n:"영웅"},  // 1/100만
  {min:1e8, n:"전설"},  // 1/1억
  {min:1e10,n:"신화"},  // 1/100억
  {min:1e12,n:"초월"},  // 1/1조
  {min:1e14,n:"태초"},  // 1/100조
  {min:1e16,n:"무한"},  // 1/1경
];
const BANNER_FROM=2; // 희귀 이상이면 배너 연출
function tier(d){
  for(let i=TIERS.length-1;i>=0;i--) if(d>=TIERS[i].min){
    const plus=i<TIERS.length-1&&d>=TIERS[i].min*10; // 각 등급의 위쪽 1/10 구간은 "+" (무한 제외)
    return {n:TIERS[i].n+(plus?"+":""),c:"t"+i,i,plus};
  }
  return null;
}
function mixColors(list){
  let r=0,g=0,b=0; for(const h of list){r+=parseInt(h.slice(1,3),16);g+=parseInt(h.slice(3,5),16);b+=parseInt(h.slice(5,7),16)}
  const n=list.length; return `rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`;
}
function ago(t){
  const s=Math.floor((Date.now()-t)/1000);
  if(s<10) return "방금"; if(s<60) return s+"초 전";
  const m=Math.floor(s/60); if(m<60) return m+"분 전";
  const h=Math.floor(m/60); if(h<24) return h+"시간 전";
  const d=new Date(t); return (d.getMonth()+1)+"월 "+d.getDate()+"일";
}
const sortIds = ids=>ids.filter(id=>AMAP[id]).sort((a,b)=>AMAP[a].idx-AMAP[b].idx);
const keyOf = ids=>sortIds(ids).join(",");
const idsOf = k=>k?k.split(",").filter(id=>AMAP[id]):[];

/* ---------------- pixelated version of base (JS-generated) ---------------- */
let PIXEL_IMAGE = BASE_IMAGE;
(function(){
  const im=new Image();
  im.onload=()=>{try{
    const n=40,c=document.createElement("canvas");c.width=n;c.height=n;
    const x=c.getContext("2d"); const r=Math.min(n/im.width,n/im.height)||1;
    const w=im.width*r,h=im.height*r; x.drawImage(im,(n-w)/2,(n-h)/2,w,h);
    PIXEL_IMAGE=c.toDataURL("image/png");
  }catch(e){}};
  im.src=BASE_IMAGE;
})();

/* ---------------- rendering engine ---------------- */
let FILTER_SEQ=0;
/* ---------------- 렌즈 왜곡 (SVG feDisplacementMap + JS로 만든 변위 지도) ---------------- */
// 지도의 R/G 값 = 가로/세로로 얼마나 떨어진 곳의 픽셀을 가져올지 (128 = 그대로)
const LENS_DEF={
  bulge:  {M:.12, f:(x,y)=>{const R=.46,r=Math.hypot(x,y);if(r>=R||r===0)return[0,0];const t=r/R,k=Math.pow(t,1.7)/t-1;return[x*k,y*k]}},
  fisheye:{M:.16, f:(x,y)=>{const R=.5,r=Math.hypot(x,y);if(r>=R||r===0)return[0,0];const t=r/R,k=Math.pow(t,2.1)/t-1;return[x*k,y*k]}},
  swirl:  {M:.34, f:(x,y)=>{const R=.49,r=Math.hypot(x,y);if(r>=R)return[0,0];const a=4.4*Math.pow(1-r/R,2),co=Math.cos(a),si=Math.sin(a);
            return[(x*co-y*si)-x,(x*si+y*co)-y]}},
};
const LENS_MAP={};
function lensMap(type){
  if(LENS_MAP[type]) return LENS_MAP[type];
  const N=160, cv=document.createElement("canvas"); cv.width=cv.height=N;
  const g=cv.getContext("2d"), img=g.createImageData(N,N), D=LENS_DEF[type];
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const [dx,dy]=D.f((i+.5)/N-.5,(j+.5)/N-.5), o=(j*N+i)*4;
    img.data[o]=Math.max(0,Math.min(255,Math.round(127.5+dx/(2*D.M)*255)));
    img.data[o+1]=Math.max(0,Math.min(255,Math.round(127.5+dy/(2*D.M)*255)));
    img.data[o+2]=0; img.data[o+3]=255;
  }
  g.putImageData(img,0,0);
  return LENS_MAP[type]=cv.toDataURL("image/png");
}
// 일렁이는 노이즈 왜곡 필터 (불꽃 등). scale 단위는 px
function turbFilter(el,{freq=[.02,.06],scale=10,dur=2,oct=2}={}){
  const id="fxf"+(++FILTER_SEQ), f=freq.join(" "), f2=freq.map(v=>(v*1.35).toFixed(4)).join(" ");
  el.insertAdjacentHTML("beforeend",`<svg class="fdefs" aria-hidden="true"><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="${oct}" seed="5" result="n">
      <animate attributeName="baseFrequency" dur="${dur}s" values="${f};${f2};${f}" repeatCount="indefinite"/></feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="${scale.toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
  return `url(#${id})`;
}
// el 안에 필터를 만들고 url(#id)를 돌려줌. size = 필터를 걸 요소의 한 변(px)
function lensFilter(el,type,size,anim){
  const id="fxf"+(++FILTER_SEQ), S=(2*LENS_DEF[type].M*size).toFixed(1);
  const a=anim?`<animate attributeName="scale" dur="4.5s" values="${(S*.5).toFixed(1)};${S};${(S*.5).toFixed(1)}" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/>`:"";
  el.insertAdjacentHTML("beforeend",`<svg class="fdefs" aria-hidden="true"><filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
    <feImage href="${lensMap(type)}" result="m" preserveAspectRatio="none"/>
    <feDisplacementMap in="SourceGraphic" in2="m" scale="${S}" xChannelSelector="R" yChannelSelector="G">${a}</feDisplacementMap></filter></svg>`);
  return `url(#${id})`;
}
function newCtx(){return {colors:[],img:[],tintK:1,transforms:[],anims:[],fxAnims:[],shadows:[],overlays:[],
  bg:[],frames:[],particles:[],acc:[],behind:[],badges:[],layers:[],lens:[],fisheye:false,decal:false,doppel:false,wcolor:false,invisible:false,reflect:false,doodle:false,silhouette:false,button:false,explode:false,satellite:false,opacity:1,pixel:false,clone:false}}

function spawn(layer,type,n,mini){
  const count=mini?Math.ceil(n/3):n;
  for(let i=0;i<count;i++){
    const s=document.createElement("span"); s.className="pt pt-"+type;
    const r=Math.random; let dur;
    if(type==="psparkle"){s.textContent=r()<.5?"✦":"✧";s.style.fontSize=(5+r()*5)+"cqw";
      s.style.left=r()*92+"%";s.style.top=r()*92+"%";dur=1.2+r()*1.6}
    else if(type==="sparkle"||type==="gold"){s.textContent="✦";s.style.fontSize=(type==="gold"?5+r()*5:3+r()*4)+"cqw";
      s.style.left=r()*90+"%";s.style.top=r()*90+"%";dur=1.6+r()*1.8}
    else if(type==="snow"){const z=.8+r()*1.6;s.style.width=s.style.height=z+"cqw";s.style.left=r()*100+"%";dur=5+r()*5}
    else if(type==="bubble"){const z=3+r()*5;s.style.width=s.style.height=z+"cqw";s.style.left=r()*95+"%";dur=5+r()*4}
    else if(type==="heart"){s.textContent="♥";s.style.fontSize=(3+r()*4)+"cqw";s.style.left=r()*92+"%";
      s.style.color=["#FF5C8A","#FF8FB1","#FF3B6B"][i%3];dur=4+r()*3}
    else if(type==="ember"){const z=.7+r()*1;s.style.width=s.style.height=z+"cqw";s.style.left=10+r()*85+"%";dur=3+r()*3}
    else if(type==="petal"){const z=2.6+r()*2.4;s.style.width=z+"cqw";s.style.height=(z*.72)+"cqw";s.style.left=r()*110+"%";
      s.style.opacity=(.75+r()*.25).toFixed(2);dur=6+r()*5}
    else if(type==="confetti"){s.style.width=(1.8+r()*1.4)+"cqw";s.style.height=(1+r()*.8)+"cqw";s.style.left=r()*100+"%";
      s.style.background=["#ff4d6d","#ffb84d","#ffe14a","#4dd2ff","#7a4dff","#4dff88","#ff7ef0"][i%7];
      s.style.setProperty("--sx",((r()-.5)*24).toFixed(1)+"cqw");s.style.setProperty("--sp",(r()<.5?-1:1)*(360+r()*540)+"deg");dur=3.2+r()*2.6}
    else if(type==="flake"){s.textContent="❄";s.style.fontSize=(2.4+r()*3)+"cqw";s.style.left=r()*100+"%";dur=8+r()*6}
    else if(type==="note"){s.textContent=["♪","♫","♬"][i%3];s.style.fontSize=(4+r()*4)+"cqw";s.style.left=r()*92+"%";
      s.style.color=["#ff7ef0","#6ff3ff","#ffe066","#b49bff"][i%4];dur=3.5+r()*2.5}
    else if(type==="rain"){s.style.left=(r()*110-5)+"%";s.style.height=(5+r()*5)+"cqw";dur=.45+r()*.35}
    else if(type==="mote"){const z=.6+r()*1;s.style.width=s.style.height=z+"cqw";s.style.left=(25+r()*50)+"%";dur=4+r()*4}
    else if(type==="star"){const z=.3+r()*.6;s.style.width=s.style.height=z+"cqw";s.style.left=r()*100+"%";s.style.top=r()*100+"%";dur=2+r()*3}
    s.style.animationDuration=dur+"s"; s.style.animationDelay=(-r()*dur)+"s";
    layer.appendChild(s);
  }
}

const BADGE={size:16,gap:2.5,edge:3.5}; // 크기·간격·여백 (무대 너비 대비 %)
function renderStage(el,ids,opt={}){
  const mini=!!opt.mini;
  const live=!mini&&!opt.bare&&!opt.still;
  if(el._timers) el._timers.forEach(clearTimeout);
  el._timers=[];
  if(el._cleanup) el._cleanup.forEach(f=>{try{f()}catch(e){}});
  el._cleanup=[]; el.style.transform=""; el.style.filter=""; el.classList.remove("bolt","tv-glitch");
  el.innerHTML=""; el.classList.toggle("mini",mini); el.classList.toggle("bare",!!opt.bare);
  const u=(opt.size||el.getBoundingClientRect().width||300)/100;
  const c=newCtx(); for(const id of sortIds(ids)) AMAP[id].apply(c);

  // background
  const bgs=[...c.bg].reverse(); // later-pushed attrs sit on top
  const imgs=bgs.map(b=>b.image), sizes=bgs.map(b=>b.size||"auto");
  imgs.push("radial-gradient(circle at 50% 38%,#FBFAFF,#E2DBFB 72%)"); sizes.push("auto");
  el.style.backgroundImage=opt.bare?"none":imgs.join(","); el.style.backgroundSize=sizes.join(",");
  const env={u,mini,live,el,ids,serial:opt.serial};

  /* 그리는 순서 (아래 → 위)
     1) 배경: 무대 배경색·그라데이션(c.bg) → 화면을 통째로 덮는 장면 레이어(scene: 하루, 신스웨이브, 만화경)
     2) 일부가 투명한 오브젝트: 뒤쪽 입자(별 등) → 빛살 → 뒤쪽 오브젝트 레이어(오로라 띠, 마법진, 블랙홀 …)
     3) 캐릭터 (테두리 포함)
     4) 캐릭터 앞 효과: 앞쪽 입자·레이어, 위성
     5) 배지 */
  const addLayers=(isBack,scene)=>{for(const L of c.layers) if(!!L.back===isBack&&!!L.scene===scene){
    const l=document.createElement("div");l.className="layer"+(scene?" scene":"");L.build(l,env);el.appendChild(l)}};
  addLayers(true,true);
  const back=c.particles.filter(p=>p.back), front=c.particles.filter(p=>!p.back);
  if(back.length){const l=document.createElement("div");l.className="layer";back.forEach(p=>spawn(l,p.type,p.n,mini));el.appendChild(l)}
  for(const b of c.behind){const d=document.createElement("div");d.className=b;el.appendChild(d)}
  addLayers(true,false);

  // frames (nested so all stay visible)
  const frames=document.createElement("div"); frames.className="frames"; el.appendChild(frames);
  let host=frames;
  const frameBuilds=[];
  for(const f of c.frames){const d=document.createElement("div");d.className="frame "+(typeof f==="string"?f:f.cls);host.appendChild(d);host=d;
    if(f.build) frameBuilds.push([d,f.build])}
  const content=document.createElement("div"); content.className="content"; host.appendChild(content);

  // animation wrappers (each animation on its own layer so they compose)
  let w=content;
  const wrap=cls=>{const d=document.createElement("div");d.className="w"+(cls?" "+cls:"");w.appendChild(d);w=d;return d};
  if(c.reflect) wrap("w-lift");
  for(const a of c.anims) wrap(a);
  const tw=wrap(); if(c.transforms.length) tw.style.transform=c.transforms.join(" ");
  const sw=wrap();
  { const fl=c.lens.map(t=>lensFilter(el,t,u*100,t==="swirl")).concat(c.shadows.map(f=>f(u)));
    if(fl.length) sw.style.filter=fl.join(" "); }
  if(c.fisheye) el.style.filter=lensFilter(el,"fisheye",u*100,false);
  for(const a of c.fxAnims) wrap(a);

  // the image + masked layers
  const src=c.pixel?PIXEL_IMAGE:BASE_IMAGE;
  const fx=document.createElement("div"); fx.className="fx";
  if(c.opacity<1) fx.style.opacity=c.opacity;
  const im=document.createElement("img"); im.className="base"+(c.pixel?" pix":""); im.src=src; im.alt="";
  if(c.img.length) im.style.filter=c.img.join(" ");
  if(c.invisible) im.style.visibility="hidden";
  fx.appendChild(im);
  const mask=`url("${src}")`;
  const addOv=(cls,style)=>{const d=document.createElement("div");d.className="ov "+(cls||"");
    d.style.webkitMaskImage=mask;d.style.maskImage=mask;Object.assign(d.style,style||{});fx.appendChild(d)};
  if(!c.invisible&&c.colors.length) addOv("",{background:mixColors(c.colors),mixBlendMode:"multiply",opacity:Math.min(.8,.72*c.tintK+.08)});
  if(!c.invisible) for(const o of c.overlays) addOv(o);
  if(!c.invisible&&c.silhouette) addOv("o-sil");
  for(const a of c.acc){const d=document.createElement("div");d.className="acc "+a.cls;if(a.text)d.textContent=a.text;if(a.html)d.innerHTML=a.html;fx.appendChild(d)}
  if(c.doodle){ const id="fxf"+(++FILTER_SEQ);
    el.insertAdjacentHTML("beforeend",`<svg class="fdefs" aria-hidden="true"><filter id="${id}" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="turbulence" baseFrequency="0.035" numOctaves="2" seed="1" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="${(1.4*u).toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
    fx.style.filter=`url(#${id})`;
    if(live){ const tb=el.querySelector(`#${id} feTurbulence`); let s=1;
      const boil=()=>{ if(!tb.isConnected) return; s=s%4+1; tb.setAttribute("seed",String(s*7)); el._timers.push(setTimeout(boil,130)); }; boil(); } }

  // 수채화: 윤곽이 번진 듯 살짝 흔들리고 부드러워짐 (정지)
  if(c.wcolor){ const id="fxf"+(++FILTER_SEQ);
    el.insertAdjacentHTML("beforeend",`<svg class="fdefs" aria-hidden="true"><filter id="${id}" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="9" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="${(1.5*u).toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feGaussianBlur in="d" stdDeviation="${(.05*u).toFixed(2)}"/></filter></svg>`);
    fx.style.filter=(fx.style.filter?fx.style.filter+" ":"")+`url(#${id})`; }
  // 도플갱어: 뒤에서 한 박자 늦게 따라 움직이는 검은 그림자 쨔무
  if(c.doppel){
    const k=fx.cloneNode(true); k.removeAttribute("tabindex"); k.removeAttribute("role"); k.classList.add("doppel");
    k.querySelectorAll(".acc").forEach(n=>n.remove()); w.appendChild(k);
  }
  // 데칼코마니: 왼쪽 절반을 거울처럼 오른쪽에 찍음
  if(c.decal){
    const k=fx.cloneNode(true); k.removeAttribute("tabindex"); k.removeAttribute("role");
    k.style.transform="scaleX(-1)"; k.style.clipPath="inset(-30% 49.6% -30% -30%)"; k.style.pointerEvents="none";
    fx.style.clipPath="inset(-30% 49.6% -30% -30%)";
    w.appendChild(k);
  }
  if(c.clone){
    for(const side of [-1,1]){const k=fx.cloneNode(true);k.classList.add("clone");
      k.style.transform=`translateX(${side*42}%) scale(.72)`;k.style.opacity=(c.opacity*.45).toFixed(2);w.appendChild(k)}
  }
  w.appendChild(fx);

  // 물결: 수면과 거꾸로 비친 모습
  if(c.reflect){
    const lift=content.firstElementChild, id="fxf"+(++FILTER_SEQ);
    el.insertAdjacentHTML("beforeend",`<svg class="fdefs" aria-hidden="true"><filter id="${id}" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.01 0.09" numOctaves="1" seed="3" result="n">
        <animate attributeName="baseFrequency" dur="5s" values="0.01 0.09;0.014 0.12;0.01 0.09" repeatCount="indefinite"/></feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="${(3*u).toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
    const water=document.createElement("div"); water.className="water";
    const refl=document.createElement("div"); refl.className="reflect"; refl.style.filter=`url(#${id})`;
    const k=lift.cloneNode(true); k.querySelectorAll("[tabindex],[role]").forEach(n=>{n.removeAttribute("tabindex");n.removeAttribute("role")});
    refl.appendChild(k);
    const hl=document.createElement("div"); hl.className="water-hl";
    content.insertBefore(water,lift); content.insertBefore(refl,lift); content.insertBefore(hl,lift);
  }

  if(front.length){const l=document.createElement("div");l.className="layer";front.forEach(p=>spawn(l,p.type,p.n,mini));el.appendChild(l)}
  addLayers(false,false);

  // satellite: plain base image orbiting the stage centre, untouched by other traits
  if(c.satellite){
    const orb=document.createElement("div"); orb.className="orbit";
    const sat=document.createElement("img"); sat.className="sat"; sat.src=BASE_IMAGE; sat.alt="";
    orb.appendChild(sat); el.appendChild(orb);
  }

  // badges: bottom-left, less rare first, equal spacing, never overlapping
  if(c.badges.length){
    const l=document.createElement("div"); l.className="layer badges";
    [...c.badges].sort((x,y)=>x.p-y.p).forEach((bd,i)=>{
      const im=document.createElement("img"); im.className="badge"; im.src=bd.src; im.alt="";
      im.style.left=`calc(${BADGE.edge}% + ${i}*(${BADGE.size}% + ${BADGE.gap}%))`;
      l.appendChild(im);
    });
    el.appendChild(l);
  }
  for(const [d,fn] of frameBuilds) fn(d,env);
  if(live){
    if(c.button) makeButton(fx);
    if(c.explode) el._timers.push(setTimeout(()=>explode(el,w,fx,u),1000));
  }
  el.setAttribute("aria-label", ids.length?("속성: "+sortIds(ids).map(i=>AMAP[i].name).join(", ")):"기본 이미지");
}


/* ---------------- 버튼 & 폭발 ---------------- */
function showAlert(msg){
  const t=performance.now();
  try{alert(msg)}catch(e){}
  // 샌드박스 등으로 alert가 막혀 즉시 반환되면 페이지 안의 알림 창으로 대신 표시
  if(performance.now()-t<30){const d=document.getElementById("alertBox");d.querySelector("p").textContent=msg;d.showModal()}
}
function makeButton(fx){
  fx.classList.add("is-button"); fx.tabIndex=0;
  fx.setAttribute("role","button"); fx.setAttribute("aria-label","쨔무쨔무 버튼");
  const press=()=>{fx.animate([{scale:"1"},{scale:".9"},{scale:"1"}],{duration:180,easing:"ease-out"});setTimeout(()=>showAlert("쨔무쨔무"),60)};
  fx.addEventListener("click",e=>{e.stopPropagation();press()});
  fx.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();press()}});
}
function explode(el,w,fx,u){
  if(!fx.isConnected) return;
  fx.animate([{filter:"brightness(1)"},{filter:"brightness(3.5)"}],{duration:140,fill:"forwards"});
  el._timers.push(setTimeout(()=>{
    if(!fx.isConnected) return;
    // 1) 이미지를 조각내어 흩날리기
    const N=12, frags=[];
    for(let i=0;i<N;i++){
      const a0=(i/N)*Math.PI*2+(Math.random()-.5)*.25, a1=((i+1)/N)*Math.PI*2+(Math.random()-.5)*.25, am=(a0+a1)/2;
      const P=(a,r)=>`${(50+r*Math.cos(a)).toFixed(1)}% ${(50+r*Math.sin(a)).toFixed(1)}%`;
      const k=fx.cloneNode(true); k.classList.remove("is-button"); k.classList.add("frag");
      k.removeAttribute("tabindex"); k.removeAttribute("role"); k.removeAttribute("aria-label");
      k.style.clipPath=`polygon(${P(am,4*Math.random())}, ${P(a0,95)}, ${P(am,110)}, ${P(a1,95)})`;
      const dist=45+Math.random()*55, rot=(Math.random()-.5)*540;
      k.animate([{transform:"translate(0,0) rotate(0)",opacity:1,filter:"brightness(2.5)"},
                 {offset:.15,filter:"brightness(1.3)"},
                 {transform:`translate(${(Math.cos(am)*dist).toFixed(1)}%,${(Math.sin(am)*dist).toFixed(1)}%) rotate(${rot.toFixed(0)}deg) scale(.7)`,opacity:0,filter:"brightness(1)"}],
                {duration:800+Math.random()*500,easing:"cubic-bezier(.12,.75,.3,1)",fill:"forwards"});
      frags.push(k);
    }
    for(const ch of [...w.children]) ch.style.visibility="hidden";
    el.querySelectorAll(".reflect").forEach(r=>r.remove());
    frags.forEach(k=>w.appendChild(k));
    // 2) 불꽃, 충격파, 불티, 연기
    const boom=document.createElement("div"); boom.className="layer boom";
    boom.innerHTML=`<div class="fireball"></div><div class="shock"></div><div class="shock s2"></div>`;
    for(let i=0;i<18;i++){const s=document.createElement("i");s.className="spark";
      s.style.setProperty("--a",(i*20+Math.random()*12)+"deg");s.style.animationDelay=(Math.random()*.08)+"s";
      s.style.setProperty("--d",(30+Math.random()*25)+"cqw");boom.appendChild(s)}
    for(let i=0;i<9;i++){const s=document.createElement("i");s.className="smoke";const a=Math.random()*Math.PI*2,r=8+Math.random()*16;
      s.style.setProperty("--dx",(Math.cos(a)*r)+"cqw");s.style.setProperty("--dy",(Math.sin(a)*r-6)+"cqh");
      s.style.filter=`blur(${1.2*u}px)`;s.style.animationDelay=(.05+Math.random()*.15)+"s";boom.appendChild(s)}
    el.appendChild(boom);
    el.animate([{transform:"translate(0,0)"},{transform:"translate(-1.5%,1%)"},{transform:"translate(1.2%,-1.2%)"},
      {transform:"translate(-.8%,-.6%)"},{transform:"translate(.6%,.8%)"},{transform:"translate(0,0)"}],{duration:420});
    el._timers.push(setTimeout(()=>{boom.remove();frags.forEach(k=>k.remove())},2600));
  },140));
}

function miniStage(ids,size,serial){
  const d=document.createElement("div"); d.className="stage"; d.style.width=size+"px";
  renderStage(d,ids,{mini:true,size,serial}); return d;
}

/* ---------------- state & storage ---------------- */
const COOLDOWN=1000, LS_KEY="henshin-gacha-v1";
const histMax=()=>owns("archive")?500:100;
let state={total:0,lastRollAt:0,history:[],combos:{},attrs:{},
  points:0,spent:0,owned:[],cfg:{},favs:[],names:{},showcase:[],manual:0,auto:0,hours:Array(24).fill(0)};
let lastRollInfo=null; // {ids, newAttrs:Set, newCombo, t}

function serialize(){
  return {v:1,total:state.total,lastRollAt:state.lastRollAt,history:state.history,attrs:state.attrs,
    points:state.points,spent:state.spent,owned:state.owned,cfg:state.cfg,favs:state.favs,names:state.names,showcase:state.showcase,
    manual:state.manual,auto:state.auto,hours:state.hours,
    combos:Object.entries(state.combos).map(([k,v])=>({k,c:v.c,f:v.f,l:v.l,...(v.n!=null?{n:v.n}:{})}))};
}
// 상점에서 빠진 품목을 이미 샀다면 포인트를 돌려줌
const REMOVED_ITEMS={notify:3000,palette:10000};
function refundRemoved(o){
  let points=o.points!=null?Math.max(0,+o.points||0):(o.total|0), spent=+o.spent||0;
  const owned=(Array.isArray(o.owned)?o.owned:[]).filter(x=>typeof x==="string");
  for(const [id,price] of Object.entries(REMOVED_ITEMS)) if(owned.includes(id)){points+=price;spent=Math.max(0,spent-price)}
  const cfg=(o.cfg&&typeof o.cfg==="object")?{...o.cfg}:{}; delete cfg.blink; delete cfg.notify; delete cfg.palette;
  return {points,spent,owned:owned.filter(x=>!(x in REMOVED_ITEMS)),cfg};
}
function deserialize(o){
  if(!o||typeof o!=="object") return null;
  const combos={};
  for(const e of (o.combos||[])){
    if(!e||typeof e.k!=="string") continue;
    const k=keyOf(idsOf(e.k)); const cur=combos[k];
    if(cur){cur.c+=e.c|0;cur.f=Math.min(cur.f,e.f||cur.f);cur.l=Math.max(cur.l,e.l||0);if(e.n!=null&&(cur.n==null||e.n<cur.n))cur.n=e.n}
    else combos[k]={c:e.c|0,f:e.f||0,l:e.l||0,...(e.n!=null?{n:e.n}:{})};
  }
  const arr=(x,f)=>Array.isArray(x)?x.filter(f):[], obj=x=>(x&&typeof x==="object"&&!Array.isArray(x))?{...x}:{};
  const hours=Array(24).fill(0); if(Array.isArray(o.hours)) o.hours.slice(0,24).forEach((v,i)=>hours[i]=+v||0);
  return {total:o.total|0,lastRollAt:+o.lastRollAt||0,history:Array.isArray(o.history)?o.history.slice(0,500):[],
    combos,attrs:obj(o.attrs),
    // 포인트: 저장된 값이 없으면 지금까지 굴린 횟수만큼 소급 지급
    points:o.points!=null?Math.max(0,+o.points||0):(o.total|0), spent:+o.spent||0,
    owned:arr(o.owned,x=>typeof x==="string"), cfg:obj(o.cfg), favs:arr(o.favs,x=>typeof x==="string"),
    names:obj(o.names), showcase:arr(o.showcase,x=>typeof x==="string").slice(0,6),
    manual:o.manual|0, auto:o.auto|0, hours, ...refundRemoved(o)};
}
function saveLocal(){try{localStorage.setItem(LS_KEY,JSON.stringify(serialize()))}catch(e){}}
function loadLocal(){try{return deserialize(JSON.parse(localStorage.getItem(LS_KEY)))}catch(e){return null}}

let remoteRef=null, writing=false, dirty=false;
async function pushRemote(){
  if(!remoteRef) return; if(writing){dirty=true;return}
  writing=true;
  try{await remoteRef.set(serialize())}
  catch(e){
    if(e&&e.code==="unavailable"){await new Promise(r=>setTimeout(r,800+Math.random()*800));try{await remoteRef.set(serialize())}catch(_){}} 
    else {remoteRef=null;setSaveInfo(false)}
  }
  writing=false; if(dirty){dirty=false;pushRemote()}
}
function persist(){saveLocal();pushRemote()}
function setSaveInfo(remote){$("#saveInfo").textContent=remote?"계정에 저장 중 (다른 기기에서도 이어서 할 수 있어요)":"이 브라우저에 저장 중"}

async function initRemote(){
  if(!window.claude||typeof window.claude.use!=="function") return;
  try{
    const [db,user]=await Promise.all([window.claude.use("db"),window.claude.use("user")]);
    if(!db||!user) return;
    const uid=await user.id(); if(!uid) return;
    const ref=db.doc("data/users/"+uid+"/save");
    const snap=await ref.get();
    const remote=snap.exists?deserialize(snap.data()):null;
    remoteRef=ref; setSaveInfo(true);
    if(remote&&remote.total>=state.total){state=remote;renderAll(true)}
    else pushRemote();
  }catch(e){remoteRef=null}
}

/* ---------------- game ---------------- */
const discovered = id=>(state.attrs[id]||0)>0;
const remaining = ()=>{const r=state.lastRollAt+COOLDOWN-Date.now();return (r>COOLDOWN||r<0)?0:r};
let previewIds=null; // dev mode


/* ---------------- 전체 화면 연출 (전설 이상 등급 / 희귀 특성) ---------------- */
const CINE_FROM=4;             // TIERS 인덱스: 4=전설 이상이면 등급 연출
const TRAIT_CINE_MIN=100000;   // 확률이 1/10만 이하인 특성이 뜨면 특성 연출
const CINE_IN=1200, CINE_OUT=3000; // 암전 시간, 섬광 뒤 복귀 시간(ms)
const CINE_STYLE=[ // 등급별 색, 모으는 시간(ms), 빛줄기 수, 흔들림
  null,null,null,null,
  {c1:"#FFC93A",c2:"#FF8A00",hold:3750,streaks:80, shake:1},   // 전설
  {c1:"#FF3D6E",c2:"#FF9A3D",hold:4750,streaks:110,shake:1.5}, // 신화
  {c1:"#3FE3FF",c2:"#8C6BFF",hold:5750,streaks:140,shake:2},   // 초월
  {c1:"#FFE3A0",c2:"#B8860B",hold:7250,streaks:170,shake:2.5,stars:true},  // 태초
  {c1:"#FF6FD8",c2:"#6FE3FF",hold:8750,streaks:210,shake:3,stars:true,rainbow:true}, // 무한
];
// 특성 연출: 특성 자체 확률로 색과 길이를 정함 (1/10만 → 2.5초, 10배마다 +1.5초)
function traitStyle(p){
  const lg=Math.log10(p);
  const col=lg>=8?{c1:"#FFD76A",c2:"#FF9F1C"}:lg>=6?{c1:"#C58BFF",c2:"#6B4DFF"}:{c1:"#7FB2FF",c2:"#3FE3FF"};
  return {...col,hold:Math.round(2500+(lg-5)*1500),shake:lg>=7?1.5:1};
}
const CINE={active:false,finish:null};
const rmotion=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;

// 이 조합이 연출 대상인지: {level, traits, d, exact} 또는 null
function cineInfo(ids){
  const d=denOf(ids), t=tier(d), tierCine=!!(t&&t.i>=CINE_FROM);
  const rare=ids.filter(id=>AMAP[id]&&AMAP[id].p>=TRAIT_CINE_MIN).sort((a,b)=>AMAP[b].p-AMAP[a].p);
  if(!tierCine&&!rare.length) return null;
  return {level:tierCine?t.i:null,d,exact:denBig(ids).toLocaleString("ko-KR"),traits:rare};
}
/* ---------------- 연출 효과음 (Web Audio로 직접 합성, 음원 파일 없음) ---------------- */
const SFX={on:true,out:null,verb:null,noise:null};
try{SFX.on=localStorage.getItem("jj-sfx")!=="0"}catch(e){}
function audioCtx(){
  try{
    if(!KEEP.ctx){const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null; KEEP.ctx=new AC();}
    if(KEEP.ctx.state==="suspended"&&KEEP.ctx.resume) KEEP.ctx.resume().catch(()=>{});
    return KEEP.ctx;
  }catch(e){return null}
}
function sfxBus(ctx){
  if(SFX.out&&SFX.out.context===ctx) return SFX;
  const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.ratio.value=4; comp.connect(ctx.destination);
  const out=ctx.createGain(); out.gain.value=.5; out.connect(comp);
  // 잔향: 지수적으로 사라지는 잡음으로 만든 임펄스 응답
  const len=Math.floor(ctx.sampleRate*2.8), ir=ctx.createBuffer(2,len,ctx.sampleRate);
  for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3)}
  const verb=ctx.createConvolver(); verb.buffer=ir; const wet=ctx.createGain(); wet.gain.value=.38; verb.connect(wet).connect(out);
  const nb=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate), nd=nb.getChannelData(0);
  for(let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
  Object.assign(SFX,{out,verb,noise:nb}); return SFX;
}
// 짧은 음 하나: 소리 → (드라이 + 잔향)
function sfxTone(ctx,dest,f,t,dur,{type="sine",gain=.2,att=.005,rel=null,glide=null,verb=.6,detune=0}={}){
  // 효과음 팩: 음높이가 있는 소리의 음색만 바꿈 (폭발음 같은 낙하음은 그대로)
  const PK=glide==null?SFX.pack:null;
  if(PK==="chip"){type="square";gain*=.5;verb*=.12;rel=(rel??dur/4)*.7}
  else if(PK==="orgel"){type="sine";if(f<900)f*=2;rel=(rel??dur/4)*1.5;verb=Math.min(1.2,verb*1.4);gain*=1.1}
  else if(PK==="orch"){type="sawtooth";gain*=.55;att=Math.max(att,.05);verb*=1.1}
  const o=ctx.createOscillator(), g=ctx.createGain(); o.type=type; o.frequency.setValueAtTime(f,t); o.detune.value=detune;
  if(glide) o.frequency.exponentialRampToValueAtTime(glide,t+dur);
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(gain,t+att);
  g.gain.setTargetAtTime(0,t+att,rel??dur/4);
  if(PK==="orch"){const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=1900;o.connect(lp).connect(g)} else o.connect(g);
  g.connect(dest); if(verb){const s=ctx.createGain();s.gain.value=verb;g.connect(s).connect(SFX.verb)}
  o.start(t); o.stop(t+dur+(rel??dur/4)*6);
  return o;
}
function sfxNoise(ctx,dest,t,dur,{type="bandpass",f0=400,f1=6000,q=1,gain=.2,att=.01,verb=.4}={}){
  const s=ctx.createBufferSource(); s.buffer=SFX.noise; s.loop=true;
  const fl=ctx.createBiquadFilter(); fl.type=type; fl.Q.value=q; fl.frequency.setValueAtTime(f0,t); fl.frequency.exponentialRampToValueAtTime(f1,t+dur);
  const g=ctx.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(gain,t+att);
  s.connect(fl).connect(g).connect(dest); if(verb){const v=ctx.createGain();v.gain.value=verb;g.connect(v).connect(SFX.verb)}
  s.start(t); s.stop(t+dur+2); return g;
}
const SEMI=n=>Math.pow(2,n/12);
// 등급별·특성별 화음 (근음 Hz, 반음 간격)
const CINE_CHORD=[null,null,null,null,
  {root:261.63,iv:[0,4,7,12]},          // 전설: 다장조
  {root:293.66,iv:[0,4,7,12,14]},       // 신화: 라장조 add9
  {root:329.63,iv:[0,4,6,11,14]},       // 초월: 몽환적인 리디안
  {root:220.00,iv:[0,7,12,16,19,24]},   // 태초: 넓게 펼친 화음 + 징
  {root:261.63,iv:[0,4,7,11,14,16,19,23,24,28],arp:true}, // 무한: 무지개처럼 솟는 아르페지오
];
function traitChord(p){const lg=Math.log10(p);
  return lg>=8?{root:440,iv:[0,4,7,9,14,19]}:lg>=6?{root:349.23,iv:[0,3,7,10,14]}:{root:392,iv:[0,4,7,11]}}

/* 연출 하나의 소리. 미리 '모으기'까지 예약하고, flash()에서 터지는 소리를 냄 */
function cineSound({level,traitP,hold}){
  if(!SFX.on) return null;
  const ctx=audioCtx(); if(!ctx) return null; sfxBus(ctx);
  const isTrait=level==null, ch=isTrait?traitChord(traitP):CINE_CHORD[level];
  const big=isTrait?Math.min(3,Math.max(0,Math.log10(traitP)-5)/1.5):level-4;   // 0(가장 약함) ~ 4(무한)
  const t0=ctx.currentTime+.02, tc=t0+CINE_IN/1000, tf=tc+hold/1000;
  const pre=ctx.createGain(); pre.gain.value=1; pre.connect(SFX.out);
  const srcs=[];
  // 1) 암전: 낮게 깔리는 웅웅거림
  const dr=ctx.createBiquadFilter(); dr.type="lowpass"; dr.frequency.value=220; const dg=ctx.createGain();
  dg.gain.setValueAtTime(0,t0); dg.gain.linearRampToValueAtTime(.16,tc); dg.gain.linearRampToValueAtTime(.17,tf);
  dr.connect(dg).connect(pre);
  for(const dt of [-7,7]){const o=ctx.createOscillator();o.type="sawtooth";o.frequency.value=ch.root/4;o.detune.value=dt;o.connect(dr);o.start(t0);o.stop(tf+1);srcs.push(o)}
  // 2) 모으기: 음높이가 솟구치는 라이저 + 바람 소리
  const rf=ctx.createBiquadFilter(); rf.type="lowpass"; rf.Q.value=6; rf.frequency.setValueAtTime(300,tc); rf.frequency.exponentialRampToValueAtTime(7000,tf);
  const rg=ctx.createGain(); rg.gain.setValueAtTime(0,tc); rg.gain.linearRampToValueAtTime(isTrait?.04:.06,tf); rf.connect(rg).connect(pre);
  {const o=ctx.createOscillator(); o.type=isTrait?"triangle":"sawtooth"; o.frequency.setValueAtTime(ch.root/2,tc); o.frequency.exponentialRampToValueAtTime(ch.root*4,tf);
   o.connect(rf); o.start(tc); o.stop(tf+1); srcs.push(o);}
  const wg=sfxNoise(ctx,pre,tc,hold/1000,{f0:300,f1:9000,q:.8,gain:.001,verb:.2}); wg.gain.linearRampToValueAtTime(.085,tf);
  // 숫자가 올라가는 '틱' 소리: 점점 빨라짐
  for(let t=tc+.15,gap=.24;t<tf-.05;t+=gap,gap=Math.max(.035,gap*.93))
    sfxTone(ctx,pre,isTrait?2400:1800,t,.03,{type:"square",gain:.025,att:.001,rel:.012,verb:.15});
  // 특성 연출: 모으는 동안 높은 종소리가 반짝임
  if(isTrait) for(let t=tc+.3;t<tf-.2;t+=.18+Math.random()*.25)
    sfxTone(ctx,pre,ch.root*4*SEMI(ch.iv[Math.random()*ch.iv.length|0]),t,.5,{gain:.035,rel:.25,verb:1});
  // 섬광 직전 1.6초: 땅이 울리는 저음
  {const o=ctx.createOscillator(), g=ctx.createGain(); o.frequency.value=48; g.gain.setValueAtTime(0,tf-1.6); g.gain.linearRampToValueAtTime(.2,tf);
   const lfo=ctx.createOscillator(), lg=ctx.createGain(); lfo.frequency.value=11; lg.gain.value=.12; lfo.connect(lg).connect(g.gain);
   o.connect(g).connect(pre); o.start(Math.max(tc,tf-1.6)); lfo.start(Math.max(tc,tf-1.6)); o.stop(tf+1); lfo.stop(tf+1); srcs.push(o,lfo);}

  let done=false;
  return {flash(at){
    if(done) return; done=true; const t=at??ctx.currentTime;
    pre.gain.cancelScheduledValues(t); pre.gain.setValueAtTime(pre.gain.value,t); pre.gain.setTargetAtTime(0,t,.04);
    srcs.forEach(s=>{try{s.stop(t+.5)}catch(e){}});
    const post=ctx.createGain(); post.gain.value=1; post.connect(SFX.out);
    // 3) 섬광: 쾅 (저음 낙하 + 잡음 폭발)
    sfxTone(ctx,post,isTrait?90:120,t,1.3,{gain:isTrait?.45:.7,att:.002,rel:.35,glide:32,verb:.3});
    sfxNoise(ctx,post,t,1.4,{type:"lowpass",f0:9000,f1:300,q:.5,gain:isTrait?.3:.45,att:.003,verb:.6}).gain.setTargetAtTime(0,t+.05,.25);
    // 4) 화음: 등급이 높을수록 음이 많고 길게 울림
    const ring=2.2+big*.6;
    ch.iv.forEach((s,i)=>{const f=ch.root*SEMI(s), st=t+(ch.arp?i*.07:.02+i*.012);
      sfxTone(ctx,post,f,st,ring,{type:"triangle",gain:.11/Math.sqrt(1+i*.3),att:.01,rel:ring/3,verb:.9});
      sfxTone(ctx,post,f*2,st,ring*.6,{gain:.05,att:.005,rel:ring/5,verb:1,detune:4});});
    if(!ch.arp) sfxTone(ctx,post,ch.root/2,t+.02,ring,{type:"sawtooth",gain:.06,att:.03,rel:ring/3,verb:.5});
    // 태초·무한: 징
    if(big>=3) sfxTone(ctx,post,ch.root/2*1.01,t+.05,4,{gain:.18,att:.02,rel:1.4,verb:1,glide:ch.root/2*.97});
    // 높은 반짝임
    const n=isTrait?10:4+big*3;
    for(let i=0;i<n;i++){const s=ch.iv[i%ch.iv.length]+12*(2+(i/ch.iv.length|0)%2);
      sfxTone(ctx,post,ch.root*SEMI(s),t+.25+i*(isTrait?.09:.06),.6,{gain:.03,rel:.3,verb:1})}
    setTimeout(()=>{try{pre.disconnect()}catch(e){}},2000);
  }};
}
// 영웅: 연출 없이 결과가 나올 때 짧은 화음
const REVEAL_CHORD={3:{root:440,iv:[0,4,7,12,16]}};   // 영웅만 (희귀는 소리 없음)
function revealChord(level){
  if(!SFX.on) return;
  const ch=REVEAL_CHORD[level]; if(!ch) return;
  const ctx=audioCtx(); if(!ctx) return; sfxBus(ctx);
  const t=ctx.currentTime+.02, ring=level>=3?1.6:1.1;
  ch.iv.forEach((s,i)=>{const f=ch.root*SEMI(s), st=t+i*.045;
    sfxTone(ctx,SFX.out,f,st,ring,{type:"triangle",gain:.085/Math.sqrt(1+i*.3),att:.008,rel:ring/3,verb:.8});
    sfxTone(ctx,SFX.out,f*2,st,ring*.5,{gain:.035,att:.005,rel:ring/5,verb:1,detune:4})});
  if(level>=3) for(let i=0;i<4;i++) sfxTone(ctx,SFX.out,ch.root*4*SEMI(ch.iv[i%ch.iv.length]),t+.2+i*.06,.4,{gain:.022,rel:.2,verb:1});
}
function setSfx(on){
  SFX.on=on; try{localStorage.setItem("jj-sfx",on?"1":"0")}catch(e){}
  const tg=$("#sfxToggle"); if(tg) tg.checked=on;
  if(on){const ctx=audioCtx(); if(ctx){sfxBus(ctx); sfxTone(ctx,SFX.out,1046.5,ctx.currentTime+.02,.25,{gain:.08,rel:.1,verb:.6});
    sfxTone(ctx,SFX.out,1568,ctx.currentTime+.1,.35,{gain:.06,rel:.15,verb:.8})}}
}
function cinematic({level=null,d=1,exact="",traits=[],onFlash=()=>{},stage=null}){
  const TS=level!=null?CINE_STYLE[level]:null;
  const tName=level!=null?(tier(d)?.i===level?tier(d).n:TIERS[level].n):"";
  const top=traits.length?AMAP[traits[0]]:null;
  const TR=top?traitStyle(top.p):null;
  const S=TS||TR; const hold=Math.max(TS?TS.hold:0,TR?TR.hold:0);
  const snd=cineSound({level:TS?level:null,traitP:top?top.p:0,hold});
  const target=TS?d:top.p;
  const exactStr=TS?(exact||Math.round(d).toLocaleString("ko-KR")):top.p.toLocaleString("ko-KR");
  const names=traits.map(id=>esc(AMAP[id].name));
  const ov=document.createElement("dialog"); ov.id="cine";
  ov.className="cine "+(TS?"lv"+level:"trait")+(TS&&TS.rainbow?" rainbow":"");
  ov.style.setProperty("--c1",S.c1); ov.style.setProperty("--c2",S.c2); ov.style.setProperty("--hold",hold+"ms");
  if(TR){ov.style.setProperty("--t1",TR.c1);ov.style.setProperty("--t2",TR.c2)}
  ov.setAttribute("role","status");
  ov.setAttribute("aria-label",TS?`${tName} 등급, 1 / ${exactStr}`:`희귀 특성 ${AMAP[traits[0]].name}, 1 / ${exactStr}`);
  const text=TS
    ? `<b>${tName}</b><span class="cine-num">1 / 1</span>${names.length?`<em class="cine-traits">${names.join(", ")}</em>`:""}`
    : `<small class="cine-cap">희귀 특성</small><b>${names[0]}</b><span class="cine-num">1 / 1</span>${names.length>1?`<em class="cine-traits">+ ${names.slice(1).join(", ")}</em>`:""}`;
  ov.innerHTML=`<div class="cine-dim"></div><div class="cine-stars"></div><div class="cine-shake"><div class="cine-fx">
      <div class="cine-rays"></div><div class="cine-streaks"></div><div class="cine-core"></div>
      <div class="cine-sigil"><i></i><i></i><i></i></div>
      <div class="cine-ring"></div><div class="cine-ring r2"></div><div class="cine-ring r3"></div></div>
    <div class="cine-text">${text}</div></div>
    <div class="cine-flash"></div><p class="cine-skip">눌러서 건너뛰기</p>`;
  document.body.appendChild(ov); ov.showModal();
  ov.addEventListener("cancel",e=>{e.preventDefault();CINE.finish&&CINE.finish()});
  if(TS&&TS.stars){const st=ov.querySelector(".cine-stars");for(let i=0;i<110;i++){const s=document.createElement("i");
    s.style.left=Math.random()*100+"%";s.style.top=Math.random()*100+"%";s.style.animationDelay=(-Math.random()*3)+"s";
    const z=1+Math.random()*2.5;s.style.width=s.style.height=z+"px";st.appendChild(s)}}
  const sk=ov.querySelector(".cine-streaks"), vmax=Math.max(innerWidth,innerHeight), vh=innerHeight;
  if(TS){ // 등급: 빛줄기가 점점 촘촘하게 중앙으로
    for(let i=0;i<TS.streaks*hold/TS.hold;i++){
      const s=document.createElement("i"), a=Math.random()*360, R=vmax*(.45+Math.random()*.35);
      s.style.width=(40+Math.random()*140)+"px"; sk.appendChild(s);
      s.animate([{transform:`rotate(${a}deg) translateX(${R}px) scaleX(1)`,opacity:0},{opacity:1,offset:.3},
                 {transform:`rotate(${a}deg) translateX(0px) scaleX(.2)`,opacity:0}],
                {duration:600+Math.random()*700,delay:CINE_IN+Math.sqrt(Math.random())*(hold-700),easing:"cubic-bezier(.5,0,.9,.6)",fill:"both"});
    }
  } else { // 특성: 빛 입자가 아래에서 떠올라 문장 쪽으로 모임
    const n=Math.round(hold/45);
    for(let i=0;i<n;i++){
      const s=document.createElement("i"); s.className="rise"; const x=(Math.random()-.5)*vmax*.9, z=2+Math.random()*4;
      s.style.width=s.style.height=z+"px"; sk.appendChild(s);
      s.animate([{transform:`translate(${x}px,${vh*.6}px)`,opacity:0},{opacity:1,offset:.25},
                 {transform:`translate(${x*.08}px,0px)`,opacity:0}],
                {duration:1100+Math.random()*900,delay:CINE_IN+Math.sqrt(Math.random())*(hold-1000),easing:"cubic-bezier(.4,0,.8,.7)",fill:"both"});
    }
  }
  // 확률 숫자: 1부터 실제 값까지 커지며 올라감
  const num=ov.querySelector(".cine-num"); let raf=0, t0=0; const L=Math.log(Math.max(target,1));
  const tick=now=>{ if(!t0) t0=now; const p=Math.min(1,(now-t0)/hold);
    num.textContent="1 / "+Math.floor(Math.exp(L*p*p)).toLocaleString("ko-KR");
    if(p<1) raf=requestAnimationFrame(tick); };
  const timers=[]; let flashed=false, done=false, spot=null;
  CINE.active=true;
  const flash=()=>{ if(flashed) return; flashed=true; if(snd) snd.flash(); cancelAnimationFrame(raf); num.textContent="1 / "+exactStr;
    ov.classList.remove("rumble"); ov.classList.add("flash");
    ov.querySelector(".cine-shake").animate(
      [{transform:"translate(0,0)"},{transform:`translate(${-7*S.shake}px,${5*S.shake}px)`},{transform:`translate(${6*S.shake}px,${-6*S.shake}px)`},
       {transform:`translate(${-4*S.shake}px,${-3*S.shake}px)`},{transform:`translate(${2*S.shake}px,${2*S.shake}px)`},{transform:"translate(0,0)"}],{duration:500+150*S.shake});
    try{onFlash()}catch(e){console.error(e)}
    // 결과 무대만 밝게 비추는 스포트라이트
    const st=stage||document.getElementById("mainStage");
    if(st){ const r0=st.getBoundingClientRect(); if(r0.top<0||r0.bottom>innerHeight) st.scrollIntoView({block:"center"});
      const r=st.getBoundingClientRect(); spot=document.createElement("div"); spot.className="cine-spot";
      Object.assign(spot.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px",borderRadius:(r.width*.07)+"px"});
      ov.insertBefore(spot,ov.querySelector(".cine-flash"));
      timers.push(setTimeout(()=>spot.classList.add("on"),250)); }
  };
  const end=()=>{ if(done) return; done=true; timers.forEach(clearTimeout); flash(); ov.classList.add("out");
    setTimeout(()=>{ov.close();ov.remove();CINE.active=false},700); };
  requestAnimationFrame(()=>ov.classList.add("in"));
  timers.push(setTimeout(()=>{ov.classList.add("charge");raf=requestAnimationFrame(tick)},CINE_IN));
  timers.push(setTimeout(()=>ov.classList.add("rumble"),CINE_IN+hold-1600));
  timers.push(setTimeout(flash,CINE_IN+hold));
  timers.push(setTimeout(end,CINE_IN+hold+CINE_OUT+(level>=7?1500:0)));
  ov.addEventListener("click",end);
  CINE.finish=end;
}

/* 자동 굴리기: 켜 두면 AUTO_INTERVAL마다 저절로 굴리고, 직접 굴리기는 막힘 */
// [자동 굴리기를 켜 둔 시간(ms), 그때부터의 간격(ms)]
const AUTO_STEPS=[[0,2000],[5*60e3,3000],[15*60e3,4000],[30*60e3,5000],[60*60e3,10000],[180*60e3,30000]];
const AUTO={on:false,next:0,since:0};
function autoStep(){const e=Date.now()-AUTO.since;let k=0;AUTO_STEPS.forEach(([t],i)=>{if(e>=t)k=i});return k}
const autoInterval=()=>AUTO_STEPS[autoStep()][1];
const MANUAL_HINT="스페이스바로도 굴릴 수 있어요. 1초마다 한 번씩 굴릴 수 있어요.";
function autoHint(){
  const k=autoStep(), mins=Math.floor((Date.now()-AUTO.since)/60e3), nx=AUTO_STEPS[k+1];
  return `자동 굴리기 중이에요${mins?` (${mins}분째)`:""}. 지금은 ${AUTO_STEPS[k][1]/1000}초마다 굴려지고, 직접 굴리기는 막혀요.`+
    (nx?` ${nx[0]/60e3}분이 지나면 ${nx[1]/1000}초마다로 느려져요.`:"");
}
function renderAutoTip(){
  const k=AUTO.on?autoStep():-1, fmt=m=>m>=60?`${m/60}시간`:`${m}분`;
  const rows=AUTO_STEPS.map(([t,iv],i)=>{const nx=AUTO_STEPS[i+1];
    const range=nx?`${t?fmt(t/60e3):"처음"} ~ ${fmt(nx[0]/60e3)}`:`${fmt(t/60e3)} 이후`;
    return `<li${i===k?' class="now"':""}><span>${range}</span><b>${iv/1000}초</b></li>`}).join("");
  const html=`<strong>자동 굴리기 간격</strong><ul>${rows}</ul><em>오래 켜 둘수록 느려지고, 껐다 켜면 처음부터 시작해요.</em>
    <em class="focus-note"><b>저주파 재생</b>켜 둔 동안만 들리지 않는 20Hz 저음을 아주 작게 재생해요. 소리가 나는 탭은 브라우저가 멈추지 않아서, 다른 탭에 있어도 계속 굴러가요. 다른 탭에 있을 때도 효과음은 그대로 들려요.</em>`;
  const tip=$("#autoTip"); if(tip._k!==k){tip.innerHTML=html;tip._k=k}
}
/* 백그라운드 유지: 자동 굴리기 중에는 사람이 들을 수 없는 20Hz 저음을 아주 작게 재생.
   브라우저는 소리가 나는 탭의 타이머를 늦추거나 멈추지 않으므로, 다른 탭으로 옮겨도 계속 굴러감.
   20Hz·-54dBFS는 사람 귀의 가청 한계보다 훨씬 작고, 대부분의 노트북·폰 스피커는 이 음역을 아예 못 냄. */
const KEEP={ctx:null,gain:null,osc:null};
function keepAlive(on){
  try{
    if(on){
      if(KEEP.osc) return;
      const ctx=audioCtx(); if(!ctx) return;
      const osc=ctx.createOscillator(), g=ctx.createGain();
      osc.type="sine"; osc.frequency.value=20; g.gain.value=0;
      osc.connect(g).connect(ctx.destination); osc.start();
      g.gain.setTargetAtTime(0.002,ctx.currentTime,0.3);
      KEEP.osc=osc; KEEP.gain=g;
    } else if(KEEP.osc){
      // 자동 굴리기를 끄면 저주파 발생기 자체를 멈추고 없앰
      const {osc,gain}=KEEP, t=KEEP.ctx.currentTime;
      gain.gain.setTargetAtTime(0,t,0.08); osc.stop(t+0.5);
      osc.onended=()=>{try{osc.disconnect();gain.disconnect()}catch(e){}};
      KEEP.osc=null; KEEP.gain=null;
    }
  }catch(e){}
  renderLowNote();
}
function renderLowNote(){ const n=$("#lowNote"); if(n) n.hidden=!KEEP.osc; }
function setAuto(on){
  keepAlive(on);
  AUTO.on=on; AUTO.since=Date.now(); AUTO.next=AUTO.since+autoInterval();
  $("#autoRoll").checked=on; btn.classList.toggle("auto",on);
  $("#autoEvery").textContent=`${AUTO_STEPS[0][1]/1000}초마다`;
  $("#rollHint").textContent=on?autoHint():MANUAL_HINT;
  renderAutoTip();
}
function roll(src){
  if(AUTO.on&&src!=="auto") return;
  if(remaining()>0||CINE.active) return;
  previewIds=null; document.querySelectorAll("#devList input").forEach(i=>i.checked=false);
  const now=Date.now();
  const ids=ATTRS.filter(a=>rand()<1/a.p).map(a=>a.id);
  const newAttrs=new Set(ids.filter(id=>!discovered(id)));
  const key=keyOf(ids);
  const newCombo=!state.combos[key];
  state.total++; state.lastRollAt=now;
  for(const id of ids) state.attrs[id]=(state.attrs[id]||0)+1;
  const cb=state.combos[key]||{c:0,f:now,l:now,n:state.total}; cb.c++; cb.l=now; state.combos[key]=cb;
  state.history.unshift({a:ids,t:now,n:state.total}); if(state.history.length>histMax()) state.history.length=histMax();
  state.points++; if(src==="auto") state.auto++; else { state.manual++; playClick(); }
  state.hours[new Date().getHours()]++;
  lastRollInfo={ids,newAttrs,newCombo,t:now};
  persist();
  renderStats();
  const ci=cineInfo(ids);
  if(ci&&!rmotion()&&!document.hidden){
    cinematic({...ci,onFlash:()=>{renderMain(true);renderPanes()}});
  } else {
    renderMain(true); renderPanes();
    if(ci&&document.hidden) cineSoundOnly(ci);
  }
}
/* 다른 탭에 있을 때: 화면 연출은 생략하고 효과음만 그대로 재생 */
function cineSoundOnly({level,traits}){
  const top=traits&&traits.length?AMAP[traits[0]]:null;
  const hold=Math.max(level!=null?CINE_STYLE[level].hold:0, top?traitStyle(top.p).hold:0);
  const snd=cineSound({level,traitP:top?top.p:0,hold});
  if(snd) setTimeout(()=>snd.flash(),CINE_IN+hold);
}

/* ---------------- UI rendering ---------------- */
function chipsHTML(ids,newSet){
  if(!ids.length) return `<li class="chip">기본 이미지</li>`;
  return sortIds(ids).map(id=>{const a=AMAP[id];const t=tier(a.p);
    return `<li class="chip${t?" "+t.c:""}">${esc(a.name)} <small>1/${a.p.toLocaleString("ko-KR")}</small>${newSet&&newSet.has(id)?"<em>NEW</em>":""}</li>`}).join("");
}
function probHTML(ids,label){
  const d=denOf(ids),t=tier(d);
  return `<div class="prob"><span class="lbl">${label}</span><b>1 / ${fmtDen(d,denBig(ids))}</b>${t?`<span class="tier ${t.c}">${t.n}</span>`:""}</div>`;
}

function renderMain(fresh){
  const stage=$("#mainStage");
  const ids=previewIds||(state.history[0]?state.history[0].a:[]);
  renderStage(stage,ids,{serial:previewIds?null:(state.history[0]&&state.history[0].n)});
  const res=$("#result");
  if(previewIds){res.innerHTML=probHTML(ids,"미리보기 (저장되지 않음)")+`<ul class="chips">${chipsHTML(ids)}</ul>`;return}
  if(!state.history.length){res.innerHTML=`<div class="prob"><span class="lbl">아직 굴리지 않았어요</span><b>기본 이미지</b></div><p class="meta">굴리면 수십 가지 속성이 각자의 확률로 붙어요. 여러 속성이 한꺼번에 붙을 수도 있어요.</p>`;return}
  const info=(lastRollInfo&&lastRollInfo.t===state.history[0].t)?lastRollInfo:null;
  const cb=state.combos[keyOf(ids)];
  let meta="";
  if(info&&info.newCombo) meta="처음 뽑은 조합이에요.";
  else if(cb) meta=`이 조합을 ${cb.c}번 뽑았어요.`;
  res.innerHTML=probHTML(ids,info?"방금 나온 모습의 확률":"마지막으로 나온 모습의 확률")+
    `<ul class="chips">${chipsHTML(ids,info&&info.newAttrs)}</ul><p class="meta">${meta}</p>`;
  if(fresh&&info){
    stage.classList.remove("reveal"); void stage.offsetWidth; stage.classList.add("reveal");
    const t=tier(denOf(ids));
    if(t&&t.i>=BANNER_FROM){
      if(!CINE.active&&!cineInfo(ids)) revealChord(t.i);
      const b=document.createElement("div");b.className="banner "+t.c+(owns("banner")&&state.cfg.banner?" bs-"+state.cfg.banner:"");b.textContent=t.n+"!";
      stage.appendChild(b); setTimeout(()=>b.remove(),1900);
    }
  }
}

/* 포인트 표시는 전부 여기서만 갱신: 상단 통계, 상점 머리말, 상점 구매 버튼 */
let shownPoints=null;
function syncPoints(){
  const p=state.points, txt=p.toLocaleString("ko-KR"); shownPoints=p;
  $("#sPoints").textContent=txt;
  const sp=$("#shopPoints"); if(sp) sp.textContent=txt;
  document.querySelectorAll("#pane-shop .si-buy[data-price]").forEach(b=>{const ok=p>=+b.dataset.price;b.disabled=!ok;b.title=ok?"사기":"포인트가 부족해요"});
}
function renderStats(){
  const found=ATTRS.filter(a=>discovered(a.id)).length;
  $("#sTotal").textContent=state.total.toLocaleString("ko-KR");
  $("#sFound").textContent=`${found}/${ATTRS.length}`;
  $("#sCombos").textContent=Object.keys(state.combos).length.toLocaleString("ko-KR");
  $("#attrCount").textContent=`${found}/${ATTRS.length}`;
  syncPoints();
  if(owns("goldbtn")&&state.cfg.btn==="gold") $("#rollEngrave").textContent="No. "+state.total.toLocaleString("ko-KR");
}

let activeTab="hist";
function renderPanes(){ if(activeTab==="hist")renderHistory(); else if(activeTab==="col")renderCollection(); else if(activeTab==="attr")renderDex();
  else if(activeTab==="stats")renderStatsPane(); else if(activeTab==="shop")renderShop(); else if(activeTab==="set")renderSettings(); }

let histShown=50;
function renderHistory(){
  const pane=$("#pane-hist"); pane.innerHTML="";
  if(!state.history.length){pane.innerHTML=`<p class="empty">아직 굴린 기록이 없어요. 굴리기 버튼을 눌러 첫 모습을 뽑아 보세요.</p>`;return}
  const ul=document.createElement("ul"); ul.className="hist";
  state.history.slice(0,histShown).forEach(h=>{
    const li=document.createElement("li"); const b=document.createElement("button"); b.type="button";
    b.appendChild(miniStage(h.a,72,h.n));
    const names=document.createElement("div"); names.className="names";
    names.innerHTML=h.a.length?sortIds(h.a).map(id=>`<span>${esc(AMAP[id].name)}</span>`).join(""):`<span class="none">기본 이미지</span>`;
    const when=document.createElement("div"); when.className="when";
    when.innerHTML=`<b>1/${fmtDen(denOf(h.a),denBig(h.a))}</b>${ago(h.t)}`;
    b.append(names,when); b.onclick=()=>openViewer(h.a,h.n); li.appendChild(b); ul.appendChild(li);
  });
  pane.appendChild(ul);
  if(state.history.length>histShown){const b=document.createElement("button");b.type="button";b.className="more";b.textContent="더 보기";
    b.onclick=()=>{histShown+=50;renderHistory()};pane.appendChild(b)}
  const p=document.createElement("p");p.className="help";p.style.margin="12px 0 0";
  p.textContent=`최근 ${histMax()}개까지 보관해요.`+(owns("archive")?"":" 이전 결과는 도감에서 찾을 수 있어요.");pane.appendChild(p);
}

const filt={}; // id -> "in" | "out"
let minTier=0;  // 도감 등급 필터 (TIERS 인덱스)
let colLimit=60;
function renderCollection(){
  const fbox=$("#filters"); fbox.innerHTML="";
  for(const a of ATTRS){
    const b=document.createElement("button"); b.type="button"; b.className="fchip";
    if(!discovered(a.id)){b.classList.add("unknown");b.textContent="???";b.disabled=true;b.title="아직 뽑지 못한 속성";fbox.appendChild(b);continue}
    const s=filt[a.id]||""; b.dataset.s=s;
    b.textContent=(s==="in"?"+ ":s==="out"?"− ":"")+a.name;
    b.setAttribute("aria-label",a.name+(s==="in"?" 포함":s==="out"?" 제외":" 상관없음"));
    b.onclick=()=>{filt[a.id]=s===""?"in":s==="in"?"out":"";if(!filt[a.id])delete filt[a.id];colLimit=60;renderCollection()};
    fbox.appendChild(b);
  }
  const inc=Object.keys(filt).filter(k=>filt[k]==="in"), exc=Object.keys(filt).filter(k=>filt[k]==="out");
  $("#clearFilters").hidden=!(inc.length||exc.length||minTier);
  let all=Object.entries(state.combos).map(([k,v])=>({k,ids:idsOf(k),...v,d:denOf(idsOf(k))}));
  // 등급 필터: 뽑은 적 있는 가장 높은 등급까지만 선택지로 보여줌
  const topTier=all.reduce((m,e)=>{const t=tier(e.d);return Math.max(m,t?t.i:0)},0);
  const sel=$("#minTier"); if(minTier>topTier) minTier=0;
  sel.innerHTML=TIERS.slice(0,all.length?topTier+1:1).map((t,i)=>`<option value="${i}"${i===minTier?" selected":""}>${t.n} 이상</option>`).join("");
  $("#favOnlyWrap").hidden=!owns("fav"); const favOnly=owns("fav")&&$("#favOnly").checked;
  let list=all.filter(e=>inc.every(i=>e.ids.includes(i))&&!exc.some(i=>e.ids.includes(i))&&(tier(e.d)?.i??0)>=minTier&&(!favOnly||isFav(e.k)));
  const sort=$("#sort").value;
  list.sort(sort==="count"?(a,b)=>b.c-a.c||b.d-a.d:sort==="recent"?(a,b)=>b.l-a.l:(a,b)=>b.d-a.d||b.c-a.c);
  const totalHits=list.reduce((s,e)=>s+e.c,0);
  $("#colSummary").textContent=Object.keys(state.combos).length?`조건에 맞는 조합 ${list.length.toLocaleString("ko-KR")}개, 뽑은 횟수 합계 ${totalHits.toLocaleString("ko-KR")}번`:"";
  const grid=$("#colGrid"); grid.innerHTML="";
  if(!Object.keys(state.combos).length){grid.innerHTML=`<p class="empty" style="grid-column:1/-1">뽑은 모습이 여기에 모여요. 먼저 한 번 굴려 보세요.</p>`}
  else if(!list.length){grid.innerHTML=`<p class="empty" style="grid-column:1/-1">조건에 맞는 모습이 없어요. 속성을 눌러 조건을 바꿔 보세요.</p>`}
  list.slice(0,colLimit).forEach(e=>{
    const b=document.createElement("button"); b.type="button"; b.className="card";
    b.appendChild(miniStage(e.ids,110,e.n));
    const p=document.createElement("div");p.className="p";p.textContent=(isFav(e.k)?"★ ":"")+"1/"+fmtDen(e.d,denBig(e.ids));
    const n=document.createElement("div");n.className="n";const nm=comboName(e.k);
    n.textContent=nm||(e.ids.length?e.ids.map(i=>AMAP[i].name).join(", "):"기본 이미지"); if(nm) n.classList.add("named");
    const c=document.createElement("div");c.className="c";c.textContent=`${e.c}번 뽑음`;
    b.append(p,n,c); b.onclick=()=>openViewer(e.ids); grid.appendChild(b);
  });
  $("#colMore").hidden=list.length<=colLimit;
}

function renderDex(){
  const box=$("#dex"); box.innerHTML="";
  for(const a of ATTRS){
    const known=discovered(a.id);
    const d=document.createElement("div"); d.className="card"+(known?"":" unk");
    d.appendChild(miniStage(known?[a.id]:[],118));
    const nm=document.createElement("div");nm.className="nm";nm.textContent=known?a.name:"???";
    const p=document.createElement("div");p.className="c";
    p.textContent=known?`1/${a.p.toLocaleString("ko-KR")}, ${state.attrs[a.id]}번 나옴`:"???";
    d.append(nm,p); box.appendChild(d);
  }
}

function openViewer(ids,serial){
  const dlg=$("#viewer"); dlg.showModal();
  const cb=state.combos[keyOf(ids)];
  if(serial==null&&cb) serial=cb.n;
  dlg._serial=serial;
  renderStage($("#viewStage"),ids,{serial});
  $("#viewInfo").innerHTML=probHTML(ids,"이 모습이 나올 확률")+`<ul class="chips">${chipsHTML(ids)}</ul>`+
    (cb?`<p class="meta">${cb.c}번 뽑았어요. 마지막으로 뽑은 때: ${ago(cb.l)}</p>`:"");
  dlg._ids=ids;
  const ci=cineInfo(ids);
  if(ci){
    const b=document.createElement("button"); b.type="button"; b.className="replay"; b.textContent="연출 다시 보기";
    b.onclick=()=>{ if(CINE.active) return; const vs=$("#viewStage");
      cinematic({...ci,stage:vs,onFlash:()=>renderStage(vs,ids,{serial})}); };
    $("#viewInfo").appendChild(b);
  }
  viewerExtras(ids,serial);
}
$("#closeViewer").onclick=()=>$("#viewer").close();
$("#viewer").addEventListener("close",()=>{LAST_GIF=null});
$("#viewer").addEventListener("click",e=>{if(e.target.id==="viewer")e.target.close()});

/* tabs */
function showTab(name){
  activeTab=name;
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected",b.id==="tab-"+name?"true":"false"));
  document.querySelectorAll(".pane").forEach(p=>p.hidden=p.id!=="pane-"+name);
  renderPanes();
}
document.querySelectorAll(".tabs button").forEach(btn=>{ btn.onclick=()=>showTab(btn.id.replace("tab-","")); });
$("#sort").onchange=()=>{colLimit=60;renderCollection()};
$("#minTier").onchange=e=>{minTier=+e.target.value;colLimit=60;renderCollection()};
$("#favOnly").onchange=()=>{colLimit=60;renderCollection()};
$("#clearFilters").onclick=()=>{for(const k in filt)delete filt[k];minTier=0;renderCollection()};
$("#colMore").onclick=()=>{colLimit+=60;renderCollection()};

/* roll button */
const btn=$("#rollBtn");
btn.onclick=()=>roll("manual");
/* 키를 누르고 있어도 한 번만 굴림: 엔터/스페이스를 뗐다가 다시 눌러야 다음 굴리기 */
const heldKeys=new Set();
document.addEventListener("keydown",e=>{
  if(e.key!=="Enter"&&e.code!=="Space") return;
  if(e.repeat||heldKeys.has(e.code)){e.preventDefault();e.stopImmediatePropagation();return}
  heldKeys.add(e.code);
},true);
document.addEventListener("keyup",e=>heldKeys.delete(e.code),true);
addEventListener("blur",()=>heldKeys.clear());
$("#autoRoll").addEventListener("change",e=>setAuto(e.target.checked));

renderAutoTip();
// "2초마다"를 누르면 스위치는 그대로 두고 설명만 열고 닫음 (터치 기기용)
$("#autoEvery").addEventListener("click",e=>{e.preventDefault();e.stopPropagation();$(".tip-wrap").classList.toggle("open")});
document.addEventListener("click",e=>{if(!e.target.closest(".tip-wrap"))$(".tip-wrap").classList.remove("open")});
document.addEventListener("keydown",e=>{
  if(CINE.active){if(e.code==="Space"||e.key==="Enter"||e.key==="Escape"){e.preventDefault();CINE.finish&&CINE.finish()}return}
  if(e.code==="Space"&&!e.repeat&&!$("#viewer").open&&!$("#alertBox").open&&!/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)&&!document.activeElement.closest("[role=button]")){e.preventDefault();roll("manual")}
});
/* 자동 굴리기 판정은 화면 그리기(requestAnimationFrame)와 분리.
   requestAnimationFrame은 탭이 안 보이면 완전히 멈추기 때문에 타이머로 돌림. */
function autoPump(){
  if(!AUTO.on) return;
  const now=Date.now(), iv=autoInterval();
  if(CINE.active) AUTO.next=now+iv;          // 연출 중에는 대기, 끝난 뒤 한 간격 뒤에 다음 굴리기
  else if(now>=AUTO.next){ roll("auto"); AUTO.next=now+iv; }
}
setInterval(autoPump,250);
function tick(){
  if(state.points!==shownPoints) syncPoints();
  let r=remaining(), p=1-r/COOLDOWN, label;
  if(AUTO.on){
    const iv=autoInterval();
    const left=Math.max(0,AUTO.next-Date.now());
    p=Math.max(0,1-left/iv); label=`자동 굴리기 · ${Math.ceil(left/1000)}초 후`;
    const ev=`${iv/1000}초마다`; if($("#autoEvery").textContent!==ev) $("#autoEvery").textContent=ev;
    const hint=autoHint(); if($("#rollHint").textContent!==hint) $("#rollHint").textContent=hint;
    renderAutoTip();
    btn.classList.remove("ready"); btn.setAttribute("aria-disabled","true");
  } else {
    btn.classList.toggle("ready",r===0);
    btn.setAttribute("aria-disabled",r>0?"true":"false");
    label=r>0?`${Math.ceil(r/1000)}초 후 굴리기`:"굴리기";
  }
  btn.style.setProperty("--p",p.toFixed(3));
  if($("#rollLabel").textContent!==label)$("#rollLabel").textContent=label;
  requestAnimationFrame(tick);
}

/* history timestamps refresh */
setInterval(()=>{if(activeTab==="hist"&&!document.hidden)renderHistory()},30000);

/* resize → re-render full-size stages (filters use px) */
let rz; addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{renderMain(false);if($("#viewer").open)renderStage($("#viewStage"),$("#viewer")._ids,{serial:$("#viewer")._serial})},200)});

/* dev mode: open with #dev at the end of the address */
let devReady=false;
function setupDev(force){
  if(devReady||(!force&&location.hash!=="#dev")) return;
  devReady=true;
  const dc=$("#devCine"); dc.insertAdjacentHTML("beforeend","<span>등급 연출:</span>");
  for(let i=CINE_FROM;i<TIERS.length;i++){const b=document.createElement("button");b.type="button";b.textContent=TIERS[i].n;
    b.onclick=()=>{if(!CINE.active){const v=BigInt(TIERS[i].min)*37n/10n+123456789n;cinematic({level:i,d:Number(v),exact:v.toLocaleString("ko-KR")})}};dc.appendChild(b)}
  dc.insertAdjacentHTML("beforeend","<span style='margin-left:8px'>특성 연출:</span>");
  for(const id of ["rframe","halo","descent"]){const b=document.createElement("button");b.type="button";b.textContent=AMAP[id].name;
    b.onclick=()=>{if(!CINE.active)cinematic({traits:[id]})};dc.appendChild(b)}
  $("#dev").hidden=false;
  const list=$("#devList");
  for(const a of ATTRS){
    const l=document.createElement("label");
    l.innerHTML=`<input type="checkbox" value="${a.id}"> ${esc(a.name)} (1/${a.p.toLocaleString("ko-KR")})`;
    list.appendChild(l);
  }
  list.onchange=()=>{
    const ids=[...list.querySelectorAll("input:checked")].map(i=>i.value);
    previewIds=ids.length?ids:null; renderMain(false);
  };
}

/* =====================================================================
   포인트 · 상점 · 설정
   - 굴릴 때마다 1포인트 (직접·자동 모두). 상점 추가 전 기록은 굴린 횟수만큼 소급.
   - 상점 품목은 모두 화면·소리·정보 표시만 바꿈. 굴리기 횟수·확률·특성 해금에는 영향 없음.
   ===================================================================== */
const SHOP=[
  {cat:"화면 꾸미기",items:[
    {id:"cursor",   name:"커서 팩",           price:1000, desc:"별·하트·픽셀 화살표 커서"},
    {id:"btn_jelly",name:"버튼 스킨: 젤리",    price:2000, desc:"말랑하게 눌리는 둥근 버튼"},
    {id:"fonts",    name:"글꼴 세트",          price:3000, desc:"제목·숫자 글꼴: 손글씨, 둥근, 명조"},
    {id:"btn_pixel",name:"버튼 스킨: 픽셀",    price:3000, desc:"도트 게임 느낌의 각진 버튼"},
    {id:"btn_metal",name:"버튼 스킨: 금속",    price:4000, desc:"빛이 스치는 금속 버튼"},
    {id:"deco",     name:"무대 테두리 장식",   price:4000, desc:"무대 바깥 틀: 리본, 필름, 별"},
    {id:"th_pastel",name:"테마: 파스텔",       price:5000, desc:"분홍빛 파스텔 화면"},
    {id:"th_paper", name:"테마: 종이 노트",    price:6000, desc:"줄 노트 위에 그린 듯한 화면"},
    {id:"th_term",  name:"테마: 레트로 터미널",price:7000, desc:"초록 글자의 옛날 컴퓨터 화면"},
    {id:"th_neon",  name:"테마: 한밤 네온",    price:8000, desc:"어두운 밤에 빛나는 네온 화면"},
  ]},
  {cat:"연출과 소리",items:[
    {id:"click",    name:"굴리기 클릭음",      price:1500, desc:"직접 굴릴 때 나는 짧은 소리"},
    {id:"banner",   name:"등급 배너 스타일",   price:5000, desc:"\"희귀!\" 배너 모양: 도장, 네온 사인"},
    {id:"pk_chip",  name:"효과음 팩: 칩튠",    price:8000, desc:"8비트 게임기 소리"},
    {id:"pk_orgel", name:"효과음 팩: 오르골",  price:10000,desc:"맑고 높은 오르골 소리"},
    {id:"pk_orch",  name:"효과음 팩: 오케스트라",price:12000,desc:"현악기처럼 부드럽게 퍼지는 소리"},
  ]},
  {cat:"기록과 정보",items:[
    {id:"fmt",      name:"확률 표기 방식",     price:1000, desc:"지수, 전체 숫자, 한글 단위(1억 2,000만) 중 선택"},
    {id:"fav",      name:"즐겨찾기",           price:2000, desc:"도감 조합에 ★ 표시, ★만 보기"},
    {id:"naming",   name:"조합 이름 짓기",     price:4000, desc:"도감 조합에 내가 지은 이름 붙이기"},
    {id:"archive",  name:"기록 보관함 확장",   price:6000, desc:"최근 기록 보관 100개 → 500개"},
    {id:"stats",    name:"통계 탭",            price:10000,desc:"등급별 횟수, 가장 희귀한 결과, 직접/자동 비율, 시간대별 굴린 횟수"},
    {id:"cardsave", name:"결과 이미지 저장",   price:15000,desc:"확대 화면의 결과를 PNG 이미지로 저장 (무대만 / 카드)"},
  ]},
  {cat:"수집 꾸미기",items:[
    {id:"ti_1",     name:"칭호: 쨔무 입문자",  price:1000, desc:"제목 옆에 붙는 칭호", title:"쨔무 입문자"},
    {id:"ti_2",     name:"칭호: 새벽의 굴림꾼",price:3000, desc:"제목 옆에 붙는 칭호", title:"새벽의 굴림꾼"},
    {id:"ti_3",     name:"칭호: 쨔무 수집가",  price:6000, desc:"제목 옆에 붙는 칭호", title:"쨔무 수집가"},
    {id:"ti_4",     name:"칭호: 확률의 지배자",price:12000,desc:"제목 옆에 붙는 칭호", title:"확률의 지배자"},
    {id:"showcase", name:"진열장",             price:15000,desc:"상단에 대표 조합 최대 6개 전시"},
    {id:"ti_5",     name:"칭호: 전설의 쨔무러",price:20000,desc:"제목 옆에 붙는 칭호", title:"전설의 쨔무러"},
    {id:"goldbtn",  name:"금빛 굴리기 버튼",   price:30000,desc:"은은하게 빛나는 버튼, 총 굴린 횟수가 새겨짐"},
  ]},
];
const SHOP_ITEM=Object.fromEntries(SHOP.flatMap(c=>c.items).map(i=>[i.id,i]));
// 명예의 전당: 누적 사용 포인트에 따라 오르는 단계. 상단 "포인트" 칸의 배경색만 바꿈 (구매 없음)
const HOF=[{min:10000,n:"브론즈"},{min:30000,n:"실버"},{min:60000,n:"골드"},{min:100000,n:"플래티넘"},{min:200000,n:"다이아몬드"}];
const hofLevel=()=>{let k=-1;HOF.forEach((h,i)=>{if(state.spent>=h.min)k=i});return k};

function owns(id){ return state.owned.includes(id); }
function buy(id){
  const it=SHOP_ITEM[id]; if(!it||owns(id)||state.points<it.price) return;
  state.points-=it.price; state.spent+=it.price; state.owned.push(id);
  // 산 물건은 바로 적용
  const c=state.cfg;
  if(id.startsWith("th_")) c.theme=id.slice(3);
  else if(id.startsWith("btn_")) c.btn=id.slice(4);
  else if(id==="goldbtn") c.btn="gold";
  else if(id.startsWith("pk_")) c.pack=id.slice(3);
  else if(id.startsWith("ti_")) c.title=id;
  else if(id==="fonts") c.font="jua";
  else if(id==="deco") c.deco="ribbon";
  else if(id==="cursor") c.cursor="star";
  else if(id==="banner") c.banner="stamp";
  else if(id==="click") c.click=true;
  persist(); renderAll();
  toast(`${it.name}을(를) 샀어요. 설정 탭에서 바꿀 수 있어요.`);
}
function setCfg(k,v){ state.cfg[k]=v; persist(); renderAll(); }

/* ---------- 화면에 적용 ---------- */
function applyLook(){
  const c=state.cfg, R=document.documentElement;
  const theme=c.theme&&owns("th_"+c.theme)?c.theme:""; theme?R.dataset.skin=theme:delete R.dataset.skin;
  const font=owns("fonts")&&c.font?c.font:""; font?R.dataset.font=font:delete R.dataset.font;
  const cur=owns("cursor")&&c.cursor?c.cursor:""; cur?document.body.dataset.cursor=cur:delete document.body.dataset.cursor;
  const bt=$("#rollBtn"); bt.className=bt.className.replace(/\bsk-\w+/g,"").trim();
  const skin=c.btn==="gold"?(owns("goldbtn")?"gold":""):(c.btn&&owns("btn_"+c.btn)?c.btn:"");
  if(skin) bt.classList.add("sk-"+skin);
  $("#rollEngrave").textContent=skin==="gold"?"No. "+state.total.toLocaleString("ko-KR"):"";
  const sw=$("#stageWrap"); sw.className="stage-wrap"+(owns("deco")&&c.deco?" dc-"+c.deco:"");
  SFX.pack=c.pack&&owns("pk_"+c.pack)?c.pack:null;
  const tb=$("#titleBadge"), ti=c.title&&owns(c.title)?SHOP_ITEM[c.title].title:"";
  tb.hidden=!ti; tb.textContent=ti; tb.dataset.lv=ti?String(Object.keys(SHOP_ITEM).filter(k=>k.startsWith("ti_")).indexOf(c.title)+1):"";
  const hl=hofLevel(), pts=$(".stat.pts");
  if(hl>=0&&c.hof!==false){pts.dataset.hof=String(hl);pts.title="명예의 전당: "+HOF[hl].n} else {delete pts.dataset.hof;pts.removeAttribute("title")}
  $("#tab-stats").hidden=!owns("stats"); if(activeTab==="stats"&&!owns("stats")) activeTab="hist";
  renderShowcase();
}

/* ---------- 진열장 ---------- */
function renderShowcase(){
  const box=$("#showcase"), on=owns("showcase")&&state.cfg.showcase!==false&&state.showcase.length;
  box.hidden=!on; box.innerHTML=""; if(!on) return;
  const h=document.createElement("span"); h.className="sc-label"; h.textContent="진열장"; box.appendChild(h);
  for(const k of state.showcase){ if(!state.combos[k]) continue; const ids=idsOf(k);
    const b=document.createElement("button"); b.type="button"; b.className="sc-item"; b.title=comboName(k)||(ids.map(i=>AMAP[i].name).join(", ")||"기본 이미지");
    b.appendChild(miniStage(ids,64,state.combos[k].n)); b.onclick=()=>openViewer(ids); box.appendChild(b); }
}

/* ---------- 즐겨찾기 · 이름 ---------- */
const isFav=k=>owns("fav")&&state.favs.includes(k);
const comboName=k=>owns("naming")?(state.names[k]||""):"";
function viewerExtras(ids,serial){
  const k=keyOf(ids), have=!!state.combos[k];
  const box=document.createElement("div"); box.className="vx";
  const nm=comboName(k); if(nm){const t=document.createElement("p");t.className="vx-name";t.textContent="“"+nm+"”";$("#viewInfo").prepend(t)}
  const btnX=(label,fn,on)=>{const b=document.createElement("button");b.type="button";b.className="vx-btn"+(on?" on":"");b.textContent=label;b.onclick=fn;box.appendChild(b);return b};
  if(have&&owns("fav")) btnX(isFav(k)?"★ 즐겨찾기":"☆ 즐겨찾기",()=>{const i=state.favs.indexOf(k);i<0?state.favs.push(k):state.favs.splice(i,1);persist();renderPanes();openViewer(ids,serial)},isFav(k));
  if(have&&owns("showcase")){const on=state.showcase.includes(k);
    btnX(on?"진열장에서 내리기":"진열장에 올리기",()=>{const i=state.showcase.indexOf(k);
      if(i>=0) state.showcase.splice(i,1); else { if(state.showcase.length>=6){toast("진열장은 6칸까지예요. 하나를 내린 뒤 올려 주세요.");return} state.showcase.push(k); }
      persist();renderShowcase();openViewer(ids,serial)},on)}
  // 저장: 모양(무대만 / 카드) 고르고 PNG(상점 품목) 또는 GIF(한 번에 300P)
  {
    const ex=document.createElement("div"); ex.className="vx-export";
    const shape=state.cfg.shotShape==="card"?"card":"stage";
    ex.innerHTML=`<div class="seg" role="radiogroup" aria-label="저장 모양">
        <button type="button" role="radio" data-v="stage" aria-checked="${shape==="stage"}">무대만</button>
        <button type="button" role="radio" data-v="card" aria-checked="${shape==="card"}">카드</button></div>`;
    ex.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{state.cfg.shotShape=b.dataset.v;persist();
      ex.querySelectorAll(".seg button").forEach(x=>x.setAttribute("aria-checked",x===b?"true":"false"))});
    const cur=()=>state.cfg.shotShape==="card"?"card":"stage";
    const mk=(label,cls)=>{const b=document.createElement("button");b.type="button";b.className="vx-btn "+cls;b.textContent=label;ex.appendChild(b);return b};
    if(owns("cardsave")){
      const pb=mk("PNG 저장","png");
      pb.onclick=async()=>{pb.disabled=true;pb.textContent="만드는 중…";
        try{ await saveFile(await shotPNG(ids,serial,cur()),shotName(serial,"png")); }catch(err){ toast("이미지를 만들지 못했어요."); console.error(err); }
        pb.disabled=false;pb.textContent="PNG 저장"};
    }
    const gb=mk(`GIF 만들기 · ${GIF_COST}P`,"gif");
    // 이미 결제하고 만든 GIF가 있으면 같은 조합·모양은 다시 저장만 (추가 차감 없음)
    const paid=()=>LAST_GIF&&LAST_GIF.k===keyOf(ids)&&LAST_GIF.shape===cur()?LAST_GIF:null;
    const label=()=>{gb.textContent=paid()?"GIF 다시 저장 (결제됨)":`GIF 만들기 · ${GIF_COST}P`};
    ex.querySelectorAll(".seg button").forEach(b=>b.addEventListener("click",label)); label();
    gb.onclick=async()=>{
      let g=paid();
      if(!g){
        if(state.points<GIF_COST){toast(`포인트가 모자라요. GIF 하나에 ${GIF_COST}포인트가 필요해요.`);return}
        gb.disabled=true;
        try{
          const blob=await shotGIF(ids,serial,cur(),(i,n,ph)=>{gb.textContent=ph==="enc"?"GIF로 묶는 중…":`장면 찍는 중 ${i}/${n}`});
          // 만들어진 순간에 차감
          state.points-=GIF_COST; state.spent+=GIF_COST; persist(); renderStats(); applyLook();
          g=LAST_GIF={k:keyOf(ids),shape:cur(),blob};
          toast(`GIF를 만들었어요. ${GIF_COST}포인트를 사용했어요. (${(blob.size/1048576).toFixed(1)}MB)`);
        }catch(err){ toast("GIF를 만들지 못했어요. 포인트는 그대로예요."); console.error(err); gb.disabled=false; label(); return; }
      }
      gb.disabled=true; gb.textContent="저장 중…";
      if(!await saveFile(g.blob,shotName(serial,"gif"))) toast("저장을 취소했어요. 이 창을 닫기 전까지는 추가 차감 없이 다시 저장할 수 있어요.",5000);
      gb.disabled=false; label();
    };
    if(state.points<GIF_COST) gb.title=`${GIF_COST}포인트가 필요해요`;
    box.appendChild(ex);
  }
  if(have&&owns("naming")){
    const w=document.createElement("label"); w.className="vx-name-edit";
    w.innerHTML=`<span>조합 이름</span><input type="text" maxlength="24" placeholder="이름 짓기">`;
    const inp=w.querySelector("input"); inp.value=state.names[k]||"";
    inp.onchange=()=>{const v=inp.value.trim(); if(v) state.names[k]=v; else delete state.names[k]; persist(); renderPanes(); renderShowcase();};
    box.appendChild(w);
  }
  if(box.children.length) $("#viewInfo").appendChild(box);
}

/* ---------- 결과 이미지 · GIF 저장 ----------
   화면을 SVG(foreignObject)에 그대로 담아 캔버스에 그림.
   GIF는 애니메이션을 멈춘 채 시간(--gt)을 조금씩 넘기며 장면을 찍고, 직접 만든 GIF 인코더로 묶음. */
const GIF_COST=300, GIF_FPS=20, GIF_SEC=3;
let LAST_GIF=null;   // 마지막으로 결제해서 만든 GIF (확대 화면을 닫으면 버림)
/* 이미지 안에 넣을 페이지 CSS를 실제 스타일시트에서 자동으로 긁어옴.
   1) 읽을 수 있는 스타일시트의 규칙  2) 같은 출처의 css 파일을 직접 받아오기 (웹 서버로 열었을 때)
   3) 둘 다 막혔을 때만 미리 넣어 둔 사본(#shotCss / window.SHOT_CSS) 사용 (파일을 더블클릭해 열었을 때) */
async function loadPageCSS(){
  if(loadPageCSS.c) return loadPageCSS.c;
  const ok=s=>s&&s.includes(".savecard");
  let out=[];
  for(const sh of [...document.styleSheets,...(document.adoptedStyleSheets||[])]){
    try{ for(const r of sh.cssRules) out.push(r.cssText); }
    catch(e){ if(sh.ownerNode&&sh.ownerNode.tagName==="STYLE") out.push(sh.ownerNode.textContent); }
  }
  let css=out.join("\n");
  if(!ok(css)){
    for(const l of document.querySelectorAll('link[rel="stylesheet"]')){
      try{ const u=new URL(l.href,location.href); if(u.origin!==location.origin) continue;
        const t=await (await fetch(u)).text(); if(ok(t)){ css=t; break; } }catch(e){}
    }
  }
  if(!ok(css)) css=(document.getElementById("shotCss")||{}).textContent||window.SHOT_CSS||css;
  return loadPageCSS.c=css;
}
function buildShot(ids,serial,shape){
  const d=denOf(ids), t=tier(d), k=keyOf(ids);
  const st=document.createElement("div"); st.className="stage"; st.style.width="520px"; st.style.height="520px";
  renderStage(st,ids,{still:true,size:520,serial});
  let node,W,H;
  if(shape==="stage"){ st.style.borderRadius="0"; node=st; W=H=520; }
  else{
    W=600; H=800;
    const card=document.createElement("div"); card.className="savecard "+(t?t.c:""); card.style.cssText=`width:${W}px;height:${H}px`;
    card.innerHTML=`<div class="sc-top"><b>jjyamu.rng</b>${t?`<span class="tier ${t.c}">${t.n}</span>`:""}</div>`;
    card.appendChild(st);
    const nm=comboName(k), traits=ids.length?sortIds(ids).map(i=>AMAP[i].name).join(", "):"기본 이미지";
    card.insertAdjacentHTML("beforeend",`<div class="sc-name">${esc(nm||traits)}</div>${nm?`<div class="sc-traits">${esc(traits)}</div>`:""}
      <div class="sc-prob">1 / ${fmtDen(d,denBig(ids))}</div><div class="sc-foot">${serial!=null?"No. "+Number(serial).toLocaleString("ko-KR"):""}</div>`);
    node=card;
  }
  const wrap=document.createElement("div"); wrap.className="shotroot"; wrap.style.cssText=`width:${W}px;height:${H}px`;
  const sty=document.createElement("style");
  sty.textContent=loadPageCSS.c+
    `\n.shotroot *::before,.shotroot *::after{animation-play-state:paused!important;animation-delay:calc(0s - var(--gt,0s))!important}`;
  wrap.append(sty,node);
  return {wrap,W,H};
}
// 화면 밖에 잠깐 붙여서 계산된 애니메이션 값을 읽고, 시간 변수로 바꿔 둔 SVG 문자열을 돌려줌
function shotTemplate(wrap,W,H){
  const host=document.createElement("div"); host.style.cssText="position:fixed;left:-20000px;top:0;pointer-events:none;opacity:1";
  host.appendChild(wrap); document.body.appendChild(host);
  for(const el of wrap.querySelectorAll("*")){
    const cs=getComputedStyle(el); if(!cs.animationName||cs.animationName==="none") continue;
    el.style.animationDelay=cs.animationDelay.split(",").map(d=>`calc(${d.trim()} - var(--gt))`).join(",");
    el.style.animationPlayState="paused";
  }
  wrap.querySelectorAll('feTurbulence[type="turbulence"]').forEach(f=>f.setAttribute("seed","__SEED__"));   // 낙서 선 떨림
  wrap.querySelectorAll("animate").forEach(a=>a.setAttribute("begin","__NEG__"));                            // SVG 필터 애니메이션
  wrap.style.setProperty("--gt","__T__");
  const x=new XMLSerializer().serializeToString(wrap);
  host.remove();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${x}</foreignObject></svg>`;
}
async function drawShot(tpl,t,g,w,h){
  const svg=tpl.replace(/__T__/g,t.toFixed(3)+"s").replace(/__NEG__/g,(-t).toFixed(3)+"s").replace(/__SEED__/g,String(7*(Math.floor(t/.13)%4+1)));
  const img=new Image(); img.decoding="sync";
  await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)});
  g.drawImage(img,0,0,w,h);
}
async function shotPNG(ids,serial,shape){
  await loadPageCSS();
  const {wrap,W,H}=buildShot(ids,serial,shape); const tpl=shotTemplate(wrap,W,H);
  const cv=document.createElement("canvas"); cv.width=W*2; cv.height=H*2; const g=cv.getContext("2d");
  await drawShot(tpl,0,g,W*2,H*2); await new Promise(r=>setTimeout(r,30)); g.clearRect(0,0,W*2,H*2); await drawShot(tpl,0,g,W*2,H*2);
  return await new Promise(r=>cv.toBlob(r,"image/png"));
}
async function shotGIF(ids,serial,shape,onProg){
  await loadPageCSS();
  const {wrap,W,H}=buildShot(ids,serial,shape); const tpl=shotTemplate(wrap,W,H);
  const s=shape==="stage"?360/W:360/W, w=Math.round(W*s), h=Math.round(H*s);
  const cv=document.createElement("canvas"); cv.width=w; cv.height=h; const g=cv.getContext("2d",{willReadFrequently:true});
  const n=GIF_FPS*GIF_SEC, frames=[];
  await drawShot(tpl,0,g,w,h);   // 첫 장은 글꼴·이미지 준비용
  for(let i=0;i<n;i++){
    g.fillStyle="#fff"; g.fillRect(0,0,w,h);
    await drawShot(tpl,i/GIF_FPS,g,w,h);
    frames.push(g.getImageData(0,0,w,h).data);
    onProg&&onProg(i+1,n);
    if(i%4===3) await new Promise(r=>setTimeout(r,0));
  }
  onProg&&onProg(n,n,"enc"); await new Promise(r=>setTimeout(r,20));
  return new Blob([gifEncode(frames,w,h,Math.round(100/GIF_FPS))],{type:"image/gif"});
}
/* GIF 인코더: 전체 장면에서 색을 모아 256색 팔레트(미디언 컷)를 만들고 LZW로 압축 */
function medianCut(px,n){
  const ch=(c,k)=>(c>>(16-8*k))&255;
  const info=b=>{let mn=[255,255,255],mx=[0,0,0];for(const c of b)for(let k=0;k<3;k++){const v=ch(c,k);if(v<mn[k])mn[k]=v;if(v>mx[k])mx[k]=v}
    const r=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]],k=r[1]>=r[0]&&r[1]>=r[2]?1:r[0]>=r[2]?0:2;return {b,k,score:r[k]*Math.sqrt(b.length)}};
  let boxes=[info(px)];
  while(boxes.length<n){
    let bi=-1,best=0; boxes.forEach((x,i)=>{if(x.b.length>1&&x.score>best){best=x.score;bi=i}}); if(bi<0)break;
    const {b,k}=boxes[bi]; b.sort((a,c)=>ch(a,k)-ch(c,k)); const m=b.length>>1;
    boxes.splice(bi,1,info(b.slice(0,m)),info(b.slice(m)));
  }
  return boxes.map(({b})=>{let r=0,g=0,bl=0;for(const c of b){r+=ch(c,0);g+=ch(c,1);bl+=ch(c,2)}const l=b.length||1;return [Math.round(r/l),Math.round(g/l),Math.round(bl/l)]});
}
function gifEncode(frames,W,H,delayCs){
  const step=Math.max(1,Math.floor(frames.length*W*H/80000)), samp=[]; let c=0;
  for(const f of frames) for(let i=0;i<W*H;i++) if((c++)%step===0) samp.push((f[i*4]<<16)|(f[i*4+1]<<8)|f[i*4+2]);
  const pal=medianCut(samp,256); while(pal.length<256) pal.push([0,0,0]);
  const cache=new Int16Array(32768).fill(-1);
  const near=(r,g,b)=>{const key=((r>>3)<<10)|((g>>3)<<5)|(b>>3);let v=cache[key];if(v>=0)return v;
    let bi=0,bd=1e12;for(let j=0;j<256;j++){const p=pal[j],dr=r-p[0],dg=g-p[1],db=b-p[2],d=2*dr*dr+4*dg*dg+3*db*db;if(d<bd){bd=d;bi=j}}
    return cache[key]=bi};
  const out=[]; const b8=v=>out.push(v&255), b16=v=>{out.push(v&255,(v>>8)&255)}, str=s=>{for(const ch of s)out.push(ch.charCodeAt(0))};
  str("GIF89a"); b16(W); b16(H); b8(0xF7); b8(0); b8(0);
  for(const p of pal) out.push(p[0],p[1],p[2]);
  out.push(0x21,0xFF,11); str("NETSCAPE2.0"); out.push(3,1,0,0,0);   // 무한 반복
  const idx=new Uint8Array(W*H);
  for(const f of frames){
    for(let i=0;i<W*H;i++) idx[i]=near(f[i*4],f[i*4+1],f[i*4+2]);
    out.push(0x21,0xF9,4,0); b16(delayCs); out.push(0,0);
    out.push(0x2C); b16(0); b16(0); b16(W); b16(H); out.push(0);
    out.push(8); const data=lzw(idx,8);
    for(let i=0;i<data.length;i+=255){const n=Math.min(255,data.length-i);out.push(n);for(let j=0;j<n;j++)out.push(data[i+j])}
    out.push(0);
  }
  out.push(0x3B);
  return new Uint8Array(out);
}
function lzw(idx,minCode){
  const out=[]; let cur=0,bits=0; const emit=(code,size)=>{cur|=code<<bits;bits+=size;while(bits>=8){out.push(cur&255);cur>>>=8;bits-=8}};
  const clear=1<<minCode, eoi=clear+1; let size=minCode+1, next=eoi+1, dict=new Map();
  emit(clear,size);
  let prefix=idx[0];
  for(let i=1;i<idx.length;i++){
    const k=idx[i], key=(prefix<<8)|k, v=dict.get(key);
    if(v!==undefined){prefix=v;continue}
    emit(prefix,size);
    if(next===4096){ emit(clear,size); dict=new Map(); size=minCode+1; next=eoi+1; }
    else { if(next>=(1<<size)) size++; dict.set(key,next++); }
    prefix=k;
  }
  emit(prefix,size); emit(eoi,size); if(bits>0) out.push(cur&255);
  return out;
}
async function saveFile(blob,name){
  const dl=window.claude&&window.claude.use?await window.claude.use("downloads"):null;
  if(dl){ try{ await dl.save({filename:name,data:blob}); return true; }
    catch(e){ if(e&&(e.code==="declined"||e.code==="rate_limited")) return false; } }
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000); return true;
}
const shotName=(serial,ext)=>`jjyamu${serial!=null?"-No"+serial:""}.${ext}`;

/* ---------- 클릭음 ---------- */
function playClick(){
  if(!SFX.on||!owns("click")||state.cfg.click===false) return;
  const ctx=audioCtx(); if(!ctx) return; sfxBus(ctx); const t=ctx.currentTime+.005;
  sfxTone(ctx,SFX.out,1318.5,t,.05,{type:"triangle",gain:.07,att:.002,rel:.025,verb:.1});
  sfxTone(ctx,SFX.out,1975.5,t+.03,.06,{type:"triangle",gain:.045,att:.002,rel:.03,verb:.15});
}

/* ---------- 알림 띠 ---------- */
function toast(msg,ms=3200){
  let t=$("#toast"); if(!t){t=document.createElement("div");t.id="toast";t.className="toast";t.setAttribute("role","status");document.body.appendChild(t)}
  t.textContent=msg; t.classList.add("on"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("on"),ms);
}

/* ---------- 상점 탭 ---------- */
function renderShop(){
  const pane=$("#pane-shop"); const sc=pane.scrollTop; pane.innerHTML="";
  const hl=hofLevel(), nx=HOF[hl+1];
  pane.insertAdjacentHTML("beforeend",`<div class="shop-head"><div><span>보유 포인트</span><b id="shopPoints">${state.points.toLocaleString("ko-KR")}</b></div>
    <p>굴릴 때마다 1포인트씩 쌓여요. 상점 물건은 화면과 소리만 바꾸고, 확률이나 굴리기에는 영향을 주지 않아요.</p>
    <p class="hof-line">명예의 전당: <b>${hl>=0?HOF[hl].n:"아직 없음"}</b> · 누적 사용 ${state.spent.toLocaleString("ko-KR")}포인트${nx?` · 다음 단계(${nx.n})까지 ${(nx.min-state.spent).toLocaleString("ko-KR")}`:""}</p></div>`);
  for(const c of SHOP){
    const sec=document.createElement("section"); sec.className="shop-cat"; sec.innerHTML=`<h3>${c.cat}</h3>`;
    const grid=document.createElement("div"); grid.className="shop-grid";
    for(const it of c.items){
      const own=owns(it.id), can=state.points>=it.price;
      const d=document.createElement("div"); d.className="shop-item"+(own?" owned":"");
      d.innerHTML=`<div class="si-name">${esc(it.name)}</div><div class="si-desc">${esc(it.desc)}</div>`;
      const b=document.createElement("button"); b.type="button"; b.className="si-buy";
      if(own){b.textContent="보유 중";b.disabled=true}
      else{b.textContent=it.price.toLocaleString("ko-KR")+"P";b.dataset.price=it.price;b.disabled=!can;b.title=can?"사기":"포인트가 부족해요";b.onclick=()=>buy(it.id)}
      d.appendChild(b); grid.appendChild(d);
    }
    sec.appendChild(grid); pane.appendChild(sec);
  }
  pane.scrollTop=sc;
}

/* ---------- 설정 탭 ---------- */
function renderSettings(){
  const pane=$("#pane-set"); pane.innerHTML=""; const c=state.cfg;
  const sec=title=>{const s=document.createElement("section");s.className="set-sec";s.innerHTML=`<h3>${title}</h3>`;pane.appendChild(s);return s};
  const row=(s,label,ctrl,note)=>{const r=document.createElement("div");r.className="set-row";
    const l=document.createElement("span");l.className="set-l";l.textContent=label;r.appendChild(l);
    const right=document.createElement("div");right.className="set-r";if(ctrl)right.appendChild(ctrl);
    if(note){const n=document.createElement("small");n.className="set-note";n.textContent=note;right.appendChild(n)}
    r.appendChild(right);s.appendChild(r)};
  const lock=ids=>{const b=document.createElement("button");b.type="button";b.className="set-lock";
    const ps=ids.map(i=>SHOP_ITEM[i].price), lo=Math.min(...ps);
    b.textContent=`🔒 상점에서 ${lo.toLocaleString("ko-KR")}P`+(ps.length>1?"부터":""); b.onclick=()=>showTab("shop"); return b};
  const toggle=(on,fn)=>{const l=document.createElement("label");l.className="auto-toggle set-sw";
    l.innerHTML=`<input type="checkbox" role="switch"${on?" checked":""}><span class="sw" aria-hidden="true"></span>`;
    l.querySelector("input").onchange=e=>fn(e.target.checked); return l};
  const select=(opts,val,fn)=>{const s=document.createElement("select");s.className="set-sel";
    s.innerHTML=opts.map(([v,n])=>`<option value="${v}"${v===(val||"")?" selected":""}>${n}</option>`).join(""); s.onchange=e=>fn(e.target.value); return s};
  // 선택지: 기본 + 산 것들. 하나도 없으면 상점 안내
  const choice=(s,label,key,variants,note)=>{
    const have=variants.filter(v=>owns(v.item));
    if(!have.length){row(s,label,lock([...new Set(variants.map(v=>v.item))]),note);return}
    row(s,label,select([["","기본"],...have.map(v=>[v.v,v.n])],c[key],v=>setCfg(key,v||undefined)),note)};

  let s=sec("소리");
  row(s,"효과음",toggle(SFX.on,on=>setSfx(on)),"영웅 이상 결과의 화음과 연출 효과음");
  choice(s,"효과음 팩","pack",[{v:"chip",n:"칩튠",item:"pk_chip"},{v:"orgel",n:"오르골",item:"pk_orgel"},{v:"orch",n:"오케스트라",item:"pk_orch"}]);
  owns("click")?row(s,"굴리기 클릭음",toggle(c.click!==false,on=>setCfg("click",on))):row(s,"굴리기 클릭음",lock(["click"]));
  if(SFX.on&&(SFX.pack||owns("click"))){const b=document.createElement("button");b.type="button";b.className="set-lock";b.textContent="▶ 미리 듣기";
    b.onclick=()=>{const ctx=audioCtx();if(!ctx)return;sfxBus(ctx);revealChord(3);setTimeout(playClick,900)};row(s,"",b)}

  s=sec("화면");
  choice(s,"테마","theme",[{v:"pastel",n:"파스텔",item:"th_pastel"},{v:"paper",n:"종이 노트",item:"th_paper"},{v:"term",n:"레트로 터미널",item:"th_term"},{v:"neon",n:"한밤 네온",item:"th_neon"}]);
  choice(s,"글꼴","font",[{v:"pen",n:"손글씨",item:"fonts"},{v:"jua",n:"둥근",item:"fonts"},{v:"batang",n:"명조",item:"fonts"}]);
  choice(s,"굴리기 버튼","btn",[{v:"jelly",n:"젤리",item:"btn_jelly"},{v:"pixel",n:"픽셀",item:"btn_pixel"},{v:"metal",n:"금속",item:"btn_metal"},{v:"gold",n:"금빛",item:"goldbtn"}]);
  choice(s,"무대 테두리","deco",[{v:"ribbon",n:"리본",item:"deco"},{v:"film",n:"필름",item:"deco"},{v:"stars",n:"별",item:"deco"}]);
  choice(s,"커서","cursor",[{v:"star",n:"별",item:"cursor"},{v:"heart",n:"하트",item:"cursor"},{v:"pixel",n:"픽셀 화살표",item:"cursor"}]);

  s=sec("연출");
  choice(s,"등급 배너","banner",[{v:"stamp",n:"도장",item:"banner"},{v:"neon",n:"네온 사인",item:"banner"}]);
  if(owns("banner")){const b=document.createElement("button");b.type="button";b.className="set-lock";b.textContent="▶ 연출 미리 보기";
    b.onclick=()=>{if(!CINE.active)cinematic({level:4,d:3.7e8,exact:"370,000,000"})};row(s,"",b)}

  s=sec("표시");
  owns("fmt")?row(s,"확률 표기",select([["","기본 (1조부터 지수)"],["full","전체 숫자"],["exp","지수 (1만부터)"],["kor","한글 단위"]],c.fmt,v=>setCfg("fmt",v||undefined)),"예: 1 / "+fmtDen(123456789,123456789n))
             :row(s,"확률 표기",lock(["fmt"]));
  const titles=SHOP.flatMap(x=>x.items).filter(i=>i.title);
  choice(s,"칭호","title",titles.map(i=>({v:i.id,n:i.title,item:i.id})));
  row(s,"명예의 전당 색",hofLevel()>=0?toggle(c.hof!==false,on=>setCfg("hof",on)):null,hofLevel()>=0?"상단 '포인트' 칸의 배경색이 단계에 따라 바뀌어요":"포인트를 1만 이상 쓰면 생겨요");
  owns("showcase")?row(s,"진열장 보이기",toggle(c.showcase!==false,on=>setCfg("showcase",on)),"도감에서 조합을 열어 진열장에 올릴 수 있어요"):row(s,"진열장",lock(["showcase"]));
}

/* ---------- 통계 탭 ---------- */
function renderStatsPane(){
  const pane=$("#pane-stats"); pane.innerHTML="";
  const all=Object.entries(state.combos).map(([k,v])=>({k,ids:idsOf(k),c:v.c,n:v.n,d:denOf(idsOf(k))}));
  const byTier=Array(TIERS.length).fill(0); let tot=0;
  for(const e of all){const t=tier(e.d); byTier[t?t.i:0]+=e.c; tot+=e.c}
  const pct=v=>!tot||!v?"0%":(v/tot*100).toFixed(v/tot<.001?3:1)+"%";
  const top=all.slice().sort((a,b)=>b.d-a.d)[0];
  const ma=state.manual+state.auto;
  const hmax=Math.max(1,...state.hours);
  pane.innerHTML=`<div class="st-grid">
      <div class="st-box"><span>굴린 횟수</span><b>${state.total.toLocaleString("ko-KR")}</b></div>
      <div class="st-box"><span>모은 조합</span><b>${all.length.toLocaleString("ko-KR")}</b></div>
      <div class="st-box"><span>발견한 속성</span><b>${ATTRS.filter(a=>discovered(a.id)).length}/${ATTRS.length}</b></div>
      <div class="st-box"><span>사용한 포인트</span><b>${state.spent.toLocaleString("ko-KR")}</b></div></div>
    <h3 class="st-h">등급별 횟수</h3>
    <table class="st-table">${TIERS.map((t,i)=>byTier[i]||i<=4?`<tr><td><span class="tier t${i}">${t.n}</span></td><td>${byTier[i].toLocaleString("ko-KR")}번</td><td>${pct(byTier[i])}</td></tr>`:"").join("")}</table>
    <h3 class="st-h">가장 희귀한 결과</h3><div class="st-top" id="stTop">${top?"":"<p class='help'>아직 없어요.</p>"}</div>
    <h3 class="st-h">직접 / 자동 <small>(v7부터 집계)</small></h3>
    ${ma?`<div class="st-bar"><i style="width:${(state.manual/ma*100).toFixed(1)}%"></i></div><p class="help">직접 ${state.manual.toLocaleString("ko-KR")}번 · 자동 ${state.auto.toLocaleString("ko-KR")}번</p>`:"<p class='help'>아직 집계된 굴리기가 없어요.</p>"}
    <h3 class="st-h">시간대별 굴린 횟수 <small>(v7부터 집계)</small></h3>
    <div class="st-hours">${state.hours.map((v,i)=>`<div title="${i}시: ${v.toLocaleString("ko-KR")}번"><i style="height:${(v/hmax*100).toFixed(1)}%"></i><span>${i%6===0?i:""}</span></div>`).join("")}</div>`;
  if(top){const b=document.createElement("button");b.type="button";b.className="card st-topcard";b.appendChild(miniStage(top.ids,96,top.n));
    const tt=tier(top.d);
    b.insertAdjacentHTML("beforeend",`<div><div class="p">1/${fmtDen(top.d,denBig(top.ids))} ${tt?`<span class="tier ${tt.c}">${tt.n}</span>`:""}</div>
      <div class="n">${esc(comboName(top.k)||(top.ids.map(i=>AMAP[i].name).join(", ")||"기본 이미지"))}</div><div class="c">${top.c}번 뽑음</div></div>`);
    b.onclick=()=>openViewer(top.ids); $("#stTop").appendChild(b)}
}

function renderAll(){applyLook();renderMain(false);renderStats();renderPanes()}

/* boot */
const local=loadLocal(); if(local) state=local;
setupDev();
/* 숨은 진입: 제목(jjyamu.rng)을 2초 안에 5번 누르면 개발용 패널이 열림 */
(function(){let n=0,t0=0;const h1=document.querySelector("h1");
  h1.addEventListener("click",()=>{const now=Date.now();if(now-t0>2000){n=0;t0=now}
    if(++n>=5){n=0;setupDev(true);$("#dev").scrollIntoView({behavior:"smooth",block:"center"})}});})();
renderAll();
requestAnimationFrame(tick);
initRemote();
