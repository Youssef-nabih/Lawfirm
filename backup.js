(() => {
'use strict';
const tables = {companies:'الشركات',clients:'الموكلون',cases:'القضايا',case_sessions:'الجلسات',client_expenses:'المصروفات',tasks:'المهام العامة',company_tasks:'مهام الشركات'};
const LIMIT = 100 * 1024 * 1024;
let busy=false, preview=null;
const item=document.createElement('li'); item.hidden=true;
item.innerHTML='<a href="#"><i class="fa-solid fa-shield-halved"></i> النسخ الاحتياطي</a>';
document.querySelector('.sidebar .menu').append(item);
const section=document.createElement('div');section.id='backups';section.className='page-section';
section.innerHTML=`<div class="panel"><div class="panel-header"><h2>النسخ الاحتياطي</h2><span class="badge badge-active">للمدير فقط</span></div>
<p class="section-note">احتفظ بنسخة من بيانات المكتب على جهازك أو هارد خارجي. النسخة الكاملة تشمل المرفقات المرتبطة بالسجلات، ولا تشمل حسابات الدخول وكلمات المرور أو الملفات غير المرتبطة بسجلات.</p>
<div class="backup-options"><button class="btn btn-primary" data-export="data">تنزيل نسخة البيانات</button><button class="btn btn-primary" data-export="full">تنزيل نسخة بالمرفقات</button><button class="btn btn-success" data-excel>تصدير Excel</button></div>
<p class="section-note">Excel للمراجعة والطباعة: كل قسم في ورقة عربية مستقلة، والمرفقات روابط. لاستعادة البيانات داخل النظام استخدم نسخة JSON.</p>
<p class="section-note">احتفظ بالنسخة في مكان آمن؛ تحتوي على بيانات المكتب وليست مشفّرة. الحد لهذه الأداة 100 ميجابايت للنسخة الواحدة؛ الأرشيفات الأكبر تحتاج نسخًا على مستوى الخادم.</p></div>
<div class="panel"><div class="panel-header"><h2>استعادة نسخة احتياطية</h2></div><p class="section-note">اختر نسخة من نفس المشروع لمعاينتها أولًا. الاستعادة تستبدل السجلات المتطابقة وتضيف السجلات المفقودة، وتحتفظ بالسجلات غير الموجودة في النسخة. المرفقات المستعادة تُرفع كملفات جديدة.</p>
<label class="form-group">ملف النسخة الاحتياطية<input type="file" accept=".json,application/json" data-file></label><div data-preview></div>
<div data-confirm hidden><label class="backup-confirm"><input type="checkbox" data-consent> راجعت النسخة وأوافق على استبدال بيانات السجلات المتطابقة. احتفظت بنسخة حديثة قبل الاستعادة.</label><button class="btn btn-warning" data-restore disabled>استعادة النسخة</button></div></div>
<div class="panel backup-status" role="status" aria-live="polite" data-status>جاهز. اختر تنزيل نسخة أو معاينة نسخة محفوظة.</div>`;
document.querySelector('.content').append(section);
const el=s=>section.querySelector(s);
const allowed=()=>Boolean(currentUser && currentProfile?.role==='admin' && currentProfile.status==='approved');
function guard(){if(!allowed()) throw new Error('هذه العملية متاحة لمدير النظام المعتمد فقط.');}
function visibility(){item.hidden=!allowed();if(!allowed()){preview=null;el('[data-preview]').replaceChildren();el('[data-confirm]').hidden=true;el('[data-file]').value='';if(section.classList.contains('active')) switchPage('dashboard',document.querySelector('.sidebar a'));}}
window.updateBackupVisibility=visibility;
visibility();
item.querySelector('a').onclick=event=>{event.preventDefault();if(!allowed())return;switchPage('backups',item.querySelector('a'));document.getElementById('workspaceTitle').textContent='النسخ الاحتياطي';document.querySelector('.sidebar').classList.remove('open');document.querySelector('.menu-toggle').setAttribute('aria-expanded','false');};
function status(message){el('[data-status]').textContent=message;}
function setBusy(value){busy=value;section.querySelectorAll('button,input').forEach(node=>node.disabled=value);el('[data-restore]').disabled=value || !preview || !el('[data-consent]').checked;}
function friendly(error){const message=String(error?.message||error);if(error?.code==='PGRST202'||message.includes('office_backup_')&&message.includes('find'))return 'النسخ الاحتياطي يحتاج التفعيل مرة واحدة. شغّل ملف 002_office_backups.sql في SQL Editor بمشروع Supabase.';if(message.includes('DATA_CHANGED'))return 'تغيّرت بيانات المكتب بعد المعاينة. اختر الملف مرة أخرى لمراجعة نسخة حديثة قبل الاستعادة.';if(message.includes('SCHEMA_CHANGED'))return 'بنية البيانات تغيّرت؛ هذه النسخة تحتاج ترحيلًا قبل استعادتها.';return message;}
async function rpc(name,args){guard();const {data,error}=await db.rpc(name,args);if(error)throw error;return data;}
async function digest(value){const bytes=new TextEncoder().encode(JSON.stringify(value));const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');}
function saveFile(value,name){const blob=new Blob([JSON.stringify(value)],{type:'application/json'});if(blob.size>LIMIT)throw new Error('النسخة أكبر من 100 ميجابايت. استخدم نسخ الخادم للبيانات والمرفقات الكبيرة.');const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function fileRefs(data){const refs=new Map();const origin=new URL(SUPABASE_URL).origin;for(const rows of Object.values(data))for(const row of rows)for(const [key,value] of Object.entries(row)){
 if(!key.endsWith('_url')||!value)continue;
 let url;try{url=new URL(value);}catch{throw new Error('يوجد رابط مرفق غير صالح في البيانات.');}
 const prefix='/storage/v1/object/public/';
 if(url.origin!==origin||!url.pathname.startsWith(prefix))throw new Error('يوجد مرفق خارج تخزين المشروع؛ استخدم نسخة البيانات واحفظ المرفق الخارجي بصورة منفصلة.');
 const [bucket,...parts]=url.pathname.slice(prefix.length).split('/');const path=decodeURIComponent(parts.join('/'));
 if(bucket!=='documents'||!path||path.split('/').some(p=>p==='..'||p==='.')||path.includes('\\'))throw new Error('مسار مرفق غير مدعوم.');
 refs.set(value,{url:value,bucket,path});
}return [...refs.values()];}
function encode(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذر قراءة المرفق.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(blob);});}
function decode(base64,type){if(typeof base64!=='string'||base64.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw new Error('بيانات مرفق غير صالحة.');const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));return new Blob([bytes],{type:type||'application/octet-stream'});}
async function exportBackup(mode){if(busy)return;setBusy(true);try{guard();status('جاري قراءة بيانات المكتب…');const snapshot=await rpc('office_backup_export');const backup={format:'ahmed-nabih-office',version:1,project:new URL(SUPABASE_URL).origin,createdAt:new Date().toISOString(),mode,schema:snapshot.schema,tables:snapshot.tables,files:[]};
 if(mode==='full'){const refs=fileRefs(backup.tables);let bytes=new Blob([JSON.stringify(backup)]).size;for(let i=0;i<refs.length;i++){guard();status(`جاري تنزيل المرفق ${i+1} من ${refs.length}…`);const ref=refs[i];const {data,error}=await db.storage.from(ref.bucket).download(ref.path);if(error)throw new Error('تعذر تنزيل أحد المرفقات؛ لم يتم إنشاء نسخة ناقصة.');bytes+=Math.ceil(data.size/3)*4+JSON.stringify(ref).length+200;if(bytes>LIMIT)throw new Error('المرفقات تتجاوز حد النسخة 100 ميجابايت. استخدم نسخ الخادم للأرشيف الكبير.');backup.files.push({...ref,type:data.type,base64:await encode(data)});}}
 const envelope={backup,sha256:await digest(backup)};guard();saveFile(envelope,`office-backup-${mode}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);status('تم تجهيز النسخة وإرسالها للتنزيل. تأكد من حفظ الملف على جهازك.');
 }catch(error){status('تعذّر إنشاء النسخة: '+friendly(error));}finally{setBusy(false);}}
async function validate(envelope){const b=envelope?.backup;if(!b||b.format!=='ahmed-nabih-office'||b.version!==1||!['data','full'].includes(b.mode))throw new Error('الملف ليس نسخة مدعومة من هذا النظام.');if(b.project!==new URL(SUPABASE_URL).origin)throw new Error('هذه النسخة تخص مشروعًا آخر.');if(await digest(b)!==envelope.sha256)throw new Error('فشل التحقق من سلامة النسخة؛ الملف تالف أو تم تعديله.');if(!b.tables||Object.keys(b.tables).sort().join()!==Object.keys(tables).sort().join()||typeof b.schema!=='string'||!Number.isFinite(Date.parse(b.createdAt)))throw new Error('محتويات النسخة غير مكتملة.');for(const name of Object.keys(tables)){const rows=b.tables[name];if(!Array.isArray(rows))throw new Error('جدول غير صالح.');const ids=new Set();for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row)||!['string','number'].includes(typeof row.id)||ids.has(String(row.id)))throw new Error('سجلات أو معرفات غير صالحة.');ids.add(String(row.id));}}
 if(!Array.isArray(b.files))throw new Error('قائمة المرفقات غير صالحة.');if(b.mode==='data'&&b.files.length)throw new Error('مرفقات غير متوقعة.');if(b.mode==='full'){const refs=fileRefs(b.tables);if(refs.length!==b.files.length)throw new Error('مرفقات مفقودة أو مكررة.');const urls=new Set();for(const file of b.files){const ref=refs.find(r=>r.url===file.url);if(!ref||ref.bucket!==file.bucket||ref.path!==file.path||urls.has(file.url))throw new Error('مرفق لا يطابق البيانات.');urls.add(file.url);decode(file.base64,file.type);}}
 return b;}
async function inspectFile(file){if(busy)return;preview=null;el('[data-preview]').replaceChildren();el('[data-confirm]').hidden=true;el('[data-consent]').checked=false;if(!file)return;setBusy(true);try{guard();if(file.size>LIMIT)throw new Error('الملف يتجاوز حد 100 ميجابايت.');status('جاري التحقق من النسخة ومقارنتها بالبيانات الحالية…');const backup=await validate(JSON.parse(await file.text()));const current=await rpc('office_backup_export');if(current.schema!==backup.schema)throw new Error('SCHEMA_CHANGED');const summaries=Object.entries(tables).map(([name,label])=>{const ids=new Set(current.tables[name].map(r=>String(r.id)));const overwrite=backup.tables[name].filter(r=>ids.has(String(r.id))).length;return `<tr><td>${label}</td><td>${backup.tables[name].length}</td><td>${overwrite}</td><td>${backup.tables[name].length-overwrite}</td></tr>`;}).join('');guard();preview={backup,revision:current.revision,user:currentUser.id};el('[data-preview]').innerHTML=`<p class="section-note">تاريخ النسخة: ${escapeHtml(new Date(backup.createdAt).toLocaleString('ar-EG'))} · المرفقات: ${backup.files.length}</p><div class="table-scroll"><table><thead><tr><th>البيانات</th><th>في النسخة</th><th>سيتم استبدالها</th><th>ستتم إضافتها</th></tr></thead><tbody>${summaries}</tbody></table></div>${backup.mode==='data'?'<p class="task-message">هذه نسخة بيانات فقط. روابط المرفقات محفوظة، لكن الملفات نفسها لن تُستعاد إذا كانت محذوفة.</p>':''}`;el('[data-confirm]').hidden=false;status('النسخة سليمة وقابلة للمعاينة. لم يتم تغيير أي بيانات.');}catch(error){status('تعذّر فتح النسخة: '+friendly(error));}finally{setBusy(false);}}
async function restore(){if(busy||!preview||!el('[data-consent]').checked)return;guard();if(preview.user!==currentUser.id)return;if(!confirm('تأكيد استبدال السجلات المتطابقة ببيانات النسخة؟ لن تُحذف السجلات الأخرى.'))return;setBusy(true);let committed=false,commitAttempted=false;const uploaded=[];try{const b=preview.backup;const data=structuredClone(b.tables);const replacements=new Map();const prefix='restored/'+crypto.randomUUID();
 for(let i=0;i<b.files.length;i++){guard();status(`جاري استعادة المرفق ${i+1} من ${b.files.length}…`);const file=b.files[i];const path=prefix+'/'+i+'/'+file.path.split('/').pop();const {error}=await db.storage.from(file.bucket).upload(path,decode(file.base64,file.type),{upsert:false,contentType:file.type||'application/octet-stream'});if(error)throw new Error('تعذر رفع المرفقات؛ لم يتم تغيير بيانات السجلات.');uploaded.push({bucket:file.bucket,path});const result=db.storage.from(file.bucket).getPublicUrl(path);replacements.set(file.url,result.data.publicUrl);}
 for(const rows of Object.values(data))for(const row of rows)for(const key of Object.keys(row))if(key.endsWith('_url')&&replacements.has(row[key]))row[key]=replacements.get(row[key]);
 status('جاري حفظ البيانات…');commitAttempted=true;await rpc('office_backup_restore',{p_tables:data,p_schema:b.schema,p_expected_revision:preview.revision});committed=true;preview=null;el('[data-confirm]').hidden=true;el('[data-preview]').replaceChildren();el('[data-file]').value='';status('تمت الاستعادة بنجاح. حدّث الصفحة لعرض البيانات المستعادة.');
 }catch(error){let cleanupFailed=false;if(!committed&&!commitAttempted)for(const file of uploaded){try{const {error:cleanupError}=await db.storage.from(file.bucket).remove([file.path]);if(cleanupError)cleanupFailed=true;}catch{cleanupFailed=true;}}status('تعذّرت الاستعادة: '+friendly(error)+(commitAttempted?' لو انقطع الاتصال، قد يكون الحفظ تم بالفعل. حدّث الصفحة وتحقق من البيانات قبل إعادة المحاولة. تم الاحتفاظ بالمرفقات المرفوعة لتجنّب فقدها.':'')+(cleanupFailed?' بعض الملفات الجديدة تحتاج تنظيفًا بواسطة مسؤول النظام.':''));}finally{setBusy(false);}}
async function exportExcel(){
    if(busy)return;
    setBusy(true);
    try{
        guard();
        status('جاري تجهيز ملف Excel…');
        const snapshot=await rpc('office_backup_export');
        const book=await window.OfficeExcel.build(snapshot.tables);
        const bytes=await book.xlsx.writeBuffer();
        guard();
        const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        if(blob.size>LIMIT)throw new Error('ملف Excel أكبر من 100 ميجابايت. استخدم تصديرًا على مستوى الخادم.');
        const url=URL.createObjectURL(blob);
        const link=document.createElement('a');
        link.href=url;link.download=`office-report-${new Date().toISOString().replace(/[:.]/g,'-')}.xlsx`;
        link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
        status('تم تجهيز ملف Excel وإرساله للتنزيل، ويشمل 7 أوراق منسّقة.');
    }catch(error){status('تعذّر تصدير Excel: '+friendly(error));}
    finally{setBusy(false);}
}
el('[data-excel]').onclick=exportExcel;
section.querySelectorAll('[data-export]').forEach(button=>button.onclick=()=>exportBackup(button.dataset.export));
el('[data-file]').onchange=event=>inspectFile(event.target.files[0]);el('[data-consent]').onchange=()=>{el('[data-restore]').disabled=!preview||!el('[data-consent]').checked;};el('[data-restore]').onclick=restore;
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
})();
