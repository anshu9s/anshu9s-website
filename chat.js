/*
  The Lounge: public chat.
  - Everyone can read. Talking needs a username.
  - Usernames are unique, claimed once, and tied to the visitor's browser.
  - Backend: Firebase (Firestore + anonymous auth). Rules are in firestore.rules.
  - Add ?demo to the URL to try the whole UI without any backend (messages stay on this device).
*/

import { firebaseConfig } from "./firebase-config.js";

const MAX_LEN=500;
const COOLDOWN_MS=1200;
const LOAD_LIMIT=60;
const NAME_RE=/^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;
const RESERVED=["admin","mod","moderator","system","owner","support","staff"]; /* keep in sync with firestore.rules */

const $=id=>document.getElementById(id);

const el={
live:$("chatLive"),
liveText:$("chatLiveText"),
log:$("chatLog"),
jump:$("chatJump"),
composer:$("composer"),
who:$("composerWho"),
msg:$("msgInput"),
send:$("sendBtn"),
count:$("msgCount"),
err:$("sendErr"),
join:$("joinForm"),
name:$("nameInput"),
joinBtn:$("joinBtn"),
hint:$("nameHint"),
handle:$("handleBody"),
navJoin:$("navJoin")
};

let adapter=null;
let me=null;
let lastSend=0;
let lastSeenId=null;
let firstRender=true;
let checkTimer=null;
let checkToken=0;

/* ---------- username rules ---------- */

function validate(raw){
const n=raw.trim();
if(n.length<3||n.length>20)return "Use 3 to 20 characters.";
if(!NAME_RE.test(n.toLowerCase()))return "Letters, numbers, _ and . only, starting and ending with a letter or number.";
if(RESERVED.includes(n.toLowerCase()))return "That name is reserved.";
return "";
}

/* ---------- small helpers ---------- */

function hue(name){
let h=0;
for(const c of name.toLowerCase())h=(h*31+c.charCodeAt(0))%360;
return h;
}

const timeFmt=new Intl.DateTimeFormat([],{hour:"numeric",minute:"2-digit"});

function dayLabel(ms){
const d=new Date(ms);
const t=new Date();
const y=new Date();
y.setDate(t.getDate()-1);
if(d.toDateString()===t.toDateString())return "Today";
if(d.toDateString()===y.toDateString())return "Yesterday";
return d.toLocaleDateString([],{day:"numeric",month:"short",year:d.getFullYear()===t.getFullYear()?undefined:"numeric"});
}

function setState(state,text){
el.live.dataset.state=state;
el.liveText.textContent=text;
}

function setHint(text,kind){
el.hint.textContent=text;
el.hint.className="hint"+(kind?" "+kind:"");
}

function makeAvatar(name,extra){
const a=document.createElement("div");
a.className="av"+(extra?" "+extra:"");
a.style.setProperty("--h",hue(name));
a.textContent=name.charAt(0).toUpperCase();
return a;
}

/* ---------- rendering ---------- */

function emptyState(title,body){
const box=document.createElement("div");
box.className="empty";
const b=document.createElement("b");
b.textContent=title;
const s=document.createElement("span");
s.textContent=body;
box.append(b,s);
return box;
}

function showNotice(title,body){
el.log.replaceChildren(emptyState(title,body));
}

function scrollToBottom(smooth){
el.log.style.scrollBehavior=smooth?"smooth":"auto";
el.log.scrollTop=el.log.scrollHeight;
el.jump.hidden=true;
}

function render(list){

const nearBottom=el.log.scrollHeight-el.log.scrollTop-el.log.clientHeight<90;

if(!list.length){
showNotice("It's quiet in here","No messages yet. Be the first to say hi.");
lastSeenId=null;
firstRender=false;
return;
}

const frag=document.createDocumentFragment();
let prev=null;

for(const m of list){

const label=dayLabel(m.ts);

if(!prev||dayLabel(prev.ts)!==label){
const d=document.createElement("div");
d.className="day";
d.textContent=label;
frag.append(d);
prev=null;
}

const grouped=prev&&prev.uid===m.uid&&m.ts-prev.ts<5*60*1000;
const mine=me&&m.uid===me.uid;

const row=document.createElement("div");
row.className="msg"+(grouped?"":" first")+(mine?" mine":"");
row.style.setProperty("--h",hue(m.name));

row.append(grouped?makeAvatar(m.name,"ghost"):makeAvatar(m.name));

const col=document.createElement("div");
col.className="bubble";

if(!grouped){
const meta=document.createElement("div");
meta.className="meta";
const nm=document.createElement("span");
nm.className="name";
nm.textContent=m.name;
meta.append(nm);
if(mine){
const you=document.createElement("span");
you.className="you";
you.textContent="you";
meta.append(you);
}
const tm=document.createElement("time");
tm.textContent=timeFmt.format(new Date(m.ts));
meta.append(tm);
col.append(meta);
}

const text=document.createElement("div");
text.className="text";
text.textContent=m.text;
col.append(text);

row.append(col);
frag.append(row);
prev=m;
}

el.log.replaceChildren(frag);

const last=list[list.length-1];
const newestMine=me&&last.uid===me.uid;

if(firstRender||nearBottom||newestMine){
scrollToBottom(!firstRender);
}else if(last.id!==lastSeenId){
el.jump.hidden=false;
}

lastSeenId=last.id;
firstRender=false;
}

