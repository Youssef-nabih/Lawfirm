/* Browser-side Excel export. No office data is sent to a spreadsheet service. */
(() => {
    'use strict';
    const definitions = {
        companies: ['الشركات', ['id','name','legal_name','status','tax_id','commercial_register','industry','company_size','email','phone','website','country','state_province','city','postal_code','address_street','currency','is_parent','parent_id','logo_url']],
        cases: ['القضايا', ['id','name','client_name','client_role','opponent_role','status','case_type','case_number','case_year','case_description','court_name','court_branch','assigned_lawyer','power_of_attorney_no','poa_issue_place','poa_issue_year','opponent','opponent_phone','case_details','attachment_url']],
        case_sessions: ['الجلسات', ['id','case_id','session_date','session_subject','attending_lawyer','decision']],
        clients: ['الموكلون', ['id','name','phone','id_card_url']],
        client_expenses: ['المصروفات', ['id','client_id','amount','expense_date','reason','spender']],
        tasks: ['المهام العامة', ['id','title','assigned_to','due_date','completed']],
        company_tasks: ['مهام الشركات', ['id','company_id','title','description','due_date','completed']]
    };
    const labels = {
        id:'رقم السجل',name:'الاسم',legal_name:'الاسم القانوني',status:'الحالة',tax_id:'رقم التسجيل الضريبي',commercial_register:'السجل التجاري',industry:'النشاط',company_size:'حجم الشركة',email:'البريد الإلكتروني',phone:'الهاتف',website:'الموقع الإلكتروني',country:'الدولة',state_province:'المحافظة',city:'المدينة',postal_code:'الرمز البريدي',address_street:'العنوان',currency:'العملة',is_parent:'شركة أم',parent_id:'رقم الشركة الأم',logo_url:'شعار الشركة',client_name:'اسم الموكل',client_role:'صفة الموكل',opponent_role:'صفة الخصم',case_type:'نوع القضية',case_number:'رقم القضية',case_year:'سنة القضية',case_description:'الوصف',court_name:'المحكمة',court_branch:'الدائرة',assigned_lawyer:'المحامي المسؤول',power_of_attorney_no:'رقم التوكيل',poa_issue_place:'جهة إصدار التوكيل',poa_issue_year:'سنة التوكيل',opponent:'الخصم',opponent_phone:'هاتف الخصم',case_details:'تفاصيل القضية',attachment_url:'المرفق',case_id:'رقم سجل القضية',session_date:'موعد الجلسة',session_subject:'موضوع الجلسة',attending_lawyer:'المحامي الحاضر',decision:'القرار',id_card_url:'صورة إثبات الهوية',client_id:'رقم سجل الموكل',amount:'المبلغ',expense_date:'تاريخ المصروف',reason:'سبب الصرف',spender:'القائم بالصرف',title:'عنوان المهمة',assigned_to:'المسؤول',due_date:'موعد التنفيذ',is_important:'مهمة جدًا',completed:'حالة المهمة',company_id:'رقم سجل الشركة',description:'التفاصيل',created_at:'تاريخ الإنشاء',updated_at:'آخر تعديل',created_by:'معرّف منشئ السجل',user_id:'معرّف المستخدم'
    };
    const relations = {company_id:['companies','اسم الشركة'],parent_id:['companies','الشركة الأم'],case_id:['cases','اسم القضية'],client_id:['clients','اسم الموكل']};
    const statuses = {active:'نشطة',pending:'قيد الانتظار',suspended:'معلقة',new:'جديدة',done:'منتهية',closed:'مغلقة',archived:'مؤرشفة',ongoing:'متداولة',in_progress:'قيد التنفيذ',completed:'مكتملة'};
    const dateKeys = new Set(['due_date','session_date','expense_date','created_at','updated_at']);
    const longKeys = new Set(['description','case_description','case_details','decision','reason','address_street','session_subject']);
    let loading;
    function loadLibrary() {
        if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
        if (!loading) loading = new Promise((resolve,reject) => {
            const script=document.createElement('script');
            script.src='vendor/exceljs-4.4.0.min.js';
            script.onload=()=>window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('تعذر تحميل أداة Excel.'));
            script.onerror=()=>{script.remove();loading=null;reject(new Error('تعذر تحميل أداة Excel. حدّث الصفحة وحاول مرة أخرى.'));};
            document.head.append(script);
        });
        return loading;
    }
    function excelDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(value)) return value;
        // Date-only and timezone-free values retain their written wall clock time.
        if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
            const date=new Date(value.replace(' ','T')+(value.length===10?'T00:00:00Z':'Z'));
            return Number.isFinite(date.getTime()) ? date : value;
        }
        const date=new Date(value);
        if (!Number.isFinite(date.getTime())) return value;
        const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
        return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    }
    function safeText(value) {
        const text=typeof value==='object' ? JSON.stringify(value) : String(value);
        if (text.length>32767) throw new Error('أحد الحقول أطول من الحد الذي يقبله Excel. استخدم نسخة JSON لحفظ النص كاملًا.');
        return text;
    }
    function cellValue(key,value) {
        if (value == null) return null;
        if (key==='is_important') return value===true ? 'نعم' : 'لا';
        if (key==='completed') return value===true ? 'مكتملة' : value===false ? 'قيد التنفيذ' : safeText(value);
        if (typeof value==='boolean') return value?'نعم':'لا';
        if (key==='status') return statuses[value]||safeText(value);
        if (dateKeys.has(key)) return excelDate(value);
        if (key==='amount' && value!=='' && Number.isFinite(Number(value))) return Number(value);
        // Explicit strings preserve leading zeros and cannot become executable formulas.
        if (key==='id'||key.endsWith('_id')||/phone|register|number|postal|tax_id|_year|_no$/.test(key)) return safeText(value);
        if ((key.endsWith('_url')||key==='website') && typeof value==='string') {
            try {const url=new URL(value);if (['http:','https:'].includes(url.protocol)) return {text:key==='website'?value:'فتح المرفق',hyperlink:url.href};} catch { /* Keep invalid URLs as ordinary text. */ }
        }
        return typeof value==='number' ? value : safeText(value);
    }
    async function build(tables,stamp=new Date()) {
        const ExcelJS=await loadLibrary();
        const book=new ExcelJS.Workbook();
        book.creator='مكتب احمد نبيه المحامي';book.created=stamp;book.modified=stamp;
        const indexes=Object.fromEntries(Object.keys(definitions).map(key=>[key,new Map((tables[key]||[]).map(row=>[String(row.id),row.name]))]));
        for (const [table,[name,ordered]] of Object.entries(definitions)) {
            const rows=tables[table];
            if (!Array.isArray(rows)) throw new Error('بيانات التصدير غير مكتملة: '+name);
            if (rows.length>1048571) throw new Error('عدد سجلات '+name+' يتجاوز حد ورقة Excel.');
            const keys=[...ordered,...Array.from(new Set(rows.flatMap(Object.keys))).filter(key=>!ordered.includes(key)).sort()];
            const columns=[];
            for (const key of keys) {
                if (relations[key]) columns.push({key: key+'_label',label:relations[key][1],width:30,relation:key});
                columns.push({key,label:labels[key]||`حقل إضافي (${key})`,width:longKeys.has(key)?48:dateKeys.has(key)?23:key==='name'||key==='title'||key==='legal_name'?32:key==='email'||key==='website'?34:key==='id'?14:key.endsWith('_url')?22:24});
            }
            const sheet=book.addWorksheet(name,{properties:{tabColor:{argb:'FF214F4B'}},views:[{state:'frozen',ySplit:5,xSplit:Math.min(2,columns.length),rightToLeft:true,showGridLines:false,zoomScale:90}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5'}});
            sheet.columns=columns.map(col=>({width:col.width}));
            sheet.getRow(1).height=8;
            sheet.mergeCells(2,1,2,Math.min(columns.length,4));sheet.getCell(2,1).value=`مكتب احمد نبيه المحامي — ${name}`;
            sheet.getCell(2,1).font={name:'Arial',size:16,bold:true,color:{argb:'FF183B3B'}};
            sheet.getCell(2,1).alignment={horizontal:'right',vertical:'middle',readingOrder:'rtl'};sheet.getRow(2).height=30;
            sheet.mergeCells(3,1,3,Math.min(columns.length,5));sheet.getCell(3,1).value=`تصدير بتاريخ ${stamp.toLocaleString('ar-EG',{timeZone:'Africa/Cairo'})} بتوقيت القاهرة. السجلات: ${rows.length}. المصدر: نظام المكتب.`;
            sheet.getCell(3,1).font={name:'Arial',size:10,color:{argb:'FF67796F'}};sheet.getCell(3,1).alignment={horizontal:'right',vertical:'middle',wrapText:true,readingOrder:'rtl'};sheet.getRow(3).height=32;
            const header=sheet.getRow(5);header.values=columns.map(col=>col.label);header.height=32;
            header.eachCell(cell=>{cell.font={name:'Arial',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF214F4B'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true,readingOrder:'rtl'};});
            rows.forEach((source,index)=>{
                const row=sheet.getRow(index+6);let height=28;
                columns.forEach((col,j)=>{
                    const cell=row.getCell(j+1);
                    const value=col.relation ? (source[col.relation]==null ? null : indexes[relations[col.relation][0]].get(String(source[col.relation]))||'غير متاح') : cellValue(col.key,source[col.key]);
                    cell.value=value;
                    cell.font={name:'Arial',size:11,color:{argb:value?.hyperlink?'FF146782':'FF243F3A'},underline:!!value?.hyperlink};
                    cell.alignment={horizontal:typeof value==='number'?'right':value instanceof Date?'center':'right',vertical:'middle',wrapText:true,readingOrder:'rtl'};
                    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFF2F5F0':'FFFFFFFF'}};
                    cell.numFmt=col.key==='amount'?'#,##0.00;[Red](#,##0.00)':value instanceof Date?(String(source[col.key]).length===10?'dd/mm/yyyy':'dd/mm/yyyy hh:mm'):typeof value==='string'?'@':'General';
                    if (typeof value==='string') {const lines=value.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/(col.width*.85))),0);height=Math.max(height,lines*16+10);}
                });
                row.height=Math.min(409,height);
            });
            sheet.autoFilter={from:{row:5,column:1},to:{row:Math.max(5,rows.length+5),column:columns.length}};
            sheet.pageSetup.printArea=`A1:${sheet.getColumn(columns.length).letter}${Math.max(6,rows.length+5)}`;
            sheet.headerFooter.oddFooter='&Rمكتب احمد نبيه المحامي&Lصفحة &P من &N';
            if (!rows.length) {sheet.getCell('A6').value='لا توجد سجلات';sheet.getCell('A6').font={name:'Arial',size:11,color:{argb:'FF67796F'}};sheet.getRow(6).height=26;}
            await new Promise(resolve=>setTimeout(resolve,0));
        }
        return book;
    }
    window.OfficeExcel={build};
})();
