const {chromium}=require('C:/Users/Ahmed Nabih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  // A device outside Cairo must still see office dates and deadlines.
  const page=await browser.newPage({viewport:{width:1440,height:1100},timezoneId:'America/New_York'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.clock.install({time:new Date('2026-10-12T09:00:00Z')});
  await page.setContent(fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]+>/g,''));
  for(const file of ['theme.css','experience.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(()=>{
   window.rows={cases:[
    {id:1,name:'قضية متأخرة',client_name:'موكل متأخر',status:'جارية'},
    {id:2,name:'قضية لها موعد جديد',client_name:'موكل الغد',status:'مؤجلة'},
    {id:3,name:'قضية اليوم',client_name:'موكل اليوم',status:'جديدة'},
    {id:4,name:'قضية منتهية',client_name:'موكل منتهية',status:'تمت'},
    {id:5,name:'قضية مؤرشفة',client_name:'موكل مؤرشف',status:'مؤرشفة'},
    {id:6,name:'بدون جلسات',client_name:'موكل جديد',status:'جارية'},
    {id:7,name:'موعد بعيد',client_name:'موكل بعيد',status:'جارية'},
    {id:8,name:'موعد غير صالح',client_name:'موكل بلا موعد',status:'جارية'},
    {id:9,name:'قضية دقيقة',client_name:'موكل دقيقة',status:'جارية'},
    ...Array.from({length:5},(_,i)=>({id:i+10,name:'قضية إضافية '+i,client_name:'موكل إضافي '+i,status:'جارية'}))
   ],case_sessions:[
    {id:1,case_id:1,session_date:'2026-10-11T09:00:00Z',decision:'تم التأجيل'},
    {id:2,case_id:2,session_date:'2026-10-13T09:00:00Z'},
    {id:3,case_id:2,session_date:'2026-10-01T09:00:00Z'},
    {id:4,case_id:'3',session_date:'2026-10-12T13:00'},
    {id:5,case_id:4,session_date:'2026-10-01T09:00:00Z'},
    {id:6,case_id:5,session_date:'2026-10-01T09:00:00Z'},
    {id:7,case_id:7,session_date:'2026-10-20T09:00:00Z'},
    {id:8,case_id:8,session_date:'invalid'},
    {id:9,case_id:9,session_date:'2026-10-12T09:01:00Z'},
    {id:10,case_id:999,session_date:'2026-10-01T09:00:00Z'}
   ]};
   window.failSessions=false;window.sessionDelay=0;window.sessionReadCount=0;
   window.supabase={createClient:()=>({from(table){let action='select',payload,filters=[],start=0,end=Infinity;const q={
    select(){return q},order(){return q},eq(k,v){filters.push([k,v]);return q},
    range(a,b){start=a;end=b;return q},
    insert(p){action='insert';payload=p;return q},update(p){action='update';payload=p;return q},delete(){action='delete';return q},
    async then(resolve){
     if(table==='case_sessions' && action==='select'){
      sessionReadCount++;
      if(sessionDelay)await new Promise(r=>setTimeout(r,sessionDelay));
      if(failSessions)return resolve({data:null,error:{message:'offline'}});
     }
     let data=(rows[table]||[]).filter(r=>filters.every(([k,v])=>String(r[k])===String(v)));
     if(action==='insert') {data=(Array.isArray(payload)?payload:[payload]).map((r,i)=>({id:100+i,...r}));(rows[table]||=[]).push(...data);}
     if(action==='update')data.forEach(r=>Object.assign(r,payload));
     if(action==='delete')rows[table]=(rows[table]||[]).filter(r=>!data.includes(r));
     return resolve({data:structuredClone(data.slice(start,end+1)),error:null});
    }
   };return q;}})};
  });
  for(const file of ['app.js','workspace.js','experience.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(async()=>{
   currentUser={id:'test'};currentProfile={role:'admin',status:'approved'};
   document.getElementById('loginScreen').classList.add('hidden');
   await fetchCases();updateOfficeTasks([{id:1,title:'مهمة مهمة',is_important:true,completed:false,due_date:'2026-10-20'}]);
  });
  const card=id=>page.locator(`.case-card[data-open-case="${id}"]`);
  const reminder=id=>page.locator(`.session-reminder-main[data-open-case="${id}"]`);
  assert.equal(await page.locator('.case-card').count(),14,'All cases remain reachable, including beyond the old 12-card limit');
  assert.equal(await card(1).locator('.session-overdue').count(),1);
  assert.equal(await card(2).locator('.session-overdue').count(),0,'Old history does not trigger overdue when a later session exists');
  assert.ok((await card(2).innerText()).includes(await page.evaluate(()=>formatSessionDate('2026-10-13T09:00:00Z'))));
  for(const id of [4,5])assert.equal(await card(id).locator('.session-overdue').count(),0);
  for(const id of [6,8])assert.ok((await card(id).innerText()).includes('لا يوجد موعد مسجّل'));
  for(const id of [4,5,6,7,8])assert.equal(await reminder(id).count(),0);
  assert.equal(await page.locator('.session-reminder').count(),4);
  assert.ok((await reminder(2).innerText()).includes('جلسة غدًا'));
  assert.ok((await reminder(3).innerText()).includes('جلسة اليوم'));
  assert.equal(await page.locator('.priority-item.task-important').count(),1,'Task reminders remain visible');
  assert.ok((await page.locator('.agenda-info strong').allTextContents()).includes('موكل اليوم'));
  // A deadline passes without a reload.
  await page.clock.fastForward(120000);
  assert.equal(await card(9).locator('.session-overdue').count(),1);
  // The reminder opens the existing editor; saving a new session clears overdue and updates the card.
  await page.locator('[data-edit-case="1"]').click();
  await page.locator('#editCaseModal.active').waitFor();
  await page.getByRole('button',{name:'إضافة جلسة جديدة +',exact:true}).click();
  await page.locator('#editSessionsTableBody tr').last().locator('.session-date').fill('2026-10-13T14:00');
  await page.getByRole('button',{name:'حفظ التغيرات',exact:true}).click();
  await page.locator('#editCaseModal.active').waitFor({state:'hidden'});
  await page.evaluate(()=>switchPage('dashboard'));
  assert.equal(await card(1).locator('.session-overdue').count(),0);
  assert.ok((await reminder(1).innerText()).includes('جلسة غدًا'));
  assert.ok((await card(1).innerText()).includes(await page.evaluate(()=>formatSessionDate('2026-10-13T14:00'))));
  // Deleting that session refreshes the dashboard even if editing is cancelled.
  await page.locator('[data-edit-case="1"]').click();
  await page.locator('#editCaseModal.active').waitFor();
  await page.locator('#editSessionsTableBody tr').last().locator('button[onclick="removeEditSessionRow(this)"]').click();
  await page.waitForFunction(()=>document.querySelector('.case-card[data-open-case="1"]').classList.contains('case-needs-session'));
  await page.evaluate(()=>{closeEditModal();switchPage('dashboard');});
  // Untrusted names are text in both the cards and reminders.
  await page.evaluate(()=>{allCasesCache[0].client_name='<img src=x onerror=alert(1)>';updateOfficeTasks([]);});
  assert.equal(await page.locator('#officeCases img,#officePriorities img').count(),0);
  await page.evaluate(()=>{currentProfile.role='viewer';updateOfficeTasks([]);});
  assert.equal(await page.locator('[data-edit-case]').count(),0);
  assert.ok(await reminder(1).isVisible());
  // Errors never masquerade as an empty schedule, and retry restores the data.
  await page.evaluate(async()=>{failSessions=true;await refreshOfficeSessions();});
  assert.ok((await card(1).innerText()).includes('تعذر تحميل موعد الجلسة'));
  assert.equal(await page.locator('.case-needs-session').count(),0);
  await page.evaluate(()=>{failSessions=false;});await page.locator('#retryAgenda').click();
  await page.waitForFunction(()=>document.querySelector('.case-card[data-open-case="1"]').classList.contains('case-needs-session'));
  // A future session beyond the database's first page must suppress a stale overdue flag.
  await page.evaluate(async()=>{
   rows.case_sessions.push(...Array.from({length:510},(_,i)=>({id:1000+i,case_id:1,session_date:'2026-01-01T09:00:00Z'})));
   rows.case_sessions.push({id:2000,case_id:1,session_date:'2026-10-13T14:00:00Z'});
   await refreshOfficeSessions();
  });
  assert.equal(await card(1).locator('.session-overdue').count(),0);
  assert.ok((await reminder(1).innerText()).includes('جلسة غدًا'));
  await page.evaluate(()=>{allCasesCache[0].client_name='موكل متأخر';currentProfile.role='admin';updateOfficeTasks([]);});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile has no horizontal overflow');
  await page.screenshot({path:'C:/Users/Ahmed Nabih/.codex/visualizations/2026/10/12/01a1300a-6224-7101-a0a0-5f8a959fb420/session-followup-mobile.png',fullPage:true});
  await page.locator('.priorities').screenshot({path:'C:/Users/Ahmed Nabih/.codex/visualizations/2026/10/12/01a1300a-6224-7101-a0a0-5f8a959fb420/session-reminders-mobile.png'});
  await card(1).screenshot({path:'C:/Users/Ahmed Nabih/.codex/visualizations/2026/10/12/01a1300a-6224-7101-a0a0-5f8a959fb420/session-card-mobile.png'});
  await page.setViewportSize({width:1440,height:1100});
  await page.screenshot({path:'C:/Users/Ahmed Nabih/.codex/visualizations/2026/10/12/01a1300a-6224-7101-a0a0-5f8a959fb420/session-followup-desktop.png',fullPage:true});
  await page.evaluate(async()=>{currentUser=null;allCasesCache=[];await refreshOfficeSessions();});
  assert.equal(await page.locator('.session-reminder,.case-card').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: Cairo deadlines on a foreign device, latest session, reminders, expiry timer, save/delete refresh, closed cases, no dates, all cards, errors/retry, escaping, permissions, mobile and sign-out.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
