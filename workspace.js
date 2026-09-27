// Workspace presentation is independent of the existing authentication and data flows.
const pageTitles = {dashboard:'نظرة عامة',companies:'إدارة الشركات',cases:'إدارة القضايا',tasks:'المهام والمواعيد',clients:'إدارة الموكلين',employees:'الموظفون'};
const menuButton = document.querySelector('.menu-toggle');
menuButton.addEventListener('click', () => {
    const open = document.querySelector('.sidebar').classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('.sidebar a').forEach(link => link.addEventListener('click', () => {
    const active = document.querySelector('.page-section.active');
    document.getElementById('workspaceTitle').textContent = pageTitles[active?.id] || 'مساحة العمل';
    document.querySelector('.sidebar').classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
}));
document.querySelectorAll('.page-section table').forEach(table => {
    if (table.parentElement.classList.contains('popup-table-scroll')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    table.before(wrapper);
    wrapper.append(table);
});

let companyWorkspace = null;
function closeCompanyWorkspace() {
    if (!companyWorkspace || companyWorkspace.busy) return;
    const overlay = companyWorkspace.overlay;
    companyWorkspace = null;
    overlay.remove();
    restorePopupFocus(overlay);
}
function canEditCompanyTasks() {
    return Boolean(currentUser && currentProfile?.status === 'approved' && ['admin','employee'].includes(currentProfile.role));
}
function companyTaskError(error) {
    if (['42P01','PGRST205'].includes(error?.code)) return 'مهام الشركات غير مفعّلة بعد. يرجى التواصل مع مسؤول النظام لتفعيلها.';
    return 'تعذر حفظ أو تحميل المهام. تحقق من الاتصال وصلاحيات حسابك ثم حاول مرة أخرى.';
}
function resetCompanyTaskForm(state) {
    state.editId = null;
    state.overlay.querySelector('form').reset();
    state.overlay.querySelector('[data-save]').textContent = 'إضافة المهمة';
    state.overlay.querySelector('[data-cancel]').hidden = true;
}
async function openCompanyWorkspace(id) {
    if (!requireLogin()) return;
    if (companyWorkspace?.busy) return;
    const company = allCompaniesCache.find(item => String(item.id) === String(id));
    if (!company) return;
    closeCompanyWorkspace();
    const overlay = document.createElement('div');
    overlay.className = 'details-overlay';
    const state = {id:company.id,overlay,tasks:[],editId:null,busy:false};
    companyWorkspace = state;
    overlay.innerHTML = `<div class="details-modal">
        <div class="details-modal-header"><div><span class="eyebrow">ملف الشركة</span><h2>${escapeHtml(company.name || '')}</h2></div><button type="button" class="btn btn-secondary" data-close aria-label="إغلاق ملف الشركة">إغلاق ×</button></div>
        <div class="details-grid"><div class="details-item"><label>الاسم القانوني</label>${escapeHtml(company.legal_name || '—')}</div><div class="details-item"><label>رقم التسجيل الضريبي</label>${escapeHtml(company.tax_id || '—')}</div><div class="details-item"><label>البريد الإلكتروني</label>${escapeHtml(company.email || '—')}</div><div class="details-item"><label>الهاتف</label>${escapeHtml(company.phone || '—')}</div></div>
        <div class="panel-header"><div><h2>مهام الشركة</h2><p class="section-note">أعمال ومواعيد خاصة بهذه الشركة، مستقلة عن المهام العامة.</p></div><button type="button" class="btn btn-secondary" data-refresh>تحديث</button></div>
        <form class="company-form" ${canEditCompanyTasks() ? '' : 'hidden'}>
            <div class="form-grid"><div class="form-group"><label for="companyTaskTitle">عنوان المهمة</label><input id="companyTaskTitle" name="title" required maxlength="250" placeholder="مثال: تجديد السجل التجاري"></div><div class="form-group"><label for="companyTaskDate">موعد التنفيذ</label><input id="companyTaskDate" name="due_date" type="date" required></div></div>
            <div class="form-group"><label for="companyTaskDescription">تفاصيل المهمة <span class="section-note">(اختياري)</span></label><textarea id="companyTaskDescription" name="description" rows="3" maxlength="5000" placeholder="أضف التفاصيل المطلوبة لتنفيذ المهمة"></textarea></div>
            <div class="company-task-actions" style="margin-top:16px"><button class="btn btn-primary" type="submit" data-save>إضافة المهمة</button><button class="btn btn-secondary" type="button" data-cancel hidden>إلغاء التعديل</button></div>
        </form>
        <p class="task-message" role="status" aria-live="polite"></p><div class="company-task-list" aria-live="polite"></div>
    </div>`;
    document.body.append(overlay);
    overlay.querySelector('[data-close]').onclick = closeCompanyWorkspace;
    overlay.querySelector('[data-refresh]').onclick = () => loadCompanyTasks(state);
    overlay.querySelector('[data-cancel]').onclick = () => resetCompanyTaskForm(state);
    overlay.querySelector('form').onsubmit = event => {event.preventDefault(); saveCompanyTask(state);};
    preparePopup(overlay, closeCompanyWorkspace);
    await loadCompanyTasks(state);
}
function setCompanyBusy(state, busy) {
    state.busy = busy;
    state.overlay.querySelectorAll('button,input,textarea').forEach(el => {el.disabled = busy;});
}
async function loadCompanyTasks(state) {
    if (state !== companyWorkspace || state.busy) return;
    setCompanyBusy(state,true);
    const list = state.overlay.querySelector('.company-task-list');
    const message = state.overlay.querySelector('.task-message');
    message.textContent = '';
    list.textContent = 'جاري تحميل مهام الشركة…';
    try {
        const {data,error} = await db.from('company_tasks').select('*').eq('company_id',state.id).order('due_date',{ascending:true}).order('id',{ascending:false});
        if (error) throw error;
        if (state !== companyWorkspace) return;
        state.tasks = data || [];
        renderCompanyTasks(state);
    } catch(error) {
        list.textContent = '';
        message.textContent = companyTaskError(error);
    } finally {setCompanyBusy(state,false);}
}
function renderCompanyTasks(state) {
    const list = state.overlay.querySelector('.company-task-list');
    list.replaceChildren();
    if (!state.tasks.length) {
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-list-check"></i><h3>لا توجد مهام لهذه الشركة بعد</h3><p>تظهر هنا مهام الشركة ومواعيد تنفيذها.</p></div>';
        return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    state.tasks.forEach(task => {
        const overdue = !task.completed && task.due_date && new Date(task.due_date+'T00:00:00') < today;
        const card = document.createElement('article');
        card.className = 'company-task' + (task.completed ? ' completed' : '');
        const status = task.completed ? 'مكتملة' : overdue ? 'متأخرة' : 'قيد التنفيذ';
        card.innerHTML = `<div><span class="badge ${task.completed ? 'badge-active' : overdue ? 'badge-suspended' : 'badge-pending'}">${status}</span><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.description || '')}</p><time>${task.due_date ? 'موعد التنفيذ: '+escapeHtml(task.due_date) : 'بدون موعد'}</time></div>`;
        if (canEditCompanyTasks()) {
            const actions = document.createElement('div'); actions.className='company-task-actions';
            const addAction = (label,style,handler) => {const button=document.createElement('button');button.type='button';button.className='btn btn-sm '+style;button.textContent=label;button.onclick=handler;actions.append(button);};
            addAction(task.completed ? 'إعادة فتح' : 'إكمال','btn-success',()=>mutateCompanyTask(state,task,'toggle'));
            addAction('تعديل','btn-secondary',()=>{
                state.editId=task.id;
                const form=state.overlay.querySelector('form');
                form.elements.title.value=task.title;
                form.elements.description.value=task.description || '';
                form.elements.due_date.value=task.due_date || '';
                state.overlay.querySelector('[data-save]').textContent='حفظ التعديلات';
                state.overlay.querySelector('[data-cancel]').hidden=false;
                form.elements.title.focus();
            });
            addAction('حذف','btn-danger',()=>mutateCompanyTask(state,task,'delete'));
            card.append(actions);
        }
        list.append(card);
    });
}
async function saveCompanyTask(state) {
    if (state !== companyWorkspace || state.busy || !canEditCompanyTasks()) return;
    const form=state.overlay.querySelector('form');
    const payload={title:form.elements.title.value.trim(),description:form.elements.description.value.trim(),due_date:form.elements.due_date.value};
    if (!payload.title || !payload.due_date) {state.overlay.querySelector('.task-message').textContent='أدخل عنوان المهمة وموعد التنفيذ.';return;}
    setCompanyBusy(state,true);
    let success=false;
    try {
        const query=state.editId == null
            ? db.from('company_tasks').insert({...payload,company_id:state.id,created_by:currentUser.id})
            : db.from('company_tasks').update(payload).eq('id',state.editId).eq('company_id',state.id);
        const {data,error}=await query.select('id');
        if(error) throw error;
        if(!data?.length) throw new Error('No row saved');
        resetCompanyTaskForm(state);success=true;
    } catch(error) {state.overlay.querySelector('.task-message').textContent=companyTaskError(error);}
    finally {setCompanyBusy(state,false);}
    if(success) await loadCompanyTasks(state);
}
async function mutateCompanyTask(state,task,action) {
    if(state !== companyWorkspace || state.busy || !canEditCompanyTasks()) return;
    if(action === 'delete' && !confirm('حذف المهمة «'+task.title+'»؟')) return;
    setCompanyBusy(state,true);let success=false;
    try {
        const query=action === 'delete' ? db.from('company_tasks').delete() : db.from('company_tasks').update({completed:!task.completed});
        const {data,error}=await query.eq('id',task.id).eq('company_id',state.id).select('id');
        if(error) throw error;
        if(!data?.length) throw new Error('No row changed');
        if(state.editId === task.id && action === 'delete') resetCompanyTaskForm(state);
        success=true;
    } catch(error) {state.overlay.querySelector('.task-message').textContent=companyTaskError(error);}
    finally {setCompanyBusy(state,false);}
    if(success) await loadCompanyTasks(state);
}
