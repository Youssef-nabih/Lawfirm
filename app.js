const SUPABASE_URL = 'https://oscUGSlepanxyogvkaxq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zJOsLj6oLm2A6zjR-NcvGg_yE0_Gfmp';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allCasesCache = [];
let allCompaniesCache = [];

let currentUser = null;
let currentProfile = null;
let realtimeStarted = false;
let profileLoadError = '';


// =========================================
// AUTH SYSTEM
// =========================================

function isAdmin() {
    return currentProfile && currentProfile.role === 'admin';
}

function requireLogin() {
    if (!currentUser) {
        alert('برجاء تسجيل الدخول أولاً.');
        return false;
    }

    return true;
}

function requireAdmin() {
    if (!currentUser) {
        alert('برجاء تسجيل الدخول أولاً.');
        return false;
    }

    if (!isAdmin()) {
        alert('ليس لديك صلاحية لتنفيذ هذا الإجراء.');
        return false;
    }

    return true;
}


// =========================================
// إنشاء شاشة تسجيل الدخول تلقائياً
// =========================================

function createLoginScreen() {

    // The page already contains the login markup.  Only create it when this
    // script is used on a page that does not.  In both cases, bind the form
    // once so clicking the button and pressing Enter follow the same path.
    const existingLoginScreen = document.getElementById('loginScreen');

    if (existingLoginScreen) {
        bindAuthScreenHandlers(existingLoginScreen);

        return;
    }

    const style = document.createElement('style');

    style.innerHTML = `
        #loginScreen {
            position: fixed;
            inset: 0;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            font-family: 'Tajawal', sans-serif;
        }

        .login-card {
            width: 100%;
            max-width: 420px;
            background: white;
            padding: 35px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.10);
            border: 1px solid #e2e8f0;
        }

        .login-logo {
            width: 70px;
            height: 70px;
            border-radius: 16px;
            background: #e0f2fe;
            color: #0284c7;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            font-size: 30px;
        }

        .login-card h2 {
            text-align: center;
            margin-bottom: 8px;
            color: #0f172a;
        }

        .login-subtitle {
            text-align: center;
            color: #64748b;
            margin-bottom: 25px;
            font-size: 14px;
        }

        .login-group {
            margin-bottom: 18px;
        }

        .login-group label {
            display: block;
            margin-bottom: 7px;
            color: #475569;
            font-weight: 500;
            font-size: 14px;
        }

        .login-group input {
            width: 100%;
            padding: 12px 14px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            outline: none;
            font-family: 'Tajawal', sans-serif;
            font-size: 15px;
        }

        .login-group input:focus {
            border-color: #0284c7;
        }

        #loginButton {
            width: 100%;
            justify-content: center;
            padding: 12px;
            margin-top: 5px;
        }

        #loginError {
            display: none;
            margin-top: 15px;
            padding: 10px;
            border-radius: 7px;
            background: #fee2e2;
            color: #b91c1c;
            text-align: center;
            font-size: 13px;
        }

        .role-badge {
            padding: 4px 9px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            margin-right: 5px;
        }

        .role-admin {
            background: #dcfce7;
            color: #15803d;
        }

        .role-employee {
            background: #e0f2fe;
            color: #0369a1;
        }

        .logout-button {
            margin-right: 15px;
        }
    `;

    document.head.appendChild(style);


    const loginScreen = document.createElement('div');

    loginScreen.id = 'loginScreen';

    loginScreen.innerHTML = `
        <div class="login-card">

            <div class="login-logo">
                <i class="fa-solid fa-scale-balanced"></i>
            </div>

            <h2>نظام إدارة مكتب المحاماة</h2>

            <div class="login-subtitle">
                قم بتسجيل الدخول للمتابعة
            </div>

            <form id="loginForm">

                <div class="login-group">
                    <label>اسم المستخدم</label>

                    <input
                        type="text"
                        id="loginUsername"
                        placeholder="أدخل اسم المستخدم"
                        autocomplete="username"
                        required
                    >
                </div>

                <div class="login-group">
                    <label>كلمة المرور</label>

                    <input
                        type="password"
                        id="loginPassword"
                        placeholder="أدخل كلمة المرور"
                        autocomplete="current-password"
                        required
                    >
                </div>

                <button
                    type="submit"
                    id="loginButton"
                    class="btn btn-primary"
                >
                    <i class="fa-solid fa-right-to-bracket"></i>
                    تسجيل الدخول
                </button>

                <div id="loginError"></div>

            </form>

        </div>
    `;

    document.body.appendChild(loginScreen);


    bindAuthScreenHandlers(loginScreen);
}

function bindAuthScreenHandlers(container = document) {
    const loginForm = container.querySelector('#loginForm');
    const registrationForm = container.querySelector('#registrationForm');

    if (loginForm && !loginForm.dataset.loginHandlerBound) {
        loginForm.addEventListener('submit', loginUser);
        loginForm.dataset.loginHandlerBound = 'true';
    }

    if (registrationForm && !registrationForm.dataset.registrationHandlerBound) {
        registrationForm.addEventListener('submit', registerUser);
        registrationForm.dataset.registrationHandlerBound = 'true';
    }
}


// =========================================
// إظهار / إخفاء Login
// =========================================

function showLoginScreen() {

    const loginScreen = document.getElementById('loginScreen');

    if (loginScreen) {
        loginScreen.style.display = 'flex';
    }

    document.body.style.overflow = 'hidden';
}


function hideLoginScreen() {

    const loginScreen = document.getElementById('loginScreen');

    if (loginScreen) {
        loginScreen.style.display = 'none';
    }

    document.body.style.overflow = '';
}


// =========================================
// تسجيل الدخول
// =========================================

