import assert from 'node:assert/strict';
import {articleLayout,paginate,pageSvg} from '../src/worksheet.js';
import {splitClauses,wrapLine} from '../src/poetry.js';
const base={mode:'article',grid:'tian',layout:'auto',title:'示儿'};
const seven='死去元知万事空，\n但悲不见九州同。\n王师北定中原日，\n家祭无忘告乃翁。';
const rumeng='常记溪亭日暮，沉醉不知归路。兴尽晚回舟，误入藕花深处。争渡，争渡，惊起一滩鸥鹭。';
const shuidiao='明月几时有？把酒问青天。不知天上宫阙，今夕是何年。我欲乘风归去，又恐琼楼玉宇，高处不胜寒。起舞弄清影，何似在人间。\n\n转朱阁，低绮户，照无眠。不应有恨，何事长向别时圆？人有悲欢离合，月有阴晴圆缺，此事古难全。但愿人长久，千里共婵娟。';
const mengyou='海客谈瀛洲，烟涛微茫信难求。\n越人语天姥，云霞明灭或可睹。\n天姥连天向天横，势拔五岳掩赤城。\n天台四万八千丈，对此欲倒东南倾。\n\n我欲因之梦吴越，一夜飞度镜湖月。\n湖月照我影，送我至剡溪。\n谢公宿处今尚在，渌水荡漾清猿啼。\n脚著谢公屐，身登青云梯。\n半壁见海日，空中闻天鸡。\n千岩万转路不定，迷花倚石忽已暝。\n熊咆龙吟殷岩泉，栗深林兮惊层巅。\n云青青兮欲雨，水澹澹兮生烟。\n列缺霹雳，丘峦崩摧。\n洞天石扉，訇然中开。\n青冥浩荡不见底，日月照耀金银台。\n霓为衣兮风为马，云之君兮纷纷而来下。\n虎鼓瑟兮鸾回车，仙之人兮列如麻。\n忽魂悸以魄动，恍惊起而长嗟。\n惟觉时之枕席，失向来之烟霞。\n\n世间行乐亦如此，古来万事东流水。\n别君去兮何时还？且放白鹿青崖间，须行即骑访名山。\n安能摧眉折腰事权贵，使我不得开心颜！';
const norm=s=>s.replace(/\s/g,'');
function verify(input){
 const pages=paginate(input,{});assert(pages.length>0);
 assert.equal(norm(pages.flat(2).join('')),norm(input.content));
 for(const p of pages){assert(p.length);if(p.layout.poetry){assert.equal(p.rowY.length,p.length);assert(p.rowY.every((y,i)=>y>=175&&y+p.layout.cell<=1025));assert(p.every(r=>r.length<=12));assert(p.every(r=>!/[，。！？；）】》」』”’]/u.test(r[0])));}}
 return pages;
}
const sevenPages=verify({...base,content:seven});assert.equal(sevenPages[0].layout.columns,8);assert.equal(sevenPages[0].length,4);assert.equal((pageSvg({...base,content:seven},{},sevenPages[0],0,1).match(/<rect /g)||[]).length,33);
const five=articleLayout({...base,content:'春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。'});assert.equal(five.lines.length,2);assert.equal(articleLayout({...base,content:'春眠不觉晓，处处闻啼鸟。',lineBreak:'punctuation'}).lines.length,2);
for(const [title,content] of [['如梦令',rumeng],['水调歌头',shuidiao],['梦游天姥吟留别',mengyou]]){
 for(const lineBreak of ['auto','original','punctuation']){const pages=verify({...base,title,content,lineBreak});assert(pages.every(p=>p.layout.poetry));console.log(title,lineBreak,pages.length+' pages');}
 verify({...base,title,content:content.replaceAll('\n','')});
}
// Stanzas that individually fit must not cross pages, and blank lines take no cells.
const stanza='春眠不觉晓，\n处处闻啼鸟。\n夜来风雨声，\n花落知多少。';
const stanzas=verify({...base,content:stanza+'\n\n'+stanza});assert.equal(stanzas.length,2);assert(stanzas.every(p=>p.length===4));
const spaced=verify({...base,content:'春眠不觉晓，\n\n处处闻啼鸟。'});assert.equal(spaced[0].length,2);assert.equal(spaced[0].rowY[1]-spaced[0].rowY[0],spaced[0].layout.cell+48);
const long=verify({...base,layout:'poem',content:'春'.repeat(3000)});assert(long.length>1);
assert.deepEqual(splitClauses('“争渡，争渡！”惊起一滩鸥鹭。'),['“争渡，','争渡！”','惊起一滩鸥鹭。']);
for(const t of ['天地玄黄宇宙洪荒，日月盈昃辰宿列张。','天地玄黄宇宙洪（荒）日月盈昃。']){const rows=wrapLine(t,8,true);assert.equal(rows.flat().join(''),t);assert(rows.every(r=>!/[，。！？；）]/u.test(r[0])&&!/[（]/u.test(r.at(-1))));}
const prose={...base,layout:'prose',content:seven};assert.equal(articleLayout(prose).poetry,false);verify(prose);
const paragraph={...base,content:'这是一段用于测试普通文章排版的文字，字帖应该继续按文章方式排版，不应把长段落错误拆成诗词。'.repeat(20)};assert.equal(articleLayout(paragraph).poetry,false);verify(paragraph);
const single=paginate({...base,mode:'single',content:'春春，'},{});assert.equal(single.flat().length,2);
console.log('PASS: all layout, punctuation, content-preservation, stanza and pagination checks');
