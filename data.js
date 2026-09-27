// Mock 数据：活动 / 攻略 / 公开队伍 / 城市坐标
const CITIES = {
  上海: { lat: 31.23, lon: 121.47 },
  北京: { lat: 39.9, lon: 116.4 },
  广州: { lat: 23.13, lon: 113.26 },
  深圳: { lat: 22.54, lon: 114.06 },
  杭州: { lat: 30.27, lon: 120.15 },
  成都: { lat: 30.66, lon: 104.07 },
};

const TYPES = ["展览", "市集", "演出", "徒步", "美食探店", "运动", "手作", "Citywalk"];
const TYPE_EMOJI = { 展览: "🖼️", 市集: "🧺", 演出: "🎸", 徒步: "🥾", 美食探店: "🍜", 运动: "🏸", 手作: "🏺", Citywalk: "🚶" };
const BUDGETS = [
  { label: "免费", value: 0 },
  { label: "≤ ¥50", value: 50 },
  { label: "≤ ¥100", value: 100 },
  { label: "≤ ¥200", value: 200 },
  { label: "不设限", value: 9999 },
];
const GROUPS = [
  { label: "自己", value: 1 },
  { label: "2 人", value: 2 },
  { label: "3–4 人", value: 3 },
  { label: "5 人+", value: 5 },
];

const G = (a, b) => `linear-gradient(145deg, ${a}, ${b})`;

