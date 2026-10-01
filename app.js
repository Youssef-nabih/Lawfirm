const SUPABASE_URL = 'https://oscUGSlepanxyogvkaxq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zJOsLj6oLm2A6zjR-NcvGg_yE0_Gfmp';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allCasesCache = [];
let allCompaniesCache = [];
let allClientsCache = [];

let currentUser = null;
let currentProfile = null;
let realtimeStarted = false;
let profileLoadError = '';

function normalizeRecordText(value) {
    return String(value ?? '').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/\s+/g, ' ').trim().toLocaleLowerCase('ar');
}

function filterManagementRows(rows, inputId, fields) {
    const term = normalizeRecordText(document.getElementById(inputId)?.value);
    return term ? rows.filter(row => fields.some(field => normalizeRecordText(row[field]).includes(term))) : rows;
}

const recordSaveLocks = new Set();
function recordSaveError(error, prefix) {
    return error.code === '23505' && String(error.message).includes('office_unique_')
        ? 'الاسم موجود بالفعل. يرجى إدخال اسم آخر.' : prefix + error.message;
}
async function withRecordSaveLock(table, save) {
    if (recordSaveLocks.has(table)) return;
    recordSaveLocks.add(table);
    try { return await save(); }
    finally { recordSaveLocks.delete(table); }
}

// Read current visible records, including pages beyond Supabase's default limit.
async function recordNameAvailable(table, name, excludedId = null) {
    try {
        const normalized = normalizeRecordText(name);
        for (let offset = 0; ; offset += 1000) {
            const {data, error} = await db.from(table).select('id, name').order('id').range(offset, offset + 999);
            if (error) throw error;
            if ((data || []).some(row => String(row.id) !== String(excludedId) && normalizeRecordText(row.name) === normalized)) {
                alert('الاسم موجود بالفعل. يرجى إدخال اسم آخر.');
                return false;
            }
            if (!data || data.length < 1000) return true;
        }
    } catch (error) {
        alert('تعذر التحقق من تكرار الاسم. حاول مرة أخرى.');
        return false;
    }
}

