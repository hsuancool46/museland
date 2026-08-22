/* =========================================================================
   Museland — 設施清單 (the one place you edit to add a facility)
   -------------------------------------------------------------------------
   要開一項新設施？只做兩件事：
     1) 在下面 WORKS 陣列最前面加一筆（照著格式填）
     2) 在 /works/<你的slug>/ 放一個 index.html
   首頁的燈牆會自動長出來，不用改別的東西。

   欄位說明：
     slug      : 網址用的英文短名，也是資料夾名 works/<slug>/
     title     : 設施中文名
     subtitle  : 英文名或副標（小字）
     blurb     : 一句話描述，招牌燈牌上顯示
     color     : 這項設施的主題色（它在燈牆上發光的顏色）
     external  : （選填）若還沒整合進 repo，填外部網址；填了就外連
     isNew     : （選填）true = 掛上「剛開幕」燈牌
   ========================================================================= */

const WORKS = [
  {
    slug: "theater",
    title: "亂想劇場",
    subtitle: "The Reverie",
    blurb: "一座選集式小戲院。每一季一個獨立的世界，風格自由跳動。",
    color: "#e8b04b",
    isNew: true,
},
  {
  slug: "narrative-simulator",
  title: "感情模擬器",
  subtitle: "Ordinary Life",
  blurb: "不算你的結果，只讓你先看一個三年後的日常。",
  color: "#ff5d5d",
  isNew: true,
},
  {
    slug: "cognitive-currency",
    title: "認知貨幣",
    subtitle: "Cognitive Currency",
    blurb: "測測看你的每一天，被工作花掉多少「認知貨幣」，又換回了什麼。",
    color: "#c8ff4d",
    isNew: true,
  },

  // ↓↓↓ 下一項設施加在這裡（複製上面那塊改一改） ↓↓↓
];
