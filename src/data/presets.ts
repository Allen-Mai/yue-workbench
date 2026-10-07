/* ==========================================================================
   data/presets.ts · 全部预设内容（首次启动写入数据库，之后用户数据优先）
   ========================================================================== */

import type { PlantCategory, PlantStatus } from '../types';

/* ------------------------------ 预设植物（8 株） ------------------------------ */
export interface PresetPlant {
  name: string;
  category: PlantCategory;
  status: PlantStatus;
  note: string;
}

export const HYDRO_2 = 'hydro2';   // 每 2 天换水
export const HYDRO_10 = 'hydro10'; // 每 10 天换水 + 营养液
export const SOIL = 'soil';        // 每天早晨浇水

export const CATEGORY_META: Record<PlantCategory, { label: string; cycle: number; action: string; extra: string; icon: string }> = {
  hydro2: { label: '水培 · 勤换水', cycle: 2, action: '换水', extra: '', icon: 'drop' },
  hydro10: { label: '水培 · 加营养液', cycle: 10, action: '换水', extra: '含营养液', icon: 'water' },
  soil: { label: '土培 · 每日浇水', cycle: 1, action: '浇水', extra: '', icon: 'watering' },
};

export const PRESET_PLANTS: PresetPlant[] = [
  { name: '水培大蒜', category: HYDRO_2, status: 'growing', note: '喜欢阳光，水没过根部一半即可。' },
  { name: '水培碗莲', category: HYDRO_2, status: 'sprout', note: '水温别太凉，放在窗边。' },
  { name: '水培洋葱', category: HYDRO_2, status: 'growing', note: '两天换一次水，不然容易有味。' },
  { name: '观音竹（2株）', category: HYDRO_10, status: 'growing', note: '每 10 天换水并滴 2 滴营养液。' },
  { name: '发财树', category: HYDRO_10, status: 'growing', note: '散射光，别暴晒。' },
  { name: '玛丽亚', category: HYDRO_10, status: 'flowering', note: '叶片要常擦，精神抖擞。' },
  { name: '土培茉莉', category: SOIL, status: 'growing', note: '每天早晨浇一次，见干见湿。' },
  { name: '土培月季', category: SOIL, status: 'sprout', note: '早晨浇水，花后修剪。' },
];

export const PLANT_STATUS_META: Record<PlantStatus, { label: string; icon: string; feedback: string }> = {
  seed: { label: '种子', icon: 'seed', feedback: '发芽' },
  sprout: { label: '发芽', icon: 'sprout', feedback: '发芽' },
  growing: { label: '生长中', icon: 'sprout', feedback: '生长' },
  flowering: { label: '开花', icon: 'flower', feedback: '开花' },
  dormant: { label: '休眠', icon: 'moon', feedback: '休眠' },
};

export const PLANT_TAGS = ['换水', '浇水', '施肥', '修剪', '观察'] as const;
export const PLANT_FEEDBACKS = ['发芽', '生长', '开花', '休眠', '茂盛'] as const;

/* ------------------------------ 每日学习三项 ------------------------------ */
export const STUDY_ITEMS = [
  { key: 'en', label: '英语单词', icon: 'book', desc: '5 个新词 + 5 个复习' },
  { key: 'fin', label: '理财知识', icon: 'coin', desc: '读一篇理财串珠' },
  { key: 'news', label: '新闻时事', icon: 'news', desc: '浏览今日要闻' },
] as const;

/* ------------------------------ 单词库 ------------------------------ */
type WordTuple = [word: string, phonetic: string, meaning: string, example: string, exampleCn: string];