const ACTIVITIES = [
  { id: "a1", title: "西岸美术馆 · 蓬皮杜典藏展：色彩的边界", type: "展览", district: "徐汇滨江", price: 100, indoor: true, suitFor: [1, 2, 3], date: "both", time: "10:00–18:00", cover: { emoji: "🖼️", bg: G("#E8F5FF", "#B9D8FF") }, ratio: 1.25, heat: 2310, desc: "蓬皮杜中心典藏轮换展，40+ 件现代艺术原作。学生证半价，周六下午人最多，建议上午去。", tags: ["学生半价", "拍照出片"] },
  { id: "a2", title: "安福路周末古着市集｜80 个摊位", type: "市集", district: "徐汇 · 安福路", price: 0, indoor: false, suitFor: [2, 3, 5], date: "sat", time: "周六 11:00–20:00", cover: { emoji: "🧺", bg: G("#FFF4D6", "#FFD98A") }, ratio: 1.45, heat: 1876, desc: "古着、黑胶、手作饰品。免费入场，现场有咖啡车。下雨会取消，出门前看公众号通知。", tags: ["免费", "适合逛吃"] },
  { id: "a3", title: "MAO Livehouse · 独立乐队拼盘夜", type: "演出", district: "黄浦 · 重庆南路", price: 150, indoor: true, suitFor: [2, 3, 5], date: "sat", time: "周六 20:00", cover: { emoji: "🎸", bg: G("#1B1B1B", "#4A4A4A") }, ratio: 1.1, heat: 1502, desc: "三支新晋独立乐队，站票 150。结束约 22:30，地铁末班车来得及。", tags: ["夜场", "站票"] },
  { id: "a4", title: "佘山国家森林公园 · 半日轻徒步", type: "徒步", district: "松江 · 佘山", price: 30, indoor: false, suitFor: [2, 3, 5], date: "both", time: "全天", cover: { emoji: "🥾", bg: G("#E3FBD0", "#A8E07A") }, ratio: 1.5, heat: 980, desc: "9 号线直达，全程 6km 爬升 200m，新手友好。山顶可以看到天文台。", tags: ["地铁直达", "新手友好"] },
  { id: "a5", title: "M50 创意园 · 开放工作室日", type: "展览", district: "普陀 · 莫干山路", price: 0, indoor: true, suitFor: [1, 2, 3], date: "sun", time: "周日 13:00–18:00", cover: { emoji: "🎨", bg: G("#FDE7F1", "#F7B5D2") }, ratio: 1.2, heat: 760, desc: "20+ 艺术家工作室对外开放，能和创作者聊天。免费，室内为主。", tags: ["免费", "室内"] },
  { id: "a6", title: "陶艺体验 · 2 小时拉坯课", type: "手作", district: "静安 · 愚园路", price: 168, indoor: true, suitFor: [1, 2], date: "both", time: "14:00 / 16:30", cover: { emoji: "🏺", bg: G("#F5EDE3", "#DCC3A4") }, ratio: 1.35, heat: 1340, desc: "老师一对四，作品烧制后 3 周可取或邮寄。双人同行第二位 8 折。", tags: ["双人优惠", "雨天友好"] },
  { id: "a7", title: "武康路—衡山路 梧桐区 Citywalk", type: "Citywalk", district: "徐汇 · 衡复风貌区", price: 0, indoor: false, suitFor: [1, 2, 3, 5], date: "both", time: "随时", cover: { emoji: "🚶", bg: G("#FFF1E0", "#FFC58F") }, ratio: 1.6, heat: 3120, desc: "约 4km，武康大楼 → 巴金故居 → 衡山坊。秋天梧桐叶黄，下午光线最好。", tags: ["免费", "秋季限定"] },
  { id: "a8", title: "云南路美食街 · 30 元吃撑路线", type: "美食探店", district: "黄浦 · 云南南路", price: 40, indoor: false, suitFor: [2, 3, 5], date: "both", time: "11:00–22:00", cover: { emoji: "🍜", bg: G("#FFE3DC", "#FF9F86") }, ratio: 1.15, heat: 2045, desc: "生煎、排骨年糕、小馄饨。人均 40 能吃 5 家，周末晚饭点排队较长。", tags: ["学生党", "人均 40"] },
  { id: "a9", title: "室内攀岩 · 新手体验课", type: "运动", district: "长宁 · 虹桥", price: 128, indoor: true, suitFor: [2, 3, 5], date: "both", time: "10:00–22:00", cover: { emoji: "🧗", bg: G("#E0F7F4", "#8DDCCF") }, ratio: 1.3, heat: 870, desc: "含装备和 1 小时教练带练，3 人以上团购价 98/人。", tags: ["团购更省", "雨天友好"] },
  { id: "a10", title: "上海大剧院 · 学生专场音乐会", type: "演出", district: "黄浦 · 人民广场", price: 80, indoor: true, suitFor: [1, 2], date: "sun", time: "周日 19:30", cover: { emoji: "🎻", bg: G("#EDE7FF", "#B9A6FF") }, ratio: 1.4, heat: 1120, desc: "德沃夏克《新世界》，学生凭证 80 元，需提前 3 天预约。", tags: ["学生专场"] },
  { id: "a11", title: "世纪公园 · 草坪野餐 + 飞盘局", type: "运动", district: "浦东 · 世纪公园", price: 10, indoor: false, suitFor: [3, 5], date: "both", time: "全天", cover: { emoji: "🥏", bg: G("#EFFFE0", "#C4F58E") }, ratio: 1.2, heat: 1650, desc: "门票 10 元，7 号门附近草坪最大。人多才好玩，适合拉群组队。", tags: ["人越多越好玩"] },
  { id: "a12", title: "UCCA Edge · 沉浸式数字艺术展", type: "展览", district: "静安 · 苏河湾", price: 128, indoor: true, suitFor: [1, 2, 3], date: "both", time: "10:00–21:00", cover: { emoji: "🌀", bg: G("#E0E7FF", "#8FA4FF") }, ratio: 1.1, heat: 2680, desc: "光影装置 + 声音艺术，时长约 1 小时。晚上 7 点后人少。", tags: ["雨天友好", "出片"] },
  { id: "a13", title: "上生·新所 周日农夫市集", type: "市集", district: "长宁 · 延安西路", price: 0, indoor: false, suitFor: [1, 2, 3], date: "sun", time: "周日 10:00–16:00", cover: { emoji: "🥬", bg: G("#F2FFE6", "#B6EB7D") }, ratio: 1.3, heat: 1240, desc: "有机蔬果、手工面包、咖啡。游泳池旁草坪可以坐。", tags: ["免费", "早起"] },
  { id: "a14", title: "滨江骑行 · 杨浦段 12km", type: "运动", district: "杨浦滨江", price: 15, indoor: false, suitFor: [1, 2, 3, 5], date: "both", time: "全天", cover: { emoji: "🚲", bg: G("#E0F4FF", "#8ED0FF") }, ratio: 1.5, heat: 930, desc: "共享单车即可，沿江绿道全程无车。日落时段可以看到杨浦大桥。", tags: ["日落", "低预算"] },
  { id: "a15", title: "即兴喜剧开放麦", type: "演出", district: "静安 · 石门一路", price: 60, indoor: true, suitFor: [2, 3], date: "sat", time: "周六 19:00", cover: { emoji: "🎤", bg: G("#FFF7CC", "#FFE066") }, ratio: 1.2, heat: 1410, desc: "10 位演员轮番上场，现场互动多。含一杯饮料。", tags: ["社交", "室内"] },
  { id: "a16", title: "朱家角古镇 · 一日游", type: "Citywalk", district: "青浦 · 朱家角", price: 50, indoor: false, suitFor: [2, 3, 5], date: "both", time: "全天", cover: { emoji: "🛶", bg: G("#E6FFF6", "#94E8C8") }, ratio: 1.35, heat: 1760, desc: "17 号线直达，摇橹船 30 元/人，扎肉粽必吃。避开周六中午人潮。", tags: ["地铁直达", "古镇"] },
];

