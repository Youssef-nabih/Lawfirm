const {chromium}=require('C:/Users/Ahmed Nabih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const names=['companies','clients','cases','case_sessions','client_expenses','tasks','company_tasks'];
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('https://office.test/**',route=>route.fulfill({body:'<html></html>',contentType:'text/html'}));await page.goto('https://office.test/');
 await page.setContent(fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]+>/g,''));await page.addStyleTag({content:fs.readFileSync('theme.css','utf8')});
 await page.evaluate(names=>{
  window.data=Object.fromEntries(names.map(n=>[n,[]]));data.companies=[{id:1,name:'شركة اختبار',logo_url:'https://oscugslepanxyogvkaxq.supabase.co/storage/v1/object/public/documents/logo.png'}];data.company_tasks=[{id:1,company_id:1,title:'مهمة اختبار'}];
  window.calls=[];window.uploaded=[];window.removed=[];window.revision='one';window.rpcFail='';window.fileFail=false;
  const client={rpc:async(name,args)=>{calls.push({name,args});if(rpcFail)return {error:{code:'PGRST202',message:rpcFail}};if(name==='office_backup_export')return {data:{tables:structuredClone(data),schema:'test-schema',revision}};if(args.p_expected_revision!==revision)return {error:{message:'DATA_CHANGED'}};data=structuredClone(args.p_tables);revision='restored';return {data:{restored:true}};},storage:{from(bucket){return {download:async path=>fileFail?{error:{message:'download failure'}}:{data:new Blob(['sample-image'],{type:'image/png'})},upload:async(path,blob)=>{uploaded.push({path,size:blob.size});return {data:{path}}},getPublicUrl:path=>({data:{publicUrl:'https://oscugslepanxyogvkaxq.supabase.co/storage/v1/object/public/'+bucket+'/'+path}}),remove:async paths=>{removed.push(...paths);return {data:[]}}}}}};window.supabase={createClient:()=>client};
 },names);
 await page.addScriptTag({content:fs.readFileSync('app.js','utf8')});await page.addScriptTag({content:fs.readFileSync('workspace.js','utf8')});await page.addScriptTag({content:fs.readFileSync('excel-export.js','utf8')});await page.addScriptTag({content:fs.readFileSync('backup.js','utf8')});
 assert.equal(await page.getByRole('link',{name:'النسخ الاحتياطي',exact:true}).isVisible(),false);
 await page.evaluate(()=>{currentUser={id:'test-user'};currentProfile={role:'admin',status:'approved'};updateBackupVisibility();document.getElementById('loginScreen').classList.add('hidden')});await page.getByRole('link',{name:'النسخ الاحتياطي',exact:true}).click();
 await page.route('https://office.test/vendor/exceljs-4.4.0.min.js',route=>route.fulfill({body:fs.readFileSync('vendor/exceljs-4.4.0.min.js'),contentType:'application/javascript'}));
 await page.evaluate(()=>{
  Object.assign(data.companies[0],{phone:'00123456789',tax_id:'000125',status:'active'});
  data.clients=[{id:7,name:'موكل تجريبي',phone:'01000123456'}];
  data.cases=[{id:4,name:'قضية تجريبية',case_details:'تفاصيل القضية ومتابعة الإجراءات المطلوبة',case_number:'0012'}];
  data.case_sessions=[{id:2,case_id:4,session_date:'2026-09-27T09:30:00Z',session_subject:'جلسة مرافعة',decision:'تأجيل لتقديم المستندات',attending_lawyer:'أحمد'}];
  data.client_expenses=[{id:3,client_id:7,amount:1200.5,expense_date:'2026-09-27',reason:'رسوم إجراءات',spender:'أحمد'},{id:4,client_id:7,amount:0,expense_date:null,reason:'بدون مصروفات'}];
  data.tasks=[{id:8,title:'=HYPERLINK("https://example.com","test")',completed:false,due_date:'2026-10-10'}];
  Object.assign(data.company_tasks[0],{completed:true,due_date:'2026-10-01',description:'مراجعة المستندات قبل الموعد المحدد',custom_field:'قيمة إضافية'});
 });
 const excelDownloadPromise=page.waitForEvent('download');await page.locator('[data-excel]').click();const excelDownload=await excelDownloadPromise;
 assert.match(excelDownload.suggestedFilename(),/\.xlsx$/);await excelDownload.saveAs('tests/excel-export-sample.xlsx');
 const ExcelJS=require('../vendor/exceljs-4.4.0.min.js');const xlsx=new ExcelJS.Workbook();await xlsx.xlsx.load(fs.readFileSync('tests/excel-export-sample.xlsx'));
 assert.equal(xlsx.worksheets.length,7);
 const cellByHeader=(name,label,row=6)=>{const sheet=xlsx.getWorksheet(name);const col=sheet.getRow(5).values.indexOf(label);assert.ok(col>0,label);return sheet.getCell(row,col)};
 assert.equal(cellByHeader('الشركات','الهاتف').value,'00123456789');assert.equal(cellByHeader('الشركات','رقم التسجيل الضريبي').value,'000125');
 assert.equal(cellByHeader('المصروفات','المبلغ').value,1200.5);assert.equal(cellByHeader('المصروفات','المبلغ',7).value,0);
 assert.equal(cellByHeader('المصروفات','اسم الموكل').value,'موكل تجريبي');assert.equal(cellByHeader('مهام الشركات','اسم الشركة').value,'شركة اختبار');
 assert.equal(cellByHeader('الجلسات','اسم القضية').value,'قضية تجريبية');assert.equal(cellByHeader('الجلسات','موعد الجلسة').value.toISOString(),'2026-09-27T12:30:00.000Z');
 assert.equal(cellByHeader('المهام العامة','عنوان المهمة').formula,undefined);assert.match(cellByHeader('المهام العامة','عنوان المهمة').value,/^=HYPERLINK/);
 assert.equal(cellByHeader('مهام الشركات','حقل إضافي (custom_field)').value,'قيمة إضافية');assert.equal(cellByHeader('الشركات','شعار الشركة').hyperlink,'https://oscugslepanxyogvkaxq.supabase.co/storage/v1/object/public/documents/logo.png');
 for(const sheet of xlsx.worksheets){assert.equal(sheet.views[0].rightToLeft,true);assert.equal(sheet.views[0].ySplit,5);assert.ok(sheet.autoFilter);}
 await page.evaluate(async()=>{const empty=Object.fromEntries(Object.keys(data).map(k=>[k,[]]));const book=await OfficeExcel.build(empty);if(book.worksheets.length!==7)throw Error('Empty export');await book.xlsx.writeBuffer();});
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-export="full"]').click();const download=await downloadPromise;const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.backup.files.length,1);assert.equal(backup.backup.tables.company_tasks.length,1);assert.equal(backup.sha256,crypto.createHash('sha256').update(JSON.stringify(backup.backup)).digest('hex'));
 const choose=async value=>{await page.locator('[data-file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))})};
 await choose(backup);await page.getByText('النسخة سليمة وقابلة للمعاينة.',{exact:false}).waitFor();assert.equal(await page.locator('[data-restore]').isDisabled(),true);
 await page.screenshot({path:'tests/backup-desktop.png',fullPage:true});
 await page.locator('[data-consent]').check();await page.locator('[data-restore]').click();await page.getByText('تمت الاستعادة بنجاح.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>uploaded.length),1);assert.match(await page.evaluate(()=>data.companies[0].logo_url),/restored\//);assert.equal(await page.evaluate(()=>removed.length),0);
 const broken=structuredClone(backup);broken.backup.tables.companies[0].name='tampered';await choose(broken);await page.getByText('فشل التحقق من سلامة النسخة',{exact:false}).waitFor();assert.equal(await page.locator('[data-confirm]').isVisible(),false);
 const foreign=structuredClone(backup);foreign.backup.project='https://elsewhere.test';await choose(foreign);await page.getByText('هذه النسخة تخص مشروعًا آخر.',{exact:false}).waitFor();
 await choose(backup);await page.getByText('النسخة سليمة وقابلة للمعاينة.',{exact:false}).waitFor();await page.evaluate(()=>revision='changed');await page.locator('[data-consent]').check();await page.locator('[data-restore]').click();await page.getByText('تغيّرت بيانات المكتب',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>removed.length),0);
 await page.evaluate(()=>fileFail=true);await page.locator('[data-export="full"]').click();await page.getByText('لم يتم إنشاء نسخة ناقصة.',{exact:false}).waitFor();
 await page.evaluate(()=>rpcFail='missing RPC');await page.locator('[data-export="data"]').click();await page.getByText('النسخ الاحتياطي يحتاج التفعيل مرة واحدة.',{exact:false}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'tests/backup-mobile.png',fullPage:true});
 await page.evaluate(()=>{currentProfile.role='employee';updateBackupVisibility()});assert.equal(await page.getByRole('link',{name:'النسخ الاحتياطي',exact:true}).isVisible(),false);assert.equal(await page.locator('#backups').isVisible(),false);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS backup UI: admin visibility, full download with checksum, attachment restore, preview consent, corrupted/foreign files, concurrent edits, missing RPC, attachment failure, mobile. Mock database only.');
})().catch(e=>{console.error(e);process.exit(1)});


