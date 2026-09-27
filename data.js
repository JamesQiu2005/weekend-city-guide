// v0.2 数据（坐标与后端 backend/seed/places.json 一致，地理认证以它为准）：Place（地点库）+ 种子局（公开局 / 可加入的局）
// v0.1 的 Activity 按原 id 迁移为 Place，旧收藏、旧点赞可以直接对上。

const CITIES = {
  上海: { lat: 31.23, lon: 121.47, open: true },
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
const AVATARS = ["🐱", "🦊", "🐼", "🐧", "🐨", "🐸", "🐯", "🐰"];

// 上海各月气候常态（超出 16 天预报范围时显示）：[平均最高温, 降水日概率%]
const CLIMATE = [[8, 35], [10, 40], [14, 45], [20, 45], [25, 45], [28, 55], [32, 50], [32, 50], [28, 40], [23, 30], [17, 30], [11, 30]];

const G = (a, b) => `linear-gradient(145deg, ${a}, ${b})`;
const P = (id, n, credit, note) => ({ src: `img/places/${id}-${n}.webp`, credit, note });

const PLACES = [
  { id: "a1", name: "西岸美术馆 · 蓬皮杜典藏展", district: "徐汇滨江", lat: 31.1706, lon: 121.4596, category: "展览", indoor: true, avgCost: 100, openHours: "10:00–18:00（周一闭馆）", days: ["sat", "sun"], suitFor: [1, 2, 3], heat: 2310, checkinCount: 1204, emoji: "🖼️", bg: G("#E8F5FF", "#B9D8FF"), ratio: 1.25,
    photos: [P("a1", 1, "Lcsun · CC BY-SA 4.0"), P("a1", 2, "Lcsun · CC BY-SA 4.0")],
    blurb: "蓬皮杜中心典藏轮换展，40+ 件现代艺术原作。学生证半价，周六下午人最多，建议上午去。", tags: ["学生半价", "拍照出片"] },
  { id: "a2", name: "安福路 · 周末古着市集", district: "徐汇 · 安福路", lat: 31.2118, lon: 121.4455, category: "市集", indoor: false, avgCost: 0, openHours: "周六 11:00–20:00", days: ["sat"], suitFor: [2, 3, 5], heat: 1876, checkinCount: 932, emoji: "🧺", bg: G("#FFF4D6", "#FFD98A"), ratio: 1.45,
    photos: [P("a2", 1, "RunningTurtle8964 · CC0"), P("a2", 2, "Fayhoo · CC BY-SA 3.0")],
    blurb: "古着、黑胶、手作饰品。免费入场，现场有咖啡车。下雨会取消，出门前看公众号通知。", tags: ["免费", "适合逛吃"] },
  { id: "a3", name: "MAO Livehouse · 独立乐队拼盘夜", district: "黄浦 · 重庆南路", lat: 31.2105, lon: 121.4745, category: "演出", indoor: true, avgCost: 150, openHours: "周六 20:00 开演", days: ["sat"], suitFor: [2, 3, 5], heat: 1502, checkinCount: 610, emoji: "🎸", bg: G("#1B1B1B", "#4A4A4A"), ratio: 1.1,
    photos: [P("a3", 1, "Tauno Tõhk · CC BY 2.0")],
    blurb: "三支新晋独立乐队，站票 150。结束约 22:30，地铁末班车来得及。", tags: ["夜场", "站票"] },
  { id: "a4", name: "佘山国家森林公园 · 半日轻徒步", district: "松江 · 佘山", lat: 31.096, lon: 121.193, category: "徒步", indoor: false, avgCost: 30, openHours: "全天", days: ["sat", "sun"], suitFor: [2, 3, 5], heat: 980, checkinCount: 455, emoji: "🥾", bg: G("#E3FBD0", "#A8E07A"), ratio: 1.5,
    photos: [P("a4", 1, "User:Mountain · CC BY-SA 4.0"), P("a4", 2, "User:Mountain · CC BY-SA 4.0")],
    blurb: "9 号线直达，全程 6km 爬升 200m，新手友好。山顶可以看到天文台。", tags: ["地铁直达", "新手友好"] },
  { id: "a5", name: "M50 创意园 · 开放工作室日", district: "普陀 · 莫干山路", lat: 31.248, lon: 121.446, category: "展览", indoor: true, avgCost: 0, openHours: "周日 13:00–18:00", days: ["sun"], suitFor: [1, 2, 3], heat: 760, checkinCount: 388, emoji: "🎨", bg: G("#FDE7F1", "#F7B5D2"), ratio: 1.2,
    photos: [P("a5", 1, "MNXANL · CC BY-SA 4.0"), P("a5", 2, "Fabio Achilli · CC BY 2.0")],
    blurb: "20+ 艺术家工作室对外开放，能和创作者聊天。免费，室内为主。", tags: ["免费", "室内"] },
  { id: "a6", name: "愚园路陶艺 · 2 小时拉坯课", district: "静安 · 愚园路", lat: 31.2215, lon: 121.433, category: "手作", indoor: true, avgCost: 168, openHours: "14:00 / 16:30 两场", days: ["sat", "sun"], suitFor: [1, 2], heat: 1340, checkinCount: 521, emoji: "🏺", bg: G("#F5EDE3", "#DCC3A4"), ratio: 1.35,
    photos: [P("a6", 1, "Mkelly2491 · CC BY-SA 4.0", "氛围图")],
    blurb: "老师一对四，作品烧制后 3 周可取或邮寄。双人同行第二位 8 折。", tags: ["双人优惠", "雨天友好"] },
  { id: "a7", name: "武康路—衡山路 梧桐区 Citywalk", district: "徐汇 · 衡复风貌区", lat: 31.205, lon: 121.438, category: "Citywalk", indoor: false, avgCost: 0, openHours: "随时", days: ["sat", "sun"], suitFor: [1, 2, 3, 5], heat: 3120, checkinCount: 2210, emoji: "🚶", bg: G("#FFF1E0", "#FFC58F"), ratio: 1.6,
    photos: [P("a7", 1, "Suicasmo · CC0"), P("a7", 2, "Livelikerw · CC BY-SA 3.0"), P("a7", 3, "SSYoung · CC BY-SA 4.0")],
    blurb: "约 4km，武康大楼 → 巴金故居 → 衡山坊。秋天梧桐叶黄，下午光线最好。", tags: ["免费", "秋季限定"] },
  { id: "a8", name: "云南南路美食街 · 30 元吃撑路线", district: "黄浦 · 云南南路", lat: 31.2285, lon: 121.48, category: "美食探店", indoor: false, avgCost: 40, openHours: "11:00–22:00", days: ["sat", "sun"], suitFor: [2, 3, 5], heat: 2045, checkinCount: 1320, emoji: "🍜", bg: G("#FFE3DC", "#FF9F86"), ratio: 1.15,
    photos: [P("a8", 1, "Shwangtianyuan · CC BY-SA 4.0"), P("a8", 2, "Shwangtianyuan · CC BY-SA 4.0"), P("a8", 3, "Metaphox · CC BY 2.0", "小杨生煎，未必是本街门店")],
    blurb: "鲜得来排骨年糕、生煎、小馄饨。人均 40 能吃 5 家，周末晚饭点排队较长。", tags: ["学生党", "人均 40"] },
  { id: "a9", name: "虹桥室内攀岩 · 新手体验课", district: "长宁 · 虹桥", lat: 31.198, lon: 121.405, category: "运动", indoor: true, avgCost: 128, openHours: "10:00–22:00", days: ["sat", "sun"], suitFor: [2, 3, 5], heat: 870, checkinCount: 302, emoji: "🧗", bg: G("#E0F7F4", "#8DDCCF"), ratio: 1.3,
    photos: [P("a9", 1, "amrufm · CC BY 2.0", "氛围图")],
    blurb: "含装备和 1 小时教练带练，3 人以上团购价 98/人。", tags: ["团购更省", "雨天友好"] },
  { id: "a10", name: "上海大剧院 · 学生专场音乐会", district: "黄浦 · 人民广场", lat: 31.2305, lon: 121.47, category: "演出", indoor: true, avgCost: 80, openHours: "周日 19:30", days: ["sun"], suitFor: [1, 2], heat: 1120, checkinCount: 498, emoji: "🎻", bg: G("#EDE7FF", "#B9A6FF"), ratio: 1.4,
    photos: [P("a10", 1, "Coolcaesar · CC BY-SA 4.0"), P("a10", 2, "N509FZ · CC BY-SA 4.0")],
    blurb: "德沃夏克《新世界》，学生凭证 80 元，需提前 3 天预约。", tags: ["学生专场"] },
  { id: "a11", name: "世纪公园 · 草坪野餐 + 飞盘局", district: "浦东 · 世纪公园", lat: 31.215, lon: 121.548, category: "运动", indoor: false, avgCost: 10, openHours: "7:00–18:00", days: ["sat", "sun"], suitFor: [3, 5], heat: 1650, checkinCount: 870, emoji: "🥏", bg: G("#EFFFE0", "#C4F58E"), ratio: 1.2,
    photos: [P("a11", 1, "Heinz-Vale · CC BY-SA 4.0"), P("a11", 2, "Tim Sheerman-Chase · CC BY 2.0")],
    blurb: "门票 10 元，7 号门附近草坪最大。人多才好玩，适合拉群组队。", tags: ["人越多越好玩"] },
  { id: "a12", name: "UCCA Edge · 沉浸式数字艺术展", district: "静安 · 苏河湾", lat: 31.244, lon: 121.476, category: "展览", indoor: true, avgCost: 128, openHours: "10:00–21:00", days: ["sat", "sun"], suitFor: [1, 2, 3], heat: 2680, checkinCount: 1410, emoji: "🌀", bg: G("#E0E7FF", "#8FA4FF"), ratio: 1.1,
    photos: [P("a12", 1, "Miguel Discart · CC BY-SA 2.0", "氛围图")],
    blurb: "光影装置 + 声音艺术，时长约 1 小时。晚上 7 点后人少。", tags: ["雨天友好", "出片"] },
  { id: "a13", name: "上生·新所 · 周日农夫市集", district: "长宁 · 延安西路", lat: 31.213, lon: 121.42, category: "市集", indoor: false, avgCost: 0, openHours: "周日 10:00–16:00", days: ["sun"], suitFor: [1, 2, 3], heat: 1240, checkinCount: 640, emoji: "🥬", bg: G("#F2FFE6", "#B6EB7D"), ratio: 1.3,
    photos: [P("a13", 1, "WQL · CC BY-SA 4.0")],
    blurb: "有机蔬果、手工面包、咖啡。游泳池旁草坪可以坐。", tags: ["免费", "早起"] },
  { id: "a14", name: "杨浦滨江 · 日落骑行 12km", district: "杨浦滨江", lat: 31.256, lon: 121.532, category: "运动", indoor: false, avgCost: 15, openHours: "全天", days: ["sat", "sun"], suitFor: [1, 2, 3, 5], heat: 930, checkinCount: 410, emoji: "🚲", bg: G("#E0F4FF", "#8ED0FF"), ratio: 1.5,
    photos: [P("a14", 1, "Matthew Burke · CC BY-SA 4.0")],
    blurb: "共享单车即可，沿江绿道全程无车。日落时段可以看到杨浦大桥。", tags: ["日落", "低预算"] },
  { id: "a15", name: "石门一路 · 即兴喜剧开放麦", district: "静安 · 石门一路", lat: 31.2295, lon: 121.46, category: "演出", indoor: true, avgCost: 60, openHours: "周六 19:00", days: ["sat"], suitFor: [2, 3], heat: 1410, checkinCount: 560, emoji: "🎤", bg: G("#FFF7CC", "#FFE066"), ratio: 1.2,
    photos: [P("a15", 1, "PaulTheAirplane · CC BY-SA 4.0", "氛围图")],
    blurb: "10 位演员轮番上场，现场互动多。含一杯饮料。", tags: ["社交", "室内"] },
  { id: "a16", name: "朱家角古镇 · 一日游", district: "青浦 · 朱家角", lat: 31.108, lon: 121.055, category: "Citywalk", indoor: false, avgCost: 50, openHours: "全天", days: ["sat", "sun"], suitFor: [2, 3, 5], heat: 1760, checkinCount: 1030, emoji: "🛶", bg: G("#E6FFF6", "#94E8C8"), ratio: 1.35,
    photos: [P("a16", 1, "Lloyd Tudor · CC BY-SA 4.0"), P("a16", 2, "Woong Deewaa · CC BY-SA 4.0")],
    blurb: "17 号线直达，摇橹船 30 元/人，扎肉粽必吃。避开周六中午人潮。", tags: ["地铁直达", "古镇"] },
];

// ---------- 种子局 ----------
// 日期相对今天计算：已完成的局放在过去的周末，筹备中的局放在接下来的周末。
function weekendDate(weeks, day) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const wd = d.getDay(); // 0 周日 … 6 周六
  const toSat = (6 - wd + 7) % 7;
  d.setDate(d.getDate() + toSat + weeks * 7 + (day === "sun" ? 1 : 0));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 紧凑写法 → 完整 Session。checkins: [站序, 成员序, 评分, 一句话, 是否到场认证, 花费]
function seedSession(o) {
  const members = o.members.map(([name, avatar], i) => ({ uid: "seed-" + name, name, avatar, role: i ? "member" : "organizer", joinedAt: 0 }));
  const t0 = new Date(o.date + "T" + (o.stops[0][1] || "10:00") + ":00").getTime();
  const entries = [];
  let k = 0;
  const add = (e) => entries.push({ id: `${o.id}-e${k++}`, sessionId: o.id, createdAt: t0 + k * 9e5, ...e });
  (o.checkins || []).forEach(([si, mi, rating, text, verified, spend]) => {
    const m = members[mi], pl = o.stops[si][0];
    add({ type: "checkin", stopIndex: si, author: m.name, avatar: m.avatar, rating, text, verified, photo: text && mi === 0 ? PLACE_PHOTO(pl, si) : null });
    if (spend) add({ type: "spend", stopIndex: si, author: m.name, avatar: m.avatar, amount: spend, text: "" });
  });
  if (o.body) add({ type: "note", author: members[0].name, avatar: members[0].avatar, text: o.body });
  return {
    id: o.id, title: o.title, cover: o.cover || null, organizer: members[0].name, visibility: o.visibility || "public",
    date: o.date, startTime: o.stops[0][1], cap: o.cap || Math.max(members.length, 2),
    stops: o.stops.map(([placeId, time, estCost, note]) => ({ placeId, time, estCost, note: note || "" })),
    budget: { total: o.budget, perPerson: Math.round(o.budget / (o.cap || Math.max(members.length, 2))), mode: o.mode || "AA" },
    members, entries, tags: o.tags || [], likes: o.likes || 0, closed: !!o.closed, seed: true, createdAt: t0 - 3 * 864e5,
  };
}
function PLACE_PHOTO(pid, i) { const pl = PLACES.find((p) => p.id === pid); return pl.photos[i % pl.photos.length]?.src || null; }

const SEED_SESSIONS = [
  // —— 已完成的公开局（= 攻略）——
  seedSession({ id: "g1", title: "梧桐区 Citywalk｜最出片的机位 + 安福路收尾", date: weekendDate(-1, "sat"), closed: true, likes: 1284, budget: 200, cap: 2,
    stops: [["a7", "15:00", 0, "武康大楼对面街角是第一机位"], ["a2", "17:00", 60, "古着摊 5 点后可以砍价"]],
    members: [["梧桐区遛弯人", "🦊"], ["小鹿", "🐰"]],
    checkins: [[0, 0, 5, "3 点半的光打在武康大楼上，绝了", true, 0], [0, 1, 5, "", true, 0], [1, 0, 4, "淘到一件 ¥30 的中古夹克", true, 30], [1, 1, 4, "", true, 45]],
    body: "路线：武康大楼 → 巴金故居 → 衡山坊 → 安福路，全程 4km。\n机位：武康大楼对面街角、安福路 322 号门口、衡山坊红砖墙。\n穿舒服的鞋！", tags: ["上海周末", "Citywalk", "免费"] }),
  seedSession({ id: "g2", title: "云南南路 30 元吃 5 家，学生党抄作业", date: weekendDate(-1, "sun"), closed: true, likes: 986, budget: 120, cap: 3,
    stops: [["a8", "17:30", 40]],
    members: [["吃饱再说", "🐼"], ["大胃王", "🐯"], ["阿宁", "🐧"]],
    checkins: [[0, 0, 5, "排骨年糕名不虚传", true, 38], [0, 1, 4, "", true, 42], [0, 2, 4, "", false, 35]],
    body: "生煎 ¥8 → 鲜得来排骨年糕 ¥18 → 小馄饨 ¥10 → 糖水 ¥6。\n避雷：路口那家网红奶茶排队 40 分钟不值。", tags: ["学生党", "美食"] }),
  seedSession({ id: "g3", title: "西岸蓬皮杜看展 → 梧桐区散步｜学生证半价", date: weekendDate(-2, "sat"), closed: true, likes: 2210, budget: 200, cap: 2,
    stops: [["a1", "10:00", 50, "10 点开门直接进，11 点后要排队"], ["a7", "14:00", 0]],
    members: [["看展少女", "🐰"], ["Momo", "🐱"]],
    checkins: [[0, 0, 5, "二楼的马蒂斯别错过", true, 50], [0, 1, 5, "", true, 50], [1, 0, 4, "", true, 0]],
    body: "学生证记得带实体卡，电子版不认。看完展打车 15 分钟到武康路，下午光线刚好。", tags: ["展览", "学生半价"] }),
  seedSession({ id: "g4", title: "佘山半日徒步｜新手零压力路线", date: weekendDate(-2, "sun"), closed: true, likes: 642, budget: 150, cap: 4,
    stops: [["a4", "09:30", 30, "山上没有补给，带水"]],
    members: [["周末不宅", "🐸"], ["阿杰", "🐯"], ["Kiki", "🐨"]],
    checkins: [[0, 0, 5, "天文台那段台阶有点陡，但风景值", true, 25], [0, 1, 4, "", true, 25], [0, 2, 4, "", true, 25]],
    body: "9 号线佘山站 → 东佘山 → 天文台 → 西佘山，3 小时。", tags: ["徒步", "新手友好"] }),
  seedSession({ id: "g5", title: "愚园路拉坯 + 安福路逛吃｜雨天也能玩", date: weekendDate(-3, "sat"), closed: true, likes: 1532, budget: 400, cap: 2,
    stops: [["a6", "14:00", 168], ["a2", "16:30", 40]],
    members: [["泥巴研究所", "🐨"], ["小鹿", "🐰"]],
    checkins: [[0, 0, 5, "第一次拉坯就成了一个碗！", true, 168], [0, 1, 5, "", true, 134], [1, 0, 4, "", true, 36]],
    body: "拉坯诀窍：定中心时手肘抵住大腿；水不要加太多；开孔慢一点。\n双人同行第二位 8 折。", tags: ["手作", "雨天好去处"] }),
  seedSession({ id: "g7", title: "UCCA 晚场看展 → 云南南路夜宵", date: weekendDate(-3, "sun"), closed: true, likes: 1790, budget: 400, cap: 2,
    stops: [["a12", "19:00", 128, "7 点后人少一半"], ["a8", "20:30", 40]],
    members: [["光影捕手", "🐧"], ["阿宁", "🐧"]],
    checkins: [[0, 0, 5, "人少，拍照不用排队", true, 128], [0, 1, 4, "", true, 128], [1, 0, 5, "", true, 42]],
    body: "整个展 1 小时就能看完，打车 10 分钟到云南南路，夜宵正好。", tags: ["展览", "夜游"] }),
  seedSession({ id: "g9", title: "朱家角一日游｜避开人潮的时间表", date: weekendDate(-4, "sat"), closed: true, likes: 1105, budget: 300, cap: 3,
    stops: [["a16", "09:30", 80]],
    members: [["江南慢游", "🐱"], ["大胃王", "🐯"]],
    checkins: [[0, 0, 5, "摇橹船 30 一位，值", true, 85], [0, 1, 4, "", false, 70]],
    body: "9:30 到 → 放生桥 → 课植园 → 12:30 前吃饭 → 摇橹船 → 16:00 返程。", tags: ["古镇", "一日游"] }),
  seedSession({ id: "g10", title: "云南南路晚饭 → 大剧院学生专场", date: weekendDate(-4, "sun"), closed: true, likes: 720, budget: 260, cap: 2,
    stops: [["a8", "17:30", 40], ["a10", "19:30", 80, "提前 3 天在公众号预约"]],
    members: [["琴房常驻", "🦊"], ["Momo", "🐱"]],
    checkins: [[0, 0, 4, "", true, 36], [1, 0, 5, "80 块听《新世界》，二楼正中视野最好", true, 80], [1, 1, 5, "", true, 80]],
    body: "现场出示学生证。着装无要求但别穿拖鞋。", tags: ["演出", "学生专场"] }),
  seedSession({ id: "g11", title: "一日看展串烧：M50 → UCCA Edge → 夜宵", date: weekendDate(-5, "sun"), closed: true, likes: 890, budget: 600, cap: 3,
    stops: [["a5", "13:30", 0], ["a12", "16:30", 128], ["a8", "19:00", 40]],
    members: [["看展少女", "🐰"], ["光影捕手", "🐧"], ["Kiki", "🐨"]],
    checkins: [[0, 0, 5, "开放工作室日能和艺术家聊天", true, 0], [0, 1, 4, "", true, 0], [0, 2, 4, "", true, 0], [1, 0, 4, "", true, 128], [1, 1, 5, "", true, 128], [2, 2, 5, "", true, 40]],
    body: "M50 走到 UCCA Edge 沿苏州河 25 分钟，天气好的话别打车。", tags: ["展览", "一日游"] }),
  // —— 筹备中的公开局（可加入）——
  seedSession({ id: "s1", title: "周六下午梧桐区互拍局", date: weekendDate(0, "sat"), budget: 120, cap: 4,
    stops: [["a7", "15:00", 0], ["a2", "17:00", 30]], members: [["梧桐区遛弯人", "🦊"], ["小鹿", "🐰"]], body: "拍照互拍，i 人友好", tags: ["Citywalk"] }),
  seedSession({ id: "s2", title: "世纪公园飞盘局，缺人！", date: weekendDate(0, "sun"), budget: 120, cap: 6,
    stops: [["a11", "10:00", 10]], members: [["飞盘新手村", "🐯"], ["阿杰", "🐯"], ["Momo", "🐱"]], body: "会不会玩都来，带野餐垫", tags: ["运动"] }),
  seedSession({ id: "s3", title: "MAO 独立乐队夜，一起冲第一排", date: weekendDate(0, "sat"), budget: 480, cap: 3,
    stops: [["a8", "18:00", 40], ["a3", "20:00", 150]], members: [["摇滚猫", "🐱"]], body: "先吃饭再进场", tags: ["演出"] }),
  seedSession({ id: "s4", title: "攀岩新手局，凑 3 人团购价", date: weekendDate(0, "sun"), budget: 400, cap: 4,
    stops: [["a9", "14:00", 98]], members: [["岩壁上的鱼", "🐸"], ["Kiki", "🐨"]], body: "3 人以上 98/人", tags: ["运动"] }),
  seedSession({ id: "s6", title: "周日慢逛：农夫市集 → 武康路 → 西岸看展", date: weekendDate(0, "sun"), budget: 600, cap: 4,
    stops: [["a13", "10:30", 40], ["a7", "13:30", 0], ["a1", "16:00", 100]], members: [["江南慢游", "🐱"], ["阿宁", "🐧"]], body: "上午市集、下午散步，最后去西岸看展", tags: ["Citywalk", "市集"] }),
];

// ---------- 人：种子用户的资料（年龄 · 学校 · 一句话），像 Hinge 的 prompt ----------
const UNIVERSITIES = ["复旦大学", "上海交通大学", "同济大学", "华东师范大学", "上海财经大学", "上海外国语大学", "上海大学", "华东理工大学", "东华大学", "上海纽约大学", "上海戏剧学院", "上海音乐学院", "上海理工大学", "上海师范大学"];
const SEED_PROFILES = {
  梧桐区遛弯人: { age: 22, school: "同济大学", prompt: "能走路就不打车，能拐进弄堂就不走大路" },
  小鹿: { age: 20, school: "上海外国语大学", prompt: "负责拍照，也负责找好吃的" },
  吃饱再说: { age: 21, school: "上海财经大学", prompt: "人均 40 吃到撑，是一种信仰" },
  大胃王: { age: 23, school: "华东理工大学", prompt: "第五家也吃得下" },
  阿宁: { age: 20, school: "华东师范大学", prompt: "周末的计划是没有计划" },
  看展少女: { age: 21, school: "复旦大学", prompt: "一个月至少看三个展" },
  Momo: { age: 19, school: "上海纽约大学", prompt: "i 人，但很愿意跟着去" },
  周末不宅: { age: 22, school: "上海大学", prompt: "山顶的风比宿舍的空调好" },
  阿杰: { age: 24, school: "上海交通大学", prompt: "飞盘、骑车、爬山都行" },
  Kiki: { age: 20, school: "东华大学", prompt: "攀岩新手，摔得很专业" },
  泥巴研究所: { age: 23, school: "上海戏剧学院", prompt: "做了一个歪掉的碗，很满意" },
  光影捕手: { age: 22, school: "上海理工大学", prompt: "相机比手机重要" },
  江南慢游: { age: 24, school: "上海师范大学", prompt: "喜欢慢一点的周末" },
  琴房常驻: { age: 21, school: "上海音乐学院", prompt: "拉小提琴的，周日去听别人拉" },
  飞盘新手村: { age: 22, school: "同济大学", prompt: "缺人，真的缺人" },
  摇滚猫: { age: 21, school: "上海大学", prompt: "第一排或者不去" },
  岩壁上的鱼: { age: 23, school: "复旦大学", prompt: "凑够三个人就出发" },
};