async function loginUser(event) {

    // Keep this safe when called from an inline handler as well as a form.
    if (event) event.preventDefault();

    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const loginButton = document.getElementById('loginButton');
    const loginError = document.getElementById('loginError');

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    loginError.style.display = 'none';

    if (!username || !password) {
        loginError.innerText = 'برجاء إدخال اسم المستخدم وكلمة المرور.';
        loginError.style.display = 'block';
        return;
    }

    if (!loginButton) {
        throw new Error('تعذر تجهيز زر تسجيل الدخول. حدّث الصفحة وحاول مرة أخرى.');
    }

    loginButton.disabled = true;

    loginButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        جاري تسجيل الدخول...
    `;


    try {

        // الحصول على Email الخاص بالـUsername
        const { data: email, error: emailError } =
            await db.rpc('get_login_email', {
                p_username: username
            });


        if (emailError) {

            console.error('Login email error:', emailError);

            throw new Error(
                'تأكد من تشغيل SQL الخاص بنظام تسجيل الدخول في Supabase.'
            );
        }


        if (!email) {
            throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
        }


        // تسجيل الدخول في Supabase Auth
        const { data, error } =
            await db.auth.signInWithPassword({
                email: email,
                password: password
            });


        if (error) {

            console.error('Supabase login error:', error);

            throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
        }


        currentUser = data.user;


        // تحميل Profile
        const profileLoaded =
            await loadCurrentProfile(currentUser.id);


        if (!profileLoaded) {

            await db.auth.signOut();

            currentUser = null;

            throw new Error(
                profileLoadError || 'الحساب موجود ولكن بيانات المستخدم غير مكتملة.'
            );
        }


        updateUserInterface();

        hideLoginScreen();

        await loadAllData();

        startRealtime();


        usernameInput.value = '';
        passwordInput.value = '';

    } catch (error) {

        console.error(error);

        loginError.innerText =
            error.message || 'حدث خطأ أثناء تسجيل الدخول.';

        loginError.style.display = 'block';

    } finally {

        loginButton.disabled = false;

        loginButton.innerHTML = `
            <i class="fa-solid fa-right-to-bracket"></i>
            تسجيل الدخول
        `;
    }
}

function showRegistrationForm() {
    document.getElementById('loginForm')?.setAttribute('hidden', '');
    document.getElementById('registrationForm')?.removeAttribute('hidden');
    document.getElementById('loginError').style.display = 'none';
}

function showLoginForm() {
    document.getElementById('registrationForm')?.setAttribute('hidden', '');
    document.getElementById('loginForm')?.removeAttribute('hidden');
    document.getElementById('registrationMessage').style.display = 'none';
}

async function registerUser(event) {
    event.preventDefault();

    const fullName = document.getElementById('registrationFullName').value.trim();
    const username = document.getElementById('registrationUsername').value.trim();
    const email = document.getElementById('registrationEmail').value.trim();
    const password = document.getElementById('registrationPassword').value;
    const button = document.getElementById('registrationButton');
    const message = document.getElementById('registrationMessage');

    message.style.display = 'none';

    if (!fullName || !username || !email || password.length < 8) {
        message.innerText = 'يرجى إدخال كل البيانات واستخدام كلمة مرور من 8 أحرف على الأقل.';
        message.style.display = 'block';
        return;
    }

    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري إرسال الطلب...';

    try {
        const { error } = await db.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username,
                    full_name: fullName
                }
            }
        });

        if (error) throw error;

        document.getElementById('registrationForm').reset();
        message.style.color = '#15803d';
        message.innerText = 'تم إرسال طلبك بنجاح. انتظر موافقة الأدمن قبل تسجيل الدخول.';
        message.style.display = 'block';
    } catch (error) {
        console.error('Registration error:', error);
        message.style.color = '#dc2626';
        message.innerText = error.message || 'تعذر إرسال طلب إنشاء المستخدم.';
        message.style.display = 'block';
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-user-plus"></i> إرسال طلب الانضمام';
    }
}


// =========================================
// تحميل بيانات المستخدم
// =========================================

async function loadCurrentProfile(userId) {

    profileLoadError = '';

    const { data, error } =
        await db
            .from('profiles')
            .select('username, full_name, role, status')
            .eq('id', userId)
            .maybeSingle();


    if (error) {

        console.error('Profile error:', error.message);
        profileLoadError = 'تعذر التحقق من صلاحية الحساب. تأكد من تشغيل إعدادات Supabase.';

        return false;
    }


    if (!data) {

        console.error('No profile found.');
        profileLoadError = 'الحساب موجود ولكن بيانات المستخدم غير مكتملة.';

        return false;
    }


    currentProfile = data;

    if (currentProfile.status !== 'approved') {
        profileLoadError = currentProfile.status === 'rejected'
            ? 'تم رفض طلب الانضمام. تواصل مع الأدمن لمزيد من التفاصيل.'
            : 'طلب الانضمام قيد انتظار موافقة الأدمن.';
        console.warn(profileLoadError);
        currentProfile = null;
        return false;
    }

    return true;
}


// =========================================
// تحديث Header
// =========================================

function updateUserInterface() {

    if (!currentProfile) return;


    const userInfo =
        document.querySelector('.header .user-info');


    if (!userInfo) return;


    const displayName =
        currentProfile.full_name ||
        currentProfile.username;


    userInfo.innerHTML = `

        <i class="fa-solid fa-circle-user fa-lg"></i>

        <span>
            مرحباً، ${displayName}
        </span>

        <span class="role-badge ${
            isAdmin()
                ? 'role-admin'
                : 'role-employee'
        }">
            ${
                isAdmin()
                    ? 'مدير النظام'
                    : 'موظف'
            }
        </span>

    `;


    // إضافة Logout button
    if (!document.getElementById('logoutButton')) {

        const logoutButton =
            document.createElement('button');

        logoutButton.id = 'logoutButton';

        logoutButton.className =
            'btn btn-danger logout-button';

        logoutButton.innerHTML = `
            <i class="fa-solid fa-right-from-bracket"></i>
            تسجيل الخروج
        `;

        logoutButton.onclick = logoutUser;


        const header =
            document.querySelector('.header');

        if (header) {
            header.appendChild(logoutButton);
        }
    }
}


// =========================================
// تسجيل الخروج
// =========================================

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

async function loadAccessRequests() {
    const panel = document.getElementById('accessRequestsPanel');
    const list = document.getElementById('accessRequestsList');

    if (!panel || !list) return;
    if (!isAdmin()) {
        panel.style.display = 'none';
        return;
    }

    const { data, error } = await db
        .from('access_requests')
        .select('id, user_id, username, full_name, email, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    panel.style.display = 'block';

    if (error) {
        console.error('Access requests error:', error.message);
        list.innerHTML = '<p style="color:#dc2626;">تعذر تحميل الطلبات. شغّل ملف إعداد Supabase أولاً.</p>';
        return;
    }

    if (!data?.length) {
        list.innerHTML = '<p style="color:#64748b;">لا توجد طلبات جديدة حالياً.</p>';
        return;
    }

    list.innerHTML = `
        <table>
            <thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>البريد</th><th>وقت الطلب</th><th>الإجراء</th></tr></thead>
            <tbody>${data.map(request => `
                <tr>
                    <td>${escapeHtml(request.full_name)}</td>
                    <td>${escapeHtml(request.username)}</td>
                    <td>${escapeHtml(request.email)}</td>
                    <td>${new Date(request.created_at).toLocaleString('ar-EG')}</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="reviewAccessRequest('${request.id}', '${request.user_id}', 'approved')">موافقة</button>
                        <button class="btn btn-sm btn-danger" onclick="reviewAccessRequest('${request.id}', '${request.user_id}', 'rejected')">رفض</button>
                    </td>
                </tr>`).join('')}</tbody>
        </table>`;
}

async function reviewAccessRequest(requestId, userId, decision) {
    if (!requireAdmin()) return;

    const confirmation = decision === 'approved'
        ? 'هل تريد الموافقة على هذا المستخدم؟'
        : 'هل تريد رفض هذا المستخدم؟';
    if (!confirm(confirmation)) return;

    const { error: profileError } = await db
        .from('profiles')
        .update({ status: decision })
        .eq('id', userId);

    if (profileError) {
        alert('تعذر تحديث صلاحية المستخدم: ' + profileError.message);
        return;
    }

    const { error: requestError } = await db
        .from('access_requests')
        .update({
            status: decision,
            reviewed_at: new Date().toISOString(),
            reviewed_by: currentUser.id
        })
        .eq('id', requestId);

    if (requestError) {
        alert('تم تحديث المستخدم ولكن تعذر تحديث سجل الطلب: ' + requestError.message);
        return;
    }

    await loadAccessRequests();
}

async function logoutUser() {

    if (!confirm('هل تريد تسجيل الخروج؟')) {
        return;
    }


    const { error } = await db.auth.signOut();


    if (error) {

        alert(
            'حدث خطأ أثناء تسجيل الخروج: ' +
            error.message
        );

        return;
    }


    currentUser = null;
    currentProfile = null;

    allCasesCache = [];
    allCompaniesCache = [];


    const logoutButton =
        document.getElementById('logoutButton');

    if (logoutButton) {
        logoutButton.remove();
    }


    showLoginScreen();
}


// =========================================
// رفع الملفات
// =========================================

async function uploadFileToSupabase(
    fileInputOrSource,
    bucketName = 'documents'
) {

    if (!requireLogin()) return null;


    let file = null;


    if (typeof fileInputOrSource === 'string') {

        const fileInput =
            document.getElementById(fileInputOrSource);

        if (
            fileInput &&
            fileInput.files &&
            fileInput.files.length > 0
        ) {
            file = fileInput.files[0];
        }

    } else if (fileInputOrSource instanceof File) {

        file = fileInputOrSource;
    }


    if (!file) return null;


    const safeFileName =
        file.name.replace(
            /[^a-zA-Z0-9.]/g,
            '_'
        );


    const fileExt =
        safeFileName.split('.').pop();


    const fileName =
        `${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 7)}.${fileExt}`;


    const filePath = fileName;


    const { data, error } =
        await db.storage
            .from(bucketName)
            .upload(filePath, file);


    if (error) {

        console.error(
            'خطأ أثناء رفع الملف:',
            error.message
        );

        alert(
            'فشل رفع الملف: ' +
            error.message
        );

        return null;
    }


    const { data: publicUrlData } =
        db.storage
            .from(bucketName)
            .getPublicUrl(filePath);


    return publicUrlData.publicUrl;
}


// =========================================
// التنقل
// =========================================

function switchPage(pageId, element) {

    document
        .querySelectorAll('.page-section')
        .forEach(sec =>
            sec.classList.remove('active')
        );


    document
        .querySelectorAll('.sidebar .menu li a')
        .forEach(a =>
            a.classList.remove('active')
        );


    const targetPage =
        document.getElementById(pageId);


    if (targetPage) {
        targetPage.classList.add('active');
    }


    if (element) {
        element.classList.add('active');
    }
}


// =========================================
// Tabs
// =========================================

function switchOdooTab(tabId, btn) {

    const parentPanel =
        btn.closest('.panel');


    if (parentPanel) {

        parentPanel
            .querySelectorAll('.tab-content')
            .forEach(tc =>
                tc.classList.remove('active')
            );


        parentPanel
            .querySelectorAll('.odoo-tab-btn')
            .forEach(b =>
                b.classList.remove('active')
            );
    }


    const targetTab =
        document.getElementById(tabId);


    if (targetTab) {
        targetTab.classList.add('active');
    }


    if (btn) {
        btn.classList.add('active');
    }
}


function switchCompanyTab(tabId, btn) {
    switchOdooTab(tabId, btn);
}


function toggleParentCompanySelect(selectElem) {

    const group =
        document.getElementById('parentCompanyGroup');


    if (group) {

        group.style.display =
            selectElem.value === 'false'
                ? 'flex'
                : 'none';
    }
}


// =========================================
// COMPANIES
// =========================================

async function fetchCompanies() {

    if (!currentUser) return;


    const { data, error } =
        await db
            .from('companies')
            .select('*')
            .order('id', {
                ascending: false
            });


    if (error) {

        console.error(
            'Error fetching companies:',
            error.message
        );

        return;
    }


    allCompaniesCache = data || [];


    renderCompaniesTable(
        allCompaniesCache
    );


    updateCompaniesStats();

    populateParentCompanyDropdown();
}


function renderCompaniesTable(companiesData) {

    const tbody =
        document.getElementById(
            'companiesTableBody'
        );


    if (!tbody) return;


    if (
        !companiesData ||
        companiesData.length === 0
    ) {

        tbody.innerHTML =
            '<tr><td colspan="8" style="text-align:center;">لا توجد شركات مسجلة حالياً</td></tr>';

        return;
    }


    tbody.innerHTML =
        companiesData.map(c => {

            let statusBadge =
                '<span class="badge badge-active">نشطة</span>';


            if (c.status === 'pending') {

                statusBadge =
                    '<span class="badge badge-pending">قيد الانتظار</span>';
            }


            if (c.status === 'suspended') {

                statusBadge =
                    '<span class="badge badge-suspended">معلقة</span>';
            }


            const logoHtml =
                c.logo_url
                    ? `<a href="${c.logo_url}" target="_blank">
                        <img src="${c.logo_url}" class="company-logo-preview" alt="logo">
                       </a>`
                    : `<div style="width:40px;height:40px;background:#e2e8f0;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#64748b;">
                        <i class="fa-solid fa-building"></i>
                       </div>`;


            const adminActions =
                isAdmin()
                    ? `
                        <button class="btn btn-sm btn-warning"
                            onclick="openEditCompanyModal(${c.id})">
                            <i class="fa-solid fa-pen"></i>
                        </button>

                        <button class="btn btn-sm btn-danger"
                            onclick="deleteCompany(${c.id})">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    `
                    : `
                        <span class="badge badge-done">
                            عرض فقط
                        </span>
                    `;


            return `
                <tr>

                    <td>${logoHtml}</td>

                    <td>
                        <b>${c.name || ''}</b>
                        ${
                            c.legal_name
                                ? `<br>
                                   <small style="color:#64748b;">
                                   ${c.legal_name}
                                   </small>`
                                : ''
                        }
                    </td>

                    <td>
                        ${c.tax_id || 'غير مسجل'}
                    </td>

                    <td>
                        ${c.industry || '-'}
                    </td>

                    <td>
                        <div>
                            <i class="fa-solid fa-envelope"
                               style="font-size:0.75rem;color:#0284c7;">
                            </i>
                            ${c.email || '-'}
                        </div>

                        ${
                            c.phone
                                ? `<div>
                                    <i class="fa-solid fa-phone"
                                       style="font-size:0.75rem;color:#16a34a;">
                                    </i>
                                    ${c.phone}
                                   </div>`
                                : ''
                        }
                    </td>

                    <td>
                        <b>${c.currency || 'EGP'}</b>
                    </td>

                    <td>
                        ${statusBadge}
                    </td>

                    <td>
                        ${adminActions}
                    </td>

                </tr>
            `;

        }).join('');
}


function updateCompaniesStats() {

    const totalStat =
        document.getElementById(
            'stat-companies-count'
        );


    const activeStat =
        document.getElementById(
            'stat-active-companies-count'
        );


    if (totalStat) {
        totalStat.innerText =
            allCompaniesCache.length;
    }


    if (activeStat) {

        const activeCount =
            allCompaniesCache.filter(
                c =>
                    c.status === 'active' ||
                    !c.status
            ).length;


        activeStat.innerText =
            activeCount;
    }
}


function populateParentCompanyDropdown() {

    const select =
        document.getElementById(
            'compParentId'
        );


    if (!select) return;


    select.innerHTML =
        '<option value="">-- اختر الشركة الأم --</option>';


    allCompaniesCache
        .filter(c => c.is_parent)
        .forEach(comp => {

            const option =
                document.createElement('option');

            option.value = comp.id;
            option.textContent = comp.name;

            select.appendChild(option);
        });
}


async function addCompany() {

    if (!requireLogin()) return;


    const name =
        document.getElementById('compName')
            ?.value.trim();


    const legal_name =
        document.getElementById('compLegalName')
            ?.value.trim();


    const tax_id =
        document.getElementById('compTaxId')
            ?.value.trim();


    const commercial_register =
        document.getElementById(
            'compCommercialRegister'
        )?.value.trim();


    const industry =
        document.getElementById('compIndustry')
            ?.value;


    const company_size =
        document.getElementById('compSize')
            ?.value;


    const email =
        document.getElementById('compEmail')
            ?.value.trim();


    const phone =
        document.getElementById('compPhone')
            ?.value.trim();


    const website =
        document.getElementById('compWebsite')
            ?.value.trim();


    const country =
        document.getElementById('compCountry')
            ?.value.trim();


    const state_province =
        document.getElementById('compState')
            ?.value.trim();


    const city =
        document.getElementById('compCity')
            ?.value.trim();


    const postal_code =
        document.getElementById('compPostalCode')
            ?.value.trim();


    const address_street =
        document.getElementById(
            'compAddressStreet'
        )?.value.trim();


    const currency =
        document.getElementById('compCurrency')
            ?.value;


    const status =
        document.getElementById('compStatus')
            ?.value;


    const is_parent =
        document.getElementById('compIsParent')
            ?.value === 'true';


    const parent_id =
        document.getElementById('compParentId')
            ?.value || null;


    if (!name || !tax_id || !email) {

        return alert(
            'برجاء ملء الحقول الأساسية المطلوبة: اسم الشركة، الرقم الضريبي، والبريد الإلكتروني.'
        );
    }


    const logo_url =
        await uploadFileToSupabase(
            'compLogoInput'
        );


    const newCompany = {

        name,
        legal_name,
        tax_id,
        commercial_register,
        industry,
        company_size,
        logo_url,
        email,
        phone,
        website,
        country,
        state_province,
        city,
        postal_code,
        address_street,
        currency,
        status,
        is_parent,
        parent_id
    };


    const { error } =
        await db
            .from('companies')
            .insert([newCompany]);


    if (error) {

        return alert(
            'حدث خطأ أثناء إضافة الشركة: ' +
            error.message
        );
    }


    alert('تمت إضافة الشركة بنجاح!');


    const fieldsToReset = [

        'compName',
        'compLegalName',
        'compTaxId',
        'compCommercialRegister',
        'compEmail',
        'compPhone',
        'compWebsite',
        'compState',
        'compCity',
        'compPostalCode',
        'compAddressStreet',
        'compLogoInput'
    ];


    fieldsToReset.forEach(id => {

        const el =
            document.getElementById(id);

        if (el) {
            el.value = '';
        }
    });


    fetchCompanies();
}


function openEditCompanyModal(id) {

    if (!requireAdmin()) return;


    const comp =
        allCompaniesCache.find(
            c => c.id === id
        );


    if (!comp) return;


    document.getElementById(
        'editCompId'
    ).value = comp.id;


    document.getElementById(
        'editCompName'
    ).value = comp.name || '';


    document.getElementById(
        'editCompLegalName'
    ).value = comp.legal_name || '';


    document.getElementById(
        'editCompTaxId'
    ).value = comp.tax_id || '';


    document.getElementById(
        'editCompCommercialRegister'
    ).value =
        comp.commercial_register || '';


    document.getElementById(
        'editCompIndustry'
    ).value =
        comp.industry || 'أخرى';


    document.getElementById(
        'editCompSize'
    ).value =
        comp.company_size || '1-10';


    document.getElementById(
        'editCompEmail'
    ).value =
        comp.email || '';


    document.getElementById(
        'editCompPhone'
    ).value =
        comp.phone || '';


    document.getElementById(
        'editCompWebsite'
    ).value =
        comp.website || '';


    document.getElementById(
        'editCompCurrency'
    ).value =
        comp.currency || 'EGP';


    document.getElementById(
        'editCompStatus'
    ).value =
        comp.status || 'active';


    const modal =
        document.getElementById(
            'editCompanyModal'
        );


    if (modal) {
        modal.classList.add('active');
    }
}


function closeEditCompanyModal() {

    const modal =
        document.getElementById(
            'editCompanyModal'
        );


    if (modal) {
        modal.classList.remove('active');
    }
}


async function saveCompanyUpdate() {

    if (!requireAdmin()) return;


    const id =
        document.getElementById(
            'editCompId'
        ).value;


    const name =
        document.getElementById(
            'editCompName'
        ).value.trim();


    const legal_name =
        document.getElementById(
            'editCompLegalName'
        ).value.trim();


    const tax_id =
        document.getElementById(
            'editCompTaxId'
        ).value.trim();


    const commercial_register =
        document.getElementById(
            'editCompCommercialRegister'
        ).value.trim();


    const industry =
        document.getElementById(
            'editCompIndustry'
        ).value;


    const company_size =
        document.getElementById(
            'editCompSize'
        ).value;


    const email =
        document.getElementById(
            'editCompEmail'
        ).value.trim();


    const phone =
        document.getElementById(
            'editCompPhone'
        ).value.trim();


    const website =
        document.getElementById(
            'editCompWebsite'
        ).value.trim();


    const currency =
        document.getElementById(
            'editCompCurrency'
        ).value;


    const status =
        document.getElementById(
            'editCompStatus'
        ).value;


    if (!name || !tax_id || !email) {

        return alert(
            'الاسم والرقم الضريبي والبريد الإلكتروني مطلوبين.'
        );
    }


    const updateData = {

        name,
        legal_name,
        tax_id,
        commercial_register,
        industry,
        company_size,
        email,
        phone,
        website,
        currency,
        status
    };


    const { error } =
        await db
            .from('companies')
            .update(updateData)
            .eq('id', id);


    if (error) {

        return alert(
            'حدث خطأ أثناء التحديث: ' +
            error.message
        );
    }


    closeEditCompanyModal();

    fetchCompanies();
}


async function deleteCompany(id) {

    if (!requireAdmin()) return;


    const comp =
        allCompaniesCache.find(
            c => c.id === id
        );


    const title =
        comp
            ? comp.name
            : 'هذه الشركة';


    if (
        !confirm(
            `هل أنت متأكد من حذف شركة "${title}"؟`
        )
    ) {
        return;
    }


    const { error } =
        await db
            .from('companies')
            .delete()
            .eq('id', id);


    if (error) {

        alert(
            'حدث خطأ أثناء الحذف: ' +
            error.message
        );

    } else {

        fetchCompanies();
    }
}


// =========================================
// CASE SESSIONS
// =========================================

function addSessionRow(data = {}) {

    const tbody =
        document.getElementById(
            'sessionsTableBody'
        );


    if (!tbody) return;


    const tr =
        document.createElement('tr');


    tr.innerHTML = `

        <td>
            <input
                type="datetime-local"
                class="session-date"
                value="${data.session_date || ''}"
                style="width:100%;">
        </td>

        <td>
            <input
                type="text"
                class="session-subject"
                value="${data.session_subject || ''}"
                placeholder="موضوع الجلسة"
                style="width:100%;">
        </td>

        <td>
            <input
                type="text"
                class="session-lawyer"
                value="${data.attending_lawyer || ''}"
                placeholder="المحامي الحاضر"
                style="width:100%;">
        </td>

        <td>
            <input
                type="text"
                class="session-decision"
                value="${data.decision || ''}"
                placeholder="قرار الجلسة / ما تم فيها"
                style="width:100%;">
        </td>

        <td>

            <button
                type="button"
                class="btn btn-sm btn-danger"
                onclick="this.closest('tr').remove()">

                <i class="fa-solid fa-trash"></i>

            </button>

        </td>

    `;


    tbody.appendChild(tr);
}


// =========================================
// CASE TYPE
// =========================================

function handleCaseTypeChange(selectElem) {

    if (selectElem.value === '__add_new__') {

        const newType =
            prompt(
                'أدخل نوع القضية الجديد:'
            );


        if (
            newType &&
            newType.trim() !== ''
        ) {

            const val =
                newType.trim();


            const option =
                document.createElement(
                    'option'
                );


            option.value = val;
            option.text = val;


            selectElem.add(
                option,
                selectElem.options[
                    selectElem.options.length - 1
                ]
            );


            selectElem.value = val;


            const editSelect =
                document.getElementById(
                    'editCaseType'
                );


            if (editSelect) {

                const editOption =
                    document.createElement(
                        'option'
                    );


                editOption.value = val;
                editOption.text = val;


                editSelect.add(
                    editOption
                );
            }

        } else {

            selectElem.selectedIndex = 0;
        }
    }
}




function getStatusBadge(status) {

    const s =
        status || 'جارية';


    switch (s) {

        case 'جديدة':
            return `<span class="badge badge-new">جديدة</span>`;

        case 'جارية':
            return `<span class="badge badge-active">جارية</span>`;

        case 'مؤجلة':
            return `<span class="badge badge-pending">مؤجلة</span>`;

        case 'تمت':
            return `<span class="badge badge-done">تمت</span>`;

        case 'مؤرشفة':
            return `<span class="badge badge-archived">مؤرشفة</span>`;

        default:
            return `<span class="badge badge-active">${s}</span>`;
    }
}



async function fetchCases() {

    if (!currentUser) return;


    const { data, error } =
        await db
            .from('cases')
            .select('*')
            .order('id', {
                ascending: false
            });


    if (error) {

        console.error(
            'Error fetching cases:',
            error.message
        );

        return;
    }


    allCasesCache = data || [];

    renderCasesTable(
        allCasesCache
    );
}


function renderCasesTable(casesData) {

    const fullTable =
        document.getElementById(
            'casesTableBody'
        );


    const recentTable =
        document.getElementById(
            'recentCasesTable'
        );


    const activeCases =
        casesData.filter(
            c =>
                c.status === 'جارية' ||
                c.status === 'جديدة' ||
                !c.status
        );


    const countStat =
        document.getElementById(
            'stat-cases-count'
        );


    if (countStat) {
        countStat.innerText =
            activeCases.length;
    }


    if (!fullTable) return;


    if (
        !casesData ||
        casesData.length === 0
    ) {

        fullTable.innerHTML =
            '<tr><td colspan="10" style="text-align:center;">لا توجد قضايا مطابقة</td></tr>';


        if (recentTable) {

            recentTable.innerHTML =
                '<tr><td colspan="6" style="text-align:center;">لا توجد قضايا مضافة بعد</td></tr>';
        }


        return;
    }


    fullTable.innerHTML =
        casesData.map(c => {

            const adminActions =
                isAdmin()
                    ? `
                        <button
                            class="btn btn-sm btn-warning"
                            onclick="openEditModal(${c.id})">

                            <i class="fa-solid fa-pen"></i>
                            تعديل

                        </button>

                        <button
                            class="btn btn-sm btn-danger"
                            onclick="deleteCase(${c.id})">

                            <i class="fa-solid fa-trash"></i>
                            حذف

                        </button>
                    `
                    : `
                        <span class="badge badge-done">
                            عرض فقط
                        </span>
                    `;


            return `

                <tr>

                    <td>
                        <b>${c.name || ''}</b>
                    </td>

                    <td>
                        ${c.client_name || 'غير محدد'}
                    </td>

                    <td>
                        ${c.opponent || 'غير محدد'}

                        ${
                            c.opponent_phone
                                ? `<br>
                                   <small>
                                   📱 ${c.opponent_phone}
                                   </small>`
                                : ''
                        }
                    </td>

                    <td>
                        ${c.case_type || 'مدني'}
                    </td>

                    <td>
                        ${
                            c.case_number
                                ? `${c.case_number} / ${c.case_year || ''}`
                                : 'غير مسجل'
                        }
                    </td>

                    <td>
                        ${c.court_name || 'غير محدد'}

                        ${
                            c.court_branch
                                ? `(${c.court_branch})`
                                : ''
                        }
                    </td>

                    <td>
                        ${c.assigned_lawyer || 'غير محدد'}
                    </td>

                    <td>
                        ${
                            c.attachment_url
                                ? `
                                    <a
                                        href="${c.attachment_url}"
                                        target="_blank"
                                        class="btn btn-sm btn-info">

                                        <i class="fa-solid fa-image"></i>
                                        عرض المرفق

                                    </a>
                                  `
                                : 'لا يوجد'
                        }
                    </td>

                    <td>
                        ${getStatusBadge(c.status)}
                    </td>

                    <td>
                        ${adminActions}
                    </td>

                </tr>

            `;

        }).join('');


    if (recentTable) {

        recentTable.innerHTML =
            casesData
                .slice(0, 5)
                .map(c => {

                    const adminActions =
                        isAdmin()
                            ? `
                                <button
                                    class="btn btn-sm btn-warning"
                                    onclick="openEditModal(${c.id})">
                                    تعديل
                                </button>

                                <button
                                    class="btn btn-sm btn-danger"
                                    onclick="deleteCase(${c.id})">
                                    حذف
                                </button>
                              `
                            : `
                                <span class="badge badge-done">
                                    عرض فقط
                                </span>
                              `;


                    return `

                        <tr>

                            <td>
                                <b>${c.name || ''}</b>
                            </td>

                            <td>
                                ${c.client_name || 'غير محدد'}
                            </td>

                            <td>
                                ${c.case_type || 'مدني'}
                            </td>

                            <td>
                                ${
                                    c.case_number
                                        ? `${c.case_number} / ${c.case_year || ''}`
                                        : 'غير مسجل'
                                }
                            </td>

                            <td>
                                ${getStatusBadge(c.status)}
                            </td>

                            <td>
                                ${adminActions}
                            </td>

                        </tr>

                    `;

                }).join('');
    }
}


function filterCases(searchTerm = '') {

    const term =
        searchTerm
            .toLowerCase()
            .trim();


    if (!term) {

        renderCasesTable(
            allCasesCache
        );

        return;
    }


    const filtered =
        allCasesCache.filter(c =>

            (
                c.name &&
                c.name
                    .toLowerCase()
                    .includes(term)
            )

            ||

            (
                c.client_name &&
                c.client_name
                    .toLowerCase()
                    .includes(term)
            )

            ||

            (
                c.case_number &&
                c.case_number
                    .toString()
                    .includes(term)
            )

            ||

            (
                c.opponent &&
                c.opponent
                    .toLowerCase()
                    .includes(term)
            )
        );


    renderCasesTable(
        filtered
    );
}




async function addCase() {

    if (!requireLogin()) return;


    const name =
        document.getElementById(
            'caseName'
        )?.value.trim();


    const client_name =
        document.getElementById(
            'clientName'
        )?.value.trim();


    const power_of_attorney_no =
        document.getElementById(
            'powerOfAttorneyNo'
        )?.value.trim();


    const poa_issue_place =
        document.getElementById(
            'poaIssuePlace'
        )?.value.trim();


    const poa_issue_year =
        document.getElementById(
            'poaIssueYear'
        )?.value.trim();


    const opponent =
        document.getElementById(
            'opponentName'
        )?.value.trim();


    const opponent_phone =
        document.getElementById(
            'opponentPhone'
        )?.value.trim();


    const case_type =
        document.getElementById(
            'caseType'
        )?.value;


    const status =
        document.getElementById(
            'caseStatus'
        )?.value;


    const case_number =
        document.getElementById(
            'caseNumber'
        )?.value.trim();


    const case_year =
        document.getElementById(
            'caseYear'
        )?.value.trim();


    const court_name =
        document.getElementById(
            'courtName'
        )?.value.trim();


    const court_branch =
        document.getElementById(
            'courtBranch'
        )?.value.trim();


    const assigned_lawyer =
        document.getElementById(
            'assignedLawyer'
        )?.value.trim();


    const case_details =
        document.getElementById(
            'caseDetailsNotes'
        )?.value.trim();


    if (!name) {

        return alert(
            'برجاء إدخال موضوع القضية'
        );
    }


    const attachment_url =
        await uploadFileToSupabase(
            'caseAttachmentInput'
        );


    const newCase = {

        name,
        client_name,
        power_of_attorney_no,
        poa_issue_place,
        poa_issue_year,
        opponent,
        opponent_phone,
        case_type,
        status,
        case_number,
        case_year,
        court_name,
        court_branch,
        assigned_lawyer,
        case_details,
        attachment_url
    };


    const {
        data: insertedCase,
        error
    } =
        await db
            .from('cases')
            .insert([newCase])
            .select()
            .single();


    if (error) {

        return alert(
            'حدث خطأ أثناء الإضافة: ' +
            error.message
        );
    }


    const caseId =
        insertedCase
            ? insertedCase.id
            : null;


    if (caseId) {

        const sessionPromises = [];


        document
            .querySelectorAll(
                '#sessionsTableBody tr'
            )
            .forEach(row => {

                const session_date =
                    row.querySelector(
                        '.session-date'
                    )?.value;


                const session_subject =
                    row.querySelector(
                        '.session-subject'
                    )?.value?.trim();


                const attending_lawyer =
                    row.querySelector(
                        '.session-lawyer'
                    )?.value?.trim();


                const decision =
                    row.querySelector(
                        '.session-decision'
                    )?.value?.trim();


                if (
                    session_date ||
                    session_subject ||
                    decision
                ) {

                    sessionPromises.push(

                        db
                            .from('case_sessions')
                            .insert([{

                                case_id: caseId,

                                session_date:
                                    session_date ||
                                    null,

                                session_subject:
                                    session_subject ||
                                    '',

                                attending_lawyer:
                                    attending_lawyer ||
                                    '',

                                decision:
                                    decision ||
                                    ''
                            }])
                    );
                }
            });


        if (
            sessionPromises.length > 0
        ) {

            await Promise.all(
                sessionPromises
            );
        }
    }


    alert(
        'تمت إضافة القضية بنجاح!'
    );


    const fieldsToReset = [

        'caseName',
        'clientName',
        'powerOfAttorneyNo',
        'poaIssuePlace',
        'poaIssueYear',
        'opponentName',
        'opponentPhone',
        'caseNumber',
        'courtName',
        'courtBranch',
        'caseDetailsNotes',
        'caseAttachmentInput'
    ];


    fieldsToReset.forEach(id => {

        const el =
            document.getElementById(id);

        if (el) {
            el.value = '';
        }
    });


    const sessionsTableBody =
        document.getElementById(
            'sessionsTableBody'
        );


    if (sessionsTableBody) {
        sessionsTableBody.innerHTML = '';
    }


    fetchCases();
}



async function deleteCase(caseId) {

    if (!requireAdmin()) return;


    const item =
        allCasesCache.find(
            c => c.id === caseId
        );


    const caseTitle =
        item
            ? item.name
            : 'هذه القضية';


    if (
        !confirm(
            `هل أنت متأكد من رغبتك في حذف قضية "${caseTitle}" نهائياً؟`
        )
    ) {
        return;
    }


    const { error } =
        await db
            .from('cases')
            .delete()
            .eq('id', caseId);


    if (error) {

        alert(
            'حدث خطأ أثناء الحذف: ' +
            error.message
        );

    } else {

        fetchCases();
    }
}




async function openEditModal(caseId) {

    if (!requireAdmin()) return;


    const item =
        allCasesCache.find(
            c => c.id === caseId
        );


    if (!item) return;


    document.getElementById(
        'editCaseId'
    ).value = item.id;


    document.getElementById(
        'editCaseName'
    ).value = item.name || '';


    document.getElementById(
        'editClientName'
    ).value =
        item.client_name || '';


    document.getElementById(
        'editPowerOfAttorneyNo'
    ).value =
        item.power_of_attorney_no || '';


    document.getElementById(
        'editPoaIssuePlace'
    ).value =
        item.poa_issue_place || '';


    document.getElementById(
        'editPoaIssueYear'
    ).value =
        item.poa_issue_year || '';


    document.getElementById(
        'editOpponentName'
    ).value =
        item.opponent || '';


    document.getElementById(
        'editOpponentPhone'
    ).value =
        item.opponent_phone || '';


    document.getElementById(
        'editCaseType'
    ).value =
        item.case_type || 'مدني';


    document.getElementById(
        'editCaseStatus'
    ).value =
        item.status || 'جارية';


    document.getElementById(
        'editCaseNumber'
    ).value =
        item.case_number || '';


    document.getElementById(
        'editCaseYear'
    ).value =
        item.case_year || '2026';


    document.getElementById(
        'editCourtName'
    ).value =
        item.court_name || '';


    document.getElementById(
        'editCourtBranch'
    ).value =
        item.court_branch || '';


    document.getElementById(
        'editAssignedLawyer'
    ).value =
        item.assigned_lawyer || '';


    const editModal =
        document.getElementById(
            'editCaseModal'
        );


    if (editModal) {
        editModal.classList.add('active');
    }
}


function closeEditModal() {

    const editModal =
        document.getElementById(
            'editCaseModal'
        );


    if (editModal) {
        editModal.classList.remove('active');
    }
}


async function saveCaseUpdate() {

    if (!requireAdmin()) return;


    const id =
        document.getElementById(
            'editCaseId'
        ).value;


    const name =
        document.getElementById(
            'editCaseName'
        ).value.trim();


    const client_name =
        document.getElementById(
            'editClientName'
        ).value.trim();


    const power_of_attorney_no =
        document.getElementById(
            'editPowerOfAttorneyNo'
        ).value.trim();


    const poa_issue_place =
        document.getElementById(
            'editPoaIssuePlace'
        ).value.trim();


    const poa_issue_year =
        document.getElementById(
            'editPoaIssueYear'
        ).value.trim();


    const opponent =
        document.getElementById(
            'editOpponentName'
        ).value.trim();


    const opponent_phone =
        document.getElementById(
            'editOpponentPhone'
        ).value.trim();


    const case_type =
        document.getElementById(
            'editCaseType'
        ).value;


    const status =
        document.getElementById(
            'editCaseStatus'
        ).value;


    const case_number =
        document.getElementById(
            'editCaseNumber'
        ).value.trim();


    const case_year =
        document.getElementById(
            'editCaseYear'
        ).value.trim();


    const court_name =
        document.getElementById(
            'editCourtName'
        ).value.trim();


    const court_branch =
        document.getElementById(
            'editCourtBranch'
        ).value.trim();


    const assigned_lawyer =
        document.getElementById(
            'editAssignedLawyer'
        ).value.trim();


    if (!name) {

        return alert(
            'اسم القضية مطلوب'
        );
    }


    const updateData = {

        name,
        client_name,
        power_of_attorney_no,
        poa_issue_place,
        poa_issue_year,
        opponent,
        opponent_phone,
        case_type,
        status,
        case_number,
        case_year,
        court_name,
        court_branch,
        assigned_lawyer
    };


    const newAttachmentUrl =
        await uploadFileToSupabase(
            'editCaseAttachmentInput'
        );


    if (newAttachmentUrl) {

        updateData.attachment_url =
            newAttachmentUrl;
    }


    const { error } =
        await db
            .from('cases')
            .update(updateData)
            .eq('id', id);


    if (error) {

        return alert(
            'حدث خطأ أثناء التحديث: ' +
            error.message
        );
    }


    closeEditModal();

    fetchCases();
}




async function fetchClients() {

    if (!currentUser) return;


    const { data, error } =
        await db
            .from('clients')
            .select('*')
            .order('id', {
                ascending: false
            });


    if (error) {

        console.error(
            'Error fetching clients:',
            error.message
        );

        return;
    }


    const tbody =
        document.getElementById(
            'clientsTableBody'
        );


    if (!tbody) return;


    if (
        !data ||
        data.length === 0
    ) {

        tbody.innerHTML =
            '<tr><td colspan="4" style="text-align:center;">لا يوجد موكلين حالياً</td></tr>';

        return;
    }


    tbody.innerHTML =
        data.map(c => {

            const adminActions =
                isAdmin()
                    ? `
                        <button
                            class="btn btn-sm btn-danger"
                            onclick="deleteClient(${c.id})">

                            <i class="fa-solid fa-trash"></i>
                            حذف

                        </button>
                      `
                    : `
                        <span class="badge badge-done">
                            عرض فقط
                        </span>
                      `;


            return `

                <tr>

                    <td>
                        <b>${c.name || ''}</b>
                    </td>

                    <td>
                        ${c.phone || ''}
                    </td>

                    <td>

                        ${
                            c.id_card_url
                                ? `
                                    <a
                                        href="${c.id_card_url}"
                                        target="_blank">

                                        <img
                                            src="${c.id_card_url}"
                                            alt="صورة البطاقة"
                                            style="width:50px;height:50px;object-fit:cover;border-radius:4px;border:1px solid #ccc;">

                                    </a>
                                  `
                                : `
                                    <span style="color:#888;">
                                        لا توجد صورة
                                    </span>
                                  `
                        }

                    </td>

                    <td>
                        ${adminActions}
                    </td>

                </tr>

            `;

        }).join('');
}


async function addClient() {

    if (!requireLogin()) return;


    const nameInput =
        document.getElementById(
            'clientFormName'
        );


    const phoneInput =
        document.getElementById(
            'clientFormPhone'
        );


    const name =
        nameInput
            ? nameInput.value.trim()
            : '';


    const phone =
        phoneInput
            ? phoneInput.value.trim()
            : '';


    if (!name || !phone) {

        return alert(
            'يرجى إدخال اسم الموكل ورقم الهاتف'
        );
    }


    const id_card_url =
        await uploadFileToSupabase(
            'clientIdCardInput'
        );


    const { error } =
        await db
            .from('clients')
            .insert([{

                name,
                phone,
                id_card_url

            }]);


    if (error) {

        return alert(
            'حدث خطأ أثناء الإضافة: ' +
            error.message
        );
    }


    if (nameInput) {
        nameInput.value = '';
    }


    if (phoneInput) {
        phoneInput.value = '';
    }


    const fileInput =
        document.getElementById(
            'clientIdCardInput'
        );


    if (fileInput) {
        fileInput.value = '';
    }


    fetchClients();
}


async function deleteClient(id) {

    if (!requireAdmin()) return;


    if (
        !confirm(
            'هل أنت متأكد من حذف هذا الموكل؟'
        )
    ) {
        return;
    }


    const { error } =
        await db
            .from('clients')
            .delete()
            .eq('id', id);


    if (error) {

        alert(
            'خطأ أثناء الحذف: ' +
            error.message
        );

    } else {

        fetchClients();
    }
}




async function fetchTasks() {

    if (!currentUser) return;


    const { data, error } =
        await db
            .from('tasks')
            .select('*')
            .order('id', {
                ascending: false
            });


    if (error) {

        console.error(
            'Error fetching tasks:',
            error.message
        );

        return;
    }


    const list =
        document.getElementById(
            'tasksList'
        );


    const countStat =
        document.getElementById(
            'stat-tasks-count'
        );


    const activeTasks =
        data
            ? data.filter(
                t => !t.completed
              )
            : [];


    if (countStat) {

        countStat.innerText =
            activeTasks.length;
    }


    if (!list) return;


    if (
        !data ||
        data.length === 0
    ) {

        list.innerHTML =
            '<li style="padding:12px;text-align:center;color:#777;">لا توجد مهام حالية</li>';

        return;
    }


    const today =
        new Date();


    today.setHours(
        0, 0, 0, 0
    );


    list.innerHTML =
        data.map(t => {

            let isOverdue = false;
            let dueDateText = '';


            if (t.due_date) {

                const dueDate =
                    new Date(
                        t.due_date
                    );


                dueDate.setHours(
                    0, 0, 0, 0
                );


                isOverdue =
                    !t.completed &&
                    today > dueDate;


                dueDateText =
                    `تاريخ التنفيذ: ${t.due_date}`;
            }


            const bgColor =
                t.completed
                    ? '#f8fafc'
                    : (
                        isOverdue
                            ? '#fef2f2'
                            : '#ffffff'
                      );


            const borderColor =
                isOverdue
                    ? '#ef4444'
                    : '#e2e8f0';


            const adminActions =
                isAdmin()
                    ? `

                        <button
                            type="button"
                            class="btn btn-sm btn-warning"
                            onclick="editTaskInline(
                                ${t.id},
                                '${String(t.title || '')
                                    .replace(/'/g, "\\'")}',
                                '${t.due_date || ''}'
                            )">

                            <i class="fa-solid fa-pen"></i>
                            تعديل

                        </button>

                        <button
                            type="button"
                            class="btn btn-sm ${
                                t.completed
                                    ? 'btn-secondary'
                                    : 'btn-success'
                            }"
                            onclick="toggleCompleteTask(
                                ${t.id},
                                ${t.completed}
                            )">

                            ${
                                t.completed
                                    ? '<i class="fa-solid fa-rotate-left"></i> إرجاع'
                                    : '<i class="fa-solid fa-check"></i> تمت'
                            }

                        </button>

                        <button
                            type="button"
                            class="btn btn-sm btn-danger"
                            onclick="deleteTask(${t.id})">

                            <i class="fa-solid fa-trash"></i>
                            حذف

                        </button>

                      `
                    : `
                        <span class="badge badge-done">
                            عرض فقط
                        </span>
                      `;


            return `

                <li
                    id="task-item-${t.id}"
                    style="
                        padding:12px;
                        border:1px solid ${borderColor};
                        border-right:${
                            isOverdue
                                ? '5px solid #ef4444'
                                : '1px solid ' + borderColor
                        };
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        background:${bgColor};
                        margin-bottom:8px;
                        border-radius:6px;
                    "
                >

                    <div style="flex-grow:1;">

                        <span style="${
                            t.completed
                                ? 'text-decoration:line-through;color:#94a3b8;'
                                : 'font-weight:500;'
                        }">

                            📌 ${t.title || ''}

                        </span>


                        ${
                            dueDateText
                                ? `

                                    <div
                                        style="
                                            font-size:0.8rem;
                                            color:${
                                                isOverdue
                                                    ? '#dc2626'
                                                    : '#64748b'
                                            };
                                            margin-top:4px;
                                            font-weight:${
                                                isOverdue
                                                    ? 'bold'
                                                    : 'normal'
                                            };
                                        "
                                    >

                                        📅 ${dueDateText}

                                        ${
                                            isOverdue
                                                ? '(متأخرة!)'
                                                : ''
                                        }

                                    </div>

                                  `
                                : ''
                        }

                    </div>


                    <div
                        style="
                            display:flex;
                            gap:8px;
                        "
                    >

                        ${adminActions}

                    </div>

                </li>

            `;

        }).join('');
}


async function addTask() {

    if (!requireLogin()) return;


    const taskInput =
        document.getElementById(
            'taskTitle'
        );


    const dueDateInput =
        document.getElementById(
            'taskDueDate'
        );


    const title =
        taskInput
            ? taskInput.value.trim()
            : '';


    const dueDate =
        dueDateInput
            ? dueDateInput.value
            : null;


    if (!title) {

        return alert(
            'برجاء إدخال تفاصيل المهمة'
        );
    }


    if (!dueDate) {

        return alert(
            'برجاء اختيار تاريخ التنفيذ'
        );
    }


    const { error } =
        await db
            .from('tasks')
            .insert([{

                title: title,

                assigned_to: 'المكتب',

                completed: false,

                due_date: dueDate,

                created_at:
                    new Date().toISOString()

            }]);


    if (error) {

        console.error(
            'Error inserting task:',
            error
        );


        return alert(
            'خطأ أثناء الإضافة: ' +
            error.message
        );
    }


    if (taskInput) {
        taskInput.value = '';
    }


    if (dueDateInput) {
        dueDateInput.value = '';
    }


    fetchTasks();
}


function editTaskInline(
    taskId,
    currentTitle,
    currentDueDate
) {

    if (!requireAdmin()) return;


    const li =
        document.getElementById(
            `task-item-${taskId}`
        );


    if (!li) return;


    li.innerHTML = `

        <div
            style="
                display:flex;
                gap:8px;
                flex-grow:1;
                align-items:center;
            "
        >

            <input
                type="text"
                id="edit-task-title-${taskId}"
                value="${currentTitle}"
                class="form-control"
                style="flex:2;"
            >

            <input
                type="date"
                id="edit-task-date-${taskId}"
                value="${currentDueDate}"
                class="form-control"
                style="flex:1;"
            >

        </div>


        <div
            style="
                display:flex;
                gap:8px;
                margin-right:8px;
            "
        >

            <button
                type="button"
                class="btn btn-sm btn-success"
                onclick="saveTaskUpdate(${taskId})">

                <i class="fa-solid fa-check"></i>
                حفظ

            </button>


            <button
                type="button"
                class="btn btn-sm btn-secondary"
                onclick="fetchTasks()">

     إلغاء

            </button>

        </div>

    `;
}

async function saveTaskUpdate(taskId) {

    if (!requireAdmin()) return;

    const titleInput =
        document.getElementById(
            `edit-task-title-${taskId}`
        );

    const dateInput =
        document.getElementById(
            `edit-task-date-${taskId}`
        );

    const newTitle =
        titleInput
            ? titleInput.value.trim()
            : '';

    const newDueDate =
        dateInput
            ? dateInput.value
            : null;

    if (!newTitle) {
        return alert(
            'عنوان المهمة لا يمكن أن يكون فارغاً'
        );
    }

    if (!newDueDate) {
        return alert(
            'برجاء اختيار تاريخ التنفيذ'
        );
    }

    const { error } =
        await db
            .from('tasks')
            .update({
                title: newTitle,
                due_date: newDueDate
            })
            .eq('id', taskId);

    if (error) {

        alert(
            'حدث خطأ أثناء تحديث المهمة: ' +
            error.message
        );

    } else {

        fetchTasks();
    }
}




async function toggleCompleteTask(
    taskId,
    currentStatus
) {

    if (!requireAdmin()) return;

    const { error } =
        await db
            .from('tasks')
            .update({
                completed: !currentStatus
            })
            .eq('id', taskId);

    if (error) {

        alert(
            'حدث خطأ أثناء تحديث حالة المهمة: ' +
            error.message
        );

    } else {

        fetchTasks();
    }
}




async function deleteTask(taskId) {

    if (!requireAdmin()) return;

    if (
        !confirm(
            'هل أنت متأكد من حذف هذه المهمة؟'
        )
    ) {
        return;
    }

    const { error } =
        await db
            .from('tasks')
            .delete()
            .eq('id', taskId);

    if (error) {

        alert(
            'حدث خطأ أثناء حذف المهمة: ' +
            error.message
        );

    } else {

        fetchTasks();
    }
}




function startRealtime() {

    if (realtimeStarted) return;

    realtimeStarted = true;


    db.channel('tasks-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'tasks'
            },
            () => fetchTasks()
        )
        .subscribe();


    db.channel('cases-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'cases'
            },
            () => fetchCases()
        )
        .subscribe();


    db.channel('clients-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'clients'
            },
            () => fetchClients()
        )
        .subscribe();


    db.channel('companies-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'companies'
            },
            () => fetchCompanies()
        )
        .subscribe();

    db.channel('access-requests-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'access_requests'
            },
            () => loadAccessRequests()
        )
        .subscribe();
}




async function loadAllData() {

    if (!currentUser) return;

    await Promise.all([
        fetchCompanies(),
        fetchCases(),
        fetchTasks(),
        fetchClients(),
        loadAccessRequests()
    ]);
}



async function initializeApp() {

    createLoginScreen();

    showLoginScreen();


    const {
        data,
        error
    } = await db.auth.getSession();


    if (error) {

        console.error(
            'Session error:',
            error.message
        );

        return;
    }


    const session =
        data ? data.session : null;


    if (!session || !session.user) {

        showLoginScreen();

        return;
    }


    currentUser =
        session.user;


    const profileLoaded =
        await loadCurrentProfile(
            currentUser.id
        );


    if (!profileLoaded) {

        await db.auth.signOut();

        currentUser = null;
        currentProfile = null;

        showLoginScreen();

        const loginError =
            document.getElementById(
                'loginError'
            );

        if (loginError) {

            loginError.innerText =
                profileLoadError || 'بيانات المستخدم غير مكتملة.';

            loginError.style.display =
                'block';
        }

        return;
    }


    updateUserInterface();

    hideLoginScreen();

    await loadAllData();

    startRealtime();
}




document.addEventListener(
    'DOMContentLoaded',
    () => {

        initializeApp();

        setInterval(
            () => {

                if (currentUser) {
                    fetchTasks();
                }

            },
            60000
        );

    }
);
