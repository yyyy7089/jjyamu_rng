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
function fmtDen(d){
  if(d<1e12) return Math.round(d).toLocaleString("ko-KR");
  const e=Math.floor(Math.log10(d)); const m=d/Math.pow(10,e);
  return m.toFixed(2)+" × 10"+String(e).split("").map(x=>SUP[+x]).join("");
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
  for(let i=TIERS.length-1;i>=0;i--) if(d>=TIERS[i].min) return {n:TIERS[i].n,c:"t"+i,i};
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
function newCtx(){return {colors:[],img:[],tintK:1,transforms:[],anims:[],fxAnims:[],shadows:[],overlays:[],
  bg:[],frames:[],particles:[],acc:[],behind:[],badges:[],layers:[],invisible:false,button:false,explode:false,satellite:false,opacity:1,pixel:false,clone:false}}

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
    else if(type==="mote"){const z=.6+r()*1;s.style.width=s.style.height=z+"cqw";s.style.left=(25+r()*50)+"%";dur=4+r()*4}
    else if(type==="star"){const z=.3+r()*.6;s.style.width=s.style.height=z+"cqw";s.style.left=r()*100+"%";s.style.top=r()*100+"%";dur=2+r()*3}
    s.style.animationDuration=dur+"s"; s.style.animationDelay=(-r()*dur)+"s";
    layer.appendChild(s);
  }
}

