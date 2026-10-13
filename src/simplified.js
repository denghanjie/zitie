// A display/input transformation only. Never replace evidence text or its hashes.
let pending;
export function getSimplifier(){
 if(!pending)pending=import('opencc-js/t2cn').then(cc=>cc.Converter({from:'t',to:'cn'})).catch(error=>{pending=null;throw error});
 return pending;
}
export function simplifiedSource(source,simplify){
 if(typeof simplify!=='function')throw Error('简体转换尚未就绪，请重新查找。');
 return {...source,display:{title:simplify(source.title),author:simplify(source.authorHint||''),text:simplify(source.text),edition:simplify(source.edition||'')}};
}
// Library identity/quality keys refer to the source edition, never the display title.
export function simplifiedWork(work,simplify){
 return {...work,original:{title:work.title,author:work.author,text:work.text},title:simplify(work.title),author:simplify(work.author),text:simplify(work.text)};
}
