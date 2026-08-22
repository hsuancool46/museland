// api/generate.js — Personalized Narrative Simulator V2 (MVP cell)
// 主題：感情 Love ｜ Lens：Ordinary Life ｜ 深度：Life Scene ｜ 反應回饋
//
// ANTHROPIC_API_KEY 只存在 Vercel 環境變數，永不進到前端、永不寫死於此。

const LOVE_QUESTIONS = {
  continue3y: '如果跟現在這個人繼續三年？',
  moveIn: '如果我們同居／結婚？',
  moreAttractive: '如果我遇到更有吸引力的人？',
  moreIndependent: '如果對方開始更獨立？',
  fearLosing: '我真正害怕失去的是什麼？',
  whoSuits: '我適合什麼樣的人？',
};

const STATUS = {
  stable: '穩定交往中',
  new: '剛在一起不久',
  ambiguous: '曖昧或還沒確定',
  singleThinking: '單身，但心裡有個人',
  justEnded: '剛結束一段',
};

// ---- Prompt construction ------------------------------------------------

function sceneSystem() {
  return `你是「Personalized Narrative Simulator」的人生情境模擬引擎。這一格的主題是「感情」，觀測角度（lens）是 Ordinary Life。

你的任務：根據使用者選的問題與提供的線索，生成一個「三年後某一個普通日子」的擬真場景。長度 800–1500 字，繁體中文，用第二人稱「你」書寫。

Ordinary Life 的鐵律（務必遵守）：
1. 不要寫關係的「走向摘要」。不准出現「你們的感情會趨於平穩／逐漸走向終點／越來越好」這種總結句。要寫「一個具體的、普通的日子」——有明確的時間（某年某月，一個星期幾，大概幾點）、地點、你正在做的事、對方正在做的事。
2. 寫一個很小的、具體的日常時刻。這個時刻「不一定是摩擦」——它可以是一次拌嘴，也可以是一個平淡的溫柔、一個習以為常的舒服、一個沒說出口的體貼、一個微小的猶豫。由使用者的線索誠實決定調性，不要為了製造張力硬塞一個問題進去。
3. 【最重要】不要系統性地把每個場景都寫成「表面平靜、底下有裂縫」。那會讓這個產品變成一台販賣不安的機器，而不是一面誠實的鏡子。有些關係三年後確實變淡，有些變得更安穩，有些兩者都有——讓輸入決定，不要預設走向壞掉。如果線索裡沒有明顯的問題，就誠實寫一個真實但不悲觀的普通日子；平淡不等於失落。
4. 場景要具體到「讀者的身體會先有反應」——不管那個反應是揪一下、暖一下、還是愣一下。這是這個產品的核心：抽象的句子收不到真實的反應，具體的日常才收得到。
5. 把使用者提供的細節自然編織進場景，不要條列、不要複述問卷。使用者填的「最怕變成的樣子」只是眾多可能之一，不要預設它一定會發生、也不要每次都把場景寫成那個恐懼的實現；「最希望還留著的東西」同樣是線索，不是保證——它可以出現、可以以變形的方式出現、也可以在這個普通日子裡剛好沒被提起。如果使用者「根本沒有提供」最怕變成的樣子，就不要自己發明一個恐懼，更不要把那個自創的恐懼當成場景的情緒重心或結尾。
6. 可以讓讀者看到一個他隱約知道、卻還沒好好看見的東西——那個東西「不一定是問題」，也可能是一個他早就習慣、卻沒真正珍惜的好。
7. 【結尾特別注意，這是最容易出錯的地方】結尾的情緒必須由輸入「賺來」，不能預設。如果使用者沒有提供明顯的恐懼或張力、輸入整體是溫暖或平淡的，結尾就「不准」無中生有一個隱憂或預感，「不准」用「還沒下雨但你知道它在那裡」「這個念頭一直在那裡」這類埋伏筆式的收尾，也「不准」用陰天、灰色天空、變暗的天色等天氣意象把一個溫暖的場景頭尾包起來暗示不祥。只有當使用者的線索本身就帶著真實張力時，一個帶著不安的結尾才成立。結尾要收在一個具體的、當下的時刻，它的情緒要跟輸入的情緒一致——暖的輸入就收在暖或平靜的真實時刻，不要在最後一段自己長出一道裂縫。誠實但不殘忍，也不要硬給一個廉價的圓滿。
8. 不要下心理診斷。呈現那個時刻就好，讓讀者自己去感覺，不要替他命名「你其實是個怎樣的人」「你真正要的是⋯」。系統負責攤開場景，結論留給讀者自己。

結尾：用一兩句讓場景自然收束，然後另起一行，原文照放這一句（不要改寫）：
這不是預言，只是其中一種看法。Not a prediction. A perspective.

只輸出場景本文加上結尾那一句。不要標題、不要前言、不要解釋你在做什麼。`;
}

function sceneUser(a) {
  const q = LOVE_QUESTIONS[a.question] || a.question;
  const statusText = STATUS[a.status] || a.status || '（未提供）';
  return `我選的感情問題：${q}

我的線索：
感情狀態：${statusText}
我和這個人（或想像中的對象）相處的日常畫面：${a.dailyScene}
我們之間，還沒真的攤開講的東西：${a.quietThing || '（沒有特別提供，可由場景自然帶出一個合理的小張力）'}
我在關係裡通常是什麼樣子：${a.selfInRelationship}
我私下最怕三年後變成的樣子：${a.fear || '（沒有特別提供）'}
我最希望三年後我們之間還留著的東西：${a.hope || '（沒有特別提供）'}

請根據以上，生成那個「三年後某一個普通日子」的場景。記住：調性由線索誠實決定，可暖、可淡、可猶豫，不要預設走向壞掉。`;
}

