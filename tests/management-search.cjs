const {chromium} = require('C:/Users/Ahmed Nabih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
    const browser = await chromium.launch({headless:true, channel:'msedge'});
    try {
        const page = await browser.newPage({viewport:{width:1280,height:900}});
        const errors = [], alerts = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', async dialog => {alerts.push(dialog.message()); await dialog.accept();});
        await page.setContent(fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]+>/g,''));
        await page.addStyleTag({content:fs.readFileSync('theme.css','utf8')});
        await page.evaluate(() => {
            window.rows = {
                companies:[{id:1,name:'شركة النور',phone:'010123',tax_id:'456'},{id:2,name:'شركة الأمل'}],
                cases:[{id:1,name:'قضية أحمد',client_name:'علي',case_number:123,court_name:'محكمة القاهرة',status:'جارية'},{id:2,name:'قضية ثانية',client_name:'منى',status:'جارية'}],
                clients:[{id:1,name:'أحمد محمد',phone:'010999'},{id:2,name:'منى علي',phone:'012888'}]
            };
            window.writes = []; window.readFailure = false; window.readDelay = 0; window.uploads = 0;
            window.supabase = {createClient:() => ({from(table) {
                let action='select', payload, filters=[], start=0, end=Infinity, single=false;
                const q = {
                    select(){return q}, order(){return q}, range(a,b){start=a;end=b;return q},
                    eq(k,v){filters.push([k,v]);return q}, single(){single=true;return q},
                    insert(p){action='insert';payload=p;return q}, update(p){action='update';payload=p;return q},
                    async then(resolve) {
                        if (readDelay) await new Promise(r => setTimeout(r,readDelay));
                        if (action==='select' && readFailure) return resolve({error:{message:'offline'}});
                        let data=(rows[table] || []).filter(r => filters.every(([k,v]) => String(r[k])===String(v)));
                        if (action==='insert') {
                            data=(Array.isArray(payload)?payload:[payload]).map((r,i) => ({id:(rows[table]?.length || 0)+i+1,...r}));
                            (rows[table] ||= []).push(...data); writes.push({table,action});
                        } else if (action==='update') {data.forEach(r => Object.assign(r,payload));writes.push({table,action});}
                        data=data.slice(start,end+1);
                        return resolve({data:structuredClone(single?data[0]:data),error:null});
                    }
                };return q;
            }})};
        });
        await page.addScriptTag({content:fs.readFileSync('app.js','utf8')});
        await page.evaluate(async () => {
            currentUser={id:'test'};currentProfile={role:'admin',status:'approved'};
            uploadFileToSupabase=async () => {uploads++;return null};
            window.openCompanyWorkspace=() => {};
            document.getElementById('loginScreen').classList.add('hidden');
            await fetchCompanies();await fetchCases();await fetchClients();
        });
        for (const [section,input,body,term,expected] of [
            ['companies','companiesSearch','companiesTableBody','456','شركة النور'],
            ['cases','casesSearch','casesTableBody','القاهرة','قضية أحمد'],
            ['clients','clientsSearch','clientsTableBody','012888','منى علي']
        ]) {
            await page.evaluate(section => switchPage(section),section);
            await page.locator('#'+input).fill(term);
            assert.equal(await page.locator('#'+body+' tr').count(),1);
            assert.ok((await page.locator('#'+body).innerText()).includes(expected));
            await page.evaluate(() => Promise.all([fetchCompanies(),fetchCases(),fetchClients()]));
            assert.equal(await page.locator('#'+body+' tr').count(),1);
            assert.equal(await page.locator('#stat-cases-count').innerText(),'2');
            assert.equal(await page.locator('#recentCasesTable tr').count(),2);
            await page.locator('#'+input).fill('<img src=x onerror=alert(1)>');
            assert.ok((await page.locator('#'+body).innerText()).includes('مطابق'));
            assert.equal(await page.locator('#'+body+' img').count(),0);
            await page.locator('#'+input).fill('');
            assert.equal(await page.locator('#'+body+' tr').count(),2);
        }
        await page.evaluate(async () => {
            document.getElementById('compName').value='  شركة   النور ';
            document.getElementById('caseName').value='قَضية أحمد';
            document.getElementById('clientFormName').value='أحمد   محمد';
            // Current server records must win even with empty/stale caches.
            allCompaniesCache=[];allCasesCache=[];allClientsCache=[];
            await addCompany();await addCase();await addClient();
            document.getElementById('editCompId').value='2';document.getElementById('editCompName').value='شركة النور';
            document.getElementById('editCaseId').value='2';document.getElementById('editCaseName').value='قضية أحمد';
            for (const [id,value] of [['dynamicEditClientId','2'],['dynamicEditClientName','أحمد محمد'],['dynamicEditClientPhone','']]) {
                const el=document.createElement('input');el.id=id;el.value=value;document.body.append(el);
            }
            await saveCompanyUpdate();await saveCaseUpdate();await saveClientUpdate();
        });
        assert.equal(alerts.filter(a => a.includes('الاسم موجود بالفعل')).length,6);
        assert.deepEqual(await page.evaluate(() => [writes.length,uploads]),[0,0]);
        assert.equal(await page.evaluate(() => recordNameAvailable('clients','أحمد محمد','1')),true);
        assert.equal(await page.evaluate(() => recordNameAvailable('clients','أحمد محمد','2')),false);
        await page.evaluate(() => {readFailure=true;document.getElementById('clientFormName').value='اسم جديد'});
        await page.evaluate(() => addClient());
        assert.ok(alerts.at(-1).includes('تعذر التحقق'));
        assert.equal(await page.evaluate(() => writes.length),0);
        await page.evaluate(async () => {
            readFailure=false;readDelay=30;
            await Promise.all([addClient(),addClient()]);
        });
        assert.equal(await page.evaluate(() => rows.clients.filter(r => r.name==='اسم جديد').length),1);
        assert.equal(await page.evaluate(() => recordSaveLocks.size),0);
        assert.ok((await page.evaluate(() => recordSaveError({code:'23505',message:'office_unique_clients_name'},'خطأ: '))).includes('الاسم موجود بالفعل'));
        assert.equal(await page.evaluate(() => recordSaveError({code:'23505',message:'other_constraint'},'خطأ: ')),'خطأ: other_constraint');
        await page.evaluate(() => {readDelay=0;rows.clients=Array.from({length:1001},(_,i) => ({id:i+1,name:'موكل '+i}))});
        assert.equal(await page.evaluate(() => recordNameAvailable('clients','موكل 1000')),false);
        await page.setViewportSize({width:390,height:844});
        await page.evaluate(async () => {switchPage('clients');await fetchClients()});
        const box=await page.locator('#clientsSearch').boundingBox();
        assert.ok(box.x>=0 && box.x+box.width<=390);
        assert.deepEqual(errors,[]);
        console.log('PASS: searches, refresh persistence, unchanged dashboard stats, duplicate add/edit, normalization, stale cache, read failure, repeat clicks, pagination and mobile. Mock database only.');
    } finally {await browser.close();}
})().catch(e => {console.error(e);process.exitCode=1});
