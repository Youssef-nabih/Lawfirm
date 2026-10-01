const {chromium}=require('C:/Users/Ahmed Nabih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/office/api/private') {res.setHeader('Content-Type','application/json');res.end('{"client":"private record"}');return;}
    const file=path.resolve(root,url.pathname.replace(/^\/office\//,''));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    let data;try {data=fs.readFileSync(file)}catch{res.writeHead(404);res.end();return;}
    if(file.endsWith('index.html')) data=data.toString().replace(/<script[^>]*src="(?!pwa\.js)[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]+https:\/\/[^>]+>/g,'');
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.webmanifest':'application/manifest+json','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
    res.end(data);
});
(async()=>{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${server.address().port}/office/`;
    const browser=await chromium.launch({headless:true,channel:'msedge'});
    try {
        const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
        const page=await context.newPage(),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto(base+'index.html');
        await page.evaluate(async()=>{
            await navigator.serviceWorker.ready;
            if(!navigator.serviceWorker.controller) await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));
        });
        assert.equal(await page.locator('[data-install-app]').first().isVisible(),true);
        await page.evaluate(()=>document.getElementById('loginScreen').classList.add('hidden'));
        await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--office-header-height'))-document.querySelector('.header').getBoundingClientRect().height)<1);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.evaluate(()=>document.querySelector('.sidebar').classList.add('open'));
        assert.ok(await page.evaluate(()=>Math.abs(document.querySelector('.sidebar').getBoundingClientRect().top-document.querySelector('.header').getBoundingClientRect().height)<1));
        await page.evaluate(()=>{document.querySelector('.sidebar').classList.remove('open');document.getElementById('loginScreen').classList.remove('hidden')});
        const manifest=await (await context.request.get(base+'manifest.webmanifest')).json();
        assert.equal(manifest.display,'standalone');assert.equal(manifest.dir,'rtl');
        assert.equal(new URL(manifest.start_url,base).href,base+'index.html');
        assert.equal(new URL(manifest.scope,base).href,base);
        for(const icon of manifest.icons) {
            const response=await context.request.get(base+icon.src);assert.ok(response.ok());
            const image=await response.body(),size=Number(icon.sizes.split('x')[0]);
            assert.equal(image.readUInt32BE(16),size);assert.equal(image.readUInt32BE(20),size);
        }
        const cdp=await context.newCDPSession(page);
        const appManifest=await cdp.send('Page.getAppManifest');assert.ok(appManifest.data);assert.equal(appManifest.errors.length,0);
        await page.locator('.install-login').click();
        await page.getByRole('dialog').waitFor();
        assert.ok((await page.getByRole('dialog').innerText()).includes('Chrome'));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:'tests/pwa-install-mobile.png'});
        await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').isVisible(),false);
        await page.evaluate(()=>{
            const event=new Event('beforeinstallprompt',{cancelable:true});
            event.prompt=async()=>{window.promptCalls=(window.promptCalls||0)+1};event.userChoice=Promise.resolve({outcome:'dismissed'});
            window.promptEvent=event;dispatchEvent(event);
        });
        assert.ok(await page.evaluate(()=>promptEvent.defaultPrevented));
        await page.locator('.install-login').click();
        assert.equal(await page.evaluate(()=>promptCalls),1);
        assert.equal(await page.locator('.install-login').isVisible(),true);
        assert.equal(await page.locator('.install-login').isDisabled(),false);
        await page.evaluate(()=>dispatchEvent(new Event('appinstalled')));
        assert.equal(await page.locator('.install-login').isVisible(),false);
        await page.evaluate(()=>fetch('./api/private').then(r=>r.json()));
        const cacheURLs=await page.evaluate(async()=>{
            const cache=await caches.open('lawfirm-offline-v1');return (await cache.keys()).map(r=>r.url);
        });
        assert.deepEqual(cacheURLs.sort(),[base+'offline.html',base+'icons/icon-192.png'].sort());
        await context.setOffline(true);await page.goto(base+'index.html');
        assert.ok((await page.locator('h1').innerText()).includes('الاتصال'));
        await page.screenshot({path:'tests/pwa-offline-mobile.png'});
        await context.setOffline(false);await page.getByRole('button',{name:'إعادة المحاولة'}).click();
        await page.locator('#loginForm').waitFor();assert.deepEqual(errors,[]);
        await context.close();
        const ios=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
        const iphone=await ios.newPage();await iphone.goto(base+'index.html');
        await iphone.locator('.install-login').click();assert.ok((await iphone.getByRole('dialog').innerText()).includes('Safari'));
        await ios.close();
        const standalone=await browser.newContext();
        await standalone.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
        const app=await standalone.newPage();await app.goto(base+'index.html');
        assert.equal(await app.locator('.install-login').isVisible(),false);await standalone.close();
        console.log('PASS: manifest/subpath scope, PNG sizes, browser manifest validation, install prompt/dismissal, installed state, iPhone guidance, mobile, real service worker offline/recovery, static-only cache. Installation events simulated; no live database.');
    } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