const WORD_TUPLES: WordTuple[] = [
  ['sapling', '/ˈsæplɪŋ/', 'n. 树苗；幼树', 'The sapling grows a little every day.', '小树苗每天都在长高一点点。'],
  ['sprout', '/spraʊt/', 'v. 发芽 n. 嫩芽', 'The beans sprout in three days.', '豆子三天就发芽了。'],
  ['blossom', '/ˈblɒsəm/', 'n. 花朵 v. 开花', 'The jasmine is in full blossom.', '茉莉花开得正盛。'],
  ['root', '/ruːt/', 'n. 根；根源', 'Clean water helps the roots breathe.', '干净的水让根能呼吸。'],
  ['soil', '/sɔɪl/', 'n. 土壤', 'This soil is loose and moist.', '这土壤松软又湿润。'],
  ['moss', '/mɒs/', 'n. 苔藓', 'Moss grows on the north side of the stone.', '苔藓长在石头背阴的一面。'],
  ['fern', '/fɜːn/', 'n. 蕨类植物', 'The fern unrolls its young leaves.', '蕨类慢慢展开嫩叶。'],
  ['harvest', '/ˈhɑːvɪst/', 'n./v. 收获', 'Autumn is the season of harvest.', '秋天是收获的季节。'],
  ['patience', '/ˈpeɪʃns/', 'n. 耐心', 'Gardening teaches me patience.', '种花教会了我耐心。'],
  ['gentle', '/ˈdʒentl/', 'adj. 温柔的；轻柔的', 'She speaks in a gentle voice.', '她说话的声音很温柔。'],
  ['budget', '/ˈbʌdʒɪt/', 'n. 预算 v. 做预算', 'Fifty yuan a day is my budget.', '一天五十元是我的预算。'],
  ['saving', '/ˈseɪvɪŋz/', 'n. 储蓄；节省', 'Small savings add up quickly.', '一点点省下来很快就多了。'],
  ['expense', '/ɪkˈspens/', 'n. 开支；费用', 'Track every expense honestly.', '诚实地记录每一笔开销。'],
  ['income', '/ˈɪnkʌm/', 'n. 收入', 'Her income covers the rent easily.', '她的收入轻松覆盖房租。'],
  ['invest', '/ɪnˈvest/', 'v. 投资', 'Do not invest money you need soon.', '不要拿近期要用的钱去投资。'],
  ['interest', '/ˈɪntrəst/', 'n. 利息；兴趣', 'Compound interest grows like a tree.', '复利像树一样生长。'],
  ['afford', '/əˈfɔːd/', 'v. 负担得起', 'I can afford one small wish this month.', '这个月我买得起一个小愿望。'],
  ['frugal', '/ˈfruːɡl/', 'adj. 节俭的', 'Being frugal is not being stingy.', '节俭不是小气。'],
  ['purchase', '/ˈpɜːtʃəs/', 'n./v. 购买', 'Write it down before you purchase.', '买之前先写下来。'],
  ['wishlist', '/ˈwɪʃlɪst/', 'n. 心愿清单', 'My wishlist has only three items.', '我的心愿清单只有三样东西。'],
  ['gratitude', '/ˈɡrætɪtjuːd/', 'n. 感激；感恩', 'Gratitude makes ordinary days warm.', '感恩让平凡的日子变暖。'],
  ['memoir', '/ˈmemwɑː/', 'n. 回忆录', 'She keeps a memoir of small joys.', '她写着小确幸的回忆录。'],
  ['anniversary', '/ˌænɪˈvɜːsəri/', 'n. 周年纪念日', 'Our anniversary is next Friday.', '我们的纪念日在下周五。'],
  ['reminder', '/rɪˈmaɪndə/', 'n. 提醒；提示', 'Set a reminder for her birthday.', '给她生日设个提醒。'],
  ['routine', '/ruːˈtiːn/', 'n. 日常；惯例', 'A gentle routine lasts longer.', '温和的日常习惯更持久。'],
  ['habit', '/ˈhæbɪt/', 'n. 习惯', 'Seven days makes a tiny habit.', '七天养成一个小习惯。'],
  ['focus', '/ˈfəʊkəs/', 'n./v. 专注', 'Focus on one thing at a time.', '一次只专注一件事。'],
  ['breathe', '/briːð/', 'v. 呼吸', 'Take a breath and start again.', '深呼吸，然后重新开始。'],
  ['healing', '/ˈhiːlɪŋ/', 'adj. 治愈的', 'Green light is healing to the eyes.', '绿意对眼睛很治愈。'],
  ['warmth', '/wɔːmθ/', 'n. 温暖', 'The warmth of tea in your hands.', '手心里那杯茶的温暖。'],
  ['sunlight', '/ˈsʌnlaɪt/', 'n. 阳光', 'Move the pot into soft sunlight.', '把花盆挪到柔和的阳光里。'],
  ['morning', '/ˈmɔːnɪŋ/', 'n. 早晨', 'Water the plants every morning.', '每天早上给植物浇水。'],
  ['drizzle', '/ˈdrɪzl/', 'n. 毛毛雨 v. 下细雨', 'A light drizzle fell all night.', '细雨下了一整夜。'],
  ['bloom', '/bluːm/', 'v. 绽放 n. 花期', 'The roses bloom twice a year.', '月季一年开两次花。'],
  ['prune', '/pruːn/', 'v. 修剪', 'Prune the branches after blooming.', '花谢之后修剪枝条。'],
  ['nutrient', '/ˈnjuːtriənt/', 'n. 养分；营养', 'Add two drops of nutrient liquid.', '加两滴营养液。'],
  ['flourish', '/ˈflʌrɪʃ/', 'v. 茂盛；兴旺', 'The lucky bamboo flourishes here.', '发财树在这儿长得很旺。'],
  ['serene', '/səˈriːn/', 'adj. 宁静的', 'The garden is serene at dawn.', '清晨的花园很宁静。'],
  ['courage', '/ˈkʌrɪdʒ/', 'n. 勇气', 'It takes courage to say no.', '说“不”需要勇气。'],
  ['balance', '/ˈbæləns/', 'n./v. 平衡', 'Keep a balance between work and rest.', '在工作和休息之间保持平衡。'],
  ['structure', '/ˈstrʌktʃə/', 'n. 结构；体系', 'A clear structure saves time.', '清晰的结构能省时间。'],
  ['review', '/rɪˈvjuː/', 'n./v. 复习；回顾', 'Review yesterday before learning new.', '学新词前先复习昨天的。'],
  ['pronounce', '/prəˈnaʊns/', 'v. 发音', 'Pronounce it slowly and clearly.', '慢慢地、清楚地读出来。'],
  ['record', '/rɪˈkɔːd/', 'v. 记录；录音', 'Record your voice and compare.', '录下自己的声音再对比。'],
  ['translate', '/trænzˈleɪt/', 'v. 翻译', 'Translate the sentence by yourself.', '试着自己翻译这个句子。'],
  ['achieve', '/əˈtʃiːv/', 'v. 达成；实现', 'You achieved a seven-day streak.', '你达成了七天连续打卡。'],
  ['streak', '/striːk/', 'n. 连续（记录）', 'Keep the streak going tomorrow.', '明天继续保持连续记录。'],
  ['milestone', '/ˈmaɪlstəʊn/', 'n. 里程碑', 'Day one hundred is a milestone.', '第一百天是个里程碑。'],
  ['treasure', '/ˈtreʒə/', 'n. 珍宝 v. 珍藏', 'Time capsules treasure small days.', '时光胶囊珍藏平凡的日子。'],
  ['capsule', '/ˈkæpsjuːl/', 'n. 胶囊；密封舱', 'Open the capsule in ten years.', '十年后再打开这个胶囊。'],
  ['promise', '/ˈprɒmɪs/', 'n./v. 承诺', 'A promise kept builds trust.', '守住的承诺带来信任。'],
  ['together', '/təˈɡeðə/', 'adv. 一起', 'We count the days together.', '我们一起数着日子。'],
  ['quiet', '/ˈkwaɪət/', 'adj. 安静的', 'A quiet corner for reading.', '一个安静的读书角落。'],
  ['ordinary', '/ˈɔːdnri/', 'adj. 平凡的', 'Ordinary days deserve records too.', '平凡的日子也值得记录。'],
  ['steady', '/ˈstedi/', 'adj. 稳定的', 'Steady progress beats bursts.', '稳定前进胜过一时冲刺。'],
  ['kindness', '/ˈkaɪndnəs/', 'n. 善意', 'Kindness returns in unexpected ways.', '善意会以意外的方式回来。'],
  ['harvest', '/ˈhɑːvɪst/', 'n. 收获（重复强化）', 'We harvest what we plant daily.', '我们收获每天种下的东西。'],
  ['sky', '/skaɪ/', 'n. 天空', 'Look up at the sky and rest your eyes.', '抬头看看天空让眼睛歇一歇。'],
  ['leaf', '/liːf/', 'n. 叶子', 'A new leaf opened this morning.', '今早又展开了一片新叶。'],
  ['grow', '/ɡrəʊ/', 'v. 生长；成长', 'You grow as your plants grow.', '你和植物一起生长。'],
  ['smile', '/smaɪl/', 'n./v. 微笑', 'Her small smile made my day.', '她的一个浅笑让我开心一整天。'],
];