const AVATARS = ["🐱", "🦊", "🐼", "🐧", "🐨", "🐸", "🐯", "🐰"];

const SEED_GUIDES = [
  { id: "g1", activityId: "a7", title: "梧桐区 Citywalk｜最出片的 5 个机位", body: "从武康大楼开始，下午 3 点半光线最好。\n1. 武康大楼对面街角\n2. 安福路 322 号门口\n3. 衡山坊红砖墙\n4. 巴金故居外的梧桐\n5. 永平里的小院子\n\n全程 4km，穿舒服的鞋！", tags: ["上海周末", "Citywalk", "免费"], author: "梧桐区遛弯人", avatar: "🦊", likes: 1284, ratio: 1.33, emoji: "📸", bg: G("#FFF1E0", "#FFB870") },
  { id: "g2", activityId: "a8", title: "云南路 30 元吃 5 家，学生党抄作业", body: "小杨生煎 ¥8 → 鲜得来排骨年糕 ¥18 → 小馄饨 ¥10 → 糖水 ¥6。\n避雷：路口那家网红奶茶排队 40 分钟不值。", tags: ["学生党", "美食"], author: "吃饱再说", avatar: "🐼", likes: 986, ratio: 1.1, emoji: "🥟", bg: G("#FFE3DC", "#FF8C6E") },
  { id: "g3", activityId: "a1", title: "西岸蓬皮杜：学生证半价 + 避开人流攻略", body: "周六 10 点开门直接进，11 点后排队 30 分钟起。\n学生证记得带实体卡，电子版不认。二楼的马蒂斯别错过。", tags: ["展览", "学生半价"], author: "看展少女", avatar: "🐰", likes: 2210, ratio: 1.45, emoji: "🖼️", bg: G("#E8F5FF", "#9CC7FF") },
  { id: "g4", activityId: "a4", title: "佘山半日徒步｜新手零压力路线", body: "9 号线佘山站 → 东佘山 → 天文台 → 西佘山，3 小时。\n山上没有补给，带水！", tags: ["徒步", "新手友好"], author: "周末不宅", avatar: "🐸", likes: 642, ratio: 1.25, emoji: "⛰️", bg: G("#E3FBD0", "#8FD75B") },
  { id: "g5", activityId: "a6", title: "第一次拉坯就成功？老师教的 3 个诀窍", body: "1. 定中心时手肘抵住大腿\n2. 水不要加太多\n3. 开孔慢一点\n\n双人同行打 8 折，和室友一起去刚好。", tags: ["手作", "雨天好去处"], author: "泥巴研究所", avatar: "🐨", likes: 1532, ratio: 1.5, emoji: "🏺", bg: G("#F5EDE3", "#D4B28C") },
  { id: "g6", activityId: "a2", title: "安福路古着市集淘到 ¥30 的中古夹克", body: "砍价小技巧：下午 5 点后摊主愿意让价。\n黑胶摊在最里面，别漏了。", tags: ["市集", "古着"], author: "vintage_控", avatar: "🐱", likes: 874, ratio: 1.2, emoji: "🧥", bg: G("#FFF4D6", "#FFCF5C") },
  { id: "g7", activityId: "a12", title: "UCCA 数字展：晚上 7 点后是隐藏福利", body: "人少一半，光影效果更好，拍照不用排队。\n整个展 1 小时就能看完，适合下班/下课后去。", tags: ["展览", "夜游"], author: "光影捕手", avatar: "🐧", likes: 1790, ratio: 1.15, emoji: "🌀", bg: G("#E0E7FF", "#7F95FF") },
  { id: "g8", activityId: "a11", title: "世纪公园飞盘局：6 个人怎么玩最开心", body: "7 号门进，右手边大草坪。带野餐垫+飞盘+蓝牙音箱。\n规则简单：别让飞盘落地就行。", tags: ["运动", "组队"], author: "飞盘新手村", avatar: "🐯", likes: 540, ratio: 1.4, emoji: "🥏", bg: G("#EFFFE0", "#B2EE6B") },
  { id: "g9", activityId: "a16", title: "朱家角一日游｜避开人潮的时间表", body: "9:30 到 → 放生桥 → 课植园 → 12:30 前吃饭 → 摇橹船 → 16:00 返程。", tags: ["古镇", "一日游"], author: "江南慢游", avatar: "🐱", likes: 1105, ratio: 1.3, emoji: "🛶", bg: G("#E6FFF6", "#7FE0BC") },
  { id: "g10", activityId: "a10", title: "大剧院学生专场，80 块听《新世界》", body: "提前 3 天在公众号预约，现场出示学生证。二楼正中视野最好。着装无要求但别穿拖鞋。", tags: ["演出", "学生专场"], author: "琴房常驻", avatar: "🦊", likes: 720, ratio: 1.2, emoji: "🎻", bg: G("#EDE7FF", "#A48CFF") },
];

