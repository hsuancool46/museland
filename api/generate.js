// api/generate.js — Vercel Serverless Function (Node.js runtime)
//
// v0.2: 10-question core intake (genre is INFERRED from the "what does
// winning feel like" multi-select, not asked directly), plus a mandatory
// "how do you narrate a mishap" sample that replaces the old tone slider —
// the model reads the sample's register and calibrates comedy intensity
// itself instead of us hand-rolling a heuristic.
//
// ANTHROPIC_API_KEY lives only in Vercel's environment variables. Never
// hardcode it here, never log it.

const GENRES = {
  comeback: { label: '逆襲', tension: '曾經被低估 vs 現在的具體翻轉', climax: '讓對照角色親眼目睹翻轉的那一刻' },
  power: { label: '權力', tension: '失控 vs 掌控', climax: '一個過去仰望的人，現在向你請示或求助' },
  freedom: { label: '自由', tension: '被綁住 vs 隨時可以離開', climax: '一個具體的、可以選擇拒絕的時刻' },
  creation: { label: '創作', tension: '自我懷疑 vs 作品被看見', climax: '一個陌生人因為這件作品，做出了具體的行動' },
  love: { label: '感情', tension: '害怕不被理解 vs 被完整接住', climax: '對方一句話，證明了真的懂你' },
  wander: { label: '遠走他鄉', tension: '根 vs 漂', climax: '第一次答不出「你住哪裡」的那個瞬間' },
};

// Q7 options → which genre each one signals. `null` = not a genre signal
// (atPeace is a tone/resolution flag, not a narrative arc).
const WIN_OPTIONS = {
  freedom: { label: '我很自由', genre: 'freedom' },
  rich: { label: '我很有錢', genre: 'comeback' },
  competence: { label: '我的能力被認可', genre: 'comeback' },
  needed: { label: '別人需要我', genre: 'power' },
  envied: { label: '別人羨慕我', genre: 'comeback' },
  provedWrong: { label: '我證明了某些人錯了', genre: 'comeback' },
  madeThing: { label: '我做出了自己的東西', genre: 'creation' },
  strong: { label: '我變得非常強', genre: 'power' },
  ownPlace: { label: '我有一個真正屬於我的地方', genre: 'wander' },
  loveTogether: { label: '我愛的人跟我一起', genre: 'love' },
  atPeace: { label: '我終於可以安心', genre: null },
  impact: { label: '我的作品影響了很多人', genre: 'creation' },
};

const OBSTACLE_OPTIONS = {
  money: '錢或資源',
  system: '工作／制度',
  family: '家庭或關係',
  ability: '能力還不夠',
  self: '自己的拖延、害怕或反覆',
  other: '其他',
};

function inferGenres(winKeys) {
  const scores = {};
  winKeys.forEach((k) => {
    const g = WIN_OPTIONS[k] && WIN_OPTIONS[k].genre;
    if (g) scores[g] = (scores[g] || 0) + 1;
  });
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked.slice(0, 2).map(([g]) => g);
}

