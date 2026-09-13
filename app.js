const SUPABASE_URL = 'https://oscugslepanxyogvkaxq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zY3Vnc2xlcGFueHlvZ3ZrYXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjI1MTEsImV4cCI6MjEwNDczODUxMX0.AtmmicXa-4JDW0Ck5hkeX3IqANE4XaazmDwceJwocLc';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allCasesCache = []; 

async function uploadFileToSupabase(fileInputOrSource, bucketName = 'documents') {
    let file = null;

    if (typeof fileInputOrSource === 'string') {
        const fileInput = document.getElementById(fileInputOrSource);
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            file = fileInput.files[0];
        }
    } else if (fileInputOrSource instanceof File) {
        file = fileInputOrSource;
    }

    if (!file) return null;  

    const safeFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const fileExt = safeFileName.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error } = await db.storage.from(bucketName).upload(filePath, file);

    if (error) {
        console.error('خطأ أثناء رفع الملف:', error.message);
        alert('فشل رفع الملف: ' + error.message);
        return null;
    }

    const { data: publicUrlData } = db.storage.from(bucketName).getPublicUrl(filePath);
    return publicUrlData.publicUrl;
}

function switchPage(pageId, element) {
    document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.sidebar .menu li a').forEach(a => a.classList.remove('active'));

    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');
    if (element) element.classList.add('active');
}

function switchOdooTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('.odoo-tab-btn').forEach(b => b.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    if (btn) btn.classList.add('active');
}

