(() => {
    const buttons = [...document.querySelectorAll('[data-install-app]')];
    const standalone = matchMedia('(display-mode: standalone)');
    let installPrompt = null, installed = Boolean(navigator.standalone || standalone.matches);
    const update = () => buttons.forEach(button => {button.hidden = installed;});
    const header = document.querySelector('.header');
    if (header && 'ResizeObserver' in window) {
        new ResizeObserver(() => document.documentElement.style.setProperty('--office-header-height', `${header.getBoundingClientRect().height}px`)).observe(header);
    }
    standalone.addEventListener('change', event => {installed = Boolean(event.matches || navigator.standalone); update();});
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault(); installPrompt = event; update();
    });
    window.addEventListener('appinstalled', () => {installed = true; installPrompt = null; update();});

    function showInstructions() {
        let dialog = document.getElementById('installAppDialog');
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.id = 'installAppDialog'; dialog.className = 'install-dialog';
            dialog.setAttribute('aria-labelledby', 'installAppTitle');
            const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const instructions = ios
                ? '<li>افتح الموقع في Safari.</li><li>افتح قائمة المشاركة، ثم اختر «إضافة إلى الشاشة الرئيسية».</li><li>فعّل «فتح كتطبيق ويب» إذا ظهر، ثم اضغط «إضافة».</li>'
                : '<li>افتح الموقع في Chrome أو Edge.</li><li>من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</li><li>أكد الإضافة؛ هتلاقي أيقونة المكتب على جهازك.</li>';
            dialog.innerHTML = `<div class="install-emblem"><img src="icons/icon-192.png" alt="" width="72" height="72"></div><span class="install-eyebrow">مكتب أحمد نبيه · للمحاماة</span><h2 id="installAppTitle">مكتبك، على شاشة موبايلك.</h2><p>وصول سريع للقضايا والموكلين والمواعيد من أيقونة واحدة.</p><ol>${instructions}</ol><p class="install-note">${isSecureContext ? 'متابعة بيانات المكتب تحتاج اتصالًا بالإنترنت.' : 'لتفعيل التثبيت، افتح النسخة المنشورة من الموقع برابط HTTPS.'}</p><form method="dialog"><button class="btn btn-primary" autofocus>تمام، فهمت</button></form>`;
            document.body.append(dialog);
            dialog.addEventListener('click', event => {
                const rect = dialog.getBoundingClientRect();
                if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
            });
        }
        if (!dialog.open) dialog.showModal();
    }
    buttons.forEach(button => button.addEventListener('click', async () => {
        if (!installPrompt) return showInstructions();
        const prompt = installPrompt; installPrompt = null;
        buttons.forEach(b => {b.disabled = true;});
        try {
            await prompt.prompt();
            await prompt.userChoice;
            // Only appinstalled / standalone confirms installation, not acceptance.
        } catch {showInstructions();}
        finally {buttons.forEach(b => {b.disabled = false;}); update();}
    }));
    update();
    if ('serviceWorker' in navigator && isSecureContext && location.protocol !== 'file:') {
        navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'})
            .catch(error => console.warn('تعذر تفعيل صفحة عدم الاتصال:', error));
    }
})();
