/* =========================================================================
   亂想劇場 — 片庫清單（每一部劇一筆，就改這裡 ＋ 丟一份 .md）
   -------------------------------------------------------------------------
   ※ 這裡的每一筆 = 一部劇（目前都算「第一季」；之後某部真的有第二季，再開一筆新的即可）。
   新增一部劇，只做兩件事：
     1) 把整季寫成一個 .md（每集用「# EP01｜《標題》」當開頭），放到
        works/theater/stories/<你的slug>/s1.md
     2) 在下面 SEASONS 陣列最前面加一筆，md 指到那個檔
   閱讀頁會自動用「# EP」把整季拆成一集集，並還原你的腳本排版
   （時間碼、字卡、對白、SFX、> 重點句）。集標題與內文都從 .md 自動來。

   欄位說明：
     id       : 這一季的英文短名（唯一，也是 stories/<id>/ 資料夾建議名）
     title    : 季名（中文）
     style    : 風格標籤（日本 / 韓劇 / 動畫 / 歐美影集 / 漫畫短篇…）篩選用
     motif    : 海報底一個大字（通常取季名裡一個字）
     genres   : 類型標籤（可多個）篩選用
     status   : "done" 完結 ｜ "live" 連載中 ｜ "single" 單季完
     runtime  : 每集約幾分鐘（顯示用）
     color    : 海報主色 { a, b, accent }（沒放 poster 圖時，用這個生成漸層海報；也是季內頁的底色）
     poster   : （選填）自製海報圖路徑，相對本設施，例如 "stories/studio-life/poster.jpg"
                建議直式 2:3（例如 800×1200），jpg / png / webp 都可。放了就用你的圖，
                沒放或圖讀不到 → 自動退回上面 color 生成的漸層海報，不會破版。
     logline  : 一句吊人胃口的介紹
     md       : 這季 markdown 檔路徑（相對本設施）
     episodes : 每集的「一句簡介」與狀態；標題和內文不寫在這裡，從 .md 自動抓
                  { syn: "一句簡介" }               一般（可讀）
                  { syn: "…", locked: true }         尚未放映（連載中用，還沒寫的集數）
                  { rt: "70" }                       這一集分鐘數不同（例如合併集）
                  { t: "自訂標題" }                  蓋掉 .md 章名，用你打的標題
   ========================================================================= */