const BADGE={size:16,gap:2.5,edge:3.5}; // 크기·간격·여백 (무대 너비 대비 %)
function renderStage(el,ids,opt={}){
  const mini=!!opt.mini;
  if(el._timers) el._timers.forEach(clearTimeout);
  el._timers=[];
  el.innerHTML=""; el.classList.toggle("mini",mini);
  const u=(opt.size||el.getBoundingClientRect().width||300)/100;
  const c=newCtx(); for(const id of sortIds(ids)) AMAP[id].apply(c);

  // background
  const bgs=[...c.bg].reverse(); // later-pushed attrs sit on top
  const imgs=bgs.map(b=>b.image), sizes=bgs.map(b=>b.size||"auto");
  imgs.push("radial-gradient(circle at 50% 38%,#FBFAFF,#E2DBFB 72%)"); sizes.push("auto");
  el.style.backgroundImage=imgs.join(","); el.style.backgroundSize=sizes.join(",");

  for(const b of c.behind){const d=document.createElement("div");d.className=b;el.appendChild(d)}
  const back=c.particles.filter(p=>p.back), front=c.particles.filter(p=>!p.back);
  if(back.length){const l=document.createElement("div");l.className="layer";back.forEach(p=>spawn(l,p.type,p.n,mini));el.appendChild(l)}
  const addLayers=isBack=>{for(const L of c.layers) if(!!L.back===isBack){const l=document.createElement("div");l.className="layer";L.build(l,{u,mini});el.appendChild(l)}};
  addLayers(true);

  // frames (nested so all stay visible)
  const frames=document.createElement("div"); frames.className="frames"; el.appendChild(frames);
  let host=frames;
  for(const f of c.frames){const d=document.createElement("div");d.className="frame "+f;host.appendChild(d);host=d}
  const content=document.createElement("div"); content.className="content"; host.appendChild(content);

  // animation wrappers (each animation on its own layer so they compose)
  let w=content;
  const wrap=cls=>{const d=document.createElement("div");d.className="w"+(cls?" "+cls:"");w.appendChild(d);w=d;return d};
  for(const a of c.anims) wrap(a);
  const tw=wrap(); if(c.transforms.length) tw.style.transform=c.transforms.join(" ");
  const sw=wrap(); if(c.shadows.length) sw.style.filter=c.shadows.map(f=>f(u)).join(" ");
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
  for(const a of c.acc){const d=document.createElement("div");d.className="acc "+a.cls;if(a.text)d.textContent=a.text;fx.appendChild(d)}

  if(c.clone){
    for(const side of [-1,1]){const k=fx.cloneNode(true);k.classList.add("clone");
      k.style.transform=`translateX(${side*42}%) scale(.72)`;k.style.opacity=(c.opacity*.45).toFixed(2);w.appendChild(k)}
  }
  w.appendChild(fx);

  if(front.length){const l=document.createElement("div");l.className="layer";front.forEach(p=>spawn(l,p.type,p.n,mini));el.appendChild(l)}
  addLayers(false);

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
  if(!mini){
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

function miniStage(ids,size){
  const d=document.createElement("div"); d.className="stage"; d.style.width=size+"px";
  renderStage(d,ids,{mini:true,size}); return d;
}

/* ---------------- state & storage ---------------- */
const COOLDOWN=1000, HISTORY_MAX=100, LS_KEY="henshin-gacha-v1";
let state={total:0,lastRollAt:0,history:[],combos:{},attrs:{}};
let lastRollInfo=null; // {ids, newAttrs:Set, newCombo, t}

function serialize(){
  return {v:1,total:state.total,lastRollAt:state.lastRollAt,history:state.history,attrs:state.attrs,
    combos:Object.entries(state.combos).map(([k,v])=>({k,c:v.c,f:v.f,l:v.l}))};
}
function deserialize(o){
  if(!o||typeof o!=="object") return null;
  const combos={};
  for(const e of (o.combos||[])){
    if(!e||typeof e.k!=="string") continue;
    const k=keyOf(idsOf(e.k)); const cur=combos[k];
    if(cur){cur.c+=e.c|0;cur.f=Math.min(cur.f,e.f||cur.f);cur.l=Math.max(cur.l,e.l||0)}
    else combos[k]={c:e.c|0,f:e.f||0,l:e.l||0};
  }
  return {total:o.total|0,lastRollAt:+o.lastRollAt||0,history:Array.isArray(o.history)?o.history.slice(0,HISTORY_MAX):[],
    combos,attrs:(o.attrs&&typeof o.attrs==="object")?{...o.attrs}:{}};
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

function cinematic({level=null,d=1,exact="",traits=[],onFlash=()=>{}}){
  const TS=level!=null?CINE_STYLE[level]:null;
  const top=traits.length?AMAP[traits[0]]:null;
  const TR=top?traitStyle(top.p):null;
  const S=TS||TR; const hold=Math.max(TS?TS.hold:0,TR?TR.hold:0);
  const target=TS?d:top.p;
  const exactStr=TS?(exact||Math.round(d).toLocaleString("ko-KR")):top.p.toLocaleString("ko-KR");
  const names=traits.map(id=>esc(AMAP[id].name));
  const ov=document.createElement("div"); ov.id="cine";
  ov.className="cine "+(TS?"lv"+level:"trait")+(TS&&TS.rainbow?" rainbow":"");
  ov.style.setProperty("--c1",S.c1); ov.style.setProperty("--c2",S.c2); ov.style.setProperty("--hold",hold+"ms");
  if(TR){ov.style.setProperty("--t1",TR.c1);ov.style.setProperty("--t2",TR.c2)}
  ov.setAttribute("role","status");
  ov.setAttribute("aria-label",TS?`${TIERS[level].n} 등급, 1 / ${exactStr}`:`희귀 특성 ${AMAP[traits[0]].name}, 1 / ${exactStr}`);
  const text=TS
    ? `<b>${TIERS[level].n}</b><span class="cine-num">1 / 1</span>${names.length?`<em class="cine-traits">${names.join(", ")}</em>`:""}`
    : `<small class="cine-cap">희귀 특성</small><b>${names[0]}</b><span class="cine-num">1 / 1</span>${names.length>1?`<em class="cine-traits">+ ${names.slice(1).join(", ")}</em>`:""}`;
  ov.innerHTML=`<div class="cine-dim"></div><div class="cine-stars"></div><div class="cine-shake"><div class="cine-fx">
      <div class="cine-rays"></div><div class="cine-streaks"></div><div class="cine-core"></div>
      <div class="cine-sigil"><i></i><i></i><i></i></div>
      <div class="cine-ring"></div><div class="cine-ring r2"></div><div class="cine-ring r3"></div></div>
    <div class="cine-text">${text}</div></div>
    <div class="cine-flash"></div><p class="cine-skip">눌러서 건너뛰기</p>`;
  document.body.appendChild(ov);
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
  const flash=()=>{ if(flashed) return; flashed=true; cancelAnimationFrame(raf); num.textContent="1 / "+exactStr;
    ov.classList.remove("rumble"); ov.classList.add("flash");
    ov.querySelector(".cine-shake").animate(
      [{transform:"translate(0,0)"},{transform:`translate(${-7*S.shake}px,${5*S.shake}px)`},{transform:`translate(${6*S.shake}px,${-6*S.shake}px)`},
       {transform:`translate(${-4*S.shake}px,${-3*S.shake}px)`},{transform:`translate(${2*S.shake}px,${2*S.shake}px)`},{transform:"translate(0,0)"}],{duration:500+150*S.shake});
    try{onFlash()}catch(e){console.error(e)}
    // 결과 무대만 밝게 비추는 스포트라이트
    const st=document.getElementById("mainStage");
    if(st){ const r0=st.getBoundingClientRect(); if(r0.top<0||r0.bottom>innerHeight) st.scrollIntoView({block:"center"});
      const r=st.getBoundingClientRect(); spot=document.createElement("div"); spot.className="cine-spot";
      Object.assign(spot.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px",borderRadius:(r.width*.07)+"px"});
      ov.insertBefore(spot,ov.querySelector(".cine-flash"));
      timers.push(setTimeout(()=>spot.classList.add("on"),250)); }
  };
  const end=()=>{ if(done) return; done=true; timers.forEach(clearTimeout); flash(); ov.classList.add("out");
    setTimeout(()=>{ov.remove();CINE.active=false},700); };
  requestAnimationFrame(()=>ov.classList.add("in"));
  timers.push(setTimeout(()=>{ov.classList.add("charge");raf=requestAnimationFrame(tick)},CINE_IN));
  timers.push(setTimeout(()=>ov.classList.add("rumble"),CINE_IN+hold-1600));
  timers.push(setTimeout(flash,CINE_IN+hold));
  timers.push(setTimeout(end,CINE_IN+hold+CINE_OUT+(level>=7?1500:0)));
  ov.addEventListener("click",end);
  CINE.finish=end;
}

function roll(){
  if(remaining()>0||CINE.active) return;
  previewIds=null; document.querySelectorAll("#devList input").forEach(i=>i.checked=false);
  const now=Date.now();
  const ids=ATTRS.filter(a=>rand()<1/a.p).map(a=>a.id);
  const newAttrs=new Set(ids.filter(id=>!discovered(id)));
  const key=keyOf(ids);
  const newCombo=!state.combos[key];
  state.total++; state.lastRollAt=now;
  for(const id of ids) state.attrs[id]=(state.attrs[id]||0)+1;
  const cb=state.combos[key]||{c:0,f:now,l:now}; cb.c++; cb.l=now; state.combos[key]=cb;
  state.history.unshift({a:ids,t:now}); if(state.history.length>HISTORY_MAX) state.history.length=HISTORY_MAX;
  lastRollInfo={ids,newAttrs,newCombo,t:now};
  persist();
  renderStats();
  const d=denOf(ids), t=tier(d);
  const tierCine=!!(t&&t.i>=CINE_FROM);
  const rare=ids.filter(id=>AMAP[id].p>=TRAIT_CINE_MIN).sort((a,b)=>AMAP[b].p-AMAP[a].p);
  if((tierCine||rare.length)&&!rmotion()){
    cinematic({level:tierCine?t.i:null,d,exact:denBig(ids).toLocaleString("ko-KR"),traits:rare,onFlash:()=>{renderMain(true);renderPanes()}});
  } else { renderMain(true); renderPanes(); }
}

/* ---------------- UI rendering ---------------- */
function chipsHTML(ids,newSet){
  if(!ids.length) return `<li class="chip">기본 이미지</li>`;
  return sortIds(ids).map(id=>{const a=AMAP[id];const t=tier(a.p);
    return `<li class="chip${t?" "+t.c:""}">${esc(a.name)} <small>1/${a.p.toLocaleString("ko-KR")}</small>${newSet&&newSet.has(id)?"<em>NEW</em>":""}</li>`}).join("");
}
function probHTML(ids,label){
  const d=denOf(ids),t=tier(d);
  return `<div class="prob"><span class="lbl">${label}</span><b>1 / ${fmtDen(d)}</b>${t?`<span class="tier ${t.c}">${t.n}</span>`:""}</div>`;
}

function renderMain(fresh){
  const stage=$("#mainStage");
  const ids=previewIds||(state.history[0]?state.history[0].a:[]);
  renderStage(stage,ids);
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
      const b=document.createElement("div");b.className="banner "+t.c;b.textContent=t.n+"!";
      stage.appendChild(b); setTimeout(()=>b.remove(),1900);
    }
  }
}

function renderStats(){
  const found=ATTRS.filter(a=>discovered(a.id)).length;
  $("#sTotal").textContent=state.total.toLocaleString("ko-KR");
  $("#sFound").textContent=`${found}/${ATTRS.length}`;
  $("#sCombos").textContent=Object.keys(state.combos).length.toLocaleString("ko-KR");
  $("#attrCount").textContent=`${found}/${ATTRS.length}`;
}

let activeTab="hist";
function renderPanes(){ if(activeTab==="hist")renderHistory(); else if(activeTab==="col")renderCollection(); else if(activeTab==="attr")renderDex(); }

function renderHistory(){
  const pane=$("#pane-hist"); pane.innerHTML="";
  if(!state.history.length){pane.innerHTML=`<p class="empty">아직 굴린 기록이 없어요. 굴리기 버튼을 눌러 첫 모습을 뽑아 보세요.</p>`;return}
  const ul=document.createElement("ul"); ul.className="hist";
  state.history.slice(0,50).forEach(h=>{
    const li=document.createElement("li"); const b=document.createElement("button"); b.type="button";
    b.appendChild(miniStage(h.a,72));
    const names=document.createElement("div"); names.className="names";
    names.innerHTML=h.a.length?sortIds(h.a).map(id=>`<span>${esc(AMAP[id].name)}</span>`).join(""):`<span class="none">기본 이미지</span>`;
    const when=document.createElement("div"); when.className="when";
    when.innerHTML=`<b>1/${fmtDen(denOf(h.a))}</b>${ago(h.t)}`;
    b.append(names,when); b.onclick=()=>openViewer(h.a); li.appendChild(b); ul.appendChild(li);
  });
  pane.appendChild(ul);
  if(state.history.length>50){const p=document.createElement("p");p.className="help";p.style.margin="12px 0 0";p.textContent="최근 50개까지 보여요. 이전 결과는 도감에서 찾을 수 있어요.";pane.appendChild(p)}
}

const filt={}; // id -> "in" | "out"
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
  $("#clearFilters").hidden=!(inc.length||exc.length);
  let list=Object.entries(state.combos).map(([k,v])=>({k,ids:idsOf(k),...v,d:denOf(idsOf(k))}))
    .filter(e=>inc.every(i=>e.ids.includes(i))&&!exc.some(i=>e.ids.includes(i)));
  const sort=$("#sort").value;
  list.sort(sort==="count"?(a,b)=>b.c-a.c||b.d-a.d:sort==="recent"?(a,b)=>b.l-a.l:(a,b)=>b.d-a.d||b.c-a.c);
  const totalHits=list.reduce((s,e)=>s+e.c,0);
  $("#colSummary").textContent=Object.keys(state.combos).length?`조건에 맞는 조합 ${list.length.toLocaleString("ko-KR")}개, 뽑은 횟수 합계 ${totalHits.toLocaleString("ko-KR")}번`:"";
  const grid=$("#colGrid"); grid.innerHTML="";
  if(!Object.keys(state.combos).length){grid.innerHTML=`<p class="empty" style="grid-column:1/-1">뽑은 모습이 여기에 모여요. 먼저 한 번 굴려 보세요.</p>`}
  else if(!list.length){grid.innerHTML=`<p class="empty" style="grid-column:1/-1">조건에 맞는 모습이 없어요. 속성을 눌러 조건을 바꿔 보세요.</p>`}
  list.slice(0,colLimit).forEach(e=>{
    const b=document.createElement("button"); b.type="button"; b.className="card";
    b.appendChild(miniStage(e.ids,110));
    const p=document.createElement("div");p.className="p";p.textContent="1/"+fmtDen(e.d);
    const n=document.createElement("div");n.className="n";n.textContent=e.ids.length?e.ids.map(i=>AMAP[i].name).join(", "):"기본 이미지";
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

function openViewer(ids){
  const dlg=$("#viewer"); dlg.showModal();
  renderStage($("#viewStage"),ids);
  const cb=state.combos[keyOf(ids)];
  $("#viewInfo").innerHTML=probHTML(ids,"이 모습이 나올 확률")+`<ul class="chips">${chipsHTML(ids)}</ul>`+
    (cb?`<p class="meta">${cb.c}번 뽑았어요. 마지막으로 뽑은 때: ${ago(cb.l)}</p>`:"");
  dlg._ids=ids;
}
$("#closeViewer").onclick=()=>$("#viewer").close();
$("#viewer").addEventListener("click",e=>{if(e.target.id==="viewer")e.target.close()});

/* tabs */
document.querySelectorAll(".tabs button").forEach(btn=>{
  btn.onclick=()=>{
    activeTab=btn.id.replace("tab-","");
    document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected",b===btn?"true":"false"));
    document.querySelectorAll(".pane").forEach(p=>p.hidden=p.id!=="pane-"+activeTab);
    renderPanes();
  };
});
$("#sort").onchange=()=>{colLimit=60;renderCollection()};
$("#clearFilters").onclick=()=>{for(const k in filt)delete filt[k];renderCollection()};
$("#colMore").onclick=()=>{colLimit+=60;renderCollection()};

/* roll button */
const btn=$("#rollBtn");
btn.onclick=roll;
document.addEventListener("keydown",e=>{
  if(CINE.active){if(e.code==="Space"||e.key==="Enter"||e.key==="Escape"){e.preventDefault();CINE.finish&&CINE.finish()}return}
  if(e.code==="Space"&&!e.repeat&&!$("#viewer").open&&!$("#alertBox").open&&!/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)&&!document.activeElement.closest("[role=button]")){e.preventDefault();roll()}
});
function tick(){
  const r=remaining();
  btn.classList.toggle("ready",r===0);
  btn.style.setProperty("--p",(1-r/COOLDOWN).toFixed(3));
  btn.setAttribute("aria-disabled",r>0?"true":"false");
  const label=r>0?`${Math.ceil(r/1000)}초 후 굴리기`:"굴리기";
  if($("#rollLabel").textContent!==label)$("#rollLabel").textContent=label;
  requestAnimationFrame(tick);
}

/* history timestamps refresh */
setInterval(()=>{if(activeTab==="hist"&&!document.hidden)renderHistory()},30000);

/* resize → re-render full-size stages (filters use px) */
let rz; addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{renderMain(false);if($("#viewer").open)renderStage($("#viewStage"),$("#viewer")._ids)},200)});

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

function renderAll(){renderMain(false);renderStats();renderPanes()}

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