function buildPrompt(a) {
  const inferredGenreKeys = inferGenres(a.winFeelings);
  const calmResolution = a.winFeelings.includes('atPeace');

  const genreBlock = inferredGenreKeys.length
    ? inferredGenreKeys
        .map((k) => GENRES[k])
        .filter(Boolean)
        .map((g) => `類別「${g.label}」：核心張力＝${g.tension}；高潮聚焦＝${g.climax}`)
        .join('\n')
    : '使用者沒有給出明確的類別偏好，請你根據他選的「贏了的感覺」跟其他線索，自行判斷最適合的敘事張力與高潮走向。';

  const winFeelingsText = a.winFeelings.map((k) => WIN_OPTIONS[k] && WIN_OPTIONS[k].label).filter(Boolean).join('、');

  const obstacleLabel = a.obstacleType === 'other' ? a.obstacleOther || '其他' : OBSTACLE_OPTIONS[a.obstacleType] || '';

  const foilBlock = a.foil
    ? `曾經不看好使用者、或讓使用者想證明點什麼的人／聲音：${a.foil}`
    : '使用者沒有提供對照角色或反派——不要為了製造衝突硬掰一個看不起他的人，衝突可以單純來自處境本身或使用者自己的猶豫。';

  const calmInstruction = calmResolution
    ? '使用者特別勾選了「我終於可以安心」，故事的結尾請偏向平靜、鬆一口氣的收束，不用寫得太張揚或太high，重點是「終於不用再撐著」的感覺。'
    : '';

  const voiceBlock = `
語氣校準（重要）：以下是使用者平常描述倒楣、荒謬或尷尬事情時的真實語氣範例：
「${a.voice}」
請先判斷這段話的正經／戲謔強度與說話習慣（比如：是不是習慣用正式、系統化、專業領域的語言去描述失控的事？是自嘲還是輕描淡寫？）。你生成的整篇故事語氣要延續這個強度和說話習慣，不要自己另外發明一種語氣。
如果範例本身帶有明顯的反差幽默（用正式語言講狼狽的事），請套用以下喜劇機制，強度對齊範例：
1. 濾鏡抽取：從範例裡抓出使用者慣用的說話視角／習慣領域，把它字面化地套進故事裡尷尬或失控的場景。
2. Callback 機制：挑一個使用者提供的具體細節（場景、物件、還沒跨出去的事），讓它在故事中至少出現兩次，並在結尾呼應開頭。
3. 反英雄語言：用正式或系統化的語言包裝失控或狼狽的時刻，語言越正式、場景越狼狽，反差越大。
4. 結尾避免太乾淨的昇華，可以留一個沒解決的小毛病。
如果範例讀起來很平實、不誇張，就維持正劇語氣，不要硬加喜劇元素。`;

  const system = `你是「Personalized Narrative Simulator」的故事生成引擎。任務：根據使用者提供的真實線索，生成一篇時間跨度約三年、800–1200字的繁體中文「未來爽文」。

核心定位：這不是預測，而是根據使用者的慾望、恐懼與自我想像，生成一條讓人覺得「這好像真的可能是我」的平行未來。故事必須具體、有場景、有對話，避免空泛的勵志語言。

寫作規則：
- 用第二人稱「你」書寫，時間跨度約三年，可用時間跳躍製造真實感。
- 大量使用使用者提供的具體細節，不要只是籠統帶過。
- 開場請利用使用者描述的日常場景，建立真實的生活質地，不要用抽象的自我介紹開場。
- 阻力來源（${obstacleLabel}）要具體反映在情節障礙上，不要只是提一句帶過。
- ${foilBlock}
- 使用者選的「贏了的感覺」：${winFeelingsText || '（未提供）'}——高潮場景要具體兌現這些感覺，不要用空泛的形容詞替代。
- ${calmInstruction}
${voiceBlock}

選定／推論出的故事類別與其敘事邏輯：
${genreBlock}

結尾必須包含一句類似「這不是預言，這是一份由你的慾望、恐懼與自我想像共同生成的未來草稿」的收束句（可用你自己的措辭改寫，不要逐字照抄），並讓它成為故事本身語氣的一部分，不要生硬地貼在最後。

只輸出故事本文，不要加上標題以外的說明文字，也不要額外解釋你在做什麼。`;

  const userMessage = `我的線索：
現在的人生位置：${a.lifePosition}
我一天最常出現的三個場景：${a.scenes}
現在卡住我的事：${a.block}
最大的阻力來源：${obstacleLabel}
三年後讓我起雞皮疙瘩的畫面：${a.climaxScene}
熟悉我的人三年後會怎麼向別人介紹我：${a.selfIntro}
我現在很想做、卻還沒跨出去的事：${a.notYetDone}

${a.fateEnabled ? `[Fate Mode 已開啟]\n出生資訊：${a.birth || '（未提供，用模糊語彙帶過）'}\n我的意圖傾向：${a.fateIntent}` : ''}

請開始生成。`;

  return { system, userMessage };
}

// Best-effort in-memory rate limit — a speed bump, not the real safety net.
// The real safety net is the spend limit set on the Anthropic API key itself.
const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 8;

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
    res.status(429).json({ error: '生成次數太多了，請稍後再試（每小時每人上限 8 次）。' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: '伺服器還沒設定 ANTHROPIC_API_KEY，請到 Vercel 專案設定裡加上這個環境變數。' });
    return;
  }

  const body = req.body || {};

  const winFeelings = Array.isArray(body.winFeelings)
    ? body.winFeelings.filter((k) => WIN_OPTIONS[k]).slice(0, 3)
    : [];

  const a = {
    lifePosition: String(body.lifePosition || '').slice(0, 50),
    scenes: String(body.scenes || '').slice(0, 150),
    block: String(body.block || '').slice(0, 60),
    obstacleType: OBSTACLE_OPTIONS[body.obstacleType] ? body.obstacleType : (body.obstacleType === 'other' ? 'other' : ''),
    obstacleOther: String(body.obstacleOther || '').slice(0, 40),
    foil: String(body.foil || '').slice(0, 60),
    climaxScene: String(body.climaxScene || '').slice(0, 200),
    winFeelings,
    selfIntro: String(body.selfIntro || '').slice(0, 80),
    notYetDone: String(body.notYetDone || '').slice(0, 80),
    voice: String(body.voice || '').slice(0, 250),
    fateEnabled: !!body.fateEnabled,
    fateIntent: body.fateIntent === '想被安慰' ? '想被安慰' : '想被推一把',
    birth: String(body.birth || '').slice(0, 100),
  };

  const missing =
    !a.lifePosition || !a.scenes || !a.block || !a.obstacleType || !a.climaxScene ||
    winFeelings.length === 0 || !a.selfIntro || !a.notYetDone || !a.voice;

  if (missing) {
    res.status(400).json({ error: '缺少必要欄位，請把問卷填完整（對照角色那題可以跳過，其他都要填）。' });
    return;
  }

  const { system, userMessage } = buildPrompt(a);

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
        max_tokens: 2200,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error', apiRes.status, errText);
      res.status(502).json({ error: '生成服務暫時出錯，請稍後再試。' });
      return;
    }

    const data = await apiRes.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    res.status(200).json({ story: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤，請稍後再試。' });
  }
};
