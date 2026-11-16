/* Page effects and the little music player. Chat lives in chat.js. */

const finePointer=window.matchMedia("(hover:hover) and (pointer:fine)").matches;
const calm=window.matchMedia("(prefers-reduced-motion:reduce)").matches;

/* Scroll reveal */

if("IntersectionObserver" in window){

const observer=new IntersectionObserver(entries=>{
entries.forEach(entry=>{
if(entry.isIntersecting){
entry.target.classList.add("show");
observer.unobserve(entry.target);
}
});
},{threshold:.08});

document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));

}else{
document.querySelectorAll(".reveal").forEach(el=>el.classList.add("show"));
}

document.getElementById("year").textContent=new Date().getFullYear();

/* Scroll progress + header blur */

const header=document.querySelector(".top");
const progress=document.querySelector(".progress");

function onScroll(){
const max=document.documentElement.scrollHeight-window.innerHeight;
progress.style.transform="scaleX("+(max>0?Math.min(window.scrollY/max,1):0)+")";
header.classList.toggle("scrolled",window.scrollY>12);
}

window.addEventListener("scroll",onScroll,{passive:true});
onScroll();

/* Cursor effects (mouse devices only) */

if(finePointer && !calm){

const spot=document.querySelector(".spot");

window.addEventListener("pointermove",e=>{
spot.style.setProperty("--x",e.clientX+"px");
spot.style.setProperty("--y",e.clientY+"px");
},{passive:true});

const visual=document.querySelector(".visual");
const card=document.querySelector(".profile-card");

visual.addEventListener("pointermove",e=>{
const r=card.getBoundingClientRect();
const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
const y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
card.style.setProperty("--ry",((x-.5)*18)+"deg");
card.style.setProperty("--rx",((.5-y)*14)+"deg");
card.style.setProperty("--gx",(x*100)+"%");
card.style.setProperty("--gy",(y*100)+"%");
card.classList.add("live");
});

visual.addEventListener("pointerleave",()=>{
card.classList.remove("live");
["--rx","--ry","--gx","--gy"].forEach(p=>card.style.removeProperty(p));
});

}

/* Soft original instrumental background music */

let audioContext=null;
let masterGain=null;
let analyser=null;
let freqData=null;
let musicTimer=null;
let musicPlaying=false;
let noteIndex=0;
let barFrame=0;

const musicButton=document.getElementById("musicToggle");
const musicStatus=document.getElementById("musicStatus");
const musicBox=document.querySelector(".music");
const bars=Array.from(document.querySelectorAll(".bars i"));

let barBins=[];

const melody=[
261.63,329.63,392.00,493.88,
392.00,329.63,293.66,349.23,
440.00,523.25,440.00,349.23
];

const chords=[
[130.81,164.81,196.00],
[146.83,174.61,220.00],
[110.00,164.81,196.00],
[123.47,155.56,185.00]
];

function playTone(frequency,start,duration,volume){

const oscillator=audioContext.createOscillator();
const gain=audioContext.createGain();
const filter=audioContext.createBiquadFilter();

oscillator.type="sine";
oscillator.frequency.setValueAtTime(frequency,start);

filter.type="lowpass";
filter.frequency.value=1100;

gain.gain.setValueAtTime(0.0001,start);
gain.gain.exponentialRampToValueAtTime(volume,start+0.12);
gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);

oscillator.connect(filter);
filter.connect(gain);
gain.connect(masterGain);

oscillator.start(start);
oscillator.stop(start+duration+0.05);
}

function playMusicStep(){

if(!musicPlaying || !audioContext)return;

const now=audioContext.currentTime;
const current=noteIndex%melody.length;
const chord=chords[Math.floor(noteIndex/3)%chords.length];

playTone(melody[current],now,1.7,0.055);

chord.forEach((frequency,index)=>{
playTone(frequency,now,2.4,index===0?0.012:0.009);
});

noteIndex++;
}

function drawBars(){

if(!musicPlaying || !analyser)return;

analyser.getByteFrequencyData(freqData);

bars.forEach((bar,i)=>{
const level=freqData[barBins[i]]/255;
bar.style.height=(4+Math.pow(level,.8)*26)+"px";
});

barFrame=requestAnimationFrame(drawBars);
}

function resetBars(){
cancelAnimationFrame(barFrame);
bars.forEach(bar=>{bar.style.height=""});
}

async function startMusic(){

try{

const AudioContextClass=window.AudioContext||window.webkitAudioContext;

if(!AudioContextClass){
throw new Error("Audio not supported");
}

if(!audioContext){

audioContext=new AudioContextClass();

masterGain=audioContext.createGain();
masterGain.gain.value=0.55;

analyser=audioContext.createAnalyser();
analyser.fftSize=2048;
analyser.smoothingTimeConstant=.82;
analyser.minDecibels=-95;
analyser.maxDecibels=-28;
freqData=new Uint8Array(analyser.frequencyBinCount);

const hzPerBin=audioContext.sampleRate/analyser.fftSize;
const low=90/hzPerBin;
const high=1300/hzPerBin;
barBins=bars.map((_,i)=>Math.round(low*Math.pow(high/low,i/Math.max(bars.length-1,1))));

masterGain.connect(analyser);
masterGain.connect(audioContext.destination);

}

await audioContext.resume();

if(musicPlaying)return;

musicPlaying=true;

playMusicStep();

musicTimer=setInterval(playMusicStep,1700);

musicButton.textContent="Ⅱ Pause Music";
musicStatus.textContent="Your soft instrumental is playing.";
musicBox.classList.add("playing");

if(!calm)drawBars();

}catch(error){

musicStatus.textContent="Audio unavailable. Try another browser.";

}
}

function stopMusic(){

musicPlaying=false;

if(musicTimer){
clearInterval(musicTimer);
musicTimer=null;
}

if(masterGain && audioContext){
masterGain.gain.setTargetAtTime(0,audioContext.currentTime,0.08);
}

resetBars();

musicButton.textContent="▶ Play Music";
musicStatus.textContent="Music paused.";
musicBox.classList.remove("playing");
}

musicButton.addEventListener("click",async()=>{

if(musicPlaying){
stopMusic();
}else{

if(masterGain && audioContext){
masterGain.gain.setTargetAtTime(0.55,audioContext.currentTime,0.08);
}

await startMusic();
}

});
