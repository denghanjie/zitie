import ledger from '../data/library/quality.json' with {type:'json'};
export const qualityFor=(key)=>ledger[key]||{status:'pending',reason:'本条尚未完成校勘。'};
export const qualityLabel={compared:'文字已对照',retained:'版本／节选已记录',excerpt:'节选范围待核',pending:'待校勘',blocked:'暂停使用'};
export const canApplyWork=(key)=>['compared','retained'].includes(qualityFor(key).status);

export async function canUseImportedDraft(draft){
 if(!draft.source)return true;
 if(draft.source.qualityKey)return canApplyWork(draft.source.qualityKey);
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(draft.content));
 const hash=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
 return Object.values(ledger).some(r=>r.textHash===hash&&['compared','retained'].includes(r.status));
}