function deepenSystem() {
  return `你是「Personalized Narrative Simulator」的人生情境模擬引擎，主題「感情」，lens 為 Ordinary Life。

使用者剛讀完上一個場景，點了「我想深入這條線」。你要做的是「把鏡頭推到最近」——不是重講、不是續寫、不是總結。

嚴格規則（違反任何一條都算失敗）：
1. 假設讀者「剛剛才讀完」上一個場景，對人物、時間、地點、發生的事完全清楚。所以：不要重述劇情、不要摘要已經發生的事、不要重複上一段出現過的句子或描述。一句都不要重覆。
2. 從上一個場景裡挑「唯一一個」情緒最濃的瞬間（那個動作、那個沉默、那個沒說出口的半句話發生的當下），把時間放慢到只有幾秒鐘。整段就只寫這幾秒。
3. 只用「上一段沒寫過的新細節」把那一瞬間撐開：一個更近的身體感受、一次呼吸、視線落在哪一個具體的東西上、指尖的動作、心裡閃過但沒說出來的那半句話。不是把場景往前推進，是往裡面鑽。
4. 不要換場景、不要跳到別的時間、不要加入新事件或新對話。鏡頭釘在那一個瞬間不動。
5. 長度 250–500 字，繁體中文，第二人稱「你」。寧可短而準，不要長而重複——如果你發現自己在重講上一段，就是錯了。
6. 不要下心理診斷、不要替使用者命名他是怎樣的人。誠實但不殘忍。

結尾另起一行，原文照放：
這不是預言，只是其中一種看法。Not a prediction. A perspective.

只輸出這段放大後的文字加結尾那句。`;
}

function deepenUser(a) {
  return `上一個場景如下（讀者剛讀完，你完全不需要、也不准重述它）：
「${a.previousScene}」

請只挑其中情緒最濃的那一個瞬間，把時間放慢到幾秒，用上一段「沒寫過的新細節」把它往裡面撐開。不要重講劇情、不要重複任何句子。`;
}

// ---- Rate limit (best-effort; the real cap is the API key's spend limit) --
const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 12;
function checkRateLimit(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length <= MAX_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: '你在短時間內生成太多次了，目前暫時無法生成內容，請過一會兒再試（每小時每人上限 12 次）。' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: '伺服器還沒設定 ANTHROPIC_API_KEY，請到 Vercel 專案設定裡加上這個環境變數。' });
    return;
  }

  const body = req.body || {};
  const mode = body.mode === 'deepen' ? 'deepen' : 'scene';

  let system, userMessage, maxTokens;

  if (mode === 'deepen') {
    const previousScene = String(body.previousScene || '').slice(0, 4000);
    if (!previousScene) {
      res.status(400).json({ error: '缺少上一個場景，無法深入。' });
      return;
    }
    system = deepenSystem();
    userMessage = deepenUser({ previousScene });
    maxTokens = 1100;
  } else {
    const a = {
      question: LOVE_QUESTIONS[body.question] ? body.question : '',
      status: STATUS[body.status] ? body.status : '',
      dailyScene: String(body.dailyScene || '').slice(0, 300),
      quietThing: String(body.quietThing || '').slice(0, 300),
      selfInRelationship: String(body.selfInRelationship || '').slice(0, 200),
      fear: String(body.fear || '').slice(0, 200),
      hope: String(body.hope || '').slice(0, 200),
    };
    if (!a.question || !a.status || !a.dailyScene || !a.selfInRelationship) {
      res.status(400).json({ error: '缺少必要欄位：問題、感情狀態、相處日常、你在關係裡的樣子都要填。' });
      return;
    }
    system = sceneSystem();
    userMessage = sceneUser(a);
    maxTokens = 2400;
  }

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.MODEL_ID || 'claude-sonnet-5',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error', apiRes.status, errText);
      let errType = '';
      try { errType = (JSON.parse(errText).error || {}).type || ''; } catch (e) {}
      let userMsg = '目前暫時無法生成內容，請稍後再試。';
      if (apiRes.status === 429 || errType === 'rate_limit_error' || errType === 'overloaded_error') {
        userMsg = '目前使用的人比較多、或用量已達上限，暫時無法生成內容，請過幾分鐘再試。';
      } else if (/credit|balance|billing|quota|insufficient/i.test(errText)) {
        userMsg = '目前無法生成內容：服務用量已達上限。請稍後再試。';
      } else if (apiRes.status === 401 || errType === 'authentication_error') {
        userMsg = '目前無法生成內容：服務設定有誤（API 金鑰）。';
      }
      res.status(502).json({ error: userMsg });
      return;
    }

    const data = await apiRes.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';

    // The model can return HTTP 200 but decline to generate (stop_reason:
    // "refusal", empty content) — typically when the input reads as acute
    // distress: a fresh breakup, betrayal, hopelessness. Handing someone in
    // that moment a vivid immersive future scene is the wrong move, so surface
    // a caring message instead of a blank/broken screen.
    if (data.stop_reason === 'refusal' || !text) {
      console.log('generate declined/empty', { mode, stop_reason: data.stop_reason });
      res.status(200).json({
        declined: true,
        message:
          '這一組情境，我這次沒有辦法幫你模擬。\n\n' +
          '有時候是因為輸入裡的狀態太重、太靠近正在發生的痛——那種時候，一篇虛構的未來場景幫不上什麼，甚至可能更難受。如果你現在正經歷這樣的事，找一個信得過的人聊聊，會比讀一篇模擬來得實在。\n\n' +
          '你也可以換一個問題，或把情境寫得輕一點、具體一點，再試一次。',
      });
      return;
    }

    res.status(200).json({ scene: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤，請稍後再試。' });
  }
};
