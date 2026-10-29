/* 翻書架 Shelf Swipe
   一次一張書卡：右滑想讀、左滑略過。
   書庫從 books-pool-120.json 讀進來，開場答題後挑 40 本發牌；JSON 裡的文字一律當資料，只用 textContent 寫入。 */
(function () {
  "use strict";

  // 書庫 120 本；開場先答題，再依答案從書庫加權挑 40 本發成一副牌
  var POOL_URL = "books-pool-120.json";
  var DECK_KEY = "museland.shelf-swipe.deck"; // 這一副牌：答題結果、40 本的順序、每本的決定
  var DECK_SIZE = 40;
  var CORE_SHARE = 0.7; // 約七成來自選的主題，其餘三成混入其他類型
  var poolBooks = [];
  var poolById = {};
  var themeLabel = {}; // 主題 id -> 中文名稱
  var answers = null; // { themes: [...], style, lang, length }
  var SWIPE_THRESHOLD = 90; // px，超過才算決定
  var FLY_MS = 320;
  var STAMP_HOLD_MS = 280; // 按鈕／鍵盤：印章壓下後停多久再飛出
  var STACK_DEPTH = 3; // 最上面一張 + 後面兩張

  // 只有這些主機（且必須是 https:）才會產生書店連結
  var ALLOWED_HOSTS = [
    "books.com.tw",
    "www.books.com.tw",
    "goodreads.com",
    "www.goodreads.com",
    "www.sanmin.com.tw"
  ];

  var books = [];
  var bookById = {};
  var indexById = {};
  var state = { decisions: {}, history: [] };
  var currentView = "deck";
  var busy = false; // 卡片飛出中，暫停其他決定
  var cardEls = {}; // id -> 已建好的卡片元素（讓牌堆遞補時能有過場）
  var stackHeightDirty = true; // 牌堆高度需要重量（初次載入、視窗變寬變窄）
  var lastWidth = window.innerWidth;
  var resizeTimer = null;

  var reduceMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  function prefersReducedMotion() {
    return !!(reduceMotionQuery && reduceMotionQuery.matches);
  }

  function $(id) {
    return document.getElementById(id);
  }

  /* ---------- 日間／夜間：預設跟系統，手動切換後記住（獨立的 key，不動翻卡紀錄） ---------- */

  var THEME_KEY = "museland.shelf-swipe.theme";
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function savedTheme() {
    try {
      var value = window.localStorage.getItem(THEME_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (e) {
      return null;
    }
  }

  function isDark() {
    var forced = document.documentElement.getAttribute("data-theme");
    if (forced) return forced === "dark";
    return !!(darkQuery && darkQuery.matches);
  }

  function syncThemeButton() {
    var button = $("theme-toggle");
    if (button) button.setAttribute("aria-pressed", isDark() ? "true" : "false");
  }

  function applyTheme(theme) {
    if (theme) {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    syncThemeButton();
  }

  function toggleTheme() {
    var next = isDark() ? "light" : "dark";
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      // 不能保存就只切這一次
    }
  }

  applyTheme(savedTheme()); // 盡早套用，減少閃一下

  /* ---------- 小工具：安全地建 DOM ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function asText(value) {
    if (value === undefined || value === null) return "";
    return String(value);
  }

  function safeBookUrl(raw) {
    if (typeof raw !== "string" || raw === "") return null;
    var parsed;
    try {
      parsed = new URL(raw);
    } catch (e) {
      return null;
    }
    if (parsed.protocol !== "https:") return null;
    if (parsed.username !== "" || parsed.password !== "" || parsed.port !== "") return null;
    if (ALLOWED_HOSTS.indexOf(parsed.hostname) === -1) return null;
    return parsed.href;
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /* ---------- 保存（localStorage，每次讀寫都包 try/catch） ---------- */

  // 讀出上次那副牌；書庫裡找不到的書、格式不對的資料一律丟掉
  function loadSavedDeck() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(DECK_KEY);
    } catch (e) {
      raw = null;
    }
    if (!raw) return null;
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.ids)) return null;
    var ids = parsed.ids.filter(function (id, i) {
      return typeof id === "string" && poolById.hasOwnProperty(id) && parsed.ids.indexOf(id) === i;
    });
    var a = normaliseAnswers(parsed.answers);
    if (ids.length === 0 || !a) return null;
    return { ids: ids, answers: a, saved: parsed };
  }

  function loadState(parsed) {
    if (!parsed || typeof parsed !== "object") return;

    var decisions = {};
    var savedDecisions = parsed.decisions;
    if (savedDecisions && typeof savedDecisions === "object") {
      Object.keys(savedDecisions).forEach(function (id) {
        var value = savedDecisions[id];
        if (bookById.hasOwnProperty(id) && (value === "yes" || value === "no")) {
          decisions[id] = value;
        }
      });
    }

    var history = [];
    if (Array.isArray(parsed.history)) {
      parsed.history.forEach(function (id) {
        if (typeof id === "string" && decisions.hasOwnProperty(id) && history.indexOf(id) === -1) {
          history.push(id);
        }
      });
    }

    state.decisions = decisions;
    state.history = history;
  }

  function saveState() {
    try {
      window.localStorage.setItem(
        DECK_KEY,
        JSON.stringify({
          answers: answers,
          ids: books.map(function (b) {
            return b.id;
          }),
          decisions: state.decisions,
          history: state.history
        })
      );
    } catch (e) {
      // localStorage 不能用：照樣可以翻，只是不保存
    }
  }

  /* ---------- 狀態查詢 ---------- */

  function undecidedBooks() {
    return books.filter(function (b) {
      return !state.decisions.hasOwnProperty(b.id);
    });
  }

  function booksWith(decision) {
    return books.filter(function (b) {
      return state.decisions[b.id] === decision;
    });
  }

  function decidedCount() {
    return books.length - undecidedBooks().length;
  }

  /* ---------- 卡片 ---------- */

  function buildCard(book) {
    var isEnglish = book.lang === "EN";
    var card = el("article", "card " + (isEnglish ? "card-en" : "card-zh"));
    card.setAttribute("data-id", book.id);

    var stampYes = buildStamp("stamp stamp-yes", "想讀");
    var stampNo = buildStamp("stamp stamp-no", "略過");

    // 1. 上緣：語言＋頁數／探索或流水號
    var top = el("div", "card-top");
    var meta = el("p", "card-meta");
    meta.appendChild(el("span", "card-lang", isEnglish ? "EN" : "中文"));
    if (typeof book.pages === "number" && isFinite(book.pages)) {
      meta.appendChild(el("span", "card-pages", book.pages + " 頁"));
    }
    top.appendChild(meta);

    if (isExplore(book)) {
      var badge = el("span", "card-explore", "探索");
      badge.title = "你選的主題以外，混進來的其他類型";
      top.appendChild(badge);
    } else {
      top.appendChild(el("span", "card-serial", "No. " + pad2(indexById[book.id] + 1)));
    }

    // 2. 書名
    var title = el("h2", "card-title", book.title);
    title.lang = isEnglish ? "en" : "zh-Hant";

    // 3. 作者（＋中譯書名）
    var authorLine = asText(book.author);
    if (book.zhTitle) authorLine += "・中譯《" + asText(book.zhTitle) + "》";
    var author = el("p", "card-author", authorLine);

    // 內容提醒（例如涉及自殺議題）
    var note = book.note ? el("p", "card-note", book.note) : null;

    // 4. 鉤子
    var hook = el("p", "card-hook", book.hook);

    // 5. 為什麼值得一讀
    var why = el("div", "card-why");
    why.appendChild(el("p", "card-why-label", "為什麼值得一讀"));
    why.appendChild(el("p", "card-why-text", book.why));

    // 6. 標籤
    var tags = el("ul", "card-tags");
    tags.setAttribute("aria-label", "標籤");
    (Array.isArray(book.tags) ? book.tags : []).forEach(function (tag) {
      tags.appendChild(el("li", "card-tag", tag));
    });

    var hole = el("span", "card-hole");
    hole.setAttribute("aria-hidden", "true");

    card.appendChild(stampYes);
    card.appendChild(stampNo);
    card.appendChild(top);
    card.appendChild(title);
    card.appendChild(author);
    if (note) card.appendChild(note);
    card.appendChild(hook);
    card.appendChild(why);
    card.appendChild(tags);
    card.appendChild(hole);

    card.addEventListener("pointerdown", onPointerDown);
    return card;
  }

  // 印章下方的日期：像借書卡的到期章，只是顯示，不存檔
  function stampDate() {
    var now = new Date();
    return now.getFullYear() + "·" + pad2(now.getMonth() + 1) + "·" + pad2(now.getDate());
  }

  function buildStamp(className, word) {
    var stamp = el("span", className, word);
    stamp.appendChild(el("small", "stamp-date", stampDate()));
    stamp.setAttribute("aria-hidden", "true");
    return stamp;
  }

  function setDrag(card, dx) {
    var reduced = prefersReducedMotion();
    var rotate = reduced ? 0 : dx / 28; // 微微旋轉
    card.style.transform = "translateX(" + dx + "px) rotate(" + rotate + "deg)";
    var strength = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    var armed = Math.abs(dx) >= SWIPE_THRESHOLD;
    // 門檻前印章只淡淡浮現（最多 0.4），跨過門檻由 .armed-* 接手上滿墨
    card.style.setProperty("--stamp-yes", dx > 0 ? String(strength * 0.4) : "0");
    card.style.setProperty("--stamp-no", dx < 0 ? String(strength * 0.4) : "0");
    card.classList.toggle("armed-yes", armed && dx > 0);
    card.classList.toggle("armed-no", armed && dx < 0);
    // 後面那張卡跟著往前
    if (!reduced) $("stack").style.setProperty("--pull", String(strength * 0.7));
  }

  function clearDrag(card) {
    card.style.transform = "";
    card.style.removeProperty("--stamp-yes");
    card.style.removeProperty("--stamp-no");
    card.classList.remove("armed-yes", "armed-no");
  }

  function clearPull() {
    var stack = $("stack");
    stack.classList.remove("is-pulling");
    stack.style.removeProperty("--pull");
  }

  function renderStack() {
    var stack = $("stack");
    var upcoming = undecidedBooks().slice(0, STACK_DEPTH);
    var keep = {};
    clearPull();

    upcoming.forEach(function (book, position) {
      keep[book.id] = true;
      var card = cardEls[book.id];
      if (!card) {
        card = buildCard(book);
        cardEls[book.id] = card;
        // 補進後排的卡淡入；最上面那張的進場由載入（整疊淡入）或復原（飛回）處理，
        // 不單獨淡入，否則半透明時會透出後面卡片的字
        if (position > 0) card.classList.add("is-entering");
      }
      card.classList.remove("pos-0", "pos-1", "pos-2", "is-flying", "fly-left", "fly-right", "is-dragging", "armed-yes", "armed-no");
      card.classList.add("pos-" + position);
      clearDrag(card);
      var isTop = position === 0;
      card.setAttribute("aria-hidden", isTop ? "false" : "true");
      card.inert = !isTop;
      if (card.parentNode !== stack) stack.appendChild(card);
    });

    Object.keys(cardEls).forEach(function (id) {
      if (!keep[id]) {
        var old = cardEls[id];
        if (old.parentNode) old.parentNode.removeChild(old);
        delete cardEls[id];
      }
    });

    // 讓新進牌堆的卡片下一格畫面再淡入
    window.requestAnimationFrame(function () {
      upcoming.forEach(function (book) {
        var card = cardEls[book.id];
        if (card) card.classList.remove("is-entering");
      });
    });
  }

  function topCard() {
    var next = undecidedBooks()[0];
    return next ? cardEls[next.id] || null : null;
  }

  /* ---------- 牌堆高度：固定成這一批最高的那張卡，按鈕才不會跟著跳 ---------- */

  function measureStackHeight() {
    var stack = $("stack");
    if (stack.hidden || stack.offsetWidth === 0) return; // 看不到時量不準，等下次顯示再量

    var probe = el("div", "stack-probe");
    probe.setAttribute("aria-hidden", "true");
    probe.inert = true;
    books.forEach(function (book) {
      probe.appendChild(buildCard(book));
    });
    stack.appendChild(probe);

    var tallest = 0;
    Array.prototype.forEach.call(probe.children, function (card) {
      tallest = Math.max(tallest, card.offsetHeight);
    });
    stack.removeChild(probe);

    if (tallest > 0) {
      stack.style.setProperty("--card-height", tallest + "px");
      stackHeightDirty = false;
    }
  }

  function onResize() {
    // 手機捲動時網址列伸縮也會觸發 resize，只有寬度變了才需要重量
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      stackHeightDirty = true;
      measureStackHeight();
      layoutPile(chosenIds()); // 書堆依新的寬度重排
    }, 150);
  }

  /* ---------- 決定與復原 ---------- */

  // 給螢幕閱讀器的播報：剛才發生了什麼、下一張是哪本
  function announce(message) {
    $("announce").textContent = message;
  }

  function nextCardNote() {
    var next = undecidedBooks()[0];
    return next ? "下一張：" + asText(next.title) : "這一批翻完了";
  }

  function commitDecision(id, decision) {
    state.decisions[id] = decision;
    var at = state.history.indexOf(id);
    if (at !== -1) state.history.splice(at, 1);
    state.history.push(id);
    saveState();
    render();
    var title = asText(bookById[id].title);
    announce((decision === "yes" ? "已放進想讀：" : "已略過：") + title + "。" + nextCardNote());
  }

  function decide(decision) {
    if (busy) return;
    var next = undecidedBooks()[0];
    if (!next) return;
    var card = cardEls[next.id];

    if (!card || prefersReducedMotion()) {
      commitDecision(next.id, decision);
      return;
    }

    busy = true;
    // 拖過門檻放開時印章早已壓下；按鈕或鍵盤則先蓋章、停一下，讓人看到印章再飛走
    var alreadyStamped = card.classList.contains("armed-" + decision);
    card.classList.remove("is-dragging", "armed-yes", "armed-no");
    card.classList.add("armed-" + decision);
    // 後卡在蓋章、飛出的同時補到最前面的位置
    $("stack").classList.remove("is-pulling");
    $("stack").style.setProperty("--pull", "1");

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      card.removeEventListener("transitionend", onEnd);
      busy = false;
      commitDecision(next.id, decision);
    }
    function onEnd(event) {
      if (event.target === card && event.propertyName === "transform") finish();
    }
    function flyOut() {
      card.classList.add("is-flying", decision === "yes" ? "fly-right" : "fly-left");
      card.style.transform = "";
      card.addEventListener("transitionend", onEnd);
      window.setTimeout(finish, FLY_MS + 120); // 保險：沒收到 transitionend 也會完成
    }
    if (alreadyStamped) {
      flyOut();
    } else {
      window.setTimeout(flyOut, STAMP_HOLD_MS);
    }
  }

  function undo() {
    if (busy || state.history.length === 0) return;
    var id = state.history.pop();
    var decision = state.decisions[id];
    delete state.decisions[id];
    saveState();
    render();
    announce("已復原：" + asText(bookById[id].title) + "，回到牌堆最上面");
    if (currentView === "deck") flyBack(cardEls[id], decision);
  }

  // 復原的卡從它離開的那一側飛回來（想讀從右、略過從左）
  function flyBack(card, decision) {
    if (!card || prefersReducedMotion()) return;
    var side = decision === "yes" ? 1 : -1;
    card.classList.add("is-dragging"); // 先關掉過場，直接放到畫面外
    card.style.transform =
      "translateX(" + side * Math.round(card.offsetWidth * 1.2) + "px) rotate(" + side * 18 + "deg)";
    card.style.opacity = "0";
    void card.offsetWidth; // 讓瀏覽器先畫出起點
    card.classList.remove("is-dragging");
    card.classList.add("is-returning");
    card.style.transform = "";
    card.style.opacity = "";

    function done() {
      card.classList.remove("is-returning");
      card.removeEventListener("transitionend", onEnd);
    }
    function onEnd(event) {
      if (event.target === card && event.propertyName === "transform") done();
    }
    card.addEventListener("transitionend", onEnd);
    window.setTimeout(done, 500);
  }

  function moveTo(id, decision) {
    if (!state.decisions.hasOwnProperty(id)) return;
    state.decisions[id] = decision;
    saveState();
    render();
    announce((decision === "yes" ? "已移到想讀：" : "已移到略過：") + asText(bookById[id].title));
  }

  /* ---------- 拖曳 ---------- */

  var drag = null;

  function onPointerDown(event) {
    var card = event.currentTarget;
    if (busy || card !== topCard()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag = { card: card, pointerId: event.pointerId, startX: event.clientX, dx: 0 };
    card.classList.add("is-dragging");
    $("stack").classList.add("is-pulling");
    try {
      card.setPointerCapture(event.pointerId);
    } catch (e) {
      // 部分瀏覽器可能不支援，拖曳仍以 move 事件為主
    }
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", onPointerUp);
    card.addEventListener("pointercancel", onPointerCancel);
  }

  function endDragListeners(card) {
    card.removeEventListener("pointermove", onPointerMove);
    card.removeEventListener("pointerup", onPointerUp);
    card.removeEventListener("pointercancel", onPointerCancel);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.dx = event.clientX - drag.startX;
    setDrag(drag.card, drag.dx);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    var card = drag.card;
    var dx = event.clientX - drag.startX;
    endDragListeners(card);
    drag = null;

    if (dx > SWIPE_THRESHOLD) {
      decide("yes");
    } else if (dx < -SWIPE_THRESHOLD) {
      decide("no");
    } else {
      snapBack(card);
    }
  }

  function onPointerCancel(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    var card = drag.card;
    endDragListeners(card);
    drag = null;
    snapBack(card);
  }

  function snapBack(card) {
    card.classList.remove("is-dragging");
    clearDrag(card);
    clearPull();
  }

  /* ---------- 翻卡紀錄 ---------- */

  function buildRecord() {
    var yes = booksWith("yes");
    var no = booksWith("no");
    var lines = [];
    lines.push("【翻書架 紀錄】主題：" + chosenThemeText() + "｜已翻 " + decidedCount() + "/" + books.length);
    lines.push("想讀（" + yes.length + "）：");
    yes.forEach(function (b) {
      lines.push(recordLine(b));
    });
    lines.push("略過（" + no.length + "）：");
    no.forEach(function (b) {
      lines.push(recordLine(b));
    });
    return lines.join("\n");
  }

  function recordLine(book) {
    var line = "- " + asText(book.title) + "（" + asText(book.author) + "）";
    if (isExplore(book)) line += "［探索］";
    return line;
  }

  /* ---------- 推薦提示：整理成一段話，讓使用者貼到自己的 AI 對話（本站不呼叫任何 AI） ---------- */

  function buildPrompt() {
    var yes = booksWith("yes");
    var no = booksWith("no");
    var lines = [];
    lines.push("我在「翻書架」翻了一副書卡（我選的主題：" + chosenThemeText() + "；偏好：" + preferenceText() + "），以下是我的選擇。");
    lines.push("請根據我想讀和略過的書，推薦 5 本我可能會喜歡、但不在下面清單裡的書。");
    lines.push("每本請附：書名、作者、一句話說明為什麼適合我，以及它最像我清單裡的哪一本。有中譯本的請附繁體中文書名。");
    lines.push("");
    lines.push("想讀（" + yes.length + "）：");
    yes.forEach(function (b) {
      var line = "- " + asText(b.title) + "（" + asText(b.author) + "）";
      if (b.hook) line += "：" + asText(b.hook);
      if (Array.isArray(b.tags) && b.tags.length) line += "［" + b.tags.map(asText).join("、") + "］";
      lines.push(line);
    });
    lines.push("");
    lines.push("略過（" + no.length + "）：");
    no.forEach(function (b) {
      lines.push("- " + asText(b.title) + "（" + asText(b.author) + "）");
    });
    return lines.join("\n");
  }

  function copyRecord(prefix) {
    copyText(prefix + "-copy", buildRecord(), "已複製翻卡紀錄");
  }

  function copyPrompt(prefix) {
    copyText(prefix + "-prompt", buildPrompt(), "已複製推薦提示，貼到你常用的 AI 對話就行");
  }

  // ids：{base}-status、{base}-fallback、{base}-text
  function copyText(base, text, doneMessage) {
    var status = $(base + "-status");
    var fallback = $(base + "-fallback");
    var area = $(base + "-text");

    function showFallback() {
      status.textContent = "";
      area.value = text;
      fallback.hidden = false;
      area.focus();
      area.select();
    }

    fallback.hidden = true;
    status.textContent = "";

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      showFallback();
      return;
    }
    navigator.clipboard.writeText(text).then(
      function () {
        status.textContent = doneMessage;
      },
      showFallback
    );
  }

  /* ---------- 清單 ---------- */

  function buildListItem(book, decision) {
    var item = el("li", "entry");
    // 左欄：對應卡片的流水號，像借閱登記簿
    var serial = el("span", "entry-no", pad2(indexById[book.id] + 1));
    serial.setAttribute("aria-hidden", "true");
    var body = el("div", "entry-body");

    var title = el("h3", "entry-title", book.title);
    title.lang = book.lang === "EN" ? "en" : "zh-Hant";
    if (book.lang === "EN") title.classList.add("entry-title-en");

    var authorText = asText(book.author);
    if (isExplore(book)) authorText += "・探索";
    var author = el("p", "entry-author", authorText);

    var hook = el("p", "entry-hook", book.hook);

    var footer = el("div", "entry-footer");
    var links = el("p", "entry-links");
    var mainUrl = safeBookUrl(book.url);
    if (mainUrl) {
      links.appendChild(makeLink(mainUrl, asText(book.urlLabel) || "書店"));
    }
    var zhUrl = safeBookUrl(book.zhUrl);
    if (zhUrl) {
      links.appendChild(makeLink(zhUrl, "中譯本"));
    }
    footer.appendChild(links);

    var move = el("button", "btn btn-line btn-small", decision === "yes" ? "移到略過" : "移到想讀");
    move.type = "button";
    move.addEventListener("click", function () {
      moveTo(book.id, decision === "yes" ? "no" : "yes");
      // 清單重畫後原按鈕已不在，把焦點放回目前分頁的按鈕
      $("tab-" + decision).focus();
    });
    footer.appendChild(move);

    body.appendChild(title);
    body.appendChild(author);
    body.appendChild(hook);
    body.appendChild(footer);
    item.appendChild(serial);
    item.appendChild(body);
    return item;
  }

  function makeLink(href, label) {
    var a = el("a", "entry-link", label);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function renderList(decision) {
    var list = $("list-" + decision);
    var items = booksWith(decision);
    while (list.firstChild) list.removeChild(list.firstChild);
    items.forEach(function (book) {
      list.appendChild(buildListItem(book, decision));
    });
    $("empty-" + decision).hidden = items.length > 0;
    $("ledger-head-" + decision).hidden = items.length === 0;
  }

  /* ---------- 整體畫面 ---------- */

  function render() {
    var total = books.length;
    var done = decidedCount();
    var yesCount = booksWith("yes").length;
    var noCount = booksWith("no").length;
    var finished = total > 0 && done === total;

    $("progress-count").textContent = String(done);
    $("progress-total").textContent = String(total);
    var track = $("progress-track");
    track.setAttribute("aria-valuemax", String(total));
    track.setAttribute("aria-valuenow", String(done));
    $("progress-fill").style.transform = "scaleX(" + (total ? done / total : 0) + ")";

    $("tab-yes").textContent = "想讀 (" + yesCount + ")";
    $("tab-no").textContent = "略過 (" + noCount + ")";

    var wasFinished = !$("finish").hidden;
    $("stack").hidden = finished;
    $("finish").hidden = !finished;
    setFinishTitle(yesCount);
    $("tally-yes").textContent = String(yesCount);
    $("tally-no").textContent = String(noCount);
    $("btn-skip").hidden = finished;
    $("btn-want").hidden = finished;
    $("hint").hidden = finished;
    $("btn-undo").disabled = state.history.length === 0;

    renderStack();
    if (stackHeightDirty) measureStackHeight();
    renderList("yes");
    renderList("no");
    renderPile();

    if (finished && !wasFinished && currentView === "deck") {
      ["finish-copy", "finish-prompt"].forEach(function (base) {
        $(base + "-fallback").hidden = true;
        $(base + "-status").textContent = "";
      });
      $("finish-title").focus();
    }
  }

  /* ---------- 想讀書堆：每放一本想讀，就有一本書平放落下、往上疊；
     疊到第 20 本時整落倒下，散成一地互相交疊，之後的書落在那一堆上 ---------- */

  var PILE_TOPPLE = 20;
  var pileEls = {}; // id -> 書
  var pileShapes = {}; // id -> 寬、厚、幾個固定的亂數（同一本書每次位置都一樣）
  var pileReady = false; // 第一次畫（含重新整理後還原）不做落下動畫
  var pileDirty = false; // 看不到時量不到寬度，等下次顯示再排

  // 用書的 id 當種子的亂數：重新整理後書堆長得一樣
  function seededRandom(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    var seed = ((hash >>> 0) % 2147483646) + 1;
    return function () {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
  }

  function buildPileBook(id) {
    var random = seededRandom("pile:" + id);
    pileShapes[id] = {
      w: Math.round(96 + random() * 44),
      h: Math.round(9 + random() * 5),
      sway: random(), // 左右錯位／散開的位置
      tilt: random(), // 旋轉
      lift: random() // 散開時被壓在多高
    };
    // 書上不寫字：一半露書脊（整塊色），一半露書口（米白紙頁）
    var bookEl = el("span", "pile-book c" + ((indexById[id] % 5) + 1) + (random() < 0.45 ? " is-fore" : ""));
    bookEl.addEventListener("animationend", function () {
      bookEl.classList.remove("is-dropping");
    });
    return bookEl;
  }

  function layoutPile(ids) {
    var area = $("pile");
    var width = area.clientWidth;
    var height = area.clientHeight;
    if (!width) {
      pileDirty = true;
      return;
    }
    pileDirty = false;
    var floor = height - 14;
    var scale = width < 420 ? 0.85 : 1;
    var count = ids.length;
    var y = floor;

    ids.forEach(function (id, i) {
      var shape = pileShapes[id];
      var w = Math.round(shape.w * scale);
      var x, top, rotate;
      if (count < PILE_TOPPLE) {
        // 疊成一落，每本微微錯開
        y -= shape.h;
        x = width / 2 - w / 2 + (shape.sway - 0.5) * 14;
        top = y;
        rotate = (shape.tilt - 0.5) * 3;
      } else {
        // 倒成一地：越多散得越開，中間壓得比較高
        var spread = Math.min(width - 40, 120 + count * 5 * scale);
        var center = 1 - Math.abs(shape.sway - 0.5) * 1.6;
        x = width / 2 - w / 2 + (shape.sway - 0.5) * spread;
        top = floor - shape.h - shape.lift * shape.lift * Math.min(70, 20 + count * 1.6) * center;
        rotate = (shape.tilt - 0.5) * 50;
      }
      var bookEl = pileEls[id];
      bookEl.style.left = Math.round(x) + "px";
      bookEl.style.top = Math.round(top) + "px";
      bookEl.style.width = w + "px";
      bookEl.style.height = shape.h + "px";
      bookEl.style.rotate = rotate.toFixed(1) + "deg";
      bookEl.style.zIndex = String(i + 1);
    });
  }

  function chosenIds() {
    return state.history.filter(function (id) {
      return state.decisions[id] === "yes";
    });
  }

  function renderPile() {
    var area = $("pile");
    var ids = chosenIds();
    var keep = {};
    var still = !pileReady || prefersReducedMotion();
    area.classList.toggle("is-still", still); // 第一次畫不做位移過場
    ids.forEach(function (id) {
      keep[id] = true;
      if (!pileEls[id]) {
        pileEls[id] = buildPileBook(id);
        if (!still) pileEls[id].classList.add("is-dropping");
        area.appendChild(pileEls[id]);
      }
    });
    Object.keys(pileEls).forEach(function (id) {
      if (!keep[id]) {
        var old = pileEls[id];
        if (old.parentNode) old.parentNode.removeChild(old);
        delete pileEls[id];
        delete pileShapes[id];
      }
    });
    layoutPile(ids);
    if (still) {
      void area.offsetWidth;
      area.classList.remove("is-still");
    }
    $("pile-caption").hidden = ids.length > 0;
    pileReady = true;
  }

  // 文字仍是「這一批翻完了，你挑了 n 本想讀」，拆成兩段只為了在窄螢幕整段換行，不讓「讀」單獨掉到下一行
  function setFinishTitle(yesCount) {
    var title = $("finish-title");
    while (title.firstChild) title.removeChild(title.firstChild);
    title.appendChild(el("span", "finish-title-part", "這一批翻完了，"));
    title.appendChild(el("span", "finish-title-part", "你挑了 " + yesCount + " 本想讀"));
  }

  function showView(view) {
    currentView = view;
    $("view-quiz").hidden = view !== "quiz";
    ["deck", "yes", "no"].forEach(function (name) {
      $("view-" + name).hidden = name !== view;
      $("tab-" + name).setAttribute("aria-pressed", name === view ? "true" : "false");
    });
    if (view === "deck" && stackHeightDirty) measureStackHeight();
    if (view === "deck" && pileDirty) layoutPile(chosenIds());
  }

  function onKeyDown(event) {
    if (currentView !== "deck" || books.length === 0) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    var target = event.target;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable)) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      decide("no");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      decide("yes");
    }
  }

  function showLoadError() {
    var message = $("deck-message");
    message.textContent = "書單讀不到，請重新整理";
    message.classList.add("is-error");
    message.hidden = false;
    $("stack").hidden = true;
    $("controls").hidden = true;
    $("hint").hidden = true;
  }

  /* ---------- 書庫與答題 ---------- */

  var STYLE_LABEL = { story: "故事型", framework: "框架型", research: "研究型", essay: "隨筆型", any: "讀法不拘" };
  var LANG_LABEL = { ZH: "中文為主", mix: "中英各半", EN: "英文為主" };
  var LENGTH_LABEL = { thin: "一個週末讀得完", any: "厚薄不拘" };

  function normaliseAnswers(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.themes)) return null;
    var themes = raw.themes.filter(function (t, i) {
      return themeLabel.hasOwnProperty(t) && raw.themes.indexOf(t) === i;
    }).slice(0, 3);
    if (themes.length === 0) return null;
    return {
      themes: themes,
      style: STYLE_LABEL.hasOwnProperty(raw.style) ? raw.style : "any",
      lang: LANG_LABEL.hasOwnProperty(raw.lang) ? raw.lang : "mix",
      length: LENGTH_LABEL.hasOwnProperty(raw.length) ? raw.length : "any"
    };
  }

  function chosenThemeText() {
    if (!answers) return "";
    return answers.themes.map(function (t) {
      return themeLabel[t];
    }).join("、");
  }

  function preferenceText() {
    if (!answers) return "";
    return [STYLE_LABEL[answers.style], LANG_LABEL[answers.lang], LENGTH_LABEL[answers.length]].join("、");
  }

  // 不屬於選的主題，就是混進來的「探索」
  function isExplore(book) {
    if (!answers) return false;
    return !(book.themes || []).some(function (t) {
      return answers.themes.indexOf(t) !== -1;
    });
  }

  function bookLength(book) {
    if (typeof book.pages === "number") {
      if (book.pages <= 240) return "thin";
      return book.pages <= 380 ? "medium" : "thick";
    }
    var tags = book.tags || [];
    if (tags.indexOf("薄") !== -1) return "thin";
    if (tags.indexOf("偏厚") !== -1) return "thick";
    return "medium"; // 頁數查不到的書當作中等厚度
  }

  // 依讀法、語言、厚度給權重；越符合，越容易被抽到
  function bookWeight(book, a) {
    var weight = 1;
    if (a.style !== "any") weight *= book.style === a.style ? 2.5 : 0.8;
    if (a.lang !== "mix") weight *= book.lang === a.lang ? 3 : 0.35;
    if (a.length === "thin") {
      var length = bookLength(book);
      weight *= length === "thin" ? 2 : length === "thick" ? 0.4 : 1;
    }
    return weight;
  }

  // 不重複的加權抽樣（每本給一個 random^(1/權重) 的鑰匙，取最大的幾本）
  function weightedPick(list, count, a) {
    return list
      .map(function (book) {
        return { book: book, key: Math.pow(Math.random(), 1 / bookWeight(book, a)) };
      })
      .sort(function (x, y) {
        return y.key - x.key;
      })
      .slice(0, Math.max(0, count))
      .map(function (entry) {
        return entry.book;
      });
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  // 組一副牌：約七成來自選的主題（每個主題至少分到一份），其餘從其他類型補滿
  function buildDeck(a) {
    var size = Math.min(DECK_SIZE, poolBooks.length);
    var coreTarget = Math.round(size * CORE_SHARE);
    var picked = [];
    var taken = {};

    function take(list) {
      list.forEach(function (book) {
        if (!taken[book.id]) {
          taken[book.id] = true;
          picked.push(book);
        }
      });
    }

    var perTheme = Math.floor(coreTarget / a.themes.length);
    a.themes.forEach(function (theme) {
      var candidates = poolBooks.filter(function (b) {
        return !taken[b.id] && b.themes.indexOf(theme) !== -1;
      });
      take(weightedPick(candidates, perTheme, a));
    });

    var moreCore = poolBooks.filter(function (b) {
      return !taken[b.id] && !isExploreFor(b, a);
    });
    take(weightedPick(moreCore, coreTarget - picked.length, a));

    var others = poolBooks.filter(function (b) {
      return !taken[b.id];
    });
    take(weightedPick(others, size - picked.length, a));

    // 洗牌，但第一張一定是選的主題
    shuffle(picked);
    for (var i = 0; i < picked.length; i++) {
      if (!isExploreFor(picked[i], a)) {
        picked.unshift(picked.splice(i, 1)[0]);
        break;
      }
    }
    return picked.map(function (b) {
      return b.id;
    });
  }

  function isExploreFor(book, a) {
    return !book.themes.some(function (t) {
      return a.themes.indexOf(t) !== -1;
    });
  }

  function normaliseBooks(list) {
    var seen = {};
    return list.filter(function (b) {
      if (!b || typeof b !== "object") return false;
      if (typeof b.id !== "string" || b.id === "" || seen[b.id]) return false;
      if (!Array.isArray(b.themes)) return false;
      seen[b.id] = true;
      return true;
    });
  }

  // 清掉上一副牌的書、卡片、書堆與狀態
  function resetDeckState() {
    books = [];
    bookById = {};
    indexById = {};
    state = { decisions: {}, history: [] };
    drag = null;
    Object.keys(cardEls).forEach(function (id) {
      var card = cardEls[id];
      if (card.parentNode) card.parentNode.removeChild(card);
    });
    cardEls = {};
    Object.keys(pileEls).forEach(function (id) {
      var bookEl = pileEls[id];
      if (bookEl.parentNode) bookEl.parentNode.removeChild(bookEl);
    });
    pileEls = {};
    pileShapes = {};
    pileReady = false;
    stackHeightDirty = true;
    $("stack").style.removeProperty("--card-height");
  }

  // 用一副牌（書的順序＋答題結果）開始翻；saved 是上次存的決定
  function startDeck(ids, a, saved) {
    resetDeckState();
    answers = a;
    books = ids.map(function (id) {
      return poolById[id];
    });
    books.forEach(function (b, i) {
      bookById[b.id] = b;
      indexById[b.id] = i;
    });
    loadState(saved);
    saveState();

    $("deck-message").hidden = true;
    $("controls").hidden = false;
    $("hint").hidden = false;
    $("pile").hidden = false;
    $("tabs").hidden = false;
    $("btn-redeal").hidden = false;
    showView("deck");

    // 整疊一起淡入：先畫出 is-arriving 的起點，再拿掉讓過場跑起來
    var stack = $("stack");
    stack.classList.add("is-arriving");
    render();
    void stack.offsetWidth;
    stack.classList.remove("is-arriving");
  }

  /* ---------- 答題畫面 ---------- */

  var quizDraft = { themes: [], style: "any", lang: "mix", length: "any" };

  function buildQuiz(themes) {
    var list = $("quiz-themes");
    themes.forEach(function (theme) {
      var chip = el("button", "chip", theme.label);
      chip.type = "button";
      chip.setAttribute("data-value", theme.id);
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", function () {
        var at = quizDraft.themes.indexOf(theme.id);
        if (at !== -1) {
          quizDraft.themes.splice(at, 1);
        } else if (quizDraft.themes.length < 3) {
          quizDraft.themes.push(theme.id);
        }
        syncQuiz();
      });
      list.appendChild(chip);
    });

    // 單選題：style、lang、length
    ["style", "lang", "length"].forEach(function (key) {
      Array.prototype.forEach.call(document.querySelectorAll("#quiz-" + key + " .chip"), function (chip) {
        chip.addEventListener("click", function () {
          quizDraft[key] = chip.getAttribute("data-value");
          syncQuiz();
        });
      });
    });

    $("quiz-deal").addEventListener("click", function () {
      var a = normaliseAnswers(quizDraft);
      if (!a || busy) return;
      startDeck(buildDeck(a), a, null);
      announce("發好一副 " + books.length + " 張的牌。" + nextCardNote());
      $("tab-deck").focus();
    });
    $("quiz-cancel").addEventListener("click", function () {
      showView("deck");
      $("tab-deck").focus();
    });
  }

  function syncQuiz() {
    Array.prototype.forEach.call(document.querySelectorAll("#quiz-themes .chip"), function (chip) {
      var on = quizDraft.themes.indexOf(chip.getAttribute("data-value")) !== -1;
      chip.setAttribute("aria-pressed", on ? "true" : "false");
      chip.disabled = !on && quizDraft.themes.length >= 3; // 最多三個
    });
    ["style", "lang", "length"].forEach(function (key) {
      Array.prototype.forEach.call(document.querySelectorAll("#quiz-" + key + " .chip"), function (chip) {
        chip.setAttribute("aria-pressed", chip.getAttribute("data-value") === quizDraft[key] ? "true" : "false");
      });
    });
    $("quiz-count").textContent = "已選 " + quizDraft.themes.length + " / 3";
    $("quiz-deal").disabled = quizDraft.themes.length === 0;
  }

  // 打開答題畫面；已經有一副牌時，預填上次的答案，並提醒會換掉目前的牌
  function openQuiz() {
    if (busy) return;
    var hasDeck = books.length > 0;
    if (answers) {
      quizDraft = {
        themes: answers.themes.slice(),
        style: answers.style,
        lang: answers.lang,
        length: answers.length
      };
    }
    syncQuiz();
    $("quiz-cancel").hidden = !hasDeck;
    $("quiz-warning").hidden = !hasDeck;
    showView("quiz");
    $("quiz-title").focus();
  }

  function startWithPool(data) {
    if (!data || !Array.isArray(data.books) || !Array.isArray(data.themes)) throw new Error("bad data");
    data.themes.forEach(function (theme) {
      if (theme && typeof theme.id === "string") themeLabel[theme.id] = asText(theme.label);
    });
    poolBooks = normaliseBooks(data.books);
    if (poolBooks.length === 0) throw new Error("empty data");
    poolBooks.forEach(function (b) {
      poolById[b.id] = b;
    });

    $("deck-message").hidden = true;
    buildQuiz(data.themes.filter(function (t) {
      return themeLabel.hasOwnProperty(t.id);
    }));

    var saved = loadSavedDeck();
    if (saved) {
      startDeck(saved.ids, saved.answers, saved.saved);
    } else {
      openQuiz();
    }
  }

  // 按鈕、鍵盤、視窗事件只綁一次；重新發牌時沿用
  function bindControls() {
    $("btn-skip").addEventListener("click", function () {
      decide("no");
    });
    $("btn-want").addEventListener("click", function () {
      decide("yes");
    });
    $("btn-undo").addEventListener("click", undo);
    $("btn-redeal").addEventListener("click", openQuiz);
    $("finish-show-yes").addEventListener("click", function () {
      showView("yes");
      $("tab-yes").focus();
    });
    $("finish-copy").addEventListener("click", function () {
      copyRecord("finish");
    });
    $("yes-copy").addEventListener("click", function () {
      copyRecord("yes");
    });
    $("finish-prompt").addEventListener("click", function () {
      copyPrompt("finish");
    });
    $("yes-prompt").addEventListener("click", function () {
      copyPrompt("yes");
    });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
  }

  function init() {
    $("theme-toggle").addEventListener("click", toggleTheme);
    if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", syncThemeButton);

    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        showView(tab.getAttribute("data-view"));
      });
    });

    bindControls();

    fetch(POOL_URL)
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(startWithPool)
      .catch(showLoadError);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
