const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('creatorpack/preferences.js','utf8').replace('export function','function');
const nodes = {}, topics = ['explore-city','food-drink','get-moving','meet-people','get-creative','slow-down','other'].map(value=>({value,checked:false}));
let tone='playful-cheeky', mode='anywhere', changes=0;
const root={events:{},querySelectorAll:()=>topics,querySelector:s=>({value:s.includes('writing_tone')?tone:mode}),addEventListener(e,fn){this.events[e]=fn}};
const doc={getElementById:id=>id==='creative-preferences'?root:(nodes[id]||={value:'',hidden:true,textContent:''})};
const context={doc,changed:()=>changes++};vm.createContext(context);vm.runInContext(source+';this.preferences=setupCreativePreferences(doc,changed)',context);
const read=()=>JSON.parse(JSON.stringify(context.preferences.read()));
assert.deepEqual(read(),{version:1,topics:[],topic_other:'',location_mode:'anywhere',location_details:'',writing_tone:'playful-cheeky'});
for(const t of ['playful-cheeky','warm-encouraging','calm-reflective','bold-energetic']){tone=t;assert.equal(read().writing_tone,t)}
for(let i=0;i<4;i++){topics[i].checked=true;root.events.change({target:topics[i]})}assert.equal(topics[3].checked,false);assert.equal(read().topics.length,3);assert.match(nodes['topic-status'].textContent,/up to three/);
topics[0].checked=false;topics[6].checked=true;root.events.change({target:topics[6]});assert.equal(nodes['other-topic-field'].hidden,false);doc.getElementById('topic-other').value='  Kindness  ';assert.equal(read().topic_other,'Kindness');topics[6].checked=false;root.events.change({target:topics[6]});assert.equal(read().topic_other,'');
mode='mixed';root.events.change({target:{}});assert.equal(nodes['location-details-field'].hidden,false);doc.getElementById('location-details').value='  Austin  ';assert.equal(read().location_details,'Austin');mode='anywhere';root.events.change({target:{}});assert.equal(nodes['location-details-field'].hidden,true);assert.equal(read().location_details,'');assert(changes>0);
const page=fs.readFileSync('creatorpack/page.js','utf8'), html=fs.readFileSync('creatorpack/index.html','utf8');assert(page.includes('creative_preferences: preferences.read()'));assert(page.indexOf('await ensureCreatorAccess()')<page.indexOf("action: 'prepare'"));assert.equal((html.match(/name="writing_tone"/g)||[]).length,4);assert.equal((html.match(/name="pack_topic"/g)||[]).length,7);assert(html.includes('form="creator-form"'));assert(html.includes('What shaped you?'));assert(html.includes('You don’t need to answer them all'));
console.log('PASS defaults; four tones; max3; conditional fields; trimmed serialization; idempotency callback; authenticated prepare wiring; broader optional prompts');