function addSessionRow(data = {}) {
    const tbody = document.getElementById('sessionsTableBody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="datetime-local" class="session-date" value="${data.session_date || ''}" style="width:100%;"></td>
        <td><input type="text" class="session-subject" value="${data.session_subject || ''}" placeholder="موضوع الجلسة" style="width:100%;"></td>
        <td><input type="text" class="session-lawyer" value="${data.attending_lawyer || ''}" placeholder="المحامي الحاضر" style="width:100%;"></td>
        <td><input type="text" class="session-decision" value="${data.decision || ''}" placeholder="قرار الجلسة / ما تم فيها" style="width:100%;"></td>
        <td><button type="button" class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()"><i class="fa-solid fa-trash"></i></button></td>
    `;
    tbody.appendChild(tr);
}

function handleCaseTypeChange(selectElem) {
    if (selectElem.value === '__add_new__') {
        const newType = prompt('أدخل نوع القضية الجديد:');
        if (newType && newType.trim() !== '') {
            const val = newType.trim();
            const option = document.createElement('option');
            option.value = val;
            option.text = val;
            
            selectElem.add(option, selectElem.options[selectElem.options.length - 1]);
            selectElem.value = val;

            const editSelect = document.getElementById('editCaseType');
            if (editSelect) {
                const editOption = document.createElement('option');
                editOption.value = val;
                editOption.text = val;
                editSelect.add(editOption);
            }
        } else {
            selectElem.selectedIndex = 0;
        }
    }
}

function getStatusBadge(status) {
    const s = status || 'جارية';
    switch (s) {
        case 'جديدة': return `<span class="badge badge-new">جديدة</span>`;
        case 'جارية': return `<span class="badge badge-active">جارية</span>`;
        case 'مؤجلة': return `<span class="badge badge-pending">مؤجلة</span>`;
        case 'تمت': return `<span class="badge badge-done">تمت</span>`;
        case 'مؤرشفة': return `<span class="badge badge-archived">مؤرشفة</span>`;
        default: return `<span class="badge badge-active">${s}</span>`;
    }
}

async function fetchCases() {
    const { data, error } = await db.from('cases').select('*').order('id', { ascending: false });
    if (error) return console.error('Error fetching cases:', error.message);

    allCasesCache = data || [];
    renderCasesTable(allCasesCache);
}

function renderCasesTable(casesData) {
    const fullTable = document.getElementById('casesTableBody');
    const recentTable = document.getElementById('recentCasesTable');
    
    const activeCases = casesData.filter(c => c.status === 'جارية' || c.status === 'جديدة' || !c.status);
    const countStat = document.getElementById('stat-cases-count');
    if (countStat) countStat.innerText = activeCases.length;

    if (!fullTable) return;

    if (!casesData || casesData.length === 0) {
        fullTable.innerHTML = '<tr><td colspan="10" style="text-align:center;">لا توجد قضايا مطابقة</td></tr>';
        if (recentTable) recentTable.innerHTML = '<tr><td colspan="6" style="text-align:center;">لا توجد قضايا مضافة بعد</td></tr>';
        return;
    }

    fullTable.innerHTML = casesData.map(c => `
        <tr>
            <td><b>${c.name || ''}</b></td>
            <td>${c.client_name || 'غير محدد'}</td>
            <td>${c.opponent || 'غير محدد'} ${c.opponent_phone ? `<br><small>📱 ${c.opponent_phone}</small>` : ''}</td>
            <td>${c.case_type || 'مدني'}</td>
            <td>${c.case_number ? `${c.case_number} / ${c.case_year || ''}` : 'غير مسجل'}</td>
            <td>${c.court_name || 'غير محدد'} ${c.court_branch ? `(${c.court_branch})` : ''}</td>
            <td>${c.assigned_lawyer || 'غير محدد'}</td>
            <td>${c.attachment_url ? `<a href="${c.attachment_url}" target="_blank" class="btn btn-sm btn-info"><i class="fa-solid fa-image"></i> عرض المرفق</a>` : 'لا يوجد'}</td>
            <td>${getStatusBadge(c.status)}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="openEditModal(${c.id})"><i class="fa-solid fa-pen"></i> تعديل</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCase(${c.id})"><i class="fa-solid fa-trash"></i> حذف</button>
            </td>
        </tr>
    `).join('');

    if (recentTable) {
        recentTable.innerHTML = casesData.slice(0, 5).map(c => `
            <tr>
                <td><b>${c.name || ''}</b></td>
                <td>${c.client_name || 'غير محدد'}</td>
                <td>${c.case_type || 'مدني'}</td>
                <td>${c.case_number ? `${c.case_number} / ${c.case_year || ''}` : 'غير مسجل'}</td>
                <td>${getStatusBadge(c.status)}</td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="openEditModal(${c.id})">تعديل</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCase(${c.id})">حذف</button>
                </td>
            </tr>
        `).join('');
    }
}

function filterCases(searchTerm = '') {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
        renderCasesTable(allCasesCache);
        return;
    }

    const filtered = allCasesCache.filter(c => 
        (c.name && c.name.toLowerCase().includes(term)) ||
        (c.client_name && c.client_name.toLowerCase().includes(term)) ||
        (c.case_number && c.case_number.toString().includes(term)) ||
        (c.opponent && c.opponent.toLowerCase().includes(term))
    );
    renderCasesTable(filtered);
}

async function addCase() {
    const name = document.getElementById('caseName')?.value.trim();
    const client_name = document.getElementById('clientName')?.value.trim();
    const power_of_attorney_no = document.getElementById('powerOfAttorneyNo')?.value.trim();
    const poa_issue_place = document.getElementById('poaIssuePlace')?.value.trim();
    const poa_issue_year = document.getElementById('poaIssueYear')?.value.trim();

    const opponent = document.getElementById('opponentName')?.value.trim();
    const opponent_phone = document.getElementById('opponentPhone')?.value.trim();

    const case_type = document.getElementById('caseType')?.value;
    const status = document.getElementById('caseStatus')?.value;
    const case_number = document.getElementById('caseNumber')?.value.trim();
    const case_year = document.getElementById('caseYear')?.value.trim();
    const court_name = document.getElementById('courtName')?.value.trim();
    const court_branch = document.getElementById('courtBranch')?.value.trim();
    const assigned_lawyer = document.getElementById('assignedLawyer')?.value.trim();

    const case_details = document.getElementById('caseDetailsNotes')?.value.trim();

    if (!name) return alert('برجاء إدخال موضوع القضية');

    const attachment_url = await uploadFileToSupabase('caseAttachmentInput');

    const newCase = { 
        name, client_name, power_of_attorney_no, poa_issue_place, poa_issue_year,
        opponent, opponent_phone, case_type, status, case_number, case_year, 
        court_name, court_branch, assigned_lawyer, case_details, attachment_url
    };

    const { data: insertedCase, error } = await db.from('cases').insert([newCase]).select().single();

    if (error) return alert('حدث خطأ أثناء الإضافة: ' + error.message);

    const caseId = insertedCase ? insertedCase.id : null;
    if (caseId) {
        const sessionPromises = [];
        document.querySelectorAll('#sessionsTableBody tr').forEach(row => {
            const session_date = row.querySelector('.session-date')?.value;
            const session_subject = row.querySelector('.session-subject')?.value;
            const attending_lawyer = row.querySelector('.session-lawyer')?.value;
            const decision = row.querySelector('.session-decision')?.value;

            if (session_date || session_subject || decision) {
                sessionPromises.push(db.from('case_sessions').insert([{
                    case_id: caseId,
                    session_date: session_date || null,
                    session_subject,
                    attending_lawyer,
                    decision
                }]));
            }
        });
        if (sessionPromises.length > 0) {
            await Promise.all(sessionPromises);
        }
    }

    alert('تمت إضافة القضية بنجاح!');

    const fieldsToReset = [
        'caseName', 'clientName', 'powerOfAttorneyNo', 'poaIssuePlace',
        'poaIssueYear', 'opponentName', 'opponentPhone', 'caseNumber',
        'courtName', 'courtBranch', 'caseDetailsNotes', 'caseAttachmentInput'
    ];
    fieldsToReset.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const sessionsTableBody = document.getElementById('sessionsTableBody');
    if (sessionsTableBody) sessionsTableBody.innerHTML = '';

    fetchCases();
}

async function deleteCase(caseId) {
    const item = allCasesCache.find(c => c.id === caseId);
    const caseTitle = item ? item.name : 'هذه القضية';

    if (!confirm(`هل أنت متأكد من رغبتك في حذف قضية "${caseTitle}" نهائياً؟`)) return;

    const { error } = await db.from('cases').delete().eq('id', caseId);

    if (error) {
        alert('حدث خطأ أثناء الحذف: ' + error.message);
    } else {
        fetchCases();
    }
}

async function openEditModal(caseId) {
    const item = allCasesCache.find(c => c.id === caseId);
    if (!item) return;

    document.getElementById('editCaseId').value = item.id;
    document.getElementById('editCaseName').value = item.name || '';
    document.getElementById('editClientName').value = item.client_name || '';
    document.getElementById('editPowerOfAttorneyNo').value = item.power_of_attorney_no || '';
    document.getElementById('editPoaIssuePlace').value = item.poa_issue_place || '';
    document.getElementById('editPoaIssueYear').value = item.poa_issue_year || '';

    document.getElementById('editOpponentName').value = item.opponent || '';
    document.getElementById('editOpponentPhone').value = item.opponent_phone || '';

    document.getElementById('editCaseType').value = item.case_type || 'مدني';
    document.getElementById('editCaseStatus').value = item.status || 'جارية';
    document.getElementById('editCaseNumber').value = item.case_number || '';
    document.getElementById('editCaseYear').value = item.case_year || '2026';
    document.getElementById('editCourtName').value = item.court_name || '';
    document.getElementById('editCourtBranch').value = item.court_branch || '';
    document.getElementById('editAssignedLawyer').value = item.assigned_lawyer || '';

    const editModal = document.getElementById('editCaseModal');
    if (editModal) editModal.classList.add('active');
}

function closeEditModal() {
    const editModal = document.getElementById('editCaseModal');
    if (editModal) editModal.classList.remove('active');
}

async function saveCaseUpdate() {
    const id = document.getElementById('editCaseId').value;
    const name = document.getElementById('editCaseName').value.trim();
    const client_name = document.getElementById('editClientName').value.trim();
    const power_of_attorney_no = document.getElementById('editPowerOfAttorneyNo').value.trim();
    const poa_issue_place = document.getElementById('editPoaIssuePlace').value.trim();
    const poa_issue_year = document.getElementById('editPoaIssueYear').value.trim();

    const opponent = document.getElementById('editOpponentName').value.trim();
    const opponent_phone = document.getElementById('editOpponentPhone').value.trim();

    const case_type = document.getElementById('editCaseType').value;
    const status = document.getElementById('editCaseStatus').value;
    const case_number = document.getElementById('editCaseNumber').value.trim();
    const case_year = document.getElementById('editCaseYear').value.trim();
    const court_name = document.getElementById('editCourtName').value.trim();
    const court_branch = document.getElementById('editCourtBranch').value.trim();
    const assigned_lawyer = document.getElementById('editAssignedLawyer').value.trim();

    if (!name) return alert('اسم القضية مطلوب');

    const updateData = {
        name, client_name, power_of_attorney_no, poa_issue_place, poa_issue_year,
        opponent, opponent_phone, case_type, status, case_number, case_year, 
        court_name, court_branch, assigned_lawyer
    };

    const newAttachmentUrl = await uploadFileToSupabase('editCaseAttachmentInput');
    if (newAttachmentUrl) {
        updateData.attachment_url = newAttachmentUrl;
    }

    const { error } = await db.from('cases').update(updateData).eq('id', id);

    if (error) return alert('حدث خطأ أثناء التحديث: ' + error.message);

    closeEditModal();
    fetchCases();
}

async function fetchClients() {
    const { data, error } = await db.from('clients').select('*').order('id', { ascending: false });
    if (error) return console.error('Error fetching clients:', error.message);

    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا يوجد موكلين حالياً</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(c => `
        <tr>
            <td><b>${c.name}</b></td>
            <td>${c.phone}</td>
            <td>
                ${c.id_card_url 
                    ? `<a href="${c.id_card_url}" target="_blank">
                        <img src="${c.id_card_url}" alt="صورة البطاقة" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #ccc;">
                       </a>` 
                    : '<span style="color: #888;">لا توجد صورة</span>'}
            </td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteClient(${c.id})"><i class="fa-solid fa-trash"></i> حذف</button>
            </td>
        </tr>
    `).join('');
}

async function addClient() {
    const nameInput = document.getElementById('clientFormName');
    const phoneInput = document.getElementById('clientFormPhone');
    
    const name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    
    if (!name || !phone) return alert('يرجى إدخال اسم الموكل ورقم الهاتف');

    const id_card_url = await uploadFileToSupabase('clientIdCardInput');

    const { error } = await db.from('clients').insert([{ name, phone, id_card_url }]);
    if (error) return alert('حدث خطأ أثناء الإضافة: ' + error.message);

    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    const fileInput = document.getElementById('clientIdCardInput');
    if (fileInput) fileInput.value = '';

    fetchClients();
}

async function deleteClient(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الموكل؟')) return;
    const { error } = await db.from('clients').delete().eq('id', id);
    if (error) alert('خطأ أثناء الحذف: ' + error.message);
    else fetchClients();
}

async function fetchTasks() {
    const { data, error } = await db.from('tasks').select('*').order('id', { ascending: false });
    if (error) return console.error('Error fetching tasks:', error.message);

    const list = document.getElementById('tasksList');
    const countStat = document.getElementById('stat-tasks-count');

    const activeTasks = data ? data.filter(t => !t.completed) : [];
    if (countStat) countStat.innerText = activeTasks.length;

    if (!list) return;

    if (!data || data.length === 0) {
        list.innerHTML = '<li style="padding: 12px; text-align: center; color: #777;">لا توجد مهام حالية</li>';
        return;
    }

    list.innerHTML = data.map(t => `
        <li style="padding: 12px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: ${t.completed ? '#f8fafc' : '#ffffff'};">
            <span style="${t.completed ? 'text-decoration: line-through; color: #94a3b8;' : 'font-weight: 500;'}">
                📌 ${t.title}
            </span>
            <div style="display: flex; gap: 8px;">
                <button type="button" class="btn btn-sm ${t.completed ? 'btn-secondary' : 'btn-success'}" 
                        onclick="toggleCompleteTask(${t.id}, ${t.completed})">
                    ${t.completed ? '<i class="fa-solid fa-rotate-left"></i> إرجاع' : '<i class="fa-solid fa-check"></i> تمت'}
                </button>
                <button type="button" class="btn btn-sm btn-danger" onclick="deleteTask(${t.id})">
                    <i class="fa-solid fa-trash"></i> حذف
                </button>
            </div>
        </li>
    `).join('');
}

async function addTask() {
    const taskInput = document.getElementById('taskTitle');
    const title = taskInput ? taskInput.value.trim() : '';
    if (!title) return alert('برجاء إدخال تفاصيل المهمة');

    const { error } = await db.from('tasks').insert([{ title, assigned_to: 'المكتب', completed: false }]);
    if (error) return alert('خطأ أثناء الإضافة: ' + error.message);

    if (taskInput) taskInput.value = '';
    fetchTasks();
}

async function toggleCompleteTask(taskId, currentStatus) {
    const { error } = await db.from('tasks').update({ completed: !currentStatus }).eq('id', taskId);
    if (error) {
        alert('حدث خطأ أثناء تحديث حالة المهمة: ' + error.message);
    } else {
        fetchTasks();
    }
}

async function deleteTask(taskId) {
    if (!confirm('هل أنت متأكد من حذف هذه المهمة؟')) return;

    const { error } = await db.from('tasks').delete().eq('id', taskId);
    if (error) {
        alert('حدث خطأ أثناء حذف المهمة: ' + error.message);
    } else {
        fetchTasks();
    }
}

db.channel('public:updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchTasks())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchCases())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => fetchClients())
    .subscribe();

document.addEventListener('DOMContentLoaded', () => {
    fetchCases();
    fetchTasks();
    fetchClients();
});