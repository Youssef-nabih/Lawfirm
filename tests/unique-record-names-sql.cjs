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
        for(const table of ['companies','cases','clients']) {
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
        console.log('PASS: atomic duplicate prevention on all three tables, updates, self edits, normalization, NULL/blank legacy rows, safe migration rollback and rerun. Local PostgreSQL only.');
    } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
