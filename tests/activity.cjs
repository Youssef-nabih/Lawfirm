const {chromium}=require('C:/Users/Ahmed Nabih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,channel:'msedge'});const p=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.setContent(fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]+>/g,''));await p.addStyleTag({content:fs.readFileSync('theme.css','utf8')});
await p.evaluate(()=>{window.calls=[];window.mode='normal';window.supabase={createClient:()=>({from(table){const q={select(){return q},order(){return q},eq(...a){calls.push(a);return q},or(s){calls.push(s);return q},range(a,b){calls.push([a,b]);return q},then(resolve){if(mode==='delay'){window.resolveActivity=resolve;return;}resolve(mode==='error'?{error:{code:'PGRST205'}}:{data:Array.from({length:51},(_,i)=>({id:i,actor_name:'موظف <img src=x onerror=alert(1)>',actor_username:'ahmed',action:'UPDATE',table_name:'cases',record_label:'قضية تجارية',occurred_at:'2026-09-27T10:00:00Z',changed_fields:['name']}))});}};return q;}})};});
for(const f of ['app.js','workspace.js','activity.js']) await p.addScriptTag({content:fs.readFileSync(f,'utf8')});
await p.evaluate(()=>{currentUser={id:'admin'};currentProfile={role:'admin',status:'approved'};document.getElementById('loginScreen').classList.add('hidden');updateEmployeesVisibility();});
await p.locator('#activityMenuItem a').click();await p.waitForFunction(()=>document.querySelectorAll('#activities tbody tr').length===50);assert.equal(await p.locator('#activities tbody img').count(),0);
await p.locator('#activities [data-next]').click();await p.waitForFunction(()=>document.querySelector('#activities [data-page]').textContent==='صفحة 2');
await p.locator('#activities [name=actor]').fill('أحمد');await p.locator('#activities [name=action]').selectOption('UPDATE');await p.locator('#activities button[type=submit]').click();await p.waitForFunction(()=>document.querySelector('#activities [data-page]').textContent==='صفحة 1');assert.ok((await p.evaluate(()=>calls)).some(x=>typeof x==='string'&&x.includes('أحمد')));
await p.screenshot({path:'tests/activity-desktop.png',fullPage:true});await p.setViewportSize({width:390,height:844});await p.screenshot({path:'tests/activity-mobile.png',fullPage:true});
await p.evaluate(()=>mode='error');await p.locator('#activities button[type=submit]').click();await p.waitForFunction(()=>document.querySelector('#activities [data-status]').textContent.includes('لم يُفعّل'));
await p.evaluate(()=>mode='delay');await p.locator('#activities button[type=submit]').click();await p.waitForFunction(()=>!!window.resolveActivity);
await p.evaluate(()=>{currentProfile={role:'employee',status:'approved'};updateEmployeesVisibility();resolveActivity({data:[{actor_name:'SECRET'}]});switchPage('activities');});
assert.equal(await p.locator('#activityMenuItem').isVisible(),false);assert.equal(await p.locator('#activities').isVisible(),false);assert.equal(await p.locator('#activities tbody tr').count(),0);assert.deepEqual(errors,[]);
await browser.close();console.log('PASS: admin-only UI, paging, filters, safe text, missing migration, stale request after role change, desktop/mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
