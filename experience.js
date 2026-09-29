/* Office overview: existing records and permissions remain the source of truth. */
(() => {
  const e = escapeHtml;
  const state = {sessions: [], tasks: [], filter: 'today', query: '', error: '', version: 0};
  const today = () => sessionDateForInput(new Date().toISOString()).slice(0, 10);
  const dateOf = value => value ? sessionDateForInput(value).slice(0, 10) : '';
  const go = id => {
    const link = [...document.querySelectorAll('.sidebar a')].find(a => a.getAttribute('onclick')?.includes(`'${id}'`));
    switchPage(id, link);
    document.getElementById('workspaceTitle').textContent = pageTitles[id] || 'مساحة العمل';
    document.querySelector('.sidebar').classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('.mobile-dock button').forEach(b => b.classList.toggle('active', b.dataset.go === id));
  };
  const dashboard = document.getElementById('dashboard');
  const iconPaths=['M4 21V3h12v18M2 21h20M8 7h4M8 11h4M8 15h4M16 10h4v11','M4 21V3h12v8M2 21h10M8 7h4M8 11h4M14 18l3 3 5-7','M12 3v18M6 21h12M4 7h16M5 7l-4 8h8L5 7M19 7l-4 8h8l-4-8','M9 5h12M9 12h12M9 19h12M2 5l2 2 3-4M2 12l2 2 3-4M2 19l2 2 3-4'];
  dashboard.querySelectorAll('.stat-card .icon').forEach((icon,i)=>{icon.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[i]}"></path></svg>`;});
  dashboard.querySelector('.workspace-intro').innerHTML = `<div><span class="eyebrow">أحمد نبيه · للمحاماة والاستشارات القانونية</span><h1>كل التفاصيل. تحت نظرك.</h1><p id="daySummary">مساحة واحدة لمتابعة القضايا والجلسات وأولويات المكتب.</p><div class="hero-actions"><button class="btn copper" data-go="cases">＋ إضافة قضية</button><button class="btn ghost" data-go="tasks">متابعة المهام ←</button></div></div><div class="hero-date"><span>أجندة المكتب</span><strong>${new Intl.DateTimeFormat('ar-EG',{day:'numeric',timeZone:'Africa/Cairo'}).format(new Date())}</strong><span>${new Intl.DateTimeFormat('ar-EG',{month:'long',weekday:'long',timeZone:'Africa/Cairo'}).format(new Date())}</span><small>توقيت القاهرة</small></div>`;
  const section = document.createElement('div');
  section.className = 'office-grid';
  section.innerHTML = `<section class="panel agenda"><div class="panel-header"><div><span class="overline">YOUR DAILY BRIEF</span><h2>على جدول المكتب</h2></div><span class="live-pill">بتوقيت القاهرة</span></div><div class="agenda-tabs" role="group" aria-label="فترة الجلسات"><button class="active" data-period="today" aria-pressed="true">اليوم</button><button data-period="upcoming" aria-pressed="false">القادمة</button><button data-period="all" aria-pressed="false">كل الجلسات</button></div><div id="officeAgenda" aria-live="polite"><p class="empty-state">جارٍ تحميل الجلسات…</p></div></section><section class="panel priorities"><div class="panel-header"><div><span class="overline">NEEDS YOUR ATTENTION</span><h2>تحتاج متابعتك</h2></div><span class="priority-dot"></span></div><div id="officePriorities" aria-live="polite"></div><button class="text-action" data-go="tasks">عرض كل المهام ←</button></section></div><section class="panel case-library"><div class="panel-header"><div><span class="overline">MATTER PORTFOLIO</span><h2>ملفات القضايا</h2></div><label class="case-search"><span>⌕</span><input id="officeSearch" type="search" placeholder="ابحث بالقضية، الموكل أو الرقم…" aria-label="بحث في ملفات القضايا"></label></div><div id="officeCases" class="case-cards" aria-live="polite"></div></section>`;
  dashboard.querySelector('.stats-grid').after(section);
  document.getElementById('recentCasesTable').closest('.panel').classList.add('legacy-recent');
  const dock = document.createElement('nav');
  dock.className = 'mobile-dock'; dock.setAttribute('aria-label','التنقل السريع');
  dock.innerHTML = `<button class="active" data-go="dashboard"><span>⌂</span>الرئيسية</button><button data-go="cases"><span>▤</span>القضايا</button><button data-go="tasks"><span>✓</span>المهام</button><button data-go="clients"><span>♙</span>الموكلون</button>`;
  document.body.append(dock);
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-go], [data-open-case], [data-period]');
    if (!button) return;
    if (button.dataset.go) go(button.dataset.go);
    if (button.dataset.openCase) {
      const item = allCasesCache.find(c => String(c.id) === button.dataset.openCase);
      if (item) openCaseDetails(item.id);
    }
    if (button.dataset.period) {
      state.filter = button.dataset.period;
      section.querySelectorAll('[data-period]').forEach(b => {b.classList.toggle('active', b === button);b.setAttribute('aria-pressed',String(b === button));});
      render();
    }
  });
  document.getElementById('officeSearch').addEventListener('input', event => {state.query = event.target.value.trim().toLocaleLowerCase('ar');renderCards();});
  function renderCards() {
    const items = allCasesCache.filter(c => [c.name,c.client_name,c.case_number,c.court_name].some(v => String(v || '').toLocaleLowerCase('ar').includes(state.query)));
    document.getElementById('officeCases').innerHTML = items.length ? items.slice(0,12).map(c => `<button class="case-card" data-open-case="${e(String(c.id))}"><div class="case-card-top"><span class="case-monogram">§</span><span class="case-status">${e(c.status || 'غير محددة')}</span></div><h3>${e(c.name || 'قضية بدون عنوان')}</h3><p>${e(c.client_name || 'لم يُحدد الموكل')}</p><div class="case-card-meta"><span>${e(c.case_number || '—')} / ${e(c.case_year || '—')}</span><span>${e(c.case_type || 'قضية')}</span></div><footer><span>${e(c.court_name || 'المحكمة غير محددة')}</span><span>فتح الملف ↗</span></footer></button>`).join('') : '<p class="empty-state">لا توجد قضايا مطابقة.</p>';
  }
  function render() {
    const day = today();
    const sessions = state.sessions.filter(s => allCasesCache.some(c => c.id === s.case_id));
    const visible = sessions.filter(s => state.filter === 'all' || (state.filter === 'today' ? dateOf(s.session_date) === day : dateOf(s.session_date) > day));
    document.getElementById('daySummary').textContent = `${sessions.filter(s => dateOf(s.session_date) === day).length} جلسات اليوم · ${state.tasks.filter(t=>!t.completed).length} مهام مفتوحة. يوم منظم يبدأ بصورة واضحة.`;
    document.getElementById('officeAgenda').innerHTML = state.error ? `<p class="empty-state">${e(state.error)}</p><button class="btn btn-secondary" id="retryAgenda">إعادة المحاولة</button>` : visible.length ? visible.slice(0,20).map(s => {
      const c = allCasesCache.find(c=>c.id===s.case_id);
      const label = s.session_date ? formatSessionDate(s.session_date) : 'بدون موعد';
      return `<button class="agenda-row" data-open-case="${e(String(c.id))}"><span class="agenda-time">${e(label)}</span><span class="agenda-info"><strong>${e(c.name)}</strong><small>${e(s.session_subject || c.court_name || 'جلسة')} · ${e(s.attending_lawyer || 'المحامي غير محدد')}</small></span><span class="row-arrow">↗</span></button>`;
    }).join('') : '<div class="quiet-state"><span>✓</span><h3>لا توجد جلسات في هذه الفترة</h3><p>يمكنك اختيار فترة أخرى أو إضافة جلسة من ملف القضية.</p></div>';
    document.getElementById('retryAgenda')?.addEventListener('click',window.refreshOfficeSessions);
    const overdue = state.tasks.filter(t=>!t.completed && (t.is_important || (t.due_date && t.due_date < day))).sort((a,b)=>Number(!!b.is_important)-Number(!!a.is_important));
    document.getElementById('officePriorities').innerHTML = overdue.length ? overdue.slice(0,4).map(t=>`<button class="priority-item ${t.is_important ? 'task-important' : ''}" data-go="tasks"><span class="priority-mark">!</span><span><strong>${e(t.title || 'مهمة')}</strong><small>${t.is_important ? '★ مهمة جدًا · ' : ''}${t.due_date && t.due_date < day ? 'متأخرة · ' : ''}${e(t.due_date || 'بدون موعد')}</small></span><span>←</span></button>`).join('') : '<div class="quiet-state"><span>✓</span><h3>لا توجد مهام مهمة جدًا أو متأخرة</h3><p>تابع المهام القادمة للحفاظ على سير العمل.</p></div>';
    renderCards();
  }
  window.updateOfficeTasks = tasks => {state.tasks = tasks || [];render();};
  window.refreshOfficeSessions = async () => {
    if (!currentUser) return;
    const version = ++state.version, userId = currentUser.id;
    try {
      const {data,error} = await db.from('case_sessions').select('*').order('session_date',{ascending:true});
      if (version !== state.version || currentUser?.id !== userId) return;
      if (error) throw error;
      state.sessions = data || []; state.error = '';
    } catch { if (version !== state.version || currentUser?.id !== userId) return; state.sessions=[];state.error='تعذر تحميل الجلسات. تحقق من الاتصال وأعد المحاولة.'; }
    render();
  };
  window.enhanceCaseWorkspace = (overlay,item,sessions) => {
    overlay.classList.add('case-workspace');
    const modal = overlay.querySelector('.details-modal');
    const heading = modal.querySelector('h2'); heading.textContent = item.name || 'ملف القضية';
    modal.querySelector('.details-modal-header small').textContent = `ملف القضية / ${item.case_number || '—'} / ${item.case_year || '—'}`;
    const next = sessions.find(s=>s.session_date && dateOf(s.session_date)>=today());
    const brief = document.createElement('div'); brief.className='case-brief';
    brief.innerHTML=`<div><span>الموكل</span><strong>${e(item.client_name || 'غير محدد')}</strong></div><div><span>المحامي المسؤول</span><strong>${e(item.assigned_lawyer || 'غير محدد')}</strong></div><div><span>الجلسة القادمة</span><strong>${next ? e(formatSessionDate(next.session_date)) : 'لا يوجد موعد قادم'}</strong></div>`;
    modal.querySelector('.details-modal-header').after(brief);
    const table = modal.querySelector('.details-table');
    if (table) {
      const timeline = document.createElement('div'); timeline.className='case-timeline';
      timeline.innerHTML=sessions.map((s,i)=>`<article class="timeline-event"><span class="timeline-number">${String(i+1).padStart(2,'0')}</span><div><time>${s.session_date ? e(formatSessionDate(s.session_date)) : 'موعد غير محدد'}</time><h4>${e(s.session_subject || 'جلسة')}</h4><p>${e(s.decision || 'لم يُسجّل قرار الجلسة بعد.')}</p><small>المحامي الحاضر · ${e(s.attending_lawyer || 'غير محدد')}</small></div></article>`).join('');
      table.replaceWith(timeline);
    }
    const grid = modal.querySelector('.details-grid');
    const details=document.createElement('details');details.className='case-facts';
    details.innerHTML='<summary>بيانات القضية والأطراف <span>عرض التفاصيل ＋</span></summary>';
    grid.before(details); details.append(grid);
  };
  render();
})();