function renderHandle(){

el.handle.replaceChildren();
el.navJoin.textContent=me?"@"+me.display:"Join chat ↗";

if(me){

const row=document.createElement("div");
row.className="me-row";
const info=document.createElement("div");
const b=document.createElement("b");
b.textContent="@"+me.display;
const s=document.createElement("small");
s.textContent="You're in. Say hi!";
info.append(b,s);
row.append(makeAvatar(me.display),info);

const note=document.createElement("p");
note.className="me-note";
note.textContent="This username is yours alone and is saved on this browser. It can't be changed or shared.";

el.handle.append(row,note);
return;
}

const p=document.createElement("p");
p.className="me-note";
p.style.marginTop="0";
p.textContent="You haven't picked a username yet. You can read everything without one. Pick one only when you want to talk.";

el.handle.append(p);

if(adapter){
const btn=document.createElement("button");
btn.type="button";
btn.className="btn me-btn";
btn.textContent="Pick a username";
btn.addEventListener("click",()=>{
el.name.scrollIntoView({block:"center",behavior:"smooth"});
el.name.focus({preventScroll:true});
});
el.handle.append(btn);
}
}

function setMe(m){
me=m;
el.composer.hidden=!m;
el.join.hidden=!!m;
if(m){
el.who.textContent="@"+m.display;
el.who.style.setProperty("--h",hue(m.display));
}
renderHandle();
}

/* ---------- backends ---------- */

async function createFirebase(cfg){

const base="https://www.gstatic.com/firebasejs/10.14.1/";

const [appMod,authMod,fs]=await Promise.all([
import(base+"firebase-app.js"),
import(base+"firebase-auth.js"),
import(base+"firebase-firestore.js")
]);

const app=appMod.initializeApp(cfg);
const auth=authMod.getAuth(app);
const db=fs.getFirestore(app);

const taken=()=>{const e=new Error("taken");e.code="taken";return e;};

const user=await new Promise(resolve=>{
const off=authMod.onAuthStateChanged(auth,u=>{off();resolve(u);});
});

let session=null;

if(user){
const snap=await fs.getDoc(fs.doc(db,"users",user.uid));
if(snap.exists())session={uid:user.uid,display:snap.data().display};
}

return {

mode:"firebase",
session,

subscribe(onList,onError){
const q=fs.query(fs.collection(db,"messages"),fs.orderBy("ts","desc"),fs.limit(LOAD_LIMIT));
return fs.onSnapshot(q,snap=>{
const list=snap.docs.map(d=>{
const x=d.data({serverTimestamps:"estimate"});
return {id:d.id,uid:x.uid,name:x.name,text:x.text,ts:x.ts?x.ts.toMillis():Date.now()};
}).reverse();
onList(list);
},onError);
},

async isAvailable(lower){
const snap=await fs.getDoc(fs.doc(db,"usernames",lower));
return !snap.exists();
},

async claim(display){

const lower=display.toLowerCase();
const cred=auth.currentUser||(await authMod.signInAnonymously(auth)).user;

const batch=fs.writeBatch(db);
batch.set(fs.doc(db,"usernames",lower),{uid:cred.uid,display,createdAt:fs.serverTimestamp()});
batch.set(fs.doc(db,"users",cred.uid),{username:lower,display,createdAt:fs.serverTimestamp()});

try{
await batch.commit();
}catch(e){
if(!(await this.isAvailable(lower)))throw taken();
throw e;
}

return {uid:cred.uid,display};
},

async send(text){
await fs.addDoc(fs.collection(db,"messages"),{
uid:me.uid,
name:me.display,
text,
ts:fs.serverTimestamp()
});
}

};
}

function createDemo(){

const MSGS="anshu.demo.messages";
const ME="anshu.demo.me";
const NAMES="anshu.demo.names";

const read=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch{return d;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};

const subs=new Set();
const emit=()=>{const list=read(MSGS,[]).slice(-LOAD_LIMIT);subs.forEach(f=>f(list));};

window.addEventListener("storage",e=>{if(e.key===MSGS)emit();});

return {

mode:"demo",
session:read(ME,null),

subscribe(onList){
subs.add(onList);
queueMicrotask(()=>onList(read(MSGS,[]).slice(-LOAD_LIMIT)));
return ()=>subs.delete(onList);
},

async isAvailable(lower){
return !read(NAMES,[]).includes(lower);
},

async claim(display){
const lower=display.toLowerCase();
const names=read(NAMES,[]);
if(names.includes(lower)){const e=new Error("taken");e.code="taken";throw e;}
names.push(lower);
write(NAMES,names);
const m={uid:"demo-"+Math.random().toString(36).slice(2,10),display};
write(ME,m);
return m;
},

async send(text){
const list=read(MSGS,[]);
list.push({id:Date.now()+"-"+Math.random().toString(36).slice(2,8),uid:me.uid,name:me.display,text,ts:Date.now()});
write(MSGS,list.slice(-200));
emit();
}

};
}

