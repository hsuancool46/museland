# Museland 胡思樂園

一座裝各種奇思妙想的個人遊樂園。純靜態站，GitHub → Vercel 自動部署。

## 結構
```
index.html                  首頁（園區入口 / 招牌燈牆），由 works.js 自動生成地圖
works.js                    設施清單 —— 要加作品，改這裡（＋放頁面檔）
works/<slug>/index.html     每一項設施一頁，可各有主題
vercel.json                 部署設定（cleanUrls）
如何新增一項設施.md          擴充說明
```

## 新增作品
見「如何新增一項設施.md」。簡短版：`works.js` 加一筆 + `works/<slug>/` 放 index.html。

## 品牌接口（預留，現在不做）
- 全站色票／字體集中在 `index.html` 的 `:root` CSS 變數，要與品牌一致時改一處。
- 頁尾有一個 `data-brand-placeholder` 連結佔位，日後接品牌站用。
- 沒有任何從屬感寫死進視覺；目前是獨立站。
