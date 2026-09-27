(() => {
'use strict';
const tables = {companies:'الشركات',clients:'الموكلون',cases:'القضايا',case_sessions:'الجلسات',client_expenses:'المصروفات',tasks:'المهام العامة',company_tasks:'مهام الشركات'};
const actions = {INSERT:'إضافة',UPDATE:'تعديل',DELETE:'حذف'};
const allowed = () => Boolean(currentUser && currentProfile?.role === 'admin' && currentProfile.status === 'approved');
const item = document.createElement('li');
item.id = 'activityMenuItem'; item.hidden = true;
item.innerHTML = '<a href="#"><i class="fa-solid fa-clock-rotate-left"></i> الأنشطة</a>';
document.getElementById('employeesMenuItem').after(item);
const section = document.createElement('div');
section.id = 'activities'; section.className = 'page-section'; section.hidden = true;
section.innerHTML = `<div class="panel"><div class="panel-header"><h2>الأنشطة</h2><span class="badge badge-active">للمدير فقط</span></div>
<p class="section-note">سجل الإضافة والتعديل والحذف في بيانات المكتب، من وقت تفعيل السجل. الأوقات بتوقيت القاهرة.</p>
<form class="activity-filters">
<label>الموظف<input name="actor" placeholder="الاسم أو اسم المستخدم" maxlength="100"></label>
<label>العملية<select name="action"><option value="">كل العمليات</option>${Object.entries(actions).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
<label>القسم<select name="table"><option value="">كل الأقسام</option>${Object.entries(tables).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
<button class="btn btn-primary" type="submit">بحث / تحديث</button></form>
<p role="status" aria-live="polite" data-status></p>
<div class="popup-table-scroll"><table><thead><tr><th>التاريخ والوقت</th><th>الموظف</th><th>العملية</th><th>القسم</th><th>السجل</th><th>تفاصيل التعديل</th></tr></thead><tbody></tbody></table></div>
<div class="activity-pagination"><button class="btn btn-secondary" data-prev>السابق</button><span data-page></span><button class="btn btn-secondary" data-next>التالي</button></div></div>`;
document.querySelector('.content').append(section);
const el = s => section.querySelector(s);
let version = 0, page = 0, filters = {}, busy = false, hasNext = false;
const pageSize = 50;
function controls() { el('[data-prev]').disabled = busy || page === 0; el('[data-next]').disabled = busy || !hasNext; }
window.updateActivityVisibility = () => {
    item.hidden = section.hidden = !allowed();
    if (!allowed()) {
        version++; busy = false; page = 0; filters = {}; hasNext = false;
        el('tbody').replaceChildren(); el('form').reset(); el('[data-status]').textContent = ''; el('[data-page]').textContent = '';
        if (section.classList.contains('active')) switchPage('dashboard', document.querySelector('.sidebar a'));
    }
};
async function load() {
    if (!allowed()) return;
    const request = ++version, userId = currentUser.id;
    busy = true; controls(); el('tbody').replaceChildren(); el('[data-status]').textContent = 'جاري تحميل الأنشطة…';
    try {
        let query = db.from('activity_log').select('*').order('occurred_at',{ascending:false}).order('id',{ascending:false});
        if (filters.actor) {
            const term = filters.actor.replace(/[\\%_]/g,'\\$&').replace(/[(),".]/g,' ');
            query = query.or(`actor_name.ilike.%${term}%,actor_username.ilike.%${term}%`);
        }
        if (filters.action) query = query.eq('action',filters.action);
        if (filters.table) query = query.eq('table_name',filters.table);
        const {data,error} = await query.range(page * pageSize, (page + 1) * pageSize);
        if (request !== version || !allowed() || userId !== currentUser.id) return;
        if (error) throw error;
        hasNext = data.length > pageSize;
        el('tbody').innerHTML = data.slice(0,pageSize).map(row => {
            const date = new Date(row.occurred_at).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'});
            const cells = [date, row.actor_name + (row.actor_username ? ` (@${row.actor_username})` : ''), actions[row.action] || row.action, tables[row.table_name] || row.table_name, row.record_label || row.record_id || '—', row.action === 'UPDATE' ? `تعديل ${(row.changed_fields || []).length} حقل` : '—'];
            return '<tr>' + cells.map(value=>`<td>${escapeHtml(String(value))}</td>`).join('') + '</tr>';
        }).join('');
        el('[data-status]').textContent = data.length ? '' : 'لا توجد أنشطة مطابقة.';
        el('[data-page]').textContent = `صفحة ${page + 1}`;
    } catch(error) {
        if (request !== version || !allowed() || userId !== currentUser.id) return;
        hasNext = false;
        el('[data-status]').textContent = ['PGRST205','42P01'].includes(error.code) ? 'سجل الأنشطة لم يُفعّل بعد. تواصل مع مسؤول النظام لتفعيله.' : 'تعذّر تحميل الأنشطة. حاول التحديث مرة أخرى.';
    } finally { if(request === version) {busy = false; controls();} }
}
item.querySelector('a').onclick = event => {
    event.preventDefault(); if (!allowed()) return;
    switchPage('activities',item.querySelector('a'));
    document.getElementById('workspaceTitle').textContent = 'الأنشطة';
    document.querySelector('.sidebar').classList.remove('open');
    document.querySelector('.menu-toggle').setAttribute('aria-expanded','false');
    page = 0; load();
};
el('form').onsubmit = event => {
    event.preventDefault(); filters = Object.fromEntries(new FormData(el('form')));
    filters.actor = filters.actor.trim(); page = 0; load();
};
el('[data-prev]').onclick = () => {if (!busy && page > 0) {page--;load();}};
el('[data-next]').onclick = () => {if (!busy && hasNext) {page++;load();}};
window.updateActivityVisibility(); controls();
})();