/* ---------- joining ---------- */

function queueAvailabilityCheck(){

clearTimeout(checkTimer);

const raw=el.name.value.trim();

if(!raw){setHint("","");return;}

const problem=validate(raw);
if(problem){setHint(problem,"bad");return;}

setHint("Checking…","");
const token=++checkToken;

checkTimer=setTimeout(async()=>{
try{
const free=await adapter.isAvailable(raw.toLowerCase());
if(token!==checkToken)return;
setHint(free?"@"+raw+" is free.":"@"+raw+" is already taken.",free?"ok":"bad");
}catch{
if(token===checkToken)setHint("","");
}
},350);
}

async function onJoin(e){

e.preventDefault();

if(!adapter)return;

const raw=el.name.value.trim();
const problem=validate(raw);

if(problem){setHint(problem,"bad");return;}

el.joinBtn.disabled=true;
setHint("Claiming…","");

try{

if(!(await adapter.isAvailable(raw.toLowerCase()))){
setHint("@"+raw+" is already taken.","bad");
return;
}

const m=await adapter.claim(raw);
setMe(m);
el.name.value="";
setHint("","");
render(currentList);
el.msg.focus({preventScroll:true});

}catch(error){

if(error&&error.code==="taken")setHint("@"+raw+" is already taken.","bad");
else{
console.error(error);
setHint("Couldn't join right now. Please try again.","bad");
}

}finally{
el.joinBtn.disabled=false;
}
}

/* ---------- sending ---------- */

function autoGrow(){
el.msg.style.height="auto";
el.msg.style.height=Math.min(el.msg.scrollHeight,120)+"px";
}

function updateCount(){
const n=el.msg.value.length;
el.count.textContent=n>400?n+" / "+MAX_LEN:"";
}

async function onSend(e){

e.preventDefault();

if(!me||!adapter)return;

const text=el.msg.value.trim();
if(!text)return;

el.err.textContent="";

if(Date.now()-lastSend<COOLDOWN_MS){
el.err.textContent="Slow down a little.";
return;
}

el.send.disabled=true;

try{
await adapter.send(text.slice(0,MAX_LEN));
lastSend=Date.now();
el.msg.value="";
autoGrow();
updateCount();
}catch(error){
console.error(error);
el.err.textContent="Couldn't send. Try again.";
}finally{
el.send.disabled=false;
el.msg.focus({preventScroll:true});
}
}

/* ---------- boot ---------- */

let currentList=[];

function lockJoin(message){
el.name.disabled=true;
el.joinBtn.disabled=true;
el.name.placeholder="chat is offline";
setHint(message,"");
}

async function boot(){

el.join.addEventListener("submit",onJoin);
el.composer.addEventListener("submit",onSend);
el.name.addEventListener("input",()=>{if(adapter)queueAvailabilityCheck();});
el.msg.addEventListener("input",()=>{autoGrow();updateCount();});
el.msg.addEventListener("keydown",e=>{
if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){
e.preventDefault();
el.composer.requestSubmit();
}
});
el.jump.addEventListener("click",()=>scrollToBottom(true));
el.log.addEventListener("scroll",()=>{
if(el.log.scrollHeight-el.log.scrollTop-el.log.clientHeight<40)el.jump.hidden=true;
},{passive:true});

renderHandle();
showNotice("Loading the chat…","One moment.");

const demo=new URLSearchParams(location.search).has("demo");

try{
if(demo)adapter=createDemo();
else if(firebaseConfig)adapter=await createFirebase(firebaseConfig);
}catch(error){
console.error(error);
adapter=null;
setState("offline","Offline");
showNotice("Can't reach the chat","The chat server didn't respond. Please try again in a bit.");
lockJoin("You can still look around the rest of the site.");
renderHandle();
return;
}

if(!adapter){
setState("offline","Not connected");
showNotice("Chat isn't switched on yet","This page is ready, but the chat server hasn't been connected. Anshu: follow SETUP.md, or add ?demo to the address to preview it.");
lockJoin("Chat will open once it's connected.");
renderHandle();
return;
}

if(adapter.mode==="demo"){
setState("demo","Demo · this device only");
}

setMe(adapter.session);

adapter.subscribe(list=>{
currentList=list;
if(adapter.mode==="firebase")setState("live","Live");
render(list);
},error=>{
console.error(error);
setState("offline","Offline");
showNotice("Can't load messages","The chat server refused or couldn't be reached. If you're the owner, check the Firestore rules in SETUP.md.");
});
}

boot();