const SEASONS = [
    {
    id: "small-things",
    title: "今天也有小事",
    style: "兒童動畫",
    motif: "事",
    genres: ["校園", "日常", "喜劇"],
    status: "live",                              // 先設連載中；若是完結短篇就改 "done"
    runtime: "15",
    color: { a: "#1e2620", b: "#26302a", accent: "#8fbf7a" },
    poster: "stories/small-things/poster.jpg",
    logline: "一群狗狗學生組了「生活支援社」，專門處理校園裡的小事——找失物、拆謠言、當白老鼠試吃。事情常常先被弄大，再剛剛好收好。",
    md: "stories/small-things/s1.md",
    episodes: [
      { syn: "生活支援社成立第一天，一件失物讓兩隻個性相反的狗同時入社。" },
      { syn: "小滿被謠傳能預知未來，全校排隊求問——其實他只是看得比較仔細。" },
      { syn: "「連小滿都吃完」的烤布蕾，第二天卻被他嫌，烘焙社急著找出哪裡不一樣。" },
    ],
  },

    {
    id: "readthrough",
    title: "讀本",
    style: "歐美影集",
    motif: "讀",
    genres: ["懸疑", "推理", "群像"],
    status: "live",                              // 連載中
    runtime: "58",
    color: { a: "#181a20", b: "#20222c", accent: "#b8a06a" },
    poster: "stories/readthrough/poster.jpg",
    logline: "五名演員第一次圍桌讀一部密室謀殺劇。",
    md: "stories/readthrough/s1.md",
    episodes: Array.from({ length: 2 }, () => ({})),   // 目前 EP01（連載中，每更一集就多一個 {}）
  },  
  
  {
    id: "pact",
    title: "此契非緣",
    style: "古裝",
    motif: "契",
    genres: ["仙俠", "愛情", "懸疑"],
    status: "live",                              // 連載中；全部連載完再改成 "done"
    runtime: "20",                              // 估的，實際不同再改
    color: { a: "#20222a", b: "#2a2430", accent: "#c05a5a" },
    poster: "stories/pact/poster.jpg",
    logline: "循著失蹤修士的血跡，一名劍修在秘境深處撞見正在施換命術的醫修。綁住兩人的是一紙契約，不是姻緣——可契約，有時比緣分更難解。",
    md: "stories/pact/s1.md",
    episodes: Array.from({ length: 15 }, () => ({})),   // 目前 15 章（連載中，每更一章就多一個 {}）
  },
  
  {
    id: "royal-spirits",
    title: "王室祖靈管理處",
    style: "動畫",
    motif: "靈",
    genres: ["奇幻", "喜劇", "職場"],
    status: "done",                              // 先當第一季完結；若還會續拍改成 "live"
    runtime: "24",                               // 估的，實際不同再改
    color: { a: "#12141f", b: "#1b1d30", accent: "#d0aa55" },
    poster: "stories/royal-spirits/poster.jpg",
    logline: "王國的祖先死了也不肯乖乖待著。一名只想準時下班的祖靈維護員，靠公文、程序與加班費，擺平一個又一個荒謬的王室亡者。",
    md: "stories/royal-spirits/s1.md",
    episodes: Array.from({ length: 10 }, () => ({})),   // 腳本體，10 集，標題自動從 .md 來
  },
  
  {
    id: "studio-life",
    title: "工作室日常",
    style: "深夜劇",
    motif: "室",
    genres: ["日常", "群像", "喜劇"],
    status: "done",
    runtime: 15,
    color: { a: "#20242e", b: "#2b2320", accent: "#d9b38a" },
    poster: "stories/studio-life/poster.jpg",   // ← 把你的海報圖放這個路徑；還沒放也沒關係，會自動用漸層海報頂著
    logline: "一個看起來很普通的男人，對世界有一套不太普通的使用方式。不同熟悉程度的人，慢慢發現這件事。",
    md: "stories/studio-life/s1.md",
    episodes: [
      { syn: "朋友帶新人第一次踏進這間「不知道算什麼」的工作室。" },
      { syn: "一頓失敗又重做的義大利麵，拆穿「興趣很多」其實是誤會。" },
      { syn: "一條魚、一瓶酒、一群沒約好的人，晚餐自己長了出來。" },
      { syn: "明明沒開店，人卻一個接一個出現。" },
      { syn: "他嘴上的「不會」，其實有好幾種完全不同的意思。" },
      { syn: "工作室的植物越來越多，追查源頭指向某個人。" },
      { syn: "一件他主動說「你比較會」的事，難得換他退到旁邊。" },
      { syn: "難得聽到他明確地說「不要」，比他學任何東西都稀奇。" },
      { syn: "工作室的日常，開始被外面的人看見。" },
      { syn: "一箱芒果，引發一整晚。" },
      { syn: "有人提議把這件事產品化，他卻踩了煞車。" },
      { syn: "季末。一切還是那麼普通——普通到剛剛好。" },
    ],
  },

  {
    id: "old-street",
    title: "老街最後一盞燈",
    style: "台劇",
    motif: "燈",
    genres: ["社會寫實", "家庭", "群像"],
    status: "done",
    runtime: "38–45",
    color: { a: "#141a24", b: "#1b202b", accent: "#d8b070" },
    poster: "stories/old-street/poster.jpg",
    logline: "一條即將都市更新的老街上，一名堅守程序的開發經理與反對整合的書店老闆，在協助居民做出選擇的過程中，逐漸看見每一份自由決定，都可能成為別人不得不面對的條件。",
    md: "stories/old-street/s1.md",
    // 章節體故事（.md 用「## 第一章」分章）。全 12 章，第 11、12 章合併 → 實際 11 個閱讀單元。
    // 每集可選填 { syn:"簡介", t:"自訂標題", rt:"分鐘數" }；空的 {} 就用 .md 章名、季的預設分鐘。
    episodes: [
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {},   // 第一～第十章（用季預設 38–45 分）
      { rt: "70" },                              // 第十一–第十二章（兩章合併，較長 → 70 分）
    ],
  },

  // ↓↓↓ 下一部劇加在這裡（複製上面那塊改一改，md 指到新的 .md） ↓↓↓
];
