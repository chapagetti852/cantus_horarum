// The interface in English, Chinese (Hong Kong) or Latin (setting "Interface"). The office's
// texts stay Latin whatever is chosen; the interface's own words change.
//
// The Chinese follows the Hong Kong Diocesan Liturgy Commission's daily office (每日日課,
// catholic-dlc.org.hk) wherever it names the same thing: the hours (誦讀日課, 晨禱, 日間祈禱
// 午前 / 午時 / 午後, 晚禱, 第一晚禱, 夜禱), their parts (開端詞, 序經, 讚美詩, 聖詠吟唱,
// 簡短讀經, 短對答詠, 匝加利亞讚主曲, 聖母謝主曲, 西默盎聖歌, 禱詞, 天主經, 結束禱詞,
// 結束詞, 誦讀, 對答詠, 對經, 聖母對經), the psalter's weeks (聖詠集第一周), the ranks
// (節日, 慶日, 紀念, 自由紀念) and the commons (通用); the celebrations' names are Hong
// Kong's own (data/calendar-zh.json, scripts/calendar/zh_names.mjs). The Latin follows the
// Liturgia Horarum's own rubrics.

export const UI_LANGS = ['en', 'zh', 'la'];
let lang = 'en';
export const uiLang = () => lang;
export function setUiLang(l) { lang = UI_LANGS.includes(l) ? l : 'en'; }

const S = {
  // the hours: in the bar, and the heading of an hour
  'hour.lectio': ['Office of Readings', '誦讀日課', 'Officium lectionis'],
  'hour.laudes': ['Lauds', '晨禱', 'Laudes matutinæ'],
  'hour.tertia': ['Terce', '午前', 'Tertia'],
  'hour.sexta': ['Sext', '午時', 'Sexta'],
  'hour.nona': ['None', '午後', 'Nona'],
  'hour.vesperae': ['Vespers', '晚禱', 'Vesperæ'],
  'hour.completorium': ['Compline', '夜禱', 'Completorium'],
  'head.lectio': ['Office of Readings', '誦讀日課', 'Ad Officium lectionis'],
  'head.laudes': ['Lauds', '晨禱', 'Ad Laudes matutinas'],
  'head.tertia': ['Terce', '日間祈禱　午前', 'Ad Tertiam'],
  'head.sexta': ['Sext', '日間祈禱　午時', 'Ad Sextam'],
  'head.nona': ['None', '日間祈禱　午後', 'Ad Nonam'],
  'head.vesperae': ['Vespers', '晚禱', 'Ad Vesperas'],
  'head.vesperae1': ['First Vespers', '第一晚禱', 'Ad I Vesperas'],
  'head.completorium': ['Compline', '夜禱', 'Ad Completorium'],
  // the parts of an hour
  'sec.invitatory': ['Invitatory', '序經', 'Invitatorium'],
  'sec.hymn': ['Hymn', '讚美詩', 'Hymnus'],
  'sec.psalmody': ['Psalmody', '聖詠吟唱', 'Psalmodia'],
  'sec.readings': ['Readings', '誦讀', 'Lectiones'],
  'sec.reading': ['Short Reading', '簡短讀經', 'Lectio brevis'],
  'sec.responsory': ['Short Responsory', '短對答詠', 'Responsorium breve'],
  'sec.benedictus': ['Benedictus', '匝加利亞讚主曲', 'Canticum evangelicum'],
  'sec.magnificat': ['Magnificat', '聖母謝主曲', 'Canticum evangelicum'],
  'sec.nunc': ['Nunc dimittis', '西默盎聖歌', 'Canticum evangelicum'],
  'sec.preces': ['Intercessions', '禱詞', 'Preces'],
  'sec.pater': ['Lord’s Prayer', '天主經', 'Oratio dominica'],
  'sec.oratio': ['Concluding Prayer', '結束禱詞', 'Oratio'],
  'sec.blessing': ['Blessing', '結束詞', 'Conclusio'],
  'sec.antiphon': ['Antiphon', '對經', 'Antiphona'],
  'sec.marian': ['Antiphon of Our Lady', '聖母對經', 'Antiphona finalis B. Mariæ V.'],
  'sub.responsory': ['Responsory', '對答詠', 'Responsorium'],
  // the head of an hour
  'rank.SOLEMNITY': ['Solemnity', '節日', 'Sollemnitas'],
  'rank.FEAST': ['Feast', '慶日', 'Festum'],
  'rank.MEMORIAL': ['Memorial', '紀念', 'Memoria'],
  'rank.OPTIONAL_MEMORIAL': ['Optional memorial', '自由紀念', 'Memoria ad libitum'],
  'rank.SUNDAY': ['Sunday', '主日', 'Dominica'],
  'rank.WEEKDAY': ['Weekday', '平日', 'Feria'],
  'psalterWeek': ['Psalter week {n}', '聖詠集第{zh}周', 'Hebdomada {n} psalterii'],
  'tone': ['Tone {t}', '第{zh}調 {e}', 'Tonus {t}'],
  // messages and rubrics
  'msg.loading': ['Loading…', '載入中……', 'Paratur…'],
  'msg.notYet': ['This hour is not available yet.', '此時辰的經文尚未提供。', 'Hæc hora nondum præsto est.'],
  'msg.borrowed': ['This day’s own texts are not here yet (they come 35 days ahead): the reading, responsory, intercessions and prayer below are the psalter’s.', '本日的專用經文尚未提供（於三十五天前備妥）：以下的簡短讀經、短對答詠、禱詞及結束禱詞取自四週聖詠集。', 'Textus huius diei proprii nondum adsunt (triginta quinque diebus ante parantur): lectio, responsorium, preces et oratio infra ex psalterio sumuntur.'],
  'msg.noCalendar': ['There is no calendar for this year.', '本年沒有禮儀日曆。', 'Huius anni calendarium deest.'],
  'msg.noReadings': ['The readings and responsories of this day are not available yet.', '本日的誦讀和對答詠尚未提供。', 'Lectiones et responsoria huius diei nondum præsto sunt.'],
  'msg.teDeum': ['The hymn Te Deum follows.', '隨後誦唱讚美頌（Te Deum）。', 'Sequitur hymnus Te Deum.'],
  'msg.error': ['Error', '錯誤', 'Error'],
  'pdf.making': ['Making…', '製作中……', 'Fit…'],
  'pdf.page': ['Page {i} of {n}…', '第 {i} 頁，共 {n} 頁……', 'Pagina {i} ex {n}…'],
  'pdf.count': ['{n} p.', '{n} 頁', '{n} pp.'],
  'pdf.countBooklet': ['{n} p., {s} sheets', '{n} 頁・{s} 張', '{n} pp., {s} folia'],
  'pdf.booklet': ['booklet', '小冊子', 'libellus'],
};
const at = { en: 0, zh: 1, la: 2 };
const ZH_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
/** 1-99 in Chinese numerals: 32 -> 三十二. */
export function zhNumber(n) {
  if (n <= 10) return ZH_NUM[n];
  if (n < 20) return `十${ZH_NUM[n - 10]}`;
  return `${ZH_NUM[Math.floor(n / 10)]}十${n % 10 ? ZH_NUM[n % 10] : ''}`;
}
/** The interface's word for `key` in the chosen language, `{x}` filled from `vars`. */
export function t(key, vars = {}) {
  const v = S[key];
  if (!v) return key;
  let s = v[at[lang]] ?? v[0];
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? ''));
}

