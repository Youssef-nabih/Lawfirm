const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '../preview');
fs.mkdirSync(dir,{recursive:true});
const mock = `
const demoDay = new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const demoCases = [
 {id:1,name:'نزاع عقد توريد تجاري',client_name:'شركة الأفق للتجارة',case_number:'١٢٤٥',case_year:'٢٠٢٦',case_type:'تجاري',court_name:'محكمة القاهرة الاقتصادية',assigned_lawyer:'أحمد نبيه',status:'متداولة',opponent:'شركة النور',case_details:'مطالبة بتنفيذ الالتزامات التعاقدية وتسوية المستحقات. يجري تجهيز المستندات ومراجعة محاضر التسليم.'},
 {id:2,name:'دعوى تعويض مدني',client_name:'عمر حسن',case_number:'٨٣٢',case_year:'٢٠٢٦',case_type:'مدني',court_name:'محكمة شمال القاهرة',assigned_lawyer:'سارة محمود',status:'متداولة'},
 {id:3,name:'مراجعة عقد شراكة',client_name:'شركة مدار للاستثمار',case_number:'٣١٦',case_year:'٢٠٢٦',case_type:'تجاري',court_name:'محكمة الجيزة',assigned_lawyer:'أحمد نبيه',status:'قيد المراجعة'}
];
const demoSessions = [
 {id:1,case_id:1,session_date:'2026-09-01T10:00',session_subject:'تقديم حافظة المستندات',attending_lawyer:'أحمد نبيه',decision:'تم تقديم أصل العقد ومحاضر التسليم، والتأجيل للاطلاع.'},
 {id:2,case_id:1,session_date:demoDay+'T10:00',session_subject:'مرافعة ومناقشة المستندات',attending_lawyer:'أحمد نبيه',decision:''},
 {id:3,case_id:2,session_date:demoDay+'T12:30',session_subject:'سماع أقوال الشهود',attending_lawyer:'سارة محمود',decision:''}
];
const demoTasks=[{id:1,title:'مراجعة مذكرة الدفاع — الأفق',is_important:true,due_date:'2026-01-01',completed:false},{id:2,title:'استكمال مستندات التوكيل',due_date:'2026-01-02',completed:false},{id:3,title:'تجهيز ملف جلسة التعويض',due_date:demoDay,completed:false}];
window.supabase={createClient:()=>({from(table){let filters=[];const q={select(){return q},order(){return q},eq(k,v){filters.push([k,v]);return q},then(resolve){let rows=table==='case_sessions'?demoSessions:table==='cases'?demoCases:table==='tasks'?demoTasks:[];return Promise.resolve(resolve({data:rows.filter(r=>filters.every(([k,v])=>r[k]===v)),error:null}));}};return q;}})};
`;
const init = `
initializeApp=async()=>{
currentUser={id:'demo'};currentProfile={role:'admin',status:'approved'};
document.getElementById('loginScreen')?.classList.add('hidden');
document.getElementById('currentUserGreeting').textContent='أحمد · مدير المكتب';
allCasesCache=demoCases;renderCasesTable(demoCases);await fetchTasks();await refreshOfficeSessions();
document.getElementById('stat-companies-count').textContent='12';document.getElementById('stat-active-companies-count').textContent='9';document.getElementById('stat-cases-count').textContent='3';document.getElementById('stat-tasks-count').textContent='3';
const note=document.createElement('div');note.className='demo-notice';note.textContent='معاينة تفاعلية · بيانات تجريبية · لا تتصل بقاعدة المكتب';document.querySelector('.header').prepend(note);
};
loadAccessRequests=async()=>{};
document.addEventListener('click',event=>{const b=event.target.closest('button,a');if(!b)return;const code=b.getAttribute('onclick')||'';if(/add|save|delete|logout|Edit|upload/i.test(code)){event.preventDefault();event.stopImmediatePropagation();alert('هذه معاينة فقط. التعديل متاح في النظام الأساسي بعد تسجيل الدخول.');}},true);
`;
let html=fs.readFileSync('index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
html=html.replace('href="theme.css"','href="../theme.css"').replace('href="experience.css"','href="../experience.css"');
html=html.replace('</body>',`<style>.demo-notice{font-size:10px;color:#98744e}.logout-btn{display:none}</style><script>${mock}</script><script src="../app.js"></script><script src="../workspace.js"></script><script src="../experience.js"></script><script>${init}</script></body>`);
fs.writeFileSync(path.join(dir,'index.html'),html);
console.log('Preview built with isolated synthetic data.');
