-- Demo content so the public feed isn't empty. Seed users have no usable token (token_hash is not a sha256).
-- Safe to re-run: everything is INSERT OR REPLACE with fixed ids.

INSERT OR REPLACE INTO users (id, name, avatar, token_hash, created_at) VALUES
 ('u_seed_wutong', '梧桐区遛弯人', '🦊', 'seed:wutong', 1758000000000),
 ('u_seed_chibao', '吃饱再说',     '🐼', 'seed:chibao', 1758000000000),
 ('u_seed_kanzhan','看展少女',     '🐰', 'seed:kanzhan', 1758000000000),
 ('u_seed_feipan', '飞盘新手村',   '🐯', 'seed:feipan', 1758000000000),
 ('u_seed_qinfang','琴房常驻',     '🐧', 'seed:qinfang', 1758000000000),
 ('u_seed_momo',   'Momo',         '🐱', 'seed:momo', 1758000000000),
 ('u_seed_ajie',   '阿杰',         '🐸', 'seed:ajie', 1758000000000),
 ('u_seed_xiaolu', '小鹿',         '🐨', 'seed:xiaolu', 1758000000000);

-- ===== done (public) — these read as 攻略 =====
INSERT OR REPLACE INTO sessions (id, organizer_id, title, cover, date, start_time, visibility, budget_total, budget_mode, cap, closed_at, deleted_at, created_at, updated_at) VALUES
 ('s_seed_wutong', 'u_seed_wutong', '梧桐区出片路线：武康路 → 安福路市集', NULL, '2026-09-19', '14:30', 'public', 200, 'AA', 3, 1758300000000, NULL, 1758000000000, 1758300000000),
 ('s_seed_yunnan', 'u_seed_chibao', '云南路 30 元吃 5 家 + 大剧院学生专场', NULL, '2026-09-20', '17:00', 'public', 480, 'AA', 4, 1758390000000, NULL, 1758000000000, 1758390000000),
 ('s_seed_xian',   'u_seed_kanzhan','西岸蓬皮杜 → 滨江散步，一天刚好',     NULL, '2026-09-13', '10:00', 'public', 300, 'AA', 2, 1757780000000, NULL, 1757500000000, 1757780000000);

INSERT OR REPLACE INTO stops (session_id, idx, place_id, time, est_cost, note, backup_place_id) VALUES
 ('s_seed_wutong', 0, 'a7',  '14:30', 0,   '武康大楼对面街角，3 点半光线最好', 'a5'),
 ('s_seed_wutong', 1, 'a2',  '16:30', 60,  '5 点后摊主愿意让价', NULL),
 ('s_seed_yunnan', 0, 'a8',  '17:00', 40,  '小杨生煎 → 排骨年糕 → 小馄饨 → 糖水', NULL),
 ('s_seed_yunnan', 1, 'a10', '19:30', 80,  '二楼正中视野最好', NULL),
 ('s_seed_xian',   0, 'a1',  '10:00', 100, '10 点开门直接进，11 点后要排队', NULL),
 ('s_seed_xian',   1, 'a14', '15:00', 15,  '沿江往北骑，风很舒服', 'a12');

INSERT OR REPLACE INTO members (session_id, user_id, role, joined_at) VALUES
 ('s_seed_wutong','u_seed_wutong','organizer',1758000000000),('s_seed_wutong','u_seed_xiaolu','member',1758010000000),
 ('s_seed_yunnan','u_seed_chibao','organizer',1758000000000),('s_seed_yunnan','u_seed_qinfang','member',1758010000000),('s_seed_yunnan','u_seed_ajie','member',1758020000000),
 ('s_seed_xian','u_seed_kanzhan','organizer',1757500000000),('s_seed_xian','u_seed_momo','member',1757510000000);

