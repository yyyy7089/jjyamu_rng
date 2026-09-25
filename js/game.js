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
const denOf = ids=>ids.reduce((m,id)=>m*(AMAP[id]?AMAP[id].p:1),1);
/* 등급: 확률 1/N의 N이 min 이상이면 해당 등급 (1/100 미만은 등급 없음) */
const TIERS=[
  {min:1e2, n:"흔함"},  // 1/100
  {min:1e4, n:"드묾"},  // 1/1만
  {min:1e6, n:"희귀"},  // 1/100만
  {min:1e8, n:"영웅"},  // 1/1억
  {min:1e10,n:"전설"},  // 1/100억
  {min:1e12,n:"신화"},  // 1/1조
  {min:1e14,n:"초월"},  // 1/100조
  {min:1e16,n:"태초"},  // 1/1경
  {min:1e18,n:"무한"},  // 1/100경
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
  bg:[],frames:[],particles:[],acc:[],behind:[],badges:[],invisible:false,opacity:1,pixel:false,clone:false}}

function spawn(layer,type,n,mini){
  const count=mini?Math.ceil(n/3):n;
  for(let i=0;i<count;i++){
    const s=document.createElement("span"); s.className="pt pt-"+type;
    const r=Math.random; let dur;
    if(type==="sparkle"||type==="gold"){s.textContent="✦";s.style.fontSize=(type==="gold"?5+r()*5:3+r()*4)+"cqw";
      s.style.left=r()*90+"%";s.style.top=r()*90+"%";dur=1.6+r()*1.8}
    else if(type==="snow"){const z=.8+r()*1.6;s.style.width=s.style.height=z+"cqw";s.style.left=r()*100+"%";dur=5+r()*5}
    else if(type==="bubble"){const z=3+r()*5;s.style.width=s.style.height=z+"cqw";s.style.left=r()*95+"%";dur=5+r()*4}
    else if(type==="heart"){s.textContent="♥";s.style.fontSize=(3+r()*4)+"cqw";s.style.left=r()*92+"%";
      s.style.color=["#FF5C8A","#FF8FB1","#FF3B6B"][i%3];dur=4+r()*3}
    else if(type==="ember"){const z=.7+r()*1;s.style.width=s.style.height=z+"cqw";s.style.left=10+r()*85+"%";dur=3+r()*3}
    else if(type==="star"){const z=.3+r()*.6;s.style.width=s.style.height=z+"cqw";s.style.left=r()*100+"%";s.style.top=r()*100+"%";dur=2+r()*3}
    s.style.animationDuration=dur+"s"; s.style.animationDelay=(-r()*dur)+"s";
    layer.appendChild(s);
  }
}

const BADGE={size:16,gap:2.5,edge:3.5}; // 크기·간격·여백 (무대 너비 대비 %)
function renderStage(el,ids,opt={}){
  const mini=!!opt.mini;
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
  el.setAttribute("aria-label", ids.length?("속성: "+sortIds(ids).map(i=>AMAP[i].name).join(", ")):"기본 이미지");
}

function miniStage(ids,size){
  const d=document.createElement("div"); d.className="stage"; d.style.width=size+"px";
  renderStage(d,ids,{mini:true,size}); return d;
}

/* ---------------- state & storage ---------------- */
const COOLDOWN=2000, HISTORY_MAX=100, LS_KEY="henshin-gacha-v1";
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

function roll(){
  if(remaining()>0) return;
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
  renderMain(true); renderStats(); renderPanes();
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
  if(e.code==="Space"&&!e.repeat&&!$("#viewer").open&&!/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)){e.preventDefault();roll()}
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
function setupDev(){
  if(location.hash!=="#dev") return;
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
renderAll();
requestAnimationFrame(tick);
initRemote();
