import catalogue from '../data/library/editorial.json' with {type:'json'};
export const EDITORIAL_REVISION=catalogue.revision;
export const EDITORIAL_EDITS=catalogue.edits;
const compact=s=>s.replace(/\s/gu,'');
export function editorialResult(work){
 const edit=EDITORIAL_EDITS.find(e=>e.key===`poetry:${work.id}`);
 return !!edit&&work.text===edit.afterText&&work.title===edit.titleAfter&&work.author===edit.authorAfter;
}
export function applyEditorial(work,key=`poetry:${work.id}`){
 const edit=EDITORIAL_EDITS.find(e=>e.key===key);
 if(!edit)return work;
 if(work.text!==edit.beforeText&&work.text!==edit.afterText)throw Error(`校勘版本不匹配：${work.title||edit.titleBefore}`);
 return {...work,text:edit.afterText,title:edit.titleAfter,author:edit.authorAfter,editorialRevision:EDITORIAL_REVISION,editorialNote:edit.reason,editorialSourceUrl:edit.reference.url};
}
export function editorialTextCorrection(content){
 const edit=EDITORIAL_EDITS.find(e=>e.beforeText!==e.afterText&&compact(e.beforeText)===compact(content));
 return edit?{content:edit.afterText,title:edit.titleAfter}:null;
}
export function migrateEditorialDraft(draft){
 if(!draft.source)return draft;
 const edit=EDITORIAL_EDITS.find(e=>e.titleBefore===draft.source.title&&e.authorBefore===draft.source.author&&compact(e.beforeText)===compact(draft.content));
 if(!edit)return draft;
 return {...draft,content:edit.afterText,title:draft.title===edit.titleBefore?edit.titleAfter:draft.title,source:{...draft.source,title:edit.titleAfter,author:edit.authorAfter}};
}
export function textIntegrityIssue(text){
 if(/[□�〓]/u.test(text))return '正文含缺字占位符，暂不能作为完整范文生成字帖。';
 return null;
}
