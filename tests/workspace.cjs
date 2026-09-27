const { chromium } = require('C:/Users/Ahmed Nabih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"msedge"});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let html=fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]+>/g,'');
 await page.setContent(html);
 await page.addStyleTag({content:fs.readFileSync('theme.css','utf8')});
 await page.evaluate(()=>{
  window.rows=[];window.operations=[];window.failNext=false;
  window.supabase={createClient:()=>({from(table){
   let action='select',payload,filters=[];
   const q={select(){return q},order(){return q},eq(k,v){filters.push([k,v]);return q},insert(p){action='insert';payload=p;return q},update(p){action='update';payload=p;return q},delete(){action='delete';return q},then(resolve){
    operations.push({table,action,filters});
    if(failNext){failNext=false;return Promise.resolve(resolve({error:{code:'PGRST205'}}))}
    const matches=r=>filters.every(([k,v])=>r[k]===v);
    let data;
    if(action==='insert'){data=[{id:Date.now(),completed:false,...payload}];rows.push(...data)}
    else if(action==='update'){data=rows.filter(matches);data.forEach(r=>Object.assign(r,payload))}
    else if(action==='delete'){data=rows.filter(matches);rows=rows.filter(r=>!matches(r))}
    else data=rows.filter(matches);
    return Promise.resolve(resolve({data:structuredClone(data),error:null}));
   }};return q;
  }})};
 });
 await page.addScriptTag({content:fs.readFileSync('app.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('workspace.js','utf8')});
 await page.evaluate(()=>{currentUser={id:'test-user'};currentProfile={role:'admin',status:'approved'};allCompaniesCache=[{id:1,name:'شركة الأمل',legal_name:'الأمل للتجارة',tax_id:'123456'},{id:2,name:'شركة النور'}];document.getElementById('loginScreen').classList.add('hidden');document.getElementById('currentUserGreeting').textContent='أحمد · مدير المكتب';renderCompaniesTable(allCompaniesCache)});
 await page.screenshot({path:'tests/dashboard-desktop.png',fullPage:true});
 await page.evaluate(()=>openCompanyWorkspace(1));
 await page.locator('#companyTaskTitle').fill('تجديد السجل التجاري');await page.locator('#companyTaskDate').fill('2026-10-12');
 await page.locator('#companyTaskDescription').fill('<img src=x onerror=alert(1)>');
 await page.locator('[data-save]').click();await page.locator('.company-task').waitFor();
 assert.equal(await page.locator('.company-task img').count(),0);
 await page.getByRole('button',{name:'إكمال',exact:true}).click();await page.locator('.company-task.completed').waitFor();
 await page.getByRole('button',{name:'تعديل',exact:true}).click();await page.locator('#companyTaskTitle').fill('تجديد السجل المعدّل');await page.locator('[data-save]').click();
 await page.getByRole('heading',{name:'تجديد السجل المعدّل'}).waitFor();
 await page.screenshot({path:'tests/company-desktop.png',fullPage:true});
 await page.evaluate(()=>{closeCompanyWorkspace();return openCompanyWorkspace(2)});
 assert.equal(await page.locator('.company-task').count(),0);
 await page.evaluate(()=>{closeCompanyWorkspace();return openCompanyWorkspace(1)});
 assert.equal(await page.locator('.company-task').count(),1);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tests/company-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'حذف',exact:true}).click();await page.locator('.empty-state').waitFor();
 await page.evaluate(()=>{failNext=true});await page.locator('[data-refresh]').click();await page.getByText('مهام الشركات غير مفعّلة بعد.',{exact:false}).waitFor();
 await page.evaluate(()=>{closeCompanyWorkspace();currentProfile.role='viewer';return openCompanyWorkspace(1)});
 assert.equal(await page.locator('.company-form').isVisible(),false);
 assert.equal(await page.evaluate(()=>operations.every(o=>o.table==='company_tasks')),true);
 await page.evaluate(()=>closeCompanyWorkspace());await page.locator('.menu-toggle').click();assert.equal(await page.locator('.sidebar').isVisible(),true);
 await page.screenshot({path:'tests/dashboard-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS: create, edit, complete, delete, company isolation, reload, escaping, read-only UI, missing-table error, mobile layout and menu. No live database accessed.');
})().catch(error=>{console.error(error);process.exit(1)});

