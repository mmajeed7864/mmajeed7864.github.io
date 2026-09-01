const BUILD = "0.3.0-symbio";
const FITCOACH_CHAT_API = "https://symbioai.dev/api/fitcoach-chat";
const FITCOACH_TRANSCRIBE_API = "https://symbioai.dev/api/fitcoach-transcribe";
const MODEL_MODES = Object.freeze({
  fast:{label:"Fast", detail:"DeepSeek Flash", models:["deepseek/deepseek-v4-flash"]},
  smart:{label:"Smart", detail:"Qwen Plus + fallback", models:["qwen/qwen3.7-plus","deepseek/deepseek-v4-flash"]},
  deep:{label:"Deep", detail:"Kimi K3 + Qwen fallback", models:["moonshotai/kimi-k3","qwen/qwen3.7-plus","deepseek/deepseek-v4-flash"]}
});
const ACCESS_CODE = "";
const ROUTES = ["today", "train", "coach", "progress", "profile"];
const ACTIONS = ["SAY_NOTHING","CHECK_IN","RECOVER_MISSED_SESSION","OFFER_PLAN_B","OFFER_MINIMUM_DOSE","MOVE_SESSION","RECOMMEND_REST","ASK_FOR_BLOCKER","CELEBRATE"];
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = (v="") => String(v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const todayISO = () => new Date().toLocaleDateString("en-CA");
const fmtTime = d => new Intl.DateTimeFormat([], {hour:"numeric",minute:"2-digit"}).format(d);
const fmtDate = d => new Intl.DateTimeFormat([], {month:"short",day:"numeric"}).format(d);
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const app = { founder:"mo", route:"today", obStep:0, deferredInstall:null, feedbackChoice:"", restTimer:null,
  chatBusy:false, voiceRecorder:null, voiceStream:null, voiceChunks:[], voiceTimer:null, voiceReplyRequested:false, toast:null };
const founders = { mo:{name:"Mohammed", initial:"M"}, ravi:{name:"Ravi", initial:"R"} };

function initialData(founder){
  return {
    founder, version:BUILD,
    profile:{onboarded:false,goal:"build muscle",experience:"intermediate",days:3,duration:45,equipment:"full gym",blocker:"time",tone:"Direct",quietStart:"21:30",quietEnd:"08:00",proactive:true,feedbackOptIn:true,energy:3,preferredDays:[1,3,5]},
    sessions:[], chat:[], feedback:[], decisions:[], memories:[], interventionOutcomes:[], activeWorkout:null,
    settings:{units:"lb",coachMode:"smart",speakReplies:true}, planProposals:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
  };
}
function key(){ return `fitcoach-founder:${app.founder}`; }
function load(){
  const base=initialData(app.founder);
  try{
    const stored=JSON.parse(localStorage.getItem(key())||"null")||{};
    return {...base,...stored,profile:{...base.profile,...(stored.profile||{})},settings:{...base.settings,...(stored.settings||{})},sessions:stored.sessions||[],chat:stored.chat||[],feedback:stored.feedback||[],decisions:stored.decisions||[],memories:stored.memories||[],interventionOutcomes:stored.interventionOutcomes||[],planProposals:stored.planProposals||[]};
  }catch{return base;}
}
function save(d){ d.updatedAt=new Date().toISOString(); localStorage.setItem(key(),JSON.stringify(d)); }
function setSession(){ localStorage.setItem("fitcoach-session",JSON.stringify({founder:app.founder,at:Date.now()})); }
function getSession(){ try{return JSON.parse(localStorage.getItem("fitcoach-session")||"null");}catch{return null;} }

function init(){
  const q = new URLSearchParams(location.search).get("route"); if(ROUTES.includes(q)) app.route=q;
  bindStatic();
  window.addEventListener("beforeinstallprompt", e=>{e.preventDefault();app.deferredInstall=e;$("#install").hidden=false;});
  window.addEventListener("appinstalled",()=>{$("#install").hidden=true;toast("FitCoach installed.");});
  window.addEventListener("online",onlineState); window.addEventListener("offline",onlineState); onlineState();
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
  const s=getSession(); if(s && founders[s.founder]){app.founder=s.founder; const d=load(); d.profile.onboarded?showShell():showOnboarding();}
}
function bindStatic(){
  $$(".founder").forEach(b=>b.addEventListener("click",()=>{app.founder=b.dataset.founder;$$(".founder").forEach(x=>x.classList.toggle("active",x===b));}));
  $("#enter").addEventListener("click",enterGate); $("#code").addEventListener("keydown",e=>{if(e.key==="Enter")enterGate();});
  $("#ob-back").addEventListener("click",()=>{if(app.obStep){app.obStep--;renderOnboarding();}});
  $("#ob-next").addEventListener("click",nextOnboarding); $("#ob-exit").addEventListener("click",exitToGate);
  $$(".nav-btn").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.route)));
  $("#avatar").addEventListener("click",()=>navigate("profile")); $("#feedback").addEventListener("click",()=>openFeedback());
  $("#install").addEventListener("click",installApp);
  $("#view").addEventListener("click",handleClick); $("#view").addEventListener("change",handleChange); $("#view").addEventListener("input",handleInput);
  $("#backdrop").addEventListener("click",closeSheet); $("#sheet").addEventListener("click",handleSheetClick);
}
function enterGate(){
  const ok=$("#code").value.trim().toUpperCase()===ACCESS_CODE; $("#gate-error").hidden=ok; if(!ok)return;
  setSession(); const d=load(); d.profile.onboarded?showShell():showOnboarding();
}
function exitToGate(){ localStorage.removeItem("fitcoach-session");$("#gate").hidden=false;$("#onboarding").hidden=true;$("#shell").hidden=true; }
function showOnboarding(){ $("#gate").hidden=true;$("#shell").hidden=true;$("#onboarding").hidden=false;app.obStep=0;renderOnboarding(); setTimeout(()=>{ if(!$("#onboarding").hidden){ app.obStep=0; renderOnboarding(); } },0); }
function showShell(){ $("#gate").hidden=true;$("#onboarding").hidden=true;$("#shell").hidden=false;render(); }
function navigate(route){ if(!ROUTES.includes(route))return;app.route=route;history.replaceState({},"",`?route=${route}`);render();window.scrollTo({top:0,behavior:"smooth"}); }
function onlineState(){ $("#offline").hidden=navigator.onLine; }