// the static page (site/index.html): elements marked data-i18n="key" take the text, data-i18n-aria
// their aria-label; the settings' options are in PAGE
const PAGE = {
  'set.psalms': ['Psalm display mode', '聖詠顯示方式', 'Modus psalmos exhibendi'],
  'set.compact': ['Compact', '精簡', 'Compactus'],
  'set.detailed': ['Detailed', '詳盡', 'Plenus'],
  'set.groupLanguage': ['Language', '語言', 'Lingua'],
  'set.groupOffice': ['Office', '日課', 'Officium'],
  'set.groupChant': ['Chant', '詠唱', 'Cantus'],
  'set.groupDisplay': ['Display', '顯示', 'Aspectus'],
  'set.groupPrint': ['Print and help', '列印及說明', 'Impressio et auxilium'],
  'set.ordo': ['Calendar', '禮儀日曆', 'Calendarium'],
  'ordo.general': ['General Roman', '羅馬通用日曆', 'Romanum generale'],
  'ordo.hk': ['🇭🇰 Hong Kong', '🇭🇰 香港教區', '🇭🇰 Hongcongensis'],
  'set.ui': ['Interface', '介面語言', 'Lingua paginæ'],
  'set.translation': ['Translation', '翻譯', 'Versio'],
  'set.beta': ['beta', '試用', 'probatur'],
  'tr.none': ['Latin only', '只用拉丁文', 'Latine tantum'],
  'tr.zh': ['Chinese (Hong Kong)', '中文（香港）', 'Sinice (Hongcongensis)'],
  'tr.en': ['English', '英文', 'Anglice'],
  'tr.zh+en': ['Chinese and English', '中文及英文', 'Sinice et Anglice'],
  'tr.zh>en': ['Chinese, else English', '中文（缺則英文）', 'Sinice, aliter Anglice'],
  'set.pange': ['Pange lingua', 'Pange lingua（讚美詩）', 'Pange lingua'],
  'pange.vaticana': ['Vatican edition', '梵蒂岡版', 'Editio Vaticana'],
  'set.ofHymn': ['Office of Readings hymn', '誦讀日課讚美詩', 'Hymnus Officii lectionis'],
  'ofHymn.auto': ['By the hour', '按時辰', 'Secundum horam'],
  'ofHymn.day': ['By day', '日間用', 'Diurnus'],
  'ofHymn.night': ['At night or early morning', '夜間或清晨用', 'Nocturnus vel matutinus'],
  'set.invitatory': ['Invitatory before', '序經置於', 'Invitatorium ante'],
  'set.memoria': ['Memorials, from the short reading', '紀念日，自簡短讀經起', 'In memoriis, a lectione brevi'],
  'memoria.feria': ['of the weekday', '用平日的', 'de feria'],
  'memoria.commune': ['of the common', '用通用的', 'de Communi'],
  'set.bonus': ['Mutual enrichment', '互相豐富', 'Mutua locupletatio'],
  'set.bonusOpen': ['Bonus content', '額外內容', 'Additamenta'],
  'set.reading': ['Short reading', '簡短讀經', 'Lectio brevis'],
  'set.preces': ['Intercessions', '禱詞', 'Preces'],
  'set.collect': ['Collect', '結束禱詞', 'Oratio'],
  'sung.ar': ['Sung (AR II)', '詠唱（AR II）', 'Cantu (AR II)'],
  'sung.lu': ['Sung (Liber Usualis)', '詠唱（LU）', 'Cantu (LU)'],
  'preces.full': ['Sung, full notation', '詠唱（全譜）', 'Cantu, plene notatum'],
  'preces.abbr': ['Sung, abbreviated', '詠唱（略譜）', 'Cantu, breviter notatum'],
  'sung.text': ['Text', '只顯示經文', 'Textus tantum'],
  'set.presider': ['Priest or deacon present', '有司鐸或執事主持', 'Sacerdote vel diacono præsidente'],
  'no': ['No', '否', 'Non'],
  'yes': ['Yes', '是', 'Ita'],
  'set.voice': ['Singing voice', '詠唱音域', 'Vox canentis'],
  'voice.low': ['Low', '低', 'Gravis'],
  'voice.mid': ['Medium', '中', 'Media'],
  'voice.high': ['High', '高', 'Acuta'],
  'set.theme': ['Dark mode', '深色模式', 'Modus obscurus'],
  'theme.system': ['System', '依系統', 'Ut systema'],
  'off': ['Off', '關', 'Non'],
  'on': ['On', '開', 'Ita'],
  'pdf.size': ['Print size', '列印大小', 'Magnitudo'],
  'pdf.format': ['Page format', '頁面格式', 'Forma paginæ'],
  'pdf.bookletA4': ['Booklet A4', 'A4 小冊子', 'Libellus A4'],
  'pdf.bookletLetter': ['Booklet Letter', 'Letter 小冊子', 'Libellus Letter'],
  'pdf.make': ['Make', '製作', 'Fac'],
  'pdf.download': ['Download', '下載', 'Deprome'],
  'pdf.share': ['Share', '分享', 'Communica'],
  'set.help': ['Help and sources', '說明及資料來源', 'Auxilium et fontes'],
  'open': ['Open', '開啟', 'Aperi'],
  'set.textSize': ['Text size', '字體大小', 'Magnitudo litterarum'],
  'aria.hour': ['Hour', '時辰', 'Hora'],
  'aria.date': ['Date', '日期', 'Dies'],
  'aria.settings': ['Settings', '設定', 'Optiones'],
  'aria.close': ['Close', '關閉', 'Claude'],
  'help.books': ['Where the scores come from', '樂譜出處', 'Unde cantus sumantur'],
  'help.contact': ['Contact', '聯絡', 'Inscriptio'],
  'foot.private': ['For private use only.', '只供私人使用。', 'Ad usum privatum tantum.'],
  'bonus.intro': ['Bonus content from the older Roman Office, in the spirit of Benedict XVI’s “mutual enrichment”. All off unless you tick them.',
    '取自舊羅馬日課的額外內容，本著教宗本篤十六世「互相豐富」的精神。全部預設關閉，勾選後才會加入。',
    'Additamenta ex antiquiore Officio Romano, mente Benedicti XVI de «mutua locupletatione». Omnia absunt, nisi notaveris.'],
  'bonus.fidelium': ['Fidelium animæ at the end of the hours (not Compline)', '各時辰（夜禱除外）結束時誦唸 Fidelium animæ', 'Fidelium animæ in fine Horarum (præter Completorium)'],
  'bonus.marianPrayer': ['After the antiphon of Our Lady: its versicle, collect and Divinum auxilium', '聖母對經後：其短句、禱詞及 Divinum auxilium', 'Post antiphonam B. Mariæ V.: versus, oratio et Divinum auxilium'],
  'bonus.marianCalendar': ['The antiphon of Our Lady by the traditional calendar', '依傳統日曆選用聖母對經', 'Antiphona B. Mariæ V. secundum calendarium traditum'],
  'bonus.deoGratias': ['℟. Deo gratias after the short reading', '簡短讀經後答：Deo gratias', '℟. Deo gratias post lectionem brevem'],
};
Object.assign(S, PAGE);

/** Put the chosen language into the static page. */
export function applyPage(root = document) {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant-HK' : lang;
  for (const e of root.querySelectorAll('[data-i18n]')) e.textContent = t(e.dataset.i18n);
  for (const e of root.querySelectorAll('[data-i18n-aria]')) e.setAttribute('aria-label', t(e.dataset.i18nAria));
  for (const e of root.querySelectorAll('[data-help]')) e.hidden = e.dataset.help !== lang;
}
