const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('creatorpack/page.js','utf8');
const block = source.slice(source.indexOf('// Recording stays'), source.indexOf('// Refine the authenticated'));
function setup({mime='audio/webm',permissionError=null,supported=true,permissionWait=null}={}) {
  const nodes = {}; const node = id => nodes[id] ||= {hidden:false,disabled:false,value:'',files:[],textContent:'',listeners:{},addEventListener(e,f){this.listeners[e]=f},before(){},append(){},replaceChildren(){}};
  let time=0, interval, stopped=0, instance;
  const track={stop(){stopped++}};
  const document={hidden:false,createElement:()=>node('created'+Math.random()),addEventListener(e,f){this[e]=f}};
  class Recorder { static isTypeSupported(t){return t.split(';')[0]===mime} constructor(stream,options){this.mimeType=options.mimeType;this.state='inactive';instance=this} start(){this.state='recording'} stop(){this.state='inactive';this.ondataavailable({data:new Blob(['test sound'],{type:this.mimeType})});queueMicrotask(()=>this.onstop())} }
  const context={document,window:{MediaRecorder:supported?Recorder:null,addEventListener(e,f){this[e]=f}},navigator:{mediaDevices:{async getUserMedia(){if(permissionWait)await permissionWait;if(permissionError)throw Object.assign(new Error(),{name:permissionError});return{getTracks:()=>[track],getAudioTracks:()=>[track]}}}},MediaRecorder:Recorder,Blob,File,performance:{now:()=>time},setInterval:f=>(interval=f,1),clearInterval(){interval=null},console};
  context.$=node; context.button=node('submit');context.busy=false; context.pending={id:'old'};context.selectedAudio=null;context.recordingInProgress=false;
  vm.createContext(context);vm.runInContext(block,context);
  return {context,node,document,instance:()=>instance,advance(t){time=t;interval?.()},stopped:()=>stopped};
}
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
for(const mime of ['audio/mp4','audio/webm','audio/ogg']){const t=setup({mime});await t.node('record-voice').listeners.click();assert.equal(t.context.recordingInProgress,true);t.node('stop-voice').listeners.click();await flush();assert.equal(t.context.selectedAudio.type,mime);assert.equal(t.context.recordingInProgress,false);assert(t.stopped()>0);t.node('delete-voice').listeners.click();assert.equal(t.context.selectedAudio,null);console.log('record/stop/delete',mime);}
let t=setup();await t.node('record-voice').listeners.click();t.advance(300001);await flush();assert.match(t.node('record-status').textContent,/Five-minute/);console.log('five-minute auto-stop');
t=setup();await t.node('record-voice').listeners.click();t.document.hidden=true;t.document.visibilitychange();await flush();assert.match(t.node('record-status').textContent,/interrupted/);assert(t.context.selectedAudio);console.log('interruption retains captured audio');
for(const error of ['NotAllowedError','NotFoundError']){t=setup({permissionError:error});await t.node('record-voice').listeners.click();assert.equal(t.context.recordingInProgress,false);assert.equal(t.node('audio').disabled,false);assert.equal(t.node('submit').disabled,false);console.log('permission/device failure',error);}
t=setup({supported:false});await t.node('record-voice').listeners.click();assert.match(t.node('record-status').textContent,/isn’t available/);console.log('unsupported fallback');
let resolvePermission; const permissionWait=new Promise(r=>resolvePermission=r);t=setup({permissionWait});const starting=t.node('record-voice').listeners.click();t.node('stop-voice').listeners.click();assert.equal(t.context.recordingInProgress,false);resolvePermission();await starting;assert(t.stopped()>0);assert.equal(t.context.selectedAudio,null);console.log('cancel permission request stops late microphone stream');
assert(source.includes('const audio = selectedAudio;'));assert(source.indexOf('await ensureCreatorAccess()')<source.indexOf("action: 'prepare'"));assert(!block.includes('fetch('));console.log('shared upload state, password precedes upload, recording does not transmit');
})().catch(e=>{console.error(e);process.exitCode=1});
