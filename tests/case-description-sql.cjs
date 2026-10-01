const {PGlite}=require(require('node:path').join(process.env.TEMP,'lawfirm-backup-sql-test/node_modules/@electric-sql/pglite'));
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
    const db=new PGlite();
    try {
        await db.exec("create table cases(id int primary key,name text);insert into cases values(1,'قضية قديمة')");
        const sql=fs.readFileSync('migrations/008_case_description.sql','utf8');
        await db.exec(sql);await db.exec(sql);
        assert.deepEqual((await db.query('select * from cases')).rows,[{id:1,name:'قضية قديمة',case_description:null}]);
        await db.query('update cases set case_description=$1 where id=1',['وصف القضية']);
        assert.equal((await db.query('select case_description from cases')).rows[0].case_description,'وصف القضية');
        console.log('PASS: optional description, existing case preserved, save/reload and migration rerun. Local PostgreSQL only.');
    } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
