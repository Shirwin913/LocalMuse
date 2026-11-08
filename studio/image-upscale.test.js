const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
test('upscale routes validate input, cache results, and cascade deletion',async()=>{
 const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON;CREATE TABLE messages(id INTEGER PRIMARY KEY,mime TEXT,attachment BLOB);INSERT INTO messages VALUES(1,'image/png',X'00')");
 const routes={};require('./image-upscale')({get:(p,h)=>routes['GET '+p]=h,post:(p,h)=>routes['POST '+p]=h},{db});
 const response=()=>({code:200,status(code){this.code=code;return this;},json(value){this.value=value;return this;},sendStatus(code){this.code=code;return this;},setHeader(){},type(){return this;},send(value){this.value=value;}});
 let res=response();await routes['POST /api/image-upscale/:id']({params:{id:'1'},body:{mode:'bad'}},res);assert.equal(res.code,400);
 res=response();await routes['POST /api/image-upscale/:id']({params:{id:'2'},body:{mode:'4k'}},res);assert.equal(res.code,404);
 db.prepare('INSERT INTO image_upscales VALUES(?,?,?,?)').run(1,'4k',JSON.stringify({width:3840}),Buffer.from('result'));
 res=response();await routes['POST /api/image-upscale/:id']({params:{id:'1'},body:{mode:'4k'}},res);assert.equal(res.value.width,3840);
 res=response();routes['GET /api/image-upscale/:id/:mode']({params:{id:'1',mode:'4k'},query:{}},res);assert.equal(res.value.toString(),'result');
 db.exec('DELETE FROM messages WHERE id=1');assert.equal(db.prepare('SELECT count(*) AS n FROM image_upscales').get().n,0);db.close();
});