INSERT OR REPLACE INTO entries (id, session_id, stop_idx, place_id, author_id, type, text, photo, amount, rating, verified, distance_m, created_at) VALUES
 ('e_seed_w1','s_seed_wutong',NULL,NULL,'u_seed_wutong','system','梧桐区遛弯人 开了这个局',NULL,NULL,NULL,0,NULL,1758000000000),
 ('e_seed_w2','s_seed_wutong',NULL,NULL,'u_seed_xiaolu','system','小鹿 加入了',NULL,NULL,NULL,0,NULL,1758010000000),
 ('e_seed_w3','s_seed_wutong',0,'a7','u_seed_wutong','checkin','武康大楼对面街角，下午 3 点半光线最好。全程 4km，穿舒服的鞋！',NULL,0,5,1,120,1758271800000),
 ('e_seed_w4','s_seed_wutong',0,'a7','u_seed_xiaolu','checkin','衡山坊红砖墙也很出片',NULL,0,5,1,210,1758272100000),
 ('e_seed_w5','s_seed_wutong',1,'a2','u_seed_wutong','checkin','淘到 ¥30 的中古夹克，黑胶摊在最里面别漏了',NULL,30,4,1,80,1758279600000),
 ('e_seed_w6','s_seed_wutong',1,'a2','u_seed_xiaolu','checkin','咖啡车的拿铁不错',NULL,25,4,1,150,1758280000000),
 ('e_seed_w7','s_seed_wutong',NULL,NULL,'u_seed_wutong','system','梧桐区遛弯人 收局 ✓',NULL,NULL,NULL,0,NULL,1758300000000),

 ('e_seed_y1','s_seed_yunnan',NULL,NULL,'u_seed_chibao','system','吃饱再说 开了这个局',NULL,NULL,NULL,0,NULL,1758000000000),
 ('e_seed_y2','s_seed_yunnan',0,'a8','u_seed_chibao','checkin','小杨生煎 ¥8 → 排骨年糕 ¥18 → 小馄饨 ¥10 → 糖水 ¥6。避雷：路口网红奶茶排队 40 分钟不值',NULL,42,5,1,60,1758359000000),
 ('e_seed_y3','s_seed_yunnan',0,'a8','u_seed_ajie','checkin','吃撑了',NULL,38,4,1,90,1758359300000),
 ('e_seed_y4','s_seed_yunnan',0,'a8','u_seed_qinfang','checkin',NULL,NULL,40,5,0,NULL,1758359400000),
 ('e_seed_y5','s_seed_yunnan',1,'a10','u_seed_qinfang','checkin','80 块听《新世界》，第二乐章圆号独奏太美了。提前 3 天公众号预约',NULL,80,5,1,40,1758368000000),
 ('e_seed_y6','s_seed_yunnan',1,'a10','u_seed_chibao','checkin','第一次听交响乐现场，被震住',NULL,80,5,1,55,1758368100000),
 ('e_seed_y7','s_seed_yunnan',NULL,NULL,'u_seed_chibao','system','吃饱再说 收局 ✓',NULL,NULL,NULL,0,NULL,1758390000000),

 ('e_seed_x1','s_seed_xian',NULL,NULL,'u_seed_kanzhan','system','看展少女 开了这个局',NULL,NULL,NULL,0,NULL,1757500000000),
 ('e_seed_x2','s_seed_xian',0,'a1','u_seed_kanzhan','checkin','学生证记得带实体卡，电子版不认。二楼的马蒂斯别错过',NULL,50,5,1,70,1757728800000),
 ('e_seed_x3','s_seed_xian',0,'a1','u_seed_momo','checkin',NULL,NULL,50,4,1,130,1757729000000),
 ('e_seed_x4','s_seed_xian',NULL,NULL,'u_seed_kanzhan','system','看展少女 第 2 站预报有雨，已设室内备选 UCCA Edge；当天没下，照原计划骑车',NULL,NULL,NULL,0,NULL,1757740000000),
 ('e_seed_x5','s_seed_xian',1,'a14','u_seed_kanzhan','checkin','沿江往北骑，风很舒服',NULL,15,5,1,300,1757750000000),
 ('e_seed_x6','s_seed_xian',NULL,NULL,'u_seed_kanzhan','system','看展少女 收局 ✓',NULL,NULL,NULL,0,NULL,1757780000000);