export const PRESET_WORDS = WORD_TUPLES.map(([word, phonetic, meaning, example, exampleCn]) => ({
  word, phonetic, meaning, example, example_cn: exampleCn,
}));

/* ------------------------------ 经典名句 ------------------------------ */
export const PRESET_QUOTES: Array<{ text: string; author: string; source: string; tags: string[] }> = [
  { text: '天地通，年月通，日事通，万事皆成。', author: '古谚', source: '民间吉语', tags: ['励志'] },
  { text: '不积跬步，无以至千里。', author: '荀子', source: '《劝学》', tags: ['励志', '哲思'] },
  { text: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游', source: '《冬夜读书示子聿》', tags: ['哲思'] },
  { text: '采菊东篱下，悠然见南山。', author: '陶渊明', source: '《饮酒》', tags: ['古诗词', '生活'] },
  { text: '竹外桃花三两枝，春江水暖鸭先知。', author: '苏轼', source: '《惠崇春江晚景》', tags: ['古诗词'] },
  { text: '人间有味是清欢。', author: '苏轼', source: '《浣溪沙》', tags: ['生活', '古诗词'] },
  { text: '但愿人长久，千里共婵娟。', author: '苏轼', source: '《水调歌头》', tags: ['爱情', '古诗词'] },
  { text: '落红不是无情物，化作春泥更护花。', author: '龚自珍', source: '《己亥杂诗》', tags: ['哲思'] },
  { text: '心之所向，素履以往。', author: '《绿野仙踪》', source: '现代引语', tags: ['励志'] },
  { text: '你不能左右天气，但可以改变心情。', author: '佚名', source: '现代谚语', tags: ['励志'] },
  { text: '把日子过成诗，不在于拥有多少，而在于珍惜多少。', author: '佚名', source: '生活随笔', tags: ['生活'] },
  { text: '愿你有好运气，如果没有，愿你在不幸中学会慈悲。', author: '刘瑜', source: '《愿你慢慢长大》', tags: ['生活', '励志'] },
  { text: '所有的丰盛，都从一粒种子开始。', author: '佚名', source: '园艺手记', tags: ['生活', '哲思'] },
  { text: '春有百花秋有月，夏有凉风冬有雪。', author: '无门慧开', source: '《颂古四十八首》', tags: ['古诗词', '哲思'] },
  { text: '一花一世界，一叶一菩提。', author: '佛经', source: '《华严经》', tags: ['哲思'] },
  { text: '静水流深，沧笙踏歌。', author: '佚名', source: '古文', tags: ['哲思'] },
  { text: '真正的富有，是你愿意为生活慢下来。', author: '佚名', source: '理财手记', tags: ['生活', '励志'] },
  { text: '节省下来的每一元，都是给未来的自己写的信。', author: '佚名', source: '财富手记', tags: ['励志', '生活'] },
  { text: '愿你成为自己的太阳，无需凭借谁的光。', author: '佚名', source: '网络佳句', tags: ['励志'] },
  { text: '慢慢来，比较快。', author: '佚名', source: '网络佳句', tags: ['励志', '生活'] },
];

/* ------------------------------ 好书 / 电影 / 知识 / 理财串珠 ------------------------------ */
export interface PresetInspire {
  kind: 'book' | 'movie' | 'knowledge' | 'beads';
  title: string;
  source: string;
  tags: string[];
  body: string;
  url?: string;
}

export const PRESET_INSPIRATIONS: PresetInspire[] = [
  {
    kind: 'book', title: '《小森林》', source: '五十岚大介', tags: ['森系', '生活'],
    body: '一个女孩从城市回到山里，用四季的作物与食物慢慢把自己养好。\n\n它讲的不只是做饭，而是“用具体的事把自己重新种回土里”。读它的时候会想：我的阳台也是一块小小的田。\n\n适合心情浮躁的夜晚，配一杯温热的茶，一次读一篇。',
  },
  {
    kind: 'book', title: '《山茶文具店》', source: '小川糸', tags: ['治愈', '书信'],
    body: '镰仓的一间文具店，代笔人写下别人的道歉信、离婚通知、给旧友的问候。\n\n“字是有体温的。”——这本书教我，认真对待每一句要说出口的话。',
  },
  {
    kind: 'book', title: '《蛤蟆先生去看心理医生》', source: '罗伯特·戴博德', tags: ['心理', '成长'],
    body: '用童话讲完一整套心理咨询过程。读完后你大概能分辨：此刻的自己处于“儿童自我状态”还是“成人自我状态”。\n\n一句很有用的话：“只有当你是为了自己而改变时，改变才会真的发生。”',
  },
  {
    kind: 'book', title: '《小狗钱钱》', source: '博多·舍费尔', tags: ['理财', '入门'],
    body: '理财启蒙的经典。三个核心动作：写下 10 个愿望、建立梦想储蓄罐、记成功日记。\n\n把“省钱”从一件痛苦的事变成一件有画面感的事——这和我们工作台的金币体系是一套逻辑。',
  },
  {
    kind: 'book', title: '《掌控习惯》', source: '詹姆斯·克利尔', tags: ['习惯', '成长'],
    body: '习惯四定律：让它显而易见、有吸引力、简便易行、令人愉悦。\n\n“你不会升到目标的高度，你只会下降到系统的水平。”——所以工作台里最重要的是系统，不是决心。',
  },
  {
    kind: 'book', title: '《植物知道生命的答案》', source: '丹尼尔·查莫维茨', tags: ['植物', '科普'],
    body: '植物能看见光、闻到气味、记得经历过的干旱。\n\n知道这些之后，给观音竹换水这件事忽然变得郑重：它真的能感知到。',
  },
  {
    kind: 'book', title: '《断舍离》', source: '山下英子', tags: ['生活', '整理'],
    body: '断＝不买不需要的；舍＝处理掉多余的；离＝脱离对物品的执念。\n\n配合“购买清单”使用效果极佳：先写下来，放三天，还想买再买。',
  },
  {
    kind: 'book', title: '《我在伊朗长大》', source: '玛赞·莎塔碧', tags: ['图像小说', '成长'],
    body: '黑白图像小说，一个女孩在动荡年代里长大。\n\n它提醒我：记录本身就是一种抵抗——把真实的感受留下来，日子就不会被轻易抹平。',
  },
  {
    kind: 'movie', title: '《小森林 夏秋篇 / 冬春篇》', source: '森淳一 · 2014', tags: ['森系', '美食'],
    body: '和书一样治愈的影像版。大量长镜头：洗菜、煮饭、酿米酒。\n\n适合周末下午开着当背景音，一边收拾房间。',
  },
  {
    kind: 'movie', title: '《海蒂和爷爷》', source: '阿兰·葛斯彭纳 · 2015', tags: ['治愈', '自然'],
    body: '阿尔卑斯山的草坡、羊群和一老一少。看完会想立刻开窗通风。\n\n“如果做一件事让你快乐，那就去做，别管别人怎么说。”',
  },
  {
    kind: 'movie', title: '《白日梦想家》', source: '本·斯蒂勒 · 2013', tags: ['励志', '旅行'],
    body: '杂志最后一期的封面，是“生活”本身。\n\n“开拓视野，冲破艰险，看见世界，身临其境，贴近彼此，感受生活——这就是生活的目的。”',
  },
  {
    kind: 'movie', title: '《千与千寻》', source: '宫崎骏 · 2001', tags: ['动画', '成长'],
    body: '别忘了自己的名字。\n\n小时候看是奇幻冒险，长大看是关于劳动、记忆和不被同化的故事。',
  },
  {
    kind: 'movie', title: '《怦然心动》', source: '罗伯·莱纳 · 2010', tags: ['爱情', '成长'],
    body: '“有些人沦为平庸浅薄，可不经意间，有一天你会遇到一个彩虹般绚丽的人。”\n\n适合和伴侣一起看。',
  },
  {
    kind: 'movie', title: '《人生果实》', source: '伏原健之 · 2016', tags: ['纪录片', '生活'],
    body: '一对老夫妇和他们的杂木林庭院。果实掉下来，就捡起来做成酱。\n\n“风吹枯叶落，落叶生肥土，肥土丰香果，孜孜不倦，不紧不慢。”',
  },
  {
    kind: 'knowledge', title: '为什么水培植物要定期换水？', source: '园艺常识', tags: ['植物', '科普'],
    body: '水培的根泡在静水里，氧气会慢慢被消耗完；根系呼吸不畅就会发黑腐烂。同时水中会积累根系分泌的有机酸，容易滋生细菌。\n\n所以：勤换水＝补氧＋控菌。观音竹这类耐阴植物每 10 天换一次并加少量营养液即可；大蒜、碗莲这类生长旺盛的每 2 天换一次。',
  },
  {
    kind: 'knowledge', title: '“月额度＝当月天数 × 50 元”背后的心理学', source: '行为经济学', tags: ['理财', '心理'],
    body: '固定日额度比固定月额度更好用，因为人脑对“今天还剩多少”远比对“这个月还剩多少”敏感。\n\n当月度高时，前几天容易大手大脚，导致月底吃土；日额度把约束切成 30 个小单元，还自带“今天省下来也不累积”的即时效用——这正是省钱奖励（1–15 元得 2 金币）能奏效的原因。',
  },
  {
    kind: 'knowledge', title: '复利到底有多慢又多快', source: '理财基础', tags: ['理财'],
    body: '年化 8%，本金 1 万：10 年约 2.16 万，20 年约 4.66 万，30 年约 10.06 万。\n\n前 10 年看起来平平无奇，最后 10 年几乎翻倍。所以“早点开始”比“投得多”更重要。',
  },
  {
    kind: 'knowledge', title: '为什么记录能提升幸福感', source: '积极心理学', tags: ['心理', '生活'],
    body: '研究发现，每周写下 3 件顺利的事，持续 10 周，幸福感和睡眠质量都会提升。\n\n关键不是写得多，而是写得**具体**：不是“今天很好”，而是“早上给茉莉浇水时闻到了第一朵花香”。',
  },
  {
    kind: 'knowledge', title: '像素艺术为什么让人放松', source: '视觉设计', tags: ['设计', '治愈'],
    body: '像素图的边界是硬的、可数的、有限的。在信息过载的环境里，这种“有限”本身就有安抚作用。\n\n再加上暖色低蓝光的纸感底色，眼睛的调节负担更小——这就是这套界面用暖米黄做底的生理原因。',
  },
  {
    kind: 'knowledge', title: '习惯的“最小可执行单元”', source: '行为设计', tags: ['习惯'],
    body: '把目标压缩到“不可能失败”的程度：不是“每天运动 30 分钟”，而是“穿上运动鞋”。\n\n工作台里对应的是：每日学习三项，点一下就算完成。',
  },
  {
    kind: 'beads', title: '理财串珠 ①：先记三天，再谈省钱', source: '财富工坊', tags: ['理财', '起步'],
    body: '不要一上来就设预算。先老老实实记三天，你会看见自己真实的钱去哪了——这往往比想象中更意外。\n\n记录本身就会改变行为，这叫“观察者效应”。',
  },
  {
    kind: 'beads', title: '理财串珠 ②：把支出分成三类', source: '财富工坊', tags: ['理财', '方法'],
    body: '① 可变支出（吃饭、交通、日用品）——唯一能压缩的部分；\n② 固定支出（房租、水电、订阅）——每季度复查一次，取消不再使用的；\n③ 心愿支出——用金币兑换，不占月额度。\n\n分开之后你会发现：焦虑大多来自第 ①类，而它其实是可以被设计的。',
  },
  {
    kind: 'beads', title: '理财串珠 ③：为“想买”设一个冷却期', source: '财富工坊', tags: ['理财', '消费'],
    body: '看到想买的东西，先写进购买清单，标上价格，等 3 天。\n\n3 天后还想要，就买；忘了，就删掉。这一招每年能省下的钱，通常比“少喝几杯咖啡”多得多。',
  },
  {
    kind: 'beads', title: '理财串珠 ④：给收入也建一个账户', source: '财富工坊', tags: ['理财', '收入'],
    body: '收入账户只做一件事：清清楚楚地记录钱从哪来。\n\n工资、兼职、投资、红包、其他——分类记录三个月，你会知道自己的“第二收入曲线”有没有在长。',
  },
  {
    kind: 'beads', title: '理财串珠 ⑤：金币不是钱，是证据', source: '财富工坊', tags: ['理财', '激励'],
    body: '金币的价值不在于能换多少东西，而在于它是你“说到做到”的证据。\n\n攒到 100 金币时的那句“恭喜！可以购买首饰啦！”，奖励的是那个坚持了 50 天的你。',
  },
  {
    kind: 'beads', title: '理财串珠 ⑥：每月 1 日做一次备份和复盘', source: '财富工坊', tags: ['理财', '复盘'],
    body: '每月 1 日：导出一次全部数据 + 看一眼上月支出结构饼图 + 写下一条下月要改的事。\n\n只要 10 分钟，但它决定了这个月是“重复上个月”还是“比上个月好一点”。',
  },
];

/* ------------------------------ 好词好句（摘抄预设） ------------------------------ */
export const QUOTE_TAGS = ['励志', '哲思', '爱情', '古诗词', '生活'] as const;

/* ------------------------------ 支出类别 ------------------------------ */
export const VARIABLE_CATEGORIES = ['餐饮', '交通', '日用品', '娱乐', '医疗', '学习', '人情', '其它'];
export const FIXED_CATEGORIES = ['房租', '水电', '宽带', '通讯', '保险', '订阅', '其它'];
export const INCOME_CATEGORIES = ['工资', '兼职', '投资', '红包', '报销', '其它'];

export const QUICK_VARIABLE = ['餐饮', '交通', '日用品', '娱乐'];
export const QUICK_FIXED = ['房租', '水电', '订阅'];
export const QUICK_INCOME = ['工资', '兼职', '红包'];

/* ------------------------------ 固定支出预设 ------------------------------ */
export const PRESET_FIXED_ITEMS = [
  { name: '房租', amount: 0, day: 1 },
  { name: '水电燃气', amount: 0, day: 10 },
  { name: '宽带/通讯', amount: 0, day: 15 },
];

/* ------------------------------ 账户预设 ------------------------------ */
export const ACCOUNT_META = {
  daily: { name: '日常账户', icon: 'wallet', desc: '可变支出 · 月额度 = 当月天数 × 50 元' },
  fixed: { name: '固定支出账户', icon: 'home', desc: '预设项目自动扣减 · 不占额度、不计奖励' },
  income: { name: '收入账户', icon: 'income', desc: '独立统计 · 不参与奖励' },
  coin: { name: '金币账户', icon: 'coin', desc: '任务奖励 · 1 金币 = 1 元 · 仅用于心愿兑换' },
  wish: { name: '心愿账户', icon: 'gift', desc: '金币兑换后转入 · 不占月额度' },
} as const;

export const DAILY_BASE = 50; // 元/天

/* ------------------------------ 成就徽章 ------------------------------ */
export interface BadgeDef {
  key: string;
  name: string;
  desc: string;
  icon: string;
  check: (s: BadgeStats) => boolean;
}
export interface BadgeStats {
  streak: number;
  readCount: number;
  savedTotal: number;
  plantDays: number;
  coinsTotal: number;
  coupleDays: number;
}

export const BADGES: BadgeDef[] = [
  { key: 'streak7', name: '连续 7 天全勤', desc: '连续 7 天完成全部待办与学习', icon: 'trophy', check: (s) => s.streak >= 7 },
  { key: 'streak30', name: '连续 30 天全勤', desc: '整整一个月没有断', icon: 'crown', check: (s) => s.streak >= 30 },
  { key: 'read50', name: '累计阅读 50 篇', desc: '读完 50 篇内容', icon: 'book', check: (s) => s.readCount >= 50 },
  { key: 'saver', name: '省钱小能手', desc: '累计节省 500 元', icon: 'piggy', check: (s) => s.savedTotal >= 500 },
  { key: 'plantmaster', name: '植物达人', desc: '植物记录 ≥ 30 天', icon: 'plant', check: (s) => s.plantDays >= 30 },
  { key: 'coin100', name: '金币百枚', desc: '累计获得 100 枚金币', icon: 'coin', check: (s) => s.coinsTotal >= 100 },
  { key: 'coin500', name: '金币五百', desc: '累计获得 500 枚金币', icon: 'chest', check: (s) => s.coinsTotal >= 500 },
  { key: 'couple100', name: '相伴百日', desc: '在一起满 100 天', icon: 'heart', check: (s) => s.coupleDays >= 100 },
  { key: 'couple365', name: '相伴一年', desc: '在一起满 365 天', icon: 'heart', check: (s) => s.coupleDays >= 365 },
  { key: 'firststep', name: '万事起头', desc: '写下第一条记录', icon: 'seed', check: (s) => s.coinsTotal > 0 || s.plantDays > 0 },
];

/* ------------------------------ 默认设置 ------------------------------ */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  theme: 'day',
  eye: 'soft',
  fontSize: 'm',
  round: 'soft',
  motion: 'on',
  navCollapsed: false,
  motto: '天地通，年月通，日事通，万事皆成！',
  coupleStart: '',
  backupRemind: true,
  coinPopup: true,
  lastBackupAt: '',
  lastCoinPopup: 0,
  lastWeeklyCard: '',
  goldAlert: 0,
  seeded: false,
  installHintDismissed: false,
};