const goalOpts=[
  ["build muscle","Build muscle","Add size with progressive training","◢"],["get stronger","Get stronger","Push the big lifts and measurable PRs","↑"],["lose fat","Lose fat","Reduce body fat while protecting performance","◇"],["stay consistent","Stay consistent","Build a routine that survives real life","◎"]
];
const blockerOpts=[["time","Not enough time","My schedule breaks the plan","◴"],["motivation","Motivation drops","I know what to do but do not start","△"],["all-or-nothing","All or nothing","One miss turns into a lost week","↺"],["uncertainty","I second-guess the plan","I keep changing what I am doing","?"]];
const toneOpts=[["Supportive","Supportive","Calm, encouraging, no pressure"],["Direct","Direct","Tell me what matters and what to do"],["Strict","Strict","Hold the line without humiliation"],["Competitive","Competitive","Challenge me against my own record"]];

function renderOnboarding(){
  const d=load(),p=d.profile; $("#ob-label").textContent=`Step ${app.obStep+1} of 4`;$("#ob-progress").style.width=`${(app.obStep+1)*25}%`;$("#ob-back").disabled=!app.obStep;
  const body=$("#ob-body");
  if(app.obStep===0) body.innerHTML=`<h2>What are we building toward?</h2><p>Your coach uses one clear objective to decide what matters and what should wait.</p><div class="option-list">${goalOpts.map(([v,t,s,e])=>`<button class="option ${p.goal===v?'active':''}" data-ob="goal" data-value="${v}"><span class="emoji">${e}</span><span><b>${t}</b><small>${s}</small></span></button>`).join("")}</div>`;
  if(app.obStep===1) body.innerHTML=`<h2>Build a plan that fits your week.</h2><p>Real availability beats an ambitious plan you cannot repeat.</p><div class="form-grid"><div class="field"><label>Training days per week</label><div class="pills">${[2,3,4,5,6].map(n=>`<button class="pill ${+p.days===n?'active':''}" data-ob="days" data-value="${n}">${n} days</button>`).join("")}</div></div><div class="field"><label>Typical session length</label><div class="pills">${[20,30,45,60,75].map(n=>`<button class="pill ${+p.duration===n?'active':''}" data-ob="duration" data-value="${n}">${n} min</button>`).join("")}</div></div><div class="field"><label>Equipment</label><select id="ob-equipment"><option ${p.equipment==='full gym'?'selected':''}>full gym</option><option ${p.equipment==='home gym'?'selected':''}>home gym</option><option ${p.equipment==='dumbbells only'?'selected':''}>dumbbells only</option><option ${p.equipment==='bodyweight'?'selected':''}>bodyweight</option></select></div></div>`;
  if(app.obStep===2) body.innerHTML=`<h2>What usually gets in the way?</h2><p>The trainer should solve the real blocker, not send generic motivation.</p><div class="option-list">${blockerOpts.map(([v,t,s,e])=>`<button class="option ${p.blocker===v?'active':''}" data-ob="blocker" data-value="${v}"><span class="emoji">${e}</span><span><b>${t}</b><small>${s}</small></span></button>`).join("")}</div><div class="field" style="margin-top:22px"><label>Accountability style</label><div class="pills">${toneOpts.map(([v])=>`<button class="pill ${p.tone===v?'active':''}" data-ob="tone" data-value="${v}">${v}</button>`).join("")}</div></div>`;
  if(app.obStep===3) body.innerHTML=`<h2>Give the coach boundaries.</h2><p>Proactive coaching is opt-in. It should know when to speak, when to stay quiet, and when you want space.</p><div class="form-grid"><div class="field"><label>Quiet hours begin</label><input id="ob-qstart" type="time" value="${p.quietStart}"></div><div class="field"><label>Quiet hours end</label><input id="ob-qend" type="time" value="${p.quietEnd}"></div><label class="consent"><input id="ob-proactive" type="checkbox" ${p.proactive?'checked':''}><span><b>Allow proactive coaching</b><br>The coach may initiate a message only when it references a real fact and offers a useful action.</span></label><label class="consent"><input id="ob-feedback-opt" type="checkbox" ${p.feedbackOptIn?'checked':''}><span><b>Share founder-test feedback</b><br>Only build version, screen, action and your rating are captured locally. Free-text coach conversations are not included in feedback telemetry.</span></label></div>`;
  body.onclick=e=>{const b=e.target.closest("[data-ob]");if(!b)return;const data=load();const field=b.dataset.ob;data.profile[field]=["days","duration"].includes(field)?+b.dataset.value:b.dataset.value;save(data);renderOnboarding();};
}
function nextOnboarding(){
  const d=load(),p=d.profile;
  if(app.obStep===1){p.equipment=$("#ob-equipment")?.value||p.equipment;}
  if(app.obStep===3){p.quietStart=$("#ob-qstart").value;p.quietEnd=$("#ob-qend").value;p.proactive=$("#ob-proactive").checked;p.feedbackOptIn=$("#ob-feedback-opt").checked;p.onboarded=true;d.memories=[`Goal: ${p.goal}`,`${p.days} days/week`,`${p.duration}-minute sessions`,`Main blocker: ${p.blocker}`,`Tone: ${p.tone}`];save(d);showShell();return;}
  save(d);app.obStep++;renderOnboarding();
}
