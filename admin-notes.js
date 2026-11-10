(() => {
    const page = document.getElementById('adminNotes');
    if (!page) return;

    const $ = selector => page.querySelector(selector);
    const list = $('[data-notes-list]');
    const form = $('[data-notes-form]');
    let notes = [];
    let requestVersion = 0;
    let busy = false;

    function allowed() {
        return Boolean(currentUser && currentProfile?.role === 'admin' && currentProfile?.status === 'approved');
    }

    function status(message, error = false) {
        const node = $('[data-notes-status]');
        node.textContent = message;
        node.classList.toggle('is-error', error);
    }

    function dbError(error) {
        if (['42P01', 'PGRST205'].includes(error?.code)) return 'فعّل الميزة أولًا بتشغيل migrations/009_admin_notes.sql في قاعدة Supabase.';
        return error?.message || 'حدث خطأ غير متوقع.';
    }

    function dateLabel(value) {
        if (!value) return '';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ar-EG', {
            timeZone: 'Africa/Cairo', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });
    }

    function render() {
        if (!allowed()) return;
        const term = normalizeRecordText($('[data-notes-search]').value);
        const visible = notes.filter(note => !term || normalizeRecordText(`${note.title} ${note.content}`).includes(term));
        if (!visible.length) {
            list.innerHTML = `<div class="empty-state">${term ? 'لا توجد ملاحظات تطابق البحث.' : 'لسه مفيش ملاحظات محفوظة. اكتب أول فكرة فوق.'}</div>`;
            return;
        }
        list.innerHTML = visible.map(note => `<article class="admin-note-card">
            <div class="admin-note-body"><h3>${escapeHtml(note.title)}</h3><p>${escapeHtml(note.content)}</p><time datetime="${escapeHtml(note.updated_at || note.created_at || '')}">آخر تعديل: ${escapeHtml(dateLabel(note.updated_at || note.created_at))}</time></div>
            <div class="admin-note-actions"><button type="button" class="btn btn-secondary btn-sm" data-note-edit="${escapeHtml(note.id)}"><i class="fa-solid fa-pen"></i> تعديل</button><button type="button" class="btn btn-danger btn-sm" data-note-delete="${escapeHtml(note.id)}"><i class="fa-solid fa-trash"></i> حذف</button></div>
        </article>`).join('');
    }

    async function load() {
        if (!allowed()) return;
        const version = ++requestVersion;
        const userId = currentUser.id;
        list.innerHTML = '<div class="empty-state">جاري تحميل الملاحظات...</div>';
        const { data, error } = await db.from('admin_notes').select('id,title,content,created_at,updated_at').order('updated_at', { ascending: false }).order('id', { ascending: false });
        if (version !== requestVersion || currentUser?.id !== userId || !allowed()) return;
        if (error) {
            notes = [];
            list.innerHTML = `<div class="empty-state">تعذر تحميل الملاحظات. ${escapeHtml(dbError(error))}</div>`;
            return;
        }
        notes = data || [];
        render();
    }
    window.loadAdminNotes = load;

    function resetForm() {
        form.reset();
        $('[data-notes-id]').value = '';
        $('[data-notes-form-heading]').textContent = 'ملاحظة جديدة';
        $('[data-notes-save]').textContent = 'حفظ الملاحظة';
        $('[data-notes-cancel]').hidden = true;
        status('');
    }

    function edit(noteId) {
        const note = notes.find(item => String(item.id) === String(noteId));
        if (!note || !allowed()) return;
        $('[data-notes-id]').value = note.id;
        $('[data-notes-title]').value = note.title;
        $('[data-notes-content]').value = note.content;
        $('[data-notes-form-heading]').textContent = 'تعديل الملاحظة';
        $('[data-notes-save]').textContent = 'حفظ التعديلات';
        $('[data-notes-cancel]').hidden = false;
        $('[data-notes-title]').focus();
        page.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!allowed() || busy) return;
        const title = $('[data-notes-title]').value.trim();
        const content = $('[data-notes-content]').value.trim();
        const noteId = $('[data-notes-id]').value;
        if (!title || !content) return status('اكتب عنوان الملاحظة ومحتواها.', true);
        busy = true;
        requestVersion++;
        $('[data-notes-save]').disabled = true;
        status(noteId ? 'جاري حفظ التعديلات...' : 'جاري حفظ الملاحظة...');
        try {
            const query = noteId
                ? db.from('admin_notes').update({ title, content }).eq('id', noteId)
                : db.from('admin_notes').insert({ title, content, created_by: currentUser.id });
            const { error } = await query;
            if (error) throw error;
            resetForm();
            await load();
            status(noteId ? 'تم حفظ التعديلات.' : 'تم حفظ الملاحظة.');
        } catch (error) {
            status(`تعذر الحفظ: ${dbError(error)}`, true);
        } finally {
            busy = false;
            $('[data-notes-save]').disabled = false;
        }
    });

    $('[data-notes-cancel]').addEventListener('click', resetForm);
    $('[data-notes-refresh]').addEventListener('click', load);
    $('[data-notes-search]').addEventListener('input', render);
    list.addEventListener('click', async event => {
        if (!allowed() || busy) return;
        const editButton = event.target.closest('[data-note-edit]');
        if (editButton) return edit(editButton.dataset.noteEdit);
        const deleteButton = event.target.closest('[data-note-delete]');
        if (!deleteButton) return;
        const note = notes.find(item => String(item.id) === deleteButton.dataset.noteDelete);
        if (!note || !confirm(`حذف الملاحظة «${note.title}»؟`)) return;
        busy = true;
        requestVersion++;
        deleteButton.disabled = true;
        try {
            const { error } = await db.from('admin_notes').delete().eq('id', note.id);
            if (error) throw error;
            notes = notes.filter(item => String(item.id) !== String(note.id));
            render();
        } catch (error) {
            status(`تعذر حذف الملاحظة: ${dbError(error)}`, true);
        } finally {
            busy = false;
        }
    });

    window.updateAdminNotesVisibility = function () {
        const visible = allowed();
        const menuItem = document.getElementById('adminNotesMenuItem');
        menuItem.hidden = !visible;
        page.hidden = !visible;
        if (!visible) {
            requestVersion++;
            notes = [];
            list.replaceChildren();
            resetForm();
            if (page.classList.contains('active')) switchPage('dashboard', document.querySelector('.sidebar a'));
        } else if (page.classList.contains('active')) {
            load();
        }
    };

    if (allowed()) window.updateAdminNotesVisibility();
})();
