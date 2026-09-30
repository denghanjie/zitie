export const HISTORY_KEY='yizi-history-v1';
export function readHistory(storage=localStorage){
 const raw=storage.getItem(HISTORY_KEY);if(!raw)return [];
 const rows=JSON.parse(raw);
 if(!Array.isArray(rows)||rows.some(r=>!r||typeof r.id!=='string'||typeof r.input?.content!=='string'))throw Error('保存记录无法读取，请不要清除浏览器数据。');
 return rows;
}
export function saveHistory(input,action='manual',storage=localStorage){
 if(!input.content?.trim())throw Error('请先输入想保存的内容。');
 const rows=readHistory(storage),key=JSON.stringify(input),existing=rows.find(r=>JSON.stringify(r.input)===key);
 const record={id:existing?.id||crypto.randomUUID(),input:JSON.parse(key),createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now(),action};
 storage.setItem(HISTORY_KEY,JSON.stringify([record,...rows.filter(r=>r.id!==record.id)]));return record;
}
export function deleteHistory(id,storage=localStorage){
 const rows=readHistory(storage),record=rows.find(r=>r.id===id);
 storage.setItem(HISTORY_KEY,JSON.stringify(rows.filter(r=>r.id!==id)));return record;
}
export function restoreHistory(record,storage=localStorage){
 const rows=readHistory(storage);storage.setItem(HISTORY_KEY,JSON.stringify([record,...rows.filter(r=>r.id!==record.id)]));
}