-- ===== open (public, upcoming 国庆 weekend) — joinable =====
INSERT OR REPLACE INTO sessions (id, organizer_id, title, cover, date, start_time, visibility, budget_total, budget_mode, cap, closed_at, deleted_at, created_at, updated_at) VALUES
 ('s_seed_feipan', 'u_seed_feipan', '世纪公园飞盘局，缺人！会不会玩都来', NULL, '2026-10-04', '10:00', 'public', 180, 'AA', 6, NULL, NULL, 1758900000000, 1758950000000),
 ('s_seed_artday', 'u_seed_kanzhan','苏河湾看展日：UCCA Edge → M50',       NULL, '2026-10-03', '11:00', 'public', 400, 'AA', 4, NULL, NULL, 1758900000000, 1758940000000),
 ('s_seed_she',    'u_seed_momo',   '佘山半日徒步 + 朱家角晚饭',            NULL, '2026-10-05', '08:30', 'public', 400, 'AA', 5, NULL, NULL, 1758900000000, 1758930000000);

INSERT OR REPLACE INTO stops (session_id, idx, place_id, time, est_cost, note, backup_place_id) VALUES
 ('s_seed_feipan', 0, 'a11', '10:00', 10,  '7 号门进，右手边大草坪。带野餐垫', 'a9'),
 ('s_seed_artday', 0, 'a12', '11:00', 128, '晚上 7 点后人少一半，但我们白天去', NULL),
 ('s_seed_artday', 1, 'a5',  '15:00', 0,   '开放工作室日，免费', NULL),
 ('s_seed_she',    0, 'a4',  '08:30', 30,  '9 号线佘山站集合，山上没补给，带水', 'a9'),
 ('s_seed_she',    1, 'a16', '15:00', 50,  '放生桥 → 摇橹船', NULL);

INSERT OR REPLACE INTO members (session_id, user_id, role, joined_at) VALUES
 ('s_seed_feipan','u_seed_feipan','organizer',1758900000000),('s_seed_feipan','u_seed_ajie','member',1758920000000),('s_seed_feipan','u_seed_momo','member',1758950000000),
 ('s_seed_artday','u_seed_kanzhan','organizer',1758900000000),('s_seed_artday','u_seed_xiaolu','member',1758940000000),
 ('s_seed_she','u_seed_momo','organizer',1758900000000);

INSERT OR REPLACE INTO entries (id, session_id, stop_idx, place_id, author_id, type, text, photo, amount, rating, verified, distance_m, created_at) VALUES
 ('e_seed_f1','s_seed_feipan',NULL,NULL,'u_seed_feipan','system','飞盘新手村 开了这个局',NULL,NULL,NULL,0,NULL,1758900000000),
 ('e_seed_f2','s_seed_feipan',NULL,NULL,'u_seed_ajie','system','阿杰 加入了',NULL,NULL,NULL,0,NULL,1758920000000),
 ('e_seed_f3','s_seed_feipan',NULL,NULL,'u_seed_momo','system','Momo 加入了',NULL,NULL,NULL,0,NULL,1758950000000),
 ('e_seed_f4','s_seed_feipan',NULL,NULL,'u_seed_feipan','note','规则简单：别让飞盘落地就行。我带蓝牙音箱',NULL,NULL,NULL,0,NULL,1758951000000),
 ('e_seed_a1','s_seed_artday',NULL,NULL,'u_seed_kanzhan','system','看展少女 开了这个局',NULL,NULL,NULL,0,NULL,1758900000000),
 ('e_seed_a2','s_seed_artday',NULL,NULL,'u_seed_xiaolu','system','小鹿 加入了',NULL,NULL,NULL,0,NULL,1758940000000),
 ('e_seed_h1','s_seed_she',NULL,NULL,'u_seed_momo','system','Momo 开了这个局',NULL,NULL,NULL,0,NULL,1758900000000);
