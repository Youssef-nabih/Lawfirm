const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('app.js','utf8');
const helpers=code.slice(code.indexOf('const sessionDateParts'),code.indexOf('function isAdmin()'));
for(const tz of ['UTC','Africa/Cairo','America/New_York']) {
 process.env.TZ=tz;const ctx=vm.createContext({Intl,Date,Set,Error});vm.runInContext(helpers,ctx);
 const input=v=>ctx.sessionDateForInput(v),save=(v,o)=>ctx.sessionDateForStorage(v,o);
 assert.equal(input('2026-10-17T17:37:00+00:00'),'2026-10-17T20:37');
 assert.equal(save('2026-10-17T17:37'),'2026-10-17T14:37:00.000Z');
 assert.equal(save('2026-01-17T17:37'),'2026-01-17T15:37:00.000Z');
 for(const value of ['2026-10-17T17:37','2026-01-17T17:37','2026-06-01T00:15'])assert.equal(input(save(value)),value);
 assert.equal(save('2026-10-17T20:37','2026-10-17T17:37:41+00:00'),'2026-10-17T17:37:41+00:00');
 assert.equal(input('2026-01-17T17:37:00'),'2026-01-17T17:37');assert.equal(save(''),null);assert.equal(input(null),'');
 assert.throws(()=>save('2026-04-24T00:30'),/غير موجود/);
 assert.equal(ctx.formatSessionDate('2026-10-17T17:37:00Z'),new Date('2026-10-17T17:37:00Z').toLocaleString('ar-EG',{timeZone:'Africa/Cairo',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}));
}
assert.equal((code.match(/session_date: sessionDateForStorage\(session_date, row.dataset.sessionDate\)/g)||[]).length,2);
assert.equal((code.match(/tr.dataset.sessionDate = data.session_date/g)||[]).length,2);
console.log('PASS: Cairo display/edit/save, summer/winter, midnight, three device zones, unchanged original timestamp, legacy input, DST gap.');
