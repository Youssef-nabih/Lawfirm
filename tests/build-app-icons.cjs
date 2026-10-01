const {chromium}=require('C:/Users/Ahmed Nabih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
    const browser=await chromium.launch({headless:true,channel:'msedge'});
    try {
        const page=await browser.newPage({deviceScaleFactor:1});
        const svg=fs.readFileSync('icons/app-icon.svg','utf8');
        for(const [name,size,maskable] of [['icon-192.png',192,false],['icon-512.png',512,false],['apple-touch-icon.png',180,false],['icon-maskable-512.png',512,true]]) {
            const content=maskable?svg.replace('rx="100"','rx="0"'):svg;
            await page.setContent(`<style>body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${content}`);
            await page.locator('svg').screenshot({path:'icons/'+name,omitBackground:true});
        }
    } finally {await browser.close();}
    console.log('Built home-screen, Apple and maskable icons from the local vector source.');
})().catch(e=>{console.error(e);process.exitCode=1});
