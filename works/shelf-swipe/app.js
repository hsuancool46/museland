/* 翻書架 Shelf Swipe
   一次一張書卡：右滑想讀、左滑略過。
   書單從 books-batch-01.json 讀進來；JSON 裡的文字一律當資料，只用 textContent 寫入。 */
(function () {
  "use strict";

  var DATA_URL = "books-batch-01.json";
  var BATCH_LABEL = "batch-01";
  var STORAGE_KEY = "museland.shelf-swipe.batch-01";
  var SWIPE_THRESHOLD = 90; // px，超過才算決定
  var FLY_MS = 320;
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

  var reduceMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  function prefersReducedMotion() {
    return !!(reduceMotionQuery && reduceMotionQuery.matches);
  }

  function $(id) {
    return document.getElementById(id);
  }

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

  function loadState() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      raw = null;
    }
    if (!raw) return;

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return;
    }
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
        STORAGE_KEY,
        JSON.stringify({ decisions: state.decisions, history: state.history })
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

    var stampYes = el("span", "stamp stamp-yes", "想讀");
    var stampNo = el("span", "stamp stamp-no", "略過");
    stampYes.setAttribute("aria-hidden", "true");
    stampNo.setAttribute("aria-hidden", "true");

    // 1. 上緣：語言＋頁數／探索或流水號
    var top = el("div", "card-top");
    var meta = el("p", "card-meta");
    meta.appendChild(el("span", "card-lang", isEnglish ? "EN" : "中文"));
    if (typeof book.pages === "number" && isFinite(book.pages)) {
      meta.appendChild(el("span", "card-pages", book.pages + " 頁"));
    }
    top.appendChild(meta);

    if (book.lane === "explore") {
      var badge = el("span", "card-explore", "探索");
      badge.title = "主題旁邊的延伸選擇";
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
    card.appendChild(hook);
    card.appendChild(why);
    card.appendChild(tags);
    card.appendChild(hole);

    card.addEventListener("pointerdown", onPointerDown);
    return card;
  }

  function setDrag(card, dx) {
    var rotate = prefersReducedMotion() ? 0 : dx / 28; // 微微旋轉
    card.style.transform = "translateX(" + dx + "px) rotate(" + rotate + "deg)";
    var strength = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    card.style.setProperty("--stamp-yes", dx > 0 ? String(strength) : "0");
    card.style.setProperty("--stamp-no", dx < 0 ? String(strength) : "0");
  }

  function clearDrag(card) {
    card.style.transform = "";
    card.style.removeProperty("--stamp-yes");
    card.style.removeProperty("--stamp-no");
  }

  function renderStack() {
    var stack = $("stack");
    var upcoming = undecidedBooks().slice(0, STACK_DEPTH);
    var keep = {};

    upcoming.forEach(function (book, position) {
      keep[book.id] = true;
      var card = cardEls[book.id];
      if (!card) {
        card = buildCard(book);
        cardEls[book.id] = card;
        card.classList.add("is-entering");
      }
      card.classList.remove("pos-0", "pos-1", "pos-2", "is-flying", "fly-left", "fly-right", "is-dragging");
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

  /* ---------- 決定與復原 ---------- */

  function commitDecision(id, decision) {
    state.decisions[id] = decision;
    var at = state.history.indexOf(id);
    if (at !== -1) state.history.splice(at, 1);
    state.history.push(id);
    saveState();
    render();
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
    card.classList.remove("is-dragging");
    card.classList.add("is-flying", decision === "yes" ? "fly-right" : "fly-left");
    card.style.transform = "";
    card.style.setProperty("--stamp-yes", decision === "yes" ? "1" : "0");
    card.style.setProperty("--stamp-no", decision === "no" ? "1" : "0");

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
    card.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, FLY_MS + 120); // 保險：沒收到 transitionend 也會完成
  }

  function undo() {
    if (busy || state.history.length === 0) return;
    var id = state.history.pop();
    delete state.decisions[id];
    saveState();
    render();
  }

  function moveTo(id, decision) {
    if (!state.decisions.hasOwnProperty(id)) return;
    state.decisions[id] = decision;
    saveState();
    render();
  }

  /* ---------- 拖曳 ---------- */

  var drag = null;

  function onPointerDown(event) {
    var card = event.currentTarget;
    if (busy || card !== topCard()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag = { card: card, pointerId: event.pointerId, startX: event.clientX, dx: 0 };
    card.classList.add("is-dragging");
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
  }

  /* ---------- 翻卡紀錄 ---------- */

  function buildRecord() {
    var yes = booksWith("yes");
    var no = booksWith("no");
    var lines = [];
    lines.push("【翻書架 " + BATCH_LABEL + " 紀錄】已翻 " + decidedCount() + "/" + books.length);
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
    if (book.lane === "explore") line += "［探索］";
    return line;
  }

  function copyRecord(prefix) {
    var text = buildRecord();
    var status = $(prefix + "-copy-status");
    var fallback = $(prefix + "-copy-fallback");
    var area = $(prefix + "-copy-text");

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
        status.textContent = "已複製翻卡紀錄";
      },
      showFallback
    );
  }

  /* ---------- 清單 ---------- */

  function buildListItem(book, decision) {
    var item = el("li", "entry");

    var title = el("h3", "entry-title", book.title);
    title.lang = book.lang === "EN" ? "en" : "zh-Hant";
    if (book.lang === "EN") title.classList.add("entry-title-en");

    var authorText = asText(book.author);
    if (book.lane === "explore") authorText += "・探索";
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

    item.appendChild(title);
    item.appendChild(author);
    item.appendChild(hook);
    item.appendChild(footer);
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
    $("finish-title").textContent = "這一批翻完了，你挑了 " + yesCount + " 本想讀";
    $("btn-skip").hidden = finished;
    $("btn-want").hidden = finished;
    $("hint").hidden = finished;
    $("btn-undo").disabled = state.history.length === 0;

    renderStack();
    renderList("yes");
    renderList("no");

    if (finished && !wasFinished && currentView === "deck") {
      $("finish-copy-fallback").hidden = true;
      $("finish-copy-status").textContent = "";
      $("finish-title").focus();
    }
  }

  function showView(view) {
    currentView = view;
    ["deck", "yes", "no"].forEach(function (name) {
      $("view-" + name).hidden = name !== view;
      $("tab-" + name).setAttribute("aria-pressed", name === view ? "true" : "false");
    });
  }

  function onKeyDown(event) {
    if (currentView !== "deck" || books.length === 0) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    var target = event.target;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) return;
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

  function normaliseBooks(list) {
    var seen = {};
    return list.filter(function (b) {
      if (!b || typeof b !== "object") return false;
      if (typeof b.id !== "string" || b.id === "" || seen[b.id]) return false;
      seen[b.id] = true;
      return true;
    });
  }

  function start(data) {
    if (!data || !Array.isArray(data.books)) throw new Error("bad data");
    books = normaliseBooks(data.books);
    if (books.length === 0) throw new Error("empty data");
    books.forEach(function (b, i) {
      bookById[b.id] = b;
      indexById[b.id] = i;
    });

    loadState();

    $("deck-message").hidden = true;
    $("controls").hidden = false;
    $("hint").hidden = false;

    $("btn-skip").addEventListener("click", function () {
      decide("no");
    });
    $("btn-want").addEventListener("click", function () {
      decide("yes");
    });
    $("btn-undo").addEventListener("click", undo);
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
    document.addEventListener("keydown", onKeyDown);

    render();
  }

  function init() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        showView(tab.getAttribute("data-view"));
      });
    });

    fetch(DATA_URL)
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(start)
      .catch(showLoadError);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