// 预置公开队伍（mock 用户），让组队功能有"人气感"
const SEED_SQUADS = [
  { id: "s1", activityId: "a7", host: "梧桐区遛弯人", time: "周六 下午", meetPoint: "武康大楼", cap: 4, costMode: "AA", note: "拍照互拍，i 人友好", members: ["梧桐区遛弯人", "小鹿"], createdAt: 1 },
  { id: "s2", activityId: "a11", host: "飞盘新手村", time: "周日 上午", meetPoint: "世纪公园 7 号门", cap: 6, costMode: "AA", note: "缺人！会不会玩都来", members: ["飞盘新手村", "阿杰", "Momo"], createdAt: 1 },
  { id: "s3", activityId: "a3", host: "摇滚猫", time: "周六 晚上", meetPoint: "MAO 门口", cap: 3, costMode: "AA", note: "一起冲第一排", members: ["摇滚猫"], createdAt: 1 },
  { id: "s4", activityId: "a9", host: "岩壁上的鱼", time: "周日 下午", meetPoint: "虹桥天地 B1", cap: 4, costMode: "AA", note: "凑 3 人团购价", members: ["岩壁上的鱼", "Kiki"], createdAt: 1 },
  { id: "s5", activityId: "a8", host: "吃饱再说", time: "周六 晚上", meetPoint: "云南南路路口", cap: 4, costMode: "AA", note: "吃完 5 家再散", members: ["吃饱再说", "大胃王", "阿宁"], createdAt: 1 },
];