// Session inputs and labels always use the office timezone, not the device timezone.
const sessionDateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function sessionDateForInput(value) {
    if (!value) return '';
    // Legacy timestamps without an offset represent office wall time.
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return String(value).replace(' ', 'T').slice(0, 16);
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const p = Object.fromEntries(sessionDateParts.formatToParts(date).map(part => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function sessionDateForStorage(value, original) {
    if (original && /(Z|[+-]\d{2}:?\d{2})$/i.test(original) && sessionDateForInput(original) === value) return original;
    if (!value) return null;
    const wall = String(value).slice(0, 16);
    const target = Date.parse(wall + ':00Z');
    if (!Number.isFinite(target)) throw new Error('موعد الجلسة غير صالح.');
    // Derive possible offsets on both sides of a DST transition.
    const candidates = new Set();
    for (const delta of [-86400000, 0, 86400000]) {
        const probe = target + delta;
        const local = sessionDateForInput(new Date(probe).toISOString());
        const offset = Date.parse(local + ':00Z') - probe;
        const candidate = new Date(target - offset).toISOString();
        if (sessionDateForInput(candidate) === wall) candidates.add(candidate);
    }
    if (!candidates.size) throw new Error('هذا الوقت غير موجود بتوقيت القاهرة بسبب تغيير الساعة. اختر موعدًا آخر.');
    // In the repeated autumn hour, consistently use its first occurrence.
    return [...candidates].sort()[0];
}

function formatSessionDate(value) {
    if (!value) return '-';
    const timestamp = /(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : sessionDateForStorage(value);
    return new Date(timestamp).toLocaleString('ar-EG', {
        timeZone: 'Africa/Cairo', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
}

function isAdmin() {
    return currentProfile && currentProfile.role === 'admin';
}

function canManageClients() {
    return Boolean(currentUser && currentProfile?.status === 'approved' &&
        ['admin', 'employee'].includes(currentProfile.role));
}

function requireClientManagement() {
    if (!requireLogin()) return false;
    if (!canManageClients()) {
        alert('ليس لديك صلاحية لتنفيذ هذا الإجراء.');
        return false;
    }
    return true;
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

const popupFocus = new WeakMap();

function preparePopup(overlay, close) {
    const panel = overlay.querySelector('.details-modal, .modal-content');
    popupFocus.set(overlay, document.activeElement);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', panel.querySelector('h2')?.textContent.trim() || 'التفاصيل');
    panel.tabIndex = -1;
    panel.scrollTop = 0;
    overlay.onkeydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(panel.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]'))
            .filter(el => !el.disabled && el.getClientRects().length);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first) { event.preventDefault(); panel.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
            event.preventDefault(); first.focus();
        }
    };
    overlay.onclick = event => { if (event.target === overlay) close(); };
    panel.focus({ preventScroll: true });
}

function restorePopupFocus(overlay) {
    const trigger = popupFocus.get(overlay);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    popupFocus.delete(overlay);
}

function createLoginScreen() {

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

            <h2>نظام إدارة مكتب احمد نبيه المحامي</h2>

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

    const loginForm =
        container.querySelector('#loginForm');

    const registrationForm =
        container.querySelector('#registrationForm');

    if (
        loginForm &&
        !loginForm.dataset.loginHandlerBound
    ) {
        loginForm.addEventListener(
            'submit',
            loginUser
        );

        loginForm.dataset.loginHandlerBound =
            'true';
    }

    if (
        registrationForm &&
        !registrationForm.dataset.registrationHandlerBound
    ) {
        registrationForm.addEventListener(
            'submit',
            registerUser
        );

        registrationForm.dataset.registrationHandlerBound =
            'true';
    }
}

function showLoginScreen() {

    const loginScreen =
        document.getElementById('loginScreen');

    if (loginScreen) {
        loginScreen.style.display = 'flex';
    }

    document.body.style.overflow = 'hidden';
}

function hideLoginScreen() {

    const loginScreen =
        document.getElementById('loginScreen');

    if (loginScreen) {
        loginScreen.style.display = 'none';
    }

    document.body.style.overflow = '';
}

async function loginUser(event) {

    if (event) event.preventDefault();

    const usernameInput =
        document.getElementById('loginUsername');

    const passwordInput =
        document.getElementById('loginPassword');

    const loginButton =
        document.getElementById('loginButton');

    const loginError =
        document.getElementById('loginError');

    const username =
        usernameInput.value.trim();

    const password =
        passwordInput.value;

    loginError.style.display = 'none';

    if (!username || !password) {

        loginError.innerText =
            'برجاء إدخال اسم المستخدم وكلمة المرور.';

        loginError.style.display =
            'block';

        return;
    }

    if (!loginButton) {
        throw new Error(
            'تعذر تجهيز زر تسجيل الدخول. حدّث الصفحة وحاول مرة أخرى.'
        );
    }

    loginButton.disabled = true;

    loginButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        جاري تسجيل الدخول...
    `;

    try {

        const {
            data: email,
            error: emailError
        } =
            await db.rpc(
                'get_login_email',
                {
                    p_username: username
                }
            );

        if (emailError) {

            console.error(
                'Login email error:',
                emailError
            );

            throw new Error(
                'تأكد من تشغيل SQL الخاص بنظام تسجيل الدخول في Supabase.'
            );
        }

        if (!email) {

            throw new Error(
                'اسم المستخدم أو كلمة المرور غير صحيحة.'
            );
        }

        const {
            data,
            error
        } =
            await db.auth.signInWithPassword({
                email: email,
                password: password
            });

        if (error) {

            console.error(
                'Supabase login error:',
                error
            );

            throw new Error(
                'اسم المستخدم أو كلمة المرور غير صحيحة.'
            );
        }

        currentUser =
            data.user;

        const profileLoaded =
            await loadCurrentProfile(
                currentUser.id
            );

        if (!profileLoaded) {

            await db.auth.signOut();

            currentUser = null;

            throw new Error(
                profileLoadError ||
                'الحساب موجود ولكن بيانات المستخدم غير مكتملة.'
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
            error.message ||
            'حدث خطأ أثناء تسجيل الدخول.';

        loginError.style.display =
            'block';

    } finally {

        loginButton.disabled = false;

        loginButton.innerHTML = `
            <i class="fa-solid fa-right-to-bracket"></i>
            تسجيل الدخول
        `;
    }
}

function showRegistrationForm() {

    document
        .getElementById('loginForm')
        ?.setAttribute('hidden', '');

    document
        .getElementById('registrationForm')
        ?.removeAttribute('hidden');

    document
        .getElementById('loginError')
        .style.display = 'none';
}

function showLoginForm() {

    document
        .getElementById('registrationForm')
        ?.setAttribute('hidden', '');

    document
        .getElementById('loginForm')
        ?.removeAttribute('hidden');

    document
        .getElementById('registrationMessage')
        .style.display = 'none';
}

async function registerUser(event) {

    event.preventDefault();

    const fullName =
        document
            .getElementById(
                'registrationFullName'
            )
            .value
            .trim();

    const username =
        document
            .getElementById(
                'registrationUsername'
            )
            .value
            .trim();

    const email =
        document
            .getElementById(
                'registrationEmail'
            )
            .value
            .trim();

    const password =
        document
            .getElementById(
                'registrationPassword'
            )
            .value;

    const button =
        document.getElementById(
            'registrationButton'
        );

    const message =
        document.getElementById(
            'registrationMessage'
        );

    message.style.display = 'none';

    if (
        !fullName ||
        !username ||
        !email ||
        password.length < 8
    ) {

        message.innerText =
            'يرجى إدخال كل البيانات واستخدام كلمة مرور من 8 أحرف على الأقل.';

        message.style.display =
            'block';

        return;
    }

    button.disabled = true;

    button.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> جاري إرسال الطلب...';

    try {

        const {
            data,
            error
        } =
            await db.auth.signUp({
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

        if (
            !data.user ||
            (
                Array.isArray(data.user.identities) &&
                data.user.identities.length === 0
            )
        ) {

            throw new Error(
                'هذا البريد الإلكتروني مسجّل بالفعل. استخدم بريدًا آخر أو سجّل الدخول.'
            );
        }

        if (!data.session) {

            throw new Error(
                'تم إنشاء الحساب لكن لم يمكن إرسال طلب الموافقة. عطّل Confirm Email في Supabase ثم أنشئ مستخدمًا جديدًا ببريد مختلف.'
            );
        }

        const {
            error: requestError
        } =
            await db.rpc(
                'create_my_access_request',
                {
                    p_username: username,
                    p_full_name: fullName,
                    p_email: email
                }
            );

        if (requestError) {
            throw requestError;
        }

        document
            .getElementById('registrationForm')
            .reset();

        message.style.color =
            '#15803d';

        message.innerText =
            'تم إرسال طلبك بنجاح. انتظر موافقة الأدمن قبل تسجيل الدخول.';

        message.style.display =
            'block';

    } catch (error) {

        console.error(
            'Registration error:',
            error
        );

        message.style.color =
            '#dc2626';

        const isEmailLimit =
            error.code === 'over_email_send_rate_limit' ||
            /email.*limit|rate.*limit/i.test(
                error.message || ''
            );

        message.innerText =
            isEmailLimit
                ? 'تم الوصول لحد رسائل البريد في Supabase. لا تُعد المحاولة الآن؛ عطّل Confirm Email للتجربة أو أضف Custom SMTP من إعدادات Supabase.'
                : (
                    error.message ||
                    'تعذر إرسال طلب إنشاء المستخدم.'
                );

        message.style.display =
            'block';

    } finally {

        button.disabled = false;

        button.innerHTML =
            '<i class="fa-solid fa-user-plus"></i> إرسال طلب الانضمام';
    }
}

async function loadCurrentProfile(userId) {

    profileLoadError = '';

    const {
        data,
        error
    } =
        await db
            .from('profiles')
            .select(
                'username, full_name, role, status'
            )
            .eq('id', userId)
            .maybeSingle();

    if (error) {

        console.error(
            'Profile error:',
            error.message
        );

        profileLoadError =
            'تعذر التحقق من صلاحية الحساب. تأكد من تشغيل إعدادات Supabase.';

        return false;
    }

    if (!data) {

        console.error(
            'No profile found.'
        );

        profileLoadError =
            'الحساب موجود ولكن بيانات المستخدم غير مكتملة.';

        return false;
    }

    currentProfile = data;

    if (currentProfile.status !== 'approved') {

        profileLoadError =
            currentProfile.status === 'rejected'
                ? 'تم رفض طلب الانضمام. تواصل مع الأدمن لمزيد من التفاصيل.'
                : 'طلب الانضمام قيد انتظار موافقة الأدمن.';

        console.warn(
            profileLoadError
        );

        currentProfile = null;

        return false;
    }

    return true;
}

function updateUserInterface() {

    updateEmployeesVisibility();
    if (window.updateBackupVisibility) window.updateBackupVisibility();

    if (!currentProfile) return;

    const userInfo =
        document.querySelector(
            '.header .user-info'
        );

    if (!userInfo) return;

    const displayName =
        currentProfile.full_name ||
        currentProfile.username;

    userInfo.innerHTML = `

        <i class="fa-solid fa-circle-user fa-lg"></i>

        <span>
            مرحباً، ${escapeHtml(displayName)}
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

    if (!document.getElementById('logoutButton')) {

        const logoutButton =
            document.createElement('button');

        logoutButton.id =
            'logoutButton';

        logoutButton.className =
            'btn btn-danger logout-button';

        logoutButton.innerHTML = `
            <i class="fa-solid fa-right-from-bracket"></i>
            تسجيل الخروج
        `;

        logoutButton.onclick =
            logoutUser;

        const header =
            document.querySelector(
                '.header'
            );

        if (header) {
            header.appendChild(
                logoutButton
            );
        }
    }
}

function escapeHtml(value) {

    return String(value ?? '')
        .replace(
            /[&<>'"]/g,
            char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[char])
        );
}

async function loadAccessRequests() {

    const panel =
        document.getElementById(
            'accessRequestsPanel'
        );

    const list =
        document.getElementById(
            'accessRequestsList'
        );

    if (!panel || !list) return;

    if (!isAdmin()) {

        panel.style.display =
            'none';

        return;
    }

    const {
        data,
        error
    } =
        await db
            .from('access_requests')
            .select(
                'id, user_id, username, full_name, email, created_at'
            )
            .eq('status', 'pending')
            .order(
                'created_at',
                {
                    ascending: false
                }
            );

    panel.style.display =
        'block';

    if (error) {

        console.error(
            'Access requests error:',
            error.message
        );

        list.innerHTML =
            '<p style="color:#dc2626;">تعذر تحميل الطلبات. شغّل ملف إعداد Supabase أولاً.</p>';

        return;
    }

    if (!data?.length) {

        list.innerHTML =
            '<p style="color:#64748b;">لا توجد طلبات جديدة حالياً.</p>';

        return;
    }

    list.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>الاسم</th>
                    <th>اسم المستخدم</th>
                    <th>البريد</th>
                    <th>وقت الطلب</th>
                    <th>الإجراء</th>
                </tr>
            </thead>

            <tbody>

                ${data.map(request => `

                    <tr>

                        <td>
                            ${escapeHtml(request.full_name)}
                        </td>

                        <td>
                            ${escapeHtml(request.username)}
                        </td>

                        <td>
                            ${escapeHtml(request.email)}
                        </td>

                        <td>
                            ${new Date(
                                request.created_at
                            ).toLocaleString('ar-EG')}
                        </td>

                        <td>

                            <button
                                class="btn btn-sm btn-success"
                                onclick="reviewAccessRequest(
                                    '${request.id}',
                                    '${request.user_id}',
                                    'approved'
                                )"
                            >
                                موافقة
                            </button>

                            <button
                                class="btn btn-sm btn-danger"
                                onclick="reviewAccessRequest(
                                    '${request.id}',
                                    '${request.user_id}',
                                    'rejected'
                                )"
                            >
                                رفض
                            </button>

                        </td>

                    </tr>

                `).join('')}

            </tbody>
        </table>
    `;
}

async function reviewAccessRequest(
    requestId,
    userId,
    decision
) {

    if (!requireAdmin()) return;

    const confirmation =
        decision === 'approved'
            ? 'هل تريد الموافقة على هذا المستخدم؟'
            : 'هل تريد رفض هذا المستخدم؟';

    if (!confirm(confirmation)) return;

    const {
        error
    } =
        await db.rpc(
            'review_access_request',
            {
                p_request_id: requestId,
                p_decision: decision
            }
        );

    if (error) {

        alert(
            'تعذر تنفيذ قرار الموافقة: ' +
            error.message
        );

        return;
    }

    await loadAccessRequests();
}

async function logoutUser() {

    if (!confirm('هل تريد تسجيل الخروج؟')) {
        return;
    }

    const {
        error
    } =
        await db.auth.signOut();

    if (error) {

        alert(
            'حدث خطأ أثناء تسجيل الخروج: ' +
            error.message
        );

        return;
    }

    currentUser = null;
    currentProfile = null;
    updateEmployeesVisibility();
    if (window.updateBackupVisibility) window.updateBackupVisibility();

    allCasesCache = [];
    allCompaniesCache = [];
    allClientsCache = [];

    const logoutButton =
        document.getElementById(
            'logoutButton'
        );

    if (logoutButton) {
        logoutButton.remove();
    }

    showLoginScreen();
}

async function uploadFileToSupabase(
    fileInputOrSource,
    bucketName = 'documents'
) {

    if (!requireLogin()) return null;

    let file = null;

    if (typeof fileInputOrSource === 'string') {

        const fileInput =
            document.getElementById(
                fileInputOrSource
            );

        if (
            fileInput &&
            fileInput.files &&
            fileInput.files.length > 0
        ) {
            file = fileInput.files[0];
        }

    } else if (
        fileInputOrSource instanceof File
    ) {

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

    const filePath =
        fileName;

    const {
        data,
        error
    } =
        await db.storage
            .from(bucketName)
            .upload(
                filePath,
                file
            );

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

    const {
        data: publicUrlData
    } =
        db.storage
            .from(bucketName)
            .getPublicUrl(
                filePath
            );

    return publicUrlData.publicUrl;
}

function switchPage(
    pageId,
    element
) {
    if (pageId === 'employees' && !requireAdmin()) return;
    if (pageId === 'activities' && (!currentUser || !isAdmin() || currentProfile?.status !== 'approved')) return;

    document
        .querySelectorAll(
            '.page-section'
        )
        .forEach(
            sec =>
                sec.classList.remove(
                    'active'
                )
        );

    document
        .querySelectorAll(
            '.sidebar .menu li a'
        )
        .forEach(
            a =>
                a.classList.remove(
                    'active'
                )
        );

    const targetPage =
        document.getElementById(
            pageId
        );

    if (targetPage) {
        targetPage.classList.add(
            'active'
        );
    }

    if (element) {
        element.classList.add(
            'active'
        );
    }
    if (pageId === 'employees') fetchEmployees();

}

function switchOdooTab(
    tabId,
    btn
) {

    const parentPanel =
        btn.closest('.panel');

    if (parentPanel) {

        parentPanel
            .querySelectorAll(
                '.tab-content'
            )
            .forEach(
                tc =>
                    tc.classList.remove(
                        'active'
                    )
            );

        parentPanel
            .querySelectorAll(
                '.odoo-tab-btn'
            )
            .forEach(
                b =>
                    b.classList.remove(
                        'active'
                    )
            );
    }

    const targetTab =
        document.getElementById(
            tabId
        );

    if (targetTab) {
        targetTab.classList.add(
            'active'
        );
    }

    if (btn) {
        btn.classList.add(
            'active'
        );
    }
}

function switchCompanyTab(
    tabId,
    btn
) {

    switchOdooTab(
        tabId,
        btn
    );
}

function toggleParentCompanySelect(
    selectElem
) {

    const group =
        document.getElementById(
            'parentCompanyGroup'
        );

    if (group) {

        group.style.display =
            selectElem.value === 'false'
                ? 'flex'
                : 'none';
    }
}

async function fetchCompanies() {

    if (!currentUser) return;

    const {
        data,
        error
    } =
        await db
            .from('companies')
            .select('*')
            .order(
                'id',
                {
                    ascending: false
                }
            );

    if (error) {

        console.error(
            'Error fetching companies:',
            error.message
        );

        return;
    }

    allCompaniesCache =
        data || [];

    renderCompaniesTable(
        allCompaniesCache
    );

    updateCompaniesStats();

    populateParentCompanyDropdown();
}

function renderCompaniesTable(
    companiesData
) {

    companiesData = filterManagementRows(companiesData || [], 'companiesSearch', ['name', 'legal_name', 'tax_id', 'commercial_register', 'phone', 'email']);

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
            '<tr><td colspan="8" style="text-align:center;">لا توجد شركات مطابقة للبحث أو مسجلة حالياً</td></tr>';

        return;
    }

    tbody.innerHTML =
        companiesData
            .map(c => {

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
                        ? `
                            <a
                                href="${c.logo_url}"
                                target="_blank"
                            >
                                <img
                                    src="${c.logo_url}"
                                    class="company-logo-preview"
                                    alt="logo"
                                >
                            </a>
                          `
                        : `
                            <div
                                style="
                                    width:40px;
                                    height:40px;
                                    background:#e2e8f0;
                                    border-radius:6px;
                                    display:flex;
                                    align-items:center;
                                    justify-content:center;
                                    color:#64748b;
                                "
                            >
                                <i class="fa-solid fa-building"></i>
                            </div>
                          `;

                const adminActions =
                    isAdmin()
                        ? `
                            <button
                                class="btn btn-sm btn-warning"
                                onclick="openEditCompanyModal(${c.id})"
                            >
                                <i class="fa-solid fa-pen"></i>
                            </button>

                            <button
                                class="btn btn-sm btn-danger"
                                onclick="deleteCompany(${c.id})"
                            >
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

                        <td>
                            ${logoHtml}
                        </td>

                        <td>
                            <b>
                                ${escapeHtml(c.name || '')}
                            </b>

                            ${
                                c.legal_name
                                    ? `
                                        <br>
                                        <small style="color:#64748b;">
                                            ${escapeHtml(c.legal_name)}
                                        </small>
                                      `
                                    : ''
                            }
                        </td>

                        <td>
                            ${escapeHtml(c.tax_id || 'غير مسجل')}
                        </td>

                        <td>
                            ${escapeHtml(c.industry || '-')}
                        </td>

                        <td>

                            <div>
                                <i
                                    class="fa-solid fa-envelope"
                                    style="
                                        font-size:0.75rem;
                                        color:#0284c7;
                                    "
                                ></i>

                                ${escapeHtml(c.email || '-')}
                            </div>

                            ${
                                c.phone
                                    ? `
                                        <div>
                                            <i
                                                class="fa-solid fa-phone"
                                                style="
                                                    font-size:0.75rem;
                                                    color:#16a34a;
                                                "
                                            ></i>

                                            ${escapeHtml(c.phone)}
                                        </div>
                                      `
                                    : ''
                            }

                        </td>

                        <td>
                            <b>
                                ${escapeHtml(c.currency || 'EGP')}
                            </b>
                        </td>

                        <td>
                            ${statusBadge}
                        </td>

                        <td>
                            <button class="btn btn-sm btn-primary" onclick="openCompanyWorkspace(${c.id})"><i class="fa-solid fa-list-check"></i> ملف الشركة والمهام</button>
                            ${adminActions}
                        </td>

                    </tr>
                `;
            })
            .join('');
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
        .filter(
            c => c.is_parent
        )
        .forEach(
            comp => {

                const option =
                    document.createElement(
                        'option'
                    );

                option.value =
                    comp.id;

                option.textContent =
                    comp.name;

                select.appendChild(
                    option
                );
            }
        );
}

async function addCompany() {

    if (!requireLogin()) return;
    return withRecordSaveLock('companies', async () => {

        const name =
            document
                .getElementById('compName')
                ?.value
                .trim();

        const legal_name =
            document
                .getElementById('compLegalName')
                ?.value
                .trim();

        const tax_id =
            document
                .getElementById('compTaxId')
                ?.value
                .trim();

        const commercial_register =
            document
                .getElementById(
                    'compCommercialRegister'
                )
                ?.value
                .trim();

        const industry =
            document
                .getElementById('compIndustry')
                ?.value;

        const company_size =
            document
                .getElementById('compSize')
                ?.value;

        const email =
            document
                .getElementById('compEmail')
                ?.value
                .trim();

        const phone =
            document
                .getElementById('compPhone')
                ?.value
                .trim();

        const website =
            document
                .getElementById('compWebsite')
                ?.value
                .trim();

        const country =
            document
                .getElementById('compCountry')
                ?.value
                .trim();

        const state_province =
            document
                .getElementById('compState')
                ?.value
                .trim();

        const city =
            document
                .getElementById('compCity')
                ?.value
                .trim();

        const postal_code =
            document
                .getElementById('compPostalCode')
                ?.value
                .trim();

        const address_street =
            document
                .getElementById(
                    'compAddressStreet'
                )
                ?.value
                .trim();

        const currency =
            document
                .getElementById('compCurrency')
                ?.value;

        const status =
            document
                .getElementById('compStatus')
                ?.value;

        const is_parent =
            document
                .getElementById('compIsParent')
                ?.value === 'true';

        const parent_id =
            document
                .getElementById('compParentId')
                ?.value || null;

        if (!name) {

            return alert(
                'برجاء إدخال اسم الشركة.'
            );
        }

        if (!await recordNameAvailable('companies', name)) return;

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

        const {
            data: savedCompany,
            error
        } =
            await db
                .from('companies')
                .insert([
                    newCompany
                ]).select().single();

        if (error) {

            return alert(
                recordSaveError(error, 'حدث خطأ أثناء إضافة الشركة: ')
            );
        }

        alert(
            'تمت إضافة الشركة بنجاح!'
        );

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

        fieldsToReset.forEach(
            id => {

                const el =
                    document.getElementById(
                        id
                    );

                if (el) {
                    el.value = '';
                }
            }
        );

        await fetchCompanies();
        if (savedCompany) openCompanyWorkspace(savedCompany.id);
    });
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
    ).value =
        comp.name || '';

    document.getElementById(
        'editCompLegalName'
    ).value =
        comp.legal_name || '';

    document.getElementById(
        'editCompTaxId'
    ).value =
        comp.tax_id || '';

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
        modal.classList.add(
            'active'
        );
    }
}

function closeEditCompanyModal() {

    const modal =
        document.getElementById(
            'editCompanyModal'
        );

    if (modal) {
        modal.classList.remove(
            'active'
        );
    }
}

async function saveCompanyUpdate() {

    if (!requireAdmin()) return;
    return withRecordSaveLock('companies', async () => {

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

        if (!name) {

            return alert(
                'اسم الشركة مطلوب.'
            );
        }

        if (!await recordNameAvailable('companies', name, id)) return;

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

        const {
            error
        } =
            await db
                .from('companies')
                .update(updateData)
                .eq('id', id);

        if (error) {

            return alert(
                recordSaveError(error, 'حدث خطأ أثناء التحديث: ')
            );
        }

        closeEditCompanyModal();

        fetchCompanies();
    });
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

    const {
        error
    } =
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

/* =========================================================
   CASE SESSIONS
========================================================= */

function addSessionRow(data = {}) {

    const tbody =
        document.getElementById(
            'sessionsTableBody'
        );

    if (!tbody) return;

    const tr =
        document.createElement('tr');

    if (data.id) {
        tr.dataset.sessionId =
            data.id;
    }
    tr.dataset.sessionDate = data.session_date || '';

    tr.innerHTML = `

        <td>
            <input
                type="datetime-local"
                class="session-date"
                value="${escapeHtml(
                    sessionDateForInput(data.session_date)
                )}"
                style="width:100%;"
            >
        </td>

        <td>
            <input
                type="text"
                class="session-subject"
                value="${escapeHtml(
                    data.session_subject || ''
                )}"
                placeholder="موضوع الجلسة"
                style="width:100%;"
            >
        </td>

        <td>
            <input
                type="text"
                class="session-lawyer"
                value="${escapeHtml(
                    data.attending_lawyer || ''
                )}"
                placeholder="المحامي الحاضر"
                style="width:100%;"
            >
        </td>

        <td>
            <input
                type="text"
                class="session-decision"
                value="${escapeHtml(
                    data.decision || ''
                )}"
                placeholder="قرار الجلسة / ما تم فيها"
                style="width:100%;"
            >
        </td>

        <td>

            <button
                type="button"
                class="btn btn-sm btn-danger"
                onclick="removeSessionRow(this)"
            >
                <i class="fa-solid fa-trash"></i>
            </button>

        </td>

    `;

    tbody.appendChild(tr);
}

async function removeSessionRow(button) {

    if (!button) return;

    const row =
        button.closest('tr');

    if (!row) return;

    const sessionId =
        row.dataset.sessionId;

    if (!sessionId) {

        row.remove();

        return;
    }

    if (!requireAdmin()) return;

    if (
        !confirm(
            'هل تريد حذف هذه الجلسة نهائياً؟'
        )
    ) {
        return;
    }

    const {
        error
    } =
        await db
            .from('case_sessions')
            .delete()
            .eq('id', sessionId);

    if (error) {

        alert(
            'حدث خطأ أثناء حذف الجلسة: ' +
            error.message
        );

        return;
    }

    row.remove();
}

function handleCaseTypeChange(
    selectElem
) {

    if (
        selectElem.value ===
        '__add_new__'
    ) {

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

            option.value =
                val;

            option.text =
                val;

            selectElem.add(
                option,
                selectElem.options[
                    selectElem.options.length - 1
                ]
            );

            selectElem.value =
                val;

            const editSelect =
                document.getElementById(
                    'editCaseType'
                );

            if (editSelect) {

                const editOption =
                    document.createElement(
                        'option'
                    );

                editOption.value =
                    val;

                editOption.text =
                    val;

                editSelect.add(
                    editOption
                );
            }

        } else {

            selectElem.selectedIndex =
                0;
        }
    }
}

function getStatusBadge(status) {

    const s =
        status || 'جارية';

    switch (s) {

        case 'جديدة':
            return `
                <span class="badge badge-new">
                    جديدة
                </span>
            `;

        case 'جارية':
            return `
                <span class="badge badge-active">
                    جارية
                </span>
            `;

        case 'مؤجلة':
            return `
                <span class="badge badge-pending">
                    مؤجلة
                </span>
            `;

        case 'تمت':
            return `
                <span class="badge badge-done">
                    تمت
                </span>
            `;

        case 'مؤرشفة':
            return `
                <span class="badge badge-archived">
                    مؤرشفة
                </span>
            `;

        default:
            return `
                <span class="badge badge-active">
                    ${escapeHtml(s)}
                </span>
            `;
    }
}

async function fetchCases() {

    if (!currentUser) return;

    const {
        data,
        error
    } =
        await db
            .from('cases')
            .select('*')
            .order(
                'id',
                {
                    ascending: false
                }
            );

    if (error) {

        console.error(
            'Error fetching cases:',
            error.message
        );

        return;
    }

    allCasesCache =
        data || [];

    renderCasesTable(
        allCasesCache
    );
    window.refreshOfficeSessions?.();
}

function renderCasesTable(
    casesData
) {

    casesData = casesData || [];
    const matchingCases = filterManagementRows(casesData, 'casesSearch', ['name', 'client_name', 'opponent', 'case_number', 'case_year', 'court_name', 'court_branch', 'assigned_lawyer']);

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
            '<tr><td colspan="11" style="text-align:center;">لا توجد قضايا مطابقة</td></tr>';

        if (recentTable) {

            recentTable.innerHTML =
                '<tr><td colspan="7" style="text-align:center;">لا توجد قضايا مضافة بعد</td></tr>';
        }

        return;
    }

    fullTable.innerHTML =
        matchingCases
            .map(c => {

                const adminActions =
                    isAdmin()
                        ? `
                            <button
                                class="btn btn-sm btn-warning"
                                onclick="openEditModal(${c.id})"
                            >
                                <i class="fa-solid fa-pen"></i>
                                تعديل
                            </button>

                            <button
                                class="btn btn-sm btn-danger"
                                onclick="deleteCase(${c.id})"
                            >
                                <i class="fa-solid fa-trash"></i>
                                حذف
                            </button>
                          `
                        : '';

                return `

                    <tr>

                        <td>
                            <b>
                                ${escapeHtml(c.name || '')}
                            </b>
                        </td>

                        <td>
                            ${escapeHtml(
                                c.client_name ||
                                'غير محدد'
                            )}
                            ${c.client_role ? `<br><small>الصفة: ${escapeHtml(c.client_role)}</small>` : ''}
                        </td>

                        <td>

                            ${escapeHtml(
                                c.opponent ||
                                'غير محدد'
                            )}
                            ${c.opponent_role ? `<br><small>الصفة: ${escapeHtml(c.opponent_role)}</small>` : ''}

                            ${
                                c.opponent_phone
                                    ? `
                                        <br>
                                        <small>
                                            📱 ${escapeHtml(
                                                c.opponent_phone
                                            )}
                                        </small>
                                      `
                                    : ''
                            }

                        </td>

                        <td>
                            ${escapeHtml(
                                c.case_type ||
                                'مدني'
                            )}
                        </td>

                        <td>
                            ${
                                c.case_number
                                    ? `${escapeHtml(
                                        c.case_number
                                      )} / ${escapeHtml(
                                        c.case_year || ''
                                      )}`
                                    : 'غير مسجل'
                            }
                        </td>

                        <td>

                            ${escapeHtml(
                                c.court_name ||
                                'غير محدد'
                            )}

                            ${
                                c.court_branch
                                    ? `(
                                        ${escapeHtml(
                                            c.court_branch
                                        )}
                                      )`
                                    : ''
                            }

                        </td>

                        <td>
                            ${escapeHtml(
                                c.assigned_lawyer ||
                                'غير محدد'
                            )}
                        </td>

                        <td>

                            ${
                                c.attachment_url
                                    ? `
                                        <a
                                            href="${c.attachment_url}"
                                            target="_blank"
                                            class="btn btn-sm btn-info"
                                        >
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

                            <button
                                class="btn btn-sm btn-info"
                                onclick="openCaseDetails(${c.id})"
                            >
                                <i class="fa-solid fa-eye"></i>
                                عرض
                            </button>

                            ${adminActions}

                        </td>

                    </tr>
                `;

            })
            .join('');

    if (!matchingCases.length) fullTable.innerHTML = '<tr><td colspan="11" style="text-align:center;">لا توجد قضايا مطابقة للبحث</td></tr>';

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
                                    onclick="openEditModal(${c.id})"
                                >
                                    تعديل
                                </button>

                                <button
                                    class="btn btn-sm btn-danger"
                                    onclick="deleteCase(${c.id})"
                                >
                                    حذف
                                </button>
                              `
                            : '';

                    return `

                        <tr>

                            <td>
                                <b>
                                    ${escapeHtml(
                                        c.name || ''
                                    )}
                                </b>
                            </td>

                            <td>
                                ${escapeHtml(
                                    c.client_name ||
                                    'غير محدد'
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    c.case_type ||
                                    'مدني'
                                )}
                            </td>

                            <td>
                                ${
                                    c.case_number
                                        ? `${escapeHtml(
                                            c.case_number
                                          )} / ${escapeHtml(
                                            c.case_year || ''
                                          )}`
                                        : 'غير مسجل'
                                }
                            </td>

                            <td>
                                ${getStatusBadge(
                                    c.status
                                )}
                            </td>

                            <td>

                                <button
                                    class="btn btn-sm btn-info"
                                    onclick="openCaseDetails(${c.id})"
                                >
                                    عرض
                                </button>

                                ${adminActions}

                            </td>

                        </tr>

                    `;
                })
                .join('');
    }
}

function filterCases(
    searchTerm = ''
) {

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
        allCasesCache.filter(
            c =>

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
    return withRecordSaveLock('cases', async () => {

        const name =
            document
                .getElementById('caseName')
                ?.value
                .trim();

        const client_name =
            document
                .getElementById('clientName')
                ?.value
                .trim();

        const power_of_attorney_no =
            document
                .getElementById(
                    'powerOfAttorneyNo'
                )
                ?.value
                .trim();

        const poa_issue_place =
            document
                .getElementById(
                    'poaIssuePlace'
                )
                ?.value
                .trim();

        const poa_issue_year =
            document
                .getElementById(
                    'poaIssueYear'
                )
                ?.value
                .trim();

        const opponent =
            document
                .getElementById('opponentName')
                ?.value
                .trim();

        const opponent_phone =
            document
                .getElementById('opponentPhone')
                ?.value
                .trim();

        const case_type =
            document
                .getElementById('caseType')
                ?.value;

        const status =
            document
                .getElementById('caseStatus')
                ?.value;

        const case_number =
            document
                .getElementById('caseNumber')
                ?.value
                .trim();

        const case_year =
            document
                .getElementById('caseYear')
                ?.value
                .trim();

        const court_name =
            document
                .getElementById('courtName')
                ?.value
                .trim();

        const court_branch =
            document
                .getElementById('courtBranch')
                ?.value
                .trim();

        const assigned_lawyer =
            document
                .getElementById(
                    'assignedLawyer'
                )
                ?.value
                .trim();

        const case_details =
            document
                .getElementById(
                    'caseDetailsNotes'
                )
                ?.value
                .trim();

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

            client_role: document.getElementById('clientRole')?.value.trim() || '',
            opponent_role: document.getElementById('opponentRole')?.value.trim() || '',

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
                .insert([
                    newCase
                ])
                .select()
                .single();

        if (error) {

            return alert(
                recordSaveError(error, 'حدث خطأ أثناء الإضافة: ')
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
                .forEach(
                    row => {

                        const session_date =
                            row.querySelector(
                                '.session-date'
                            )?.value;

                        const session_subject =
                            row.querySelector(
                                '.session-subject'
                            )?.value
                            ?.trim();

                        const attending_lawyer =
                            row.querySelector(
                                '.session-lawyer'
                            )?.value
                            ?.trim();

                        const decision =
                            row.querySelector(
                                '.session-decision'
                            )?.value
                            ?.trim();

                        if (
                            session_date ||
                            session_subject ||
                            attending_lawyer ||
                            decision
                        ) {

                            sessionPromises.push(
                                db
                                    .from(
                                        'case_sessions'
                                    )
                                    .insert([
                                        {
                                            case_id:
                                                caseId,

                                            session_date: sessionDateForStorage(session_date, row.dataset.sessionDate),

                                            session_subject:
                                                session_subject ||
                                                '',

                                            attending_lawyer:
                                                attending_lawyer ||
                                                '',

                                            decision:
                                                decision ||
                                                ''
                                        }
                                    ])
                            );
                        }
                    }
                );

            if (
                sessionPromises.length > 0
            ) {

                const results =
                    await Promise.all(
                        sessionPromises
                    );

                const failedSession =
                    results.find(
                        result =>
                            result.error
                    );

                if (failedSession) {

                    console.error(
                        'Session insert error:',
                        failedSession.error
                    );

                    alert(
                        'تم إنشاء القضية، لكن حدث خطأ أثناء حفظ إحدى الجلسات: ' +
                        failedSession.error.message
                    );
                }
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
            'clientRole',
            'opponentRole',
            'opponentPhone',
            'caseNumber',
            'caseYear',
            'courtName',
            'courtBranch',
            'assignedLawyer',
            'caseDetailsNotes',
            'caseAttachmentInput'
        ];

        fieldsToReset.forEach(
            id => {

                const el =
                    document.getElementById(
                        id
                    );

                if (el) {
                    el.value = '';
                }
            }
        );

        const sessionsTableBody =
            document.getElementById(
                'sessionsTableBody'
            );

        if (sessionsTableBody) {
            sessionsTableBody.innerHTML = '';
        }

        fetchCases();
    });
}

async function deleteCase(
    caseId
) {

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

    const {
        error
    } =
        await db
            .from('cases')
            .delete()
            .eq(
                'id',
                caseId
            );

    if (error) {

        alert(
            'حدث خطأ أثناء الحذف: ' +
            error.message
        );

    } else {

        fetchCases();
    }
}

async function openEditModal(
    caseId
) {

    if (!requireAdmin()) return;

    const item =
        allCasesCache.find(
            c => c.id === caseId
        );

    if (!item) return;

    const setValue =
        (
            id,
            value
        ) => {

            const el =
                document.getElementById(
                    id
                );

            if (el) {
                el.value =
                    value ?? '';
            }
        };

    setValue(
        'editCaseId',
        item.id
    );

    setValue(
        'editCaseName',
        item.name
    );

    setValue(
        'editClientName',
        item.client_name
    );

    setValue('editClientRole', item.client_role);
    setValue('editOpponentRole', item.opponent_role);

    setValue(
        'editPowerOfAttorneyNo',
        item.power_of_attorney_no
    );

    setValue(
        'editPoaIssuePlace',
        item.poa_issue_place
    );

    setValue(
        'editPoaIssueYear',
        item.poa_issue_year
    );

    setValue(
        'editOpponentName',
        item.opponent
    );

    setValue(
        'editOpponentPhone',
        item.opponent_phone
    );

    setValue(
        'editCaseType',
        item.case_type || 'مدني'
    );

    setValue(
        'editCaseStatus',
        item.status || 'جارية'
    );

    setValue(
        'editCaseNumber',
        item.case_number
    );

    setValue(
        'editCaseYear',
        item.case_year || '2026'
    );

    setValue(
        'editCourtName',
        item.court_name
    );

    setValue(
        'editCourtBranch',
        item.court_branch
    );

    setValue(
        'editAssignedLawyer',
        item.assigned_lawyer
    );

    setValue(
        'editCaseDetailsNotes',
        item.case_details
    );

    /*
     * دعم لو الـHTML عندك مسمي الحقل
     * editCaseDetails بدلاً من editCaseDetailsNotes
     */
    if (
        !document.getElementById(
            'editCaseDetailsNotes'
        )
    ) {

        setValue(
            'editCaseDetails',
            item.case_details
        );
    }

    const sessionsBody =
        document.getElementById(
            'editSessionsTableBody'
        );

    if (sessionsBody) {

        sessionsBody.innerHTML = '';

        const {
            data: sessions,
            error
        } =
            await db
                .from('case_sessions')
                .select('*')
                .eq(
                    'case_id',
                    caseId
                )
                .order(
                    'session_date',
                    {
                        ascending: true,
                        nullsFirst: false
                    }
                )
                .order(
                    'id',
                    {
                        ascending: true
                    }
                );

        if (error) {

            console.error(
                'Error loading case sessions:',
                error.message
            );

            alert(
                'تعذر تحميل جلسات القضية: ' +
                error.message
            );

        } else {

            (sessions || []).forEach(
                session =>
                    addEditSessionRow(
                        session
                    )
            );
        }
    }

    const editModal =
        document.getElementById(
            'editCaseModal'
        );

    if (editModal) {

        editModal.classList.add(
            'active'
        );
        preparePopup(editModal, closeEditModal);
    }
}

function addEditSessionRow(
    data = {}
) {

    const tbody =
        document.getElementById(
            'editSessionsTableBody'
        );

    if (!tbody) return;

    const tr =
        document.createElement('tr');

    if (data.id) {

        tr.dataset.sessionId =
            data.id;
    }
    tr.dataset.sessionDate = data.session_date || '';

    tr.innerHTML = `

        <td>

            <input
                type="datetime-local"
                class="session-date"
                value="${escapeHtml(
                    sessionDateForInput(data.session_date)
                )}"
                style="width:100%;"
            >

        </td>

        <td>

            <input
                type="text"
                class="session-subject"
                value="${escapeHtml(
                    data.session_subject || ''
                )}"
                placeholder="موضوع الجلسة"
                style="width:100%;"
            >

        </td>

        <td>

            <input
                type="text"
                class="session-lawyer"
                value="${escapeHtml(
                    data.attending_lawyer || ''
                )}"
                placeholder="المحامي الحاضر"
                style="width:100%;"
            >

        </td>

        <td>

            <input
                type="text"
                class="session-decision"
                value="${escapeHtml(
                    data.decision || ''
                )}"
                placeholder="قرار الجلسة / ما تم فيها"
                style="width:100%;"
            >

        </td>

        <td>

            <button
                type="button"
                class="btn btn-sm btn-danger"
                onclick="removeEditSessionRow(this)"
            >
                <i class="fa-solid fa-trash"></i>
            </button>

        </td>

    `;

    tbody.appendChild(tr);
}

async function removeEditSessionRow(
    button
) {

    if (!button) return;

    const row =
        button.closest('tr');

    if (!row) return;

    const sessionId =
        row.dataset.sessionId;

    if (!sessionId) {

        row.remove();

        return;
    }

    if (!requireAdmin()) return;

    if (
        !confirm(
            'هل تريد حذف هذه الجلسة نهائياً؟'
        )
    ) {
        return;
    }

    const {
        error
    } =
        await db
            .from('case_sessions')
            .delete()
            .eq(
                'id',
                sessionId
            );

    if (error) {

        alert(
            'حدث خطأ أثناء حذف الجلسة: ' +
            error.message
        );

        return;
    }

    row.remove();
}

function closeEditModal() {

    const editModal =
        document.getElementById(
            'editCaseModal'
        );

    if (editModal) {

        editModal.classList.remove(
            'active'
        );
        restorePopupFocus(editModal);
    }
}

async function saveCaseUpdate() {

    if (!requireAdmin()) return;
    return withRecordSaveLock('cases', async () => {

        const id =
            document.getElementById(
                'editCaseId'
            ).value;

        const getValue =
            (
                id
            ) => {

                return (
                    document.getElementById(
                        id
                    )?.value ||
                    ''
                ).trim();
            };

        const name =
            getValue(
                'editCaseName'
            );

        const client_name =
            getValue(
                'editClientName'
            );

        const power_of_attorney_no =
            getValue(
                'editPowerOfAttorneyNo'
            );

        const poa_issue_place =
            getValue(
                'editPoaIssuePlace'
            );

        const poa_issue_year =
            getValue(
                'editPoaIssueYear'
            );

        const opponent =
            getValue(
                'editOpponentName'
            );

        const opponent_phone =
            getValue(
                'editOpponentPhone'
            );

        const case_type =
            document.getElementById(
                'editCaseType'
            )?.value || '';

        const status =
            document.getElementById(
                'editCaseStatus'
            )?.value || '';

        const case_number =
            getValue(
                'editCaseNumber'
            );

        const case_year =
            getValue(
                'editCaseYear'
            );

        const court_name =
            getValue(
                'editCourtName'
            );

        const court_branch =
            getValue(
                'editCourtBranch'
            );

        const assigned_lawyer =
            getValue(
                'editAssignedLawyer'
            );

        let case_details =
            document.getElementById(
                'editCaseDetailsNotes'
            )?.value?.trim();

        if (
            case_details === undefined
        ) {

            case_details =
                document.getElementById(
                    'editCaseDetails'
                )?.value?.trim() || '';
        }

        if (!name) {

            return alert(
                'اسم القضية مطلوب'
            );
        }

        const updateData = {

            client_role: getValue('editClientRole'),
            opponent_role: getValue('editOpponentRole'),

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
            case_details
        };

        const newAttachmentUrl =
            await uploadFileToSupabase(
                'editCaseAttachmentInput'
            );

        if (newAttachmentUrl) {

            updateData.attachment_url =
                newAttachmentUrl;
        }

        const {
            error
        } =
            await db
                .from('cases')
                .update(
                    updateData
                )
                .eq(
                    'id',
                    id
                );

        if (error) {

            return alert(
                recordSaveError(error, 'حدث خطأ أثناء التحديث: ')
            );
        }

        /*
         * مهم جداً:
         * هنا لا نحذف كل الجلسات.
         *
         * الجلسة التي لها ID يتم UPDATE لها.
         * الجلسة الجديدة بدون ID يتم INSERT لها.
         * أي جلسة قديمة لم يتم حذفها تظل موجودة.
         */
        const sessionsBody =
            document.getElementById(
                'editSessionsTableBody'
            );

        if (sessionsBody) {

            const rows =
                Array.from(
                    sessionsBody.querySelectorAll(
                        'tr'
                    )
                );

            for (
                const row of rows
            ) {

                const sessionId =
                    row.dataset.sessionId ||
                    null;

                const session_date =
                    row.querySelector(
                        '.session-date'
                    )?.value || null;

                const session_subject =
                    row.querySelector(
                        '.session-subject'
                    )?.value
                    ?.trim() || '';

                const attending_lawyer =
                    row.querySelector(
                        '.session-lawyer'
                    )?.value
                    ?.trim() || '';

                const decision =
                    row.querySelector(
                        '.session-decision'
                    )?.value
                    ?.trim() || '';

                const hasData =
                    session_date ||
                    session_subject ||
                    attending_lawyer ||
                    decision;

                if (!hasData) {
                    continue;
                }

                const sessionData = {

                    case_id:
                        Number(id),

                    session_date: sessionDateForStorage(session_date, row.dataset.sessionDate),

                    session_subject,

                    attending_lawyer,

                    decision
                };

                if (sessionId) {

                    delete sessionData.case_id;

                    const {
                        error: sessionUpdateError
                    } =
                        await db
                            .from(
                                'case_sessions'
                            )
                            .update(
                                sessionData
                            )
                            .eq(
                                'id',
                                sessionId
                            )
                            .eq(
                                'case_id',
                                id
                            );

                    if (
                        sessionUpdateError
                    ) {

                        console.error(
                            'Session update error:',
                            sessionUpdateError
                        );

                        return alert(
                            'تم تحديث القضية، لكن حدث خطأ أثناء تحديث جلسة: ' +
                            sessionUpdateError.message
                        );
                    }

                } else {

                    const {
                        error: sessionInsertError
                    } =
                        await db
                            .from(
                                'case_sessions'
                            )
                            .insert([
                                sessionData
                            ]);

                    if (
                        sessionInsertError
                    ) {

                        console.error(
                            'Session insert error:',
                            sessionInsertError
                        );

                        return alert(
                            'تم تحديث القضية، لكن حدث خطأ أثناء إضافة جلسة جديدة: ' +
                            sessionInsertError.message
                        );
                    }
                }
            }
        }

        closeEditModal();

        await fetchCases();
    });
}

async function openCaseDetails(
    caseId
) {

    if (!requireLogin()) return;

    const item =
        allCasesCache.find(
            c => c.id === caseId
        );

    if (!item) {

        alert(
            'لم يتم العثور على القضية.'
        );

        return;
    }

    const {
        data: sessions,
        error
    } =
        await db
            .from('case_sessions')
            .select('*')
            .eq(
                'case_id',
                caseId
            )
            .order(
                'session_date',
                {
                    ascending: true,
                    nullsFirst: false
                }
            )
            .order(
                'id',
                {
                    ascending: true
                }
            );

    if (error) {

        alert(
            'تعذر تحميل جلسات القضية: ' +
            error.message
        );

        return;
    }

    const existing =
        document.getElementById(
            'caseDetailsDynamicModal'
        );

    if (existing) {
        existing.remove();
    }

    const overlay =
        document.createElement('div');

    overlay.id =
        'caseDetailsDynamicModal';

    overlay.className =
        'details-overlay';

    const sessionsHtml =
        sessions && sessions.length
            ? `
                <table class="details-table">

                    <thead>

                        <tr>
                            <th>التاريخ</th>
                            <th>موضوع الجلسة</th>
                            <th>المحامي</th>
                            <th>القرار / ما تم</th>
                        </tr>

                    </thead>

                    <tbody>

                        ${sessions.map(
                            session => `
                                <tr>

                                    <td>
                                        ${
                                            session.session_date
                                                ? formatSessionDate(session.session_date)
                                                : '-'
                                        }
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            session.session_subject ||
                                            '-'
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            session.attending_lawyer ||
                                            '-'
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            session.decision ||
                                            '-'
                                        )}
                                    </td>

                                </tr>
                            `
                        ).join('')}

                    </tbody>

                </table>
              `
            : `
                <div class="details-notes">
                    لا توجد جلسات مسجلة لهذه القضية حتى الآن.
                </div>
              `;

    overlay.innerHTML = `

        <div class="details-modal">

            <div class="details-modal-header">

                <div>

                    <h2 style="margin:0;">
                        تفاصيل القضية
                    </h2>

                    <small style="color:#64748b;">
                        ${escapeHtml(
                            item.name || ''
                        )}
                    </small>

                </div>

                <button
                    class="btn btn-sm btn-secondary"
                    onclick="closeDynamicCaseDetails()"
                >
                    <i class="fa-solid fa-xmark"></i>
                    إغلاق
                </button>

            </div>

            <div class="details-grid">

                <div class="details-item">
                    <label>موضوع القضية</label>
                    <strong>
                        ${escapeHtml(
                            item.name || '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>الموكل</label>
                    <strong>
                        ${escapeHtml(
                            item.client_name ||
                            '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>الخصم</label>
                    <strong>
                        ${escapeHtml(
                            item.opponent ||
                            '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>صفة الموكل</label>
                    <strong>${escapeHtml(item.client_role || '-')}</strong>
                </div>
                <div class="details-item">
                    <label>صفة الخصم</label>
                    <strong>${escapeHtml(item.opponent_role || '-')}</strong>
                </div>
                <div class="details-item">
                    <label>هاتف الخصم</label>
                    <strong>
                        ${escapeHtml(
                            item.opponent_phone ||
                            '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>نوع القضية</label>
                    <strong>
                        ${escapeHtml(
                            item.case_type ||
                            '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>رقم القضية</label>
                    <strong>
                        ${
                            item.case_number
                                ? `${escapeHtml(
                                    item.case_number
                                  )} / ${escapeHtml(
                                    item.case_year ||
                                    ''
                                  )}`
                                : '-'
                        }
                    </strong>
                </div>

                <div class="details-item">
                    <label>المحكمة</label>
                    <strong>
                        ${escapeHtml(
                            item.court_name ||
                            '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>الدائرة</label>
                    <strong>
                        ${escapeHtml(
                            item.court_branch ||
                            '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>المحامي المسؤول</label>
                    <strong>
                        ${escapeHtml(
                            item.assigned_lawyer ||
                            '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>التوكيل</label>
                    <strong>
                        ${
                            item.power_of_attorney_no ||
                            '-'
                        }
                    </strong>
                </div>

                <div class="details-item">
                    <label>مكان إصدار التوكيل</label>
                    <strong>
                        ${escapeHtml(
                            item.poa_issue_place ||
                            '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>سنة إصدار التوكيل</label>
                    <strong>
                        ${escapeHtml(
                            item.poa_issue_year ||
                            '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>الحالة</label>
                    <strong>
                        ${getStatusBadge(
                            item.status
                        )}
                    </strong>
                </div>

            </div>

            <h3>
                تفاصيل القضية
            </h3>

            <div class="details-notes">
                ${
                    escapeHtml(
                        item.case_details ||
                        'لا توجد تفاصيل إضافية.'
                    )
                }
            </div>

            <h3>
                جلسات القضية
            </h3>

            ${sessionsHtml}

            <div
                class="details-actions"
                style="margin-top:20px;"
            >

                ${
                    item.attachment_url
                        ? `
                            <a
                                href="${item.attachment_url}"
                                target="_blank"
                                class="btn btn-info"
                            >
                                <i class="fa-solid fa-paperclip"></i>
                                عرض المرفق
                            </a>
                          `
                        : ''
                }

                ${
                    isAdmin()
                        ? `
                            <button
                                class="btn btn-warning"
                                onclick="
                                    closeDynamicCaseDetails();
                                    openEditModal(${item.id});
                                "
                            >
                                <i class="fa-solid fa-pen"></i>
                                تعديل القضية
                            </button>
                          `
                        : ''
                }

            </div>

        </div>
    `;

    overlay.addEventListener(
        'click',
        event => {

            if (
                event.target === overlay
            ) {
                closeDynamicCaseDetails();
            }
        }
    );

    document.body.appendChild(
        overlay
    );
    window.enhanceCaseWorkspace?.(overlay, item, sessions || []);
    preparePopup(overlay, closeDynamicCaseDetails);
}

function closeDynamicCaseDetails() {

    const modal =
        document.getElementById(
            'caseDetailsDynamicModal'
        );

    if (modal) {
        modal.remove();
        restorePopupFocus(modal);
    }
}

/* =========================================================
   CLIENTS
========================================================= */

async function fetchClients() {

    if (!currentUser) return;

    const {
        data,
        error
    } =
        await db
            .from('clients')
            .select('*')
            .order(
                'id',
                {
                    ascending: false
                }
            );

    if (error) {

        console.error(
            'Error fetching clients:',
            error.message
        );

        return;
    }

    allClientsCache =
        data || [];

    renderClientsTable(
        allClientsCache
    );
}

function renderClientsTable(
    clientsData
) {

    clientsData = filterManagementRows(clientsData || [], 'clientsSearch', ['name', 'phone']);

    const tbody =
        document.getElementById(
            'clientsTableBody'
        );

    if (!tbody) return;

    if (
        !clientsData ||
        clientsData.length === 0
    ) {

        tbody.innerHTML =
            '<tr><td colspan="5" style="text-align:center;">لا يوجد موكلون مطابقون للبحث أو مسجلون حالياً</td></tr>';

        return;
    }

    tbody.innerHTML =
        clientsData
            .map(c => {

                const adminActions =
                    canManageClients()
                        ? `
                            <button
                                class="btn btn-sm btn-warning"
                                onclick="openEditClientModal(${c.id})"
                            >
                                <i class="fa-solid fa-pen"></i>
                                تعديل
                            </button>

                            <button
                                class="btn btn-sm btn-danger"
                                onclick="deleteClient(${c.id})"
                            >
                                <i class="fa-solid fa-trash"></i>
                                حذف
                            </button>
                          `
                        : '';

                return `

                    <tr>

                        <td>
                            <b>
                                ${escapeHtml(
                                    c.name || ''
                                )}
                            </b>
                        </td>

                        <td>
                            ${escapeHtml(
                                c.phone || ''
                            )}
                        </td>

                        <td>

                            ${
                                c.id_card_url
                                    ? `
                                        <a
                                            href="${c.id_card_url}"
                                            target="_blank"
                                        >

                                            <img
                                                src="${c.id_card_url}"
                                                alt="صورة البطاقة"
                                                style="
                                                    width:50px;
                                                    height:50px;
                                                    object-fit:cover;
                                                    border-radius:4px;
                                                    border:1px solid #ccc;
                                                "
                                            >

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

                            <button
                                class="btn btn-sm btn-info"
                                onclick="openClientDetails(${c.id})"
                            >
                                <i class="fa-solid fa-eye"></i>
                                عرض
                            </button>

                            ${adminActions}

                        </td>

                    </tr>

                `;
            })
            .join('');
}

function addClientExpenseRow(
    data = {},
    containerId = 'clientExpensesTableBody'
) {

    const tbody =
        document.getElementById(
            containerId
        );

    if (!tbody) return;

    const tr =
        document.createElement('tr');

    if (data.id) {

        tr.dataset.expenseId =
            data.id;
    }

    tr.innerHTML = `

        <td>

            <input
                type="number"
                step="0.01"
                min="0"
                class="client-expense-amount"
                value="${escapeHtml(
                    data.amount ?? ''
                )}"
                placeholder="0.00"
                style="width:100%;"
            >

        </td>

        <td>

            <input
                type="date"
                class="client-expense-date"
                value="${escapeHtml(
                    data.expense_date || ''
                )}"
                style="width:100%;"
            >

        </td>

        <td>

            <input
                type="text"
                class="client-expense-reason"
                value="${escapeHtml(
                    data.reason || ''
                )}"
                placeholder="سبب المصروف"
                style="width:100%;"
            >

        </td>

        <td>

            <input
                type="text"
                class="client-expense-spender"
                value="${escapeHtml(
                    data.spender || ''
                )}"
                placeholder="المحامي / المسؤول"
                style="width:100%;"
            >

        </td>

        <td>

            <button
                type="button"
                class="btn btn-sm btn-danger"
                onclick="removeClientExpenseRow(this)"
            >
                <i class="fa-solid fa-trash"></i>
            </button>

        </td>

    `;

    tbody.appendChild(tr);
}

async function removeClientExpenseRow(
    button
) {

    if (!button) return;

    const row =
        button.closest('tr');

    if (!row) return;

    const expenseId =
        row.dataset.expenseId;

    if (!expenseId) {

        row.remove();

        return;
    }

    if (!requireClientManagement()) return;

    if (
        !confirm(
            'هل تريد حذف هذا المصروف نهائياً؟'
        )
    ) {
        return;
    }

    const {
        error
    } =
        await db
            .from('client_expenses')
            .delete()
            .eq(
                'id',
                expenseId
            );

    if (error) {

        alert(
            'حدث خطأ أثناء حذف المصروف: ' +
            error.message
        );

        return;
    }

    row.remove();
}

async function addClient() {

    if (!requireLogin()) return;
    return withRecordSaveLock('clients', async () => {

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

        if (!name) {

            return alert(
                'يرجى إدخال اسم الموكل'
            );
        }

        if (!await recordNameAvailable('clients', name)) return;

        const id_card_url =
            await uploadFileToSupabase(
                'clientIdCardInput'
            );

        const {
            data: insertedClient,
            error
        } =
            await db
                .from('clients')
                .insert([
                    {
                        name,
                        phone,
                        id_card_url
                    }
                ])
                .select()
                .single();

        if (error) {

            return alert(
                recordSaveError(error, 'حدث خطأ أثناء الإضافة: ')
            );
        }

        const clientId =
            insertedClient?.id;

        if (clientId) {

            const expensesBody =
                document.getElementById(
                    'clientExpensesTableBody'
                );

            if (expensesBody) {

                const rows =
                    Array.from(
                        expensesBody.querySelectorAll(
                            'tr'
                        )
                    );

                for (
                    const row of rows
                ) {

                    const amount =
                        row.querySelector(
                            '.client-expense-amount'
                        )?.value;

                    const expense_date =
                        row.querySelector(
                            '.client-expense-date'
                        )?.value;

                    const reason =
                        row.querySelector(
                            '.client-expense-reason'
                        )?.value
                        ?.trim();

                    const spender =
                        row.querySelector(
                            '.client-expense-spender'
                        )?.value
                        ?.trim();

                    if (
                        !amount &&
                        !expense_date &&
                        !reason &&
                        !spender
                    ) {
                        continue;
                    }

                    const {
                        error: expenseError
                    } =
                        await db
                            .from(
                                'client_expenses'
                            )
                            .insert([
                                {
                                    client_id:
                                        clientId,

                                    amount:
                                        amount
                                            ? Number(amount)
                                            : 0,

                                    expense_date:
                                        expense_date ||
                                        null,

                                    reason:
                                        reason ||
                                        '',

                                    spender:
                                        spender ||
                                        ''
                                }
                            ]);

                    if (expenseError) {

                        console.error(
                            'Client expense insert error:',
                            expenseError
                        );

                        alert(
                            'تم إضافة الموكل، لكن حدث خطأ أثناء حفظ أحد المصروفات: ' +
                            expenseError.message
                        );

                        break;
                    }
                }
            }
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

        const expensesBody =
            document.getElementById(
                'clientExpensesTableBody'
            );

        if (expensesBody) {
            expensesBody.innerHTML = '';
        }

        await fetchClients();
    });
}

async function openClientDetails(
    clientId
) {

    if (!requireLogin()) return;

    const client =
        allClientsCache.find(
            c => c.id === clientId
        );

    if (!client) {

        alert(
            'لم يتم العثور على الموكل.'
        );

        return;
    }

    const {
        data: expenses,
        error
    } =
        await db
            .from('client_expenses')
            .select('*')
            .eq(
                'client_id',
                clientId
            )
            .order(
                'expense_date',
                {
                    ascending: false,
                    nullsFirst: false
                }
            )
            .order(
                'id',
                {
                    ascending: false
                }
            );

    if (error) {

        alert(
            'تعذر تحميل مصروفات الموكل: ' +
            error.message
        );

        return;
    }

    const existing =
        document.getElementById(
            'clientDetailsDynamicModal'
        );

    if (existing) {
        existing.remove();
    }

    const total =
        (expenses || []).reduce(
            (
                sum,
                expense
            ) =>
                sum +
                Number(
                    expense.amount || 0
                ),
            0
        );

    const overlay =
        document.createElement(
            'div'
        );

    overlay.id =
        'clientDetailsDynamicModal';

    overlay.className =
        'details-overlay';

    const expensesHtml =
        expenses && expenses.length
            ? `
                <table class="details-table">

                    <thead>

                        <tr>
                            <th>المبلغ</th>
                            <th>التاريخ</th>
                            <th>سبب المصروف</th>
                            <th>المسؤول / الدافع</th>
                        </tr>

                    </thead>

                    <tbody>

                        ${expenses.map(
                            expense => `
                                <tr>

                                    <td>
                                        ${Number(
                                            expense.amount || 0
                                        ).toLocaleString(
                                            'ar-EG',
                                            {
                                                minimumFractionDigits: 2
                                            }
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            expense.expense_date ||
                                            '-'
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            expense.reason ||
                                            '-'
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            expense.spender ||
                                            '-'
                                        )}
                                    </td>

                                </tr>
                            `
                        ).join('')}

                    </tbody>

                </table>

                <div
                    style="
                        margin-top:15px;
                        padding:12px;
                        background:#f8fafc;
                        border:1px solid #e2e8f0;
                        border-radius:8px;
                        font-weight:bold;
                    "
                >
                    إجمالي المصروفات:
                    ${total.toLocaleString(
                        'ar-EG',
                        {
                            minimumFractionDigits: 2
                        }
                    )}
                </div>
              `
            : `
                <div class="details-notes">
                    لا توجد مصروفات مسجلة لهذا الموكل.
                </div>
              `;

    overlay.innerHTML = `

        <div class="details-modal">

            <div class="details-modal-header">

                <div>

                    <h2 style="margin:0;">
                        بيانات الموكل
                    </h2>

                    <small style="color:#64748b;">
                        ${escapeHtml(
                            client.name || ''
                        )}
                    </small>

                </div>

                <button
                    class="btn btn-sm btn-secondary"
                    onclick="closeDynamicClientDetails()"
                >
                    <i class="fa-solid fa-xmark"></i>
                    إغلاق
                </button>

            </div>

            <div class="details-grid">

                <div class="details-item">
                    <label>اسم الموكل</label>
                    <strong>
                        ${escapeHtml(
                            client.name ||
                            '-'
                        )}
                    </strong>
                </div>

                <div class="details-item">
                    <label>رقم الهاتف</label>
                    <strong>
                        ${escapeHtml(
                            client.phone ||
                            '-'
                        )}
                    </strong>
                </div>

            </div>

            ${
                client.id_card_url
                    ? `
                        <div
                            style="
                                margin-bottom:20px;
                            "
                        >
                            <a
                                href="${client.id_card_url}"
                                target="_blank"
                                class="btn btn-info"
                            >
                                <i class="fa-solid fa-id-card"></i>
                                عرض صورة البطاقة
                            </a>
                        </div>
                      `
                    : ''
            }

            <h3>
                مصروفات الموكل
            </h3>

            ${expensesHtml}

            <div
                class="details-actions"
                style="margin-top:20px;"
            >

                ${
                    canManageClients()
                        ? `
                            <button
                                class="btn btn-warning"
                                onclick="
                                    closeDynamicClientDetails();
                                    openEditClientModal(${client.id});
                                "
                            >
                                <i class="fa-solid fa-pen"></i>
                                تعديل الموكل
                            </button>
                          `
                        : ''
                }

            </div>

        </div>

    `;

    overlay.addEventListener(
        'click',
        event => {

            if (
                event.target === overlay
            ) {
                closeDynamicClientDetails();
            }
        }
    );

    document.body.appendChild(
        overlay
    );
    preparePopup(overlay, closeDynamicClientDetails);
}

function closeDynamicClientDetails() {

    const modal =
        document.getElementById(
            'clientDetailsDynamicModal'
        );

    if (modal) {
        modal.remove();
        restorePopupFocus(modal);
    }
}

async function openEditClientModal(
    clientId
) {

    if (!requireClientManagement()) return;

    const client =
        allClientsCache.find(
            c => c.id === clientId
        );

    if (!client) return;

    const existing =
        document.getElementById(
            'clientEditDynamicModal'
        );

    if (existing) {
        existing.remove();
    }

    const {
        data: expenses,
        error
    } =
        await db
            .from('client_expenses')
            .select('*')
            .eq(
                'client_id',
                clientId
            )
            .order(
                'expense_date',
                {
                    ascending: true,
                    nullsFirst: false
                }
            )
            .order(
                'id',
                {
                    ascending: true
                }
            );

    if (error) {

        alert(
            'تعذر تحميل المصروفات: ' +
            error.message
        );

        return;
    }

    const overlay =
        document.createElement(
            'div'
        );

    overlay.id =
        'clientEditDynamicModal';

    overlay.className =
        'details-overlay';

    overlay.innerHTML = `

        <div class="details-modal">

            <div class="details-modal-header">

                <h2 style="margin:0;">
                    تعديل بيانات الموكل
                </h2>

                <button
                    class="btn btn-sm btn-secondary"
                    onclick="closeClientEditDynamicModal()"
                >
                    <i class="fa-solid fa-xmark"></i>
                    إغلاق
                </button>

            </div>

            <input
                type="hidden"
                id="dynamicEditClientId"
                value="${client.id}"
            >

            <div class="details-grid">

                <div class="details-item">

                    <label>
                        اسم الموكل
                    </label>

                    <input
                        type="text"
                        id="dynamicEditClientName"
                        value="${escapeHtml(
                            client.name || ''
                        )}"
                        style="
                            width:100%;
                            padding:10px;
                            border:1px solid #cbd5e1;
                            border-radius:7px;
                        "
                    >

                </div>

                <div class="details-item">

                    <label>
                        رقم الهاتف
                    </label>

                    <input
                        type="text"
                        id="dynamicEditClientPhone"
                        value="${escapeHtml(
                            client.phone || ''
                        )}"
                        style="
                            width:100%;
                            padding:10px;
                            border:1px solid #cbd5e1;
                            border-radius:7px;
                        "
                    >

                </div>

            </div>

            <h3>
                المصروفات
            </h3>

            <div style="overflow-x:auto;">

                <table class="details-table">

                    <thead>

                        <tr>
                            <th>المبلغ</th>
                            <th>التاريخ</th>
                            <th>السبب</th>
                            <th>المسؤول / الدافع</th>
                            <th>إجراء</th>
                        </tr>

                    </thead>

                    <tbody id="dynamicEditClientExpensesBody">
                    </tbody>

                </table>

            </div>

            <div
                style="
                    margin-top:15px;
                    display:flex;
                    gap:8px;
                    flex-wrap:wrap;
                "
            >

                <button
                    type="button"
                    class="btn btn-info"
                    onclick="addClientExpenseRow(
                        {},
                        'dynamicEditClientExpensesBody'
                    )"
                >
                    <i class="fa-solid fa-plus"></i>
                    إضافة مصروف
                </button>

                <button
                    type="button"
                    class="btn btn-success"
                    onclick="saveClientUpdate()"
                >
                    <i class="fa-solid fa-check"></i>
                    حفظ التعديلات
                </button>

            </div>

        </div>

    `;

    document.body.appendChild(
        overlay
    );
    preparePopup(overlay, closeClientEditDynamicModal);

    const body =
        document.getElementById(
            'dynamicEditClientExpensesBody'
        );

    if (body) {

        (expenses || []).forEach(
            expense =>
                addClientExpenseRow(
                    expense,
                    'dynamicEditClientExpensesBody'
                )
        );
    }
}

function closeClientEditDynamicModal() {

    const modal =
        document.getElementById(
            'clientEditDynamicModal'
        );

    if (modal) {
        modal.remove();
        restorePopupFocus(modal);
    }
}

async function saveClientUpdate() {

    if (!requireClientManagement()) return;
    return withRecordSaveLock('clients', async () => {

        const clientId =
            document.getElementById(
                'dynamicEditClientId'
            )?.value;

        const name =
            document.getElementById(
                'dynamicEditClientName'
            )?.value
            ?.trim();

        const phone =
            document.getElementById(
                'dynamicEditClientPhone'
            )?.value
            ?.trim();

        if (!clientId) {

            return alert(
                'لم يتم تحديد الموكل.'
            );
        }

        if (!name) {

            return alert(
                'اسم الموكل مطلوب.'
            );
        }

        if (!await recordNameAvailable('clients', name, clientId)) return;

        const {
            error: clientError
        } =
            await db
                .from('clients')
                .update({
                    name,
                    phone
                })
                .eq(
                    'id',
                    clientId
                );

        if (clientError) {

            return alert(
                recordSaveError(clientError, 'حدث خطأ أثناء تحديث الموكل: ')
            );
        }

        const body =
            document.getElementById(
                'dynamicEditClientExpensesBody'
            );

        if (body) {

            const rows =
                Array.from(
                    body.querySelectorAll(
                        'tr'
                    )
                );

            for (
                const row of rows
            ) {

                const expenseId =
                    row.dataset.expenseId ||
                    null;

                const amount =
                    row.querySelector(
                        '.client-expense-amount'
                    )?.value;

                const expense_date =
                    row.querySelector(
                        '.client-expense-date'
                    )?.value;

                const reason =
                    row.querySelector(
                        '.client-expense-reason'
                    )?.value
                    ?.trim() || '';

                const spender =
                    row.querySelector(
                        '.client-expense-spender'
                    )?.value
                    ?.trim() || '';

                const hasData =
                    amount ||
                    expense_date ||
                    reason ||
                    spender;

                if (!hasData) {
                    continue;
                }

                const expenseData = {

                    amount:
                        amount
                            ? Number(amount)
                            : 0,

                    expense_date:
                        expense_date ||
                        null,

                    reason,

                    spender
                };

                if (expenseId) {

                    const {
                        error: expenseUpdateError
                    } =
                        await db
                            .from(
                                'client_expenses'
                            )
                            .update(
                                expenseData
                            )
                            .eq(
                                'id',
                                expenseId
                            )
                            .eq(
                                'client_id',
                                clientId
                            );

                    if (
                        expenseUpdateError
                    ) {

                        return alert(
                            'تم تحديث الموكل، لكن حدث خطأ أثناء تحديث مصروف: ' +
                            expenseUpdateError.message
                        );
                    }

                } else {

                    const {
                        error: expenseInsertError
                    } =
                        await db
                            .from(
                                'client_expenses'
                            )
                            .insert([
                                {
                                    client_id:
                                        Number(
                                            clientId
                                        ),

                                    ...expenseData
                                }
                            ]);

                    if (
                        expenseInsertError
                    ) {

                        return alert(
                            'تم تحديث الموكل، لكن حدث خطأ أثناء إضافة المصروف: ' +
                            expenseInsertError.message
                        );
                    }
                }
            }
        }

        closeClientEditDynamicModal();

        await fetchClients();
    });
}

async function deleteClient(
    id
) {

    if (!requireClientManagement()) return;

    if (
        !confirm(
            'هل أنت متأكد من حذف هذا الموكل؟'
        )
    ) {
        return;
    }

    const {
        error
    } =
        await db
            .from('clients')
            .delete()
            .eq(
                'id',
                id
            );

    if (error) {

        alert(
            'خطأ أثناء الحذف: ' +
            error.message
        );

    } else {

        fetchClients();
    }
}

/* =========================================================
   TASKS
========================================================= */

async function fetchTasks() {

    if (!currentUser) return;

    const {
        data,
        error
    } =
        await db
            .from('tasks')
            .select('*')
            .order('due_date', { ascending: true, nullsFirst: false })
            .order(
                'id',
                {
                    ascending: false
                }
            );

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

    window.updateOfficeTasks?.(data || []);
    const selectedDate = document.getElementById('taskDateFilter')?.value || '';
    const visibleTasks = (data || []).filter(t => !selectedDate || t.due_date === selectedDate);

    if (
        visibleTasks.length === 0
    ) {

        list.innerHTML =
            `<li style="padding:12px;text-align:center;color:#777;">${selectedDate ? 'لا توجد مهام في اليوم المحدد' : 'لا توجد مهام حالية'}</li>`;

        return;
    }

    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );

    list.innerHTML =
        visibleTasks
            .map(t => {

                let isOverdue = false;
                let dueDateText = '';

                if (t.due_date) {

                    const dueDate =
                        new Date(
                            t.due_date
                        );

                    dueDate.setHours(
                        0,
                        0,
                        0,
                        0
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

                const safeTitle =
                    String(
                        t.title || ''
                    )
                        .replace(
                            /\\/g,
                            '\\\\'
                        )
                        .replace(
                            /'/g,
                            "\\'"
                        );

                const adminActions =
                    isAdmin()
                        ? `

                            <button
                                type="button"
                                class="btn btn-sm btn-warning"
                                onclick="editTaskInline(
                                    ${t.id},
                                    '${escapeHtml(safeTitle)}',
                                    '${t.due_date || ''}',
                                    ${t.is_important === true}
                                )"
                            >

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
                                )"
                            >

                                ${
                                    t.completed
                                        ? '<i class="fa-solid fa-rotate-left"></i> إرجاع'
                                        : '<i class="fa-solid fa-check"></i> تمت'
                                }

                            </button>

                            <button
                                type="button"
                                class="btn btn-sm btn-danger"
                                onclick="deleteTask(${t.id})"
                            >

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
                        class="${t.is_important ? 'task-important' : ''} ${t.completed ? 'task-completed' : ''}"
                        style="
                            padding:12px;
                            border:1px solid ${borderColor};
                            border-right:${
                                isOverdue
                                    ? '5px solid #ef4444'
                                    : '1px solid ' +
                                      borderColor
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

                            ${t.is_important ? '<span class="task-importance-badge">★ مهمة جدًا</span>' : ''}

                            <span style="${
                                t.completed
                                    ? 'text-decoration:line-through;color:#94a3b8;'
                                    : 'font-weight:500;'
                            }">

                                📌 ${escapeHtml(
                                    t.title || ''
                                )}

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

                                            📅 ${escapeHtml(
                                                dueDateText
                                            )}

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
            })
            .join('');
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

    const {
        error
    } =
        await db
            .from('tasks')
            .insert([
                {
                    title: title,
                    assigned_to: 'المكتب',
                    completed: false,
                    is_important: document.getElementById('taskImportant').checked,
                    due_date: dueDate,
                    created_at:
                        new Date().toISOString()
                }
            ]);

    if (error) {

        console.error(
            'Error inserting task:',
            error
        );

        return alert(
            (['42703','PGRST204'].includes(error.code) ? 'يلزم تفعيل ميزة أهمية المهام بتشغيل ملف 005_task_importance.sql. ' : 'خطأ أثناء الإضافة: ') + error.message
        );
    }

    if (taskInput) {
        taskInput.value = '';
    }
    document.getElementById('taskImportant').checked = false;

    if (dueDateInput) {
        dueDateInput.value = '';
    }

    fetchTasks();
}

function editTaskInline(
    taskId,
    currentTitle,
    currentDueDate,
    currentImportant = false
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
                value="${escapeHtml(
                    currentTitle
                )}"
                class="form-control"
                style="flex:2;"
            >

            <input
                type="date"
                id="edit-task-date-${taskId}"
                value="${escapeHtml(
                    currentDueDate
                )}"
                class="form-control"
                style="flex:1;"
            >

            <label class="task-importance-control"><input type="checkbox" id="edit-task-important-${taskId}" ${currentImportant ? 'checked' : ''}> ★ مهمة جدًا</label>

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
                onclick="saveTaskUpdate(${taskId})"
            >

                <i class="fa-solid fa-check"></i>
                حفظ

            </button>

            <button
                type="button"
                class="btn btn-sm btn-secondary"
                onclick="fetchTasks()"
            >

                إلغاء

            </button>

        </div>

    `;
}

async function saveTaskUpdate(
    taskId
) {

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

    const {
        error
    } =
        await db
            .from('tasks')
            .update({
                title: newTitle,
                due_date: newDueDate,
                is_important: document.getElementById(`edit-task-important-${taskId}`).checked
            })
            .eq(
                'id',
                taskId
            );

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

    const {
        error
    } =
        await db
            .from('tasks')
            .update({
                completed:
                    !currentStatus
            })
            .eq(
                'id',
                taskId
            );

    if (error) {

        alert(
            'حدث خطأ أثناء تحديث حالة المهمة: ' +
            error.message
        );

    } else {

        fetchTasks();
    }
}

async function deleteTask(
    taskId
) {

    if (!requireAdmin()) return;

    if (
        !confirm(
            'هل أنت متأكد من حذف هذه المهمة؟'
        )
    ) {
        return;
    }

    const {
        error
    } =
        await db
            .from('tasks')
            .delete()
            .eq(
                'id',
                taskId
            );

    if (error) {

        alert(
            'حدث خطأ أثناء حذف المهمة: ' +
            error.message
        );

    } else {

        fetchTasks();
    }
}

/* =========================================================
   REALTIME
========================================================= */

function startRealtime() {

    if (realtimeStarted) return;

    realtimeStarted =
        true;

    db.channel(
        'tasks-changes'
    )
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

    db.channel(
        'cases-changes'
    )
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

    db.channel(
        'case-sessions-changes'
    )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'case_sessions'
            },
            () => fetchCases()
        )
        .subscribe();

    db.channel(
        'clients-changes'
    )
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

    db.channel(
        'client-expenses-changes'
    )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'client_expenses'
            },
            () => fetchClients()
        )
        .subscribe();

    db.channel(
        'companies-changes'
    )
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

    db.channel(
        'access-requests-changes'
    )
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

let employeesRequestVersion = 0;

function updateEmployeesVisibility() {
    if (window.updateActivityVisibility) window.updateActivityVisibility();
    const allowed = Boolean(currentUser && isAdmin());
    const menu = document.getElementById('employeesMenuItem');
    const page = document.getElementById('employees');
    if (menu) menu.hidden = !allowed;
    if (page) page.hidden = !allowed;
    if (!allowed) {
        employeesRequestVersion++;
        const body = document.getElementById('employeesTableBody');
        if (body) body.replaceChildren();
        if (page?.classList.contains('active')) {
            switchPage('dashboard', document.querySelector('.sidebar a'));
        }
    }
}

async function fetchEmployees() {
    if (!currentUser || !isAdmin()) {
        updateEmployeesVisibility();
    if (window.updateBackupVisibility) window.updateBackupVisibility();
        return;
    }
    const body = document.getElementById('employeesTableBody');
    if (!body) return;
    const version = ++employeesRequestVersion;
    const userId = currentUser.id;
    body.innerHTML = '<tr><td colspan="3">جاري تحميل الموظفين...</td></tr>';
    try {
        const { data, error } = await db.rpc('list_registered_employees');
        if (version !== employeesRequestVersion || currentUser?.id !== userId || !isAdmin()) return;
        if (error) throw error;
        const statuses = { approved: 'مقبول', pending: 'في انتظار الموافقة', rejected: 'مرفوض' };
        body.innerHTML = (data || []).map(employee => `<tr>
            <td>${escapeHtml(employee.full_name || '—')}</td>
            <td>${escapeHtml(employee.username || '—')}</td>
            <td>${escapeHtml(statuses[employee.status] || employee.status || 'غير محدد')}</td>
        </tr>`).join('') || '<tr><td colspan="3">لا يوجد موظفون مسجلون حالياً.</td></tr>';
    } catch (error) {
        if (version !== employeesRequestVersion || currentUser?.id !== userId || !isAdmin()) return;
        console.error('Error loading employees:', error);
        body.innerHTML = '<tr><td colspan="3">تعذر تحميل الموظفين. تأكد من إعداد صلاحية عرض الموظفين في قاعدة البيانات ثم اضغط تحديث القائمة.</td></tr>';
    }
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
    } =
        await db.auth.getSession();

    if (error) {

        console.error(
            'Session error:',
            error.message
        );

        return;
    }

    const session =
        data
            ? data.session
            : null;

    if (
        !session ||
        !session.user
    ) {

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
                profileLoadError ||
                'بيانات المستخدم غير مكتملة.';

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

                    loadAccessRequests();
                }

            },
            60000
        );

    }
);
