const {PGlite}=require(require('node:path').join(process.env.TEMP,'lawfirm-backup-sql-test/node_modules/@electric-sql/pglite'));
const fs=require('node:fs'), assert=require('node:assert/strict');
(async()=>{
    const db=new PGlite();
    try {
        const migration=fs.readFileSync('migrations/006_unique_record_names.sql','utf8');
        for(const table of ['companies','cases','clients']) await db.exec(`create table ${table}(id int primary key,name text);`);
        await db.exec("insert into clients values(1,'أحمد محمد'),(2,'أحمد   محمد')");
        await assert.rejects(()=>db.exec(migration),/office_unique_clients_name/);
        await db.exec('rollback');
        assert.equal((await db.query('select * from clients')).rows.length,2);
        assert.equal((await db.query("select indexname from pg_indexes where indexname like 'office_unique_%'")).rows.length,0);
        await db.exec("update clients set name='اسم مختلف' where id=2");
        await db.exec(migration);await db.exec(migration);
        for(const table of ['companies','clients']) {
            await db.exec(`insert into ${table} values(10,'  مُوَكِّل   جديد '),(11,'اسم آخر'),(12,null),(13,''),(14,'   ')`);
            for(const name of ['موكل جديد','مـوكل جديد',' موكل   جديد ']) {
                await assert.rejects(()=>db.query(`insert into ${table} values(20,$1)`,[name]),e=>e.code==='23505' && e.message.includes('office_unique_'));
            }
            await db.exec(`update ${table} set name='موكل جديد' where id=10`);
            await assert.rejects(()=>db.exec(`update ${table} set name='موكل جديد' where id=11`),e=>e.code==='23505');
            await db.exec(`insert into ${table} values(30,'ＡＢＣ')`);
            await assert.rejects(()=>db.exec(`insert into ${table} values(31,'abc')`),e=>e.code==='23505');
            assert.equal((await db.query(`select name from ${table} where id=11`)).rows[0].name,'اسم آخر');
        }
        await db.exec("insert into cases values(1,'قضية أحمد'),(2,'قضية أحمد'),(3,'قضية ثانية');update cases set name='قضية أحمد' where id=3");
        assert.equal((await db.query("select * from cases where name='قضية أحمد'")).rows.length,3);
        // Simulate an office that already applied the original 006 migration.
        await db.exec("delete from cases where id<>1;create unique index office_unique_cases_name on cases(public.office_normalize_record_name(name))");
        const allowDuplicates=fs.readFileSync('migrations/007_allow_duplicate_case_names.sql','utf8');
        await db.exec(allowDuplicates);await db.exec(allowDuplicates);
        await db.exec("insert into cases values(2,'قضية أحمد'),(3,'قضية ثانية');update cases set name='قضية أحمد' where id=3");
        assert.equal((await db.query("select * from cases where name='قضية أحمد'")).rows.length,3);
        for(const table of ['companies','clients']) await assert.rejects(()=>db.exec(`insert into ${table} values(50,'موكل جديد')`),e=>e.code==='23505');
        console.log('PASS: company/client uniqueness, duplicate case add/update, safe migration rollback, removal of legacy case index and reruns. Local PostgreSQL only.');
    } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
