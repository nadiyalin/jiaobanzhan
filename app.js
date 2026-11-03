/* 前端 App。總覽(場次卡 + 跨場次行動清單)/ 我的待辦(時間分段)/ 名冊。
   動作:完成·一起做 / 交接·選人負載 / 改派·接手 / 等外部 / 認領 / 新增任務·場次 / 排時程。
   還沒搬:哪幾天會塞長條圖、子項清單、後台試算表分頁、09:10 摘要。 */
(function () {
  'use strict';

  // ═══ 主題 ═══
  try {
    var _t = localStorage.getItem('handoff-theme');
    document.documentElement.setAttribute('data-theme', _t === 'dark' ? 'dark' : 'light');
  } catch (e) {}
  function applyTheme(t) {
    var dark = t === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('handoff-theme', dark ? 'dark' : 'light'); } catch (e) {}
    document.getElementById('themeBtn').textContent = dark ? '☀' : '☾';
  }
  document.getElementById('themeBtn').onclick = function () {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  };
  document.getElementById('meBtn').onclick = function () { meMenu(); };
  applyTheme(document.documentElement.getAttribute('data-theme'));

  // ═══ 狀態 ═══
  var board = null, scr = 'board', busy = false;
  var boardLoadedAt = null;      // 這份 board 資料是什麼時候抓到的(日曆分頁底部的快取提醒要用)
  var expState = {};             // 個人設定「匯出報表」按鈕狀態:{ exportKanban|exportYearArchive: 'loading'|'done'|'error' }
  var openAudit = null;          // 點進某場次
  var openGroups = {};           // 小節摺疊
  var doneOpen = false;          // 我的待辦:「最近完成」抽屜開了沒
  var sel = {};                  // 待認領多選
  var openCk = {};               // 任務卡的「子項清單」展開狀態(rowId → bool)
  var horizon = 30;             // 總覽時間範圍:30 / 7 / 0(全部)
  var boardFocus = null;        // 點指標篩選:overdue|due|unsched|pool|owned|waiting
  var boardDay = null;          // 點「哪幾天會塞」某一天 → 只看那天到期
  var jamOpen = false;          // 「哪幾天會塞」展開了沒
  var rosterFilter = 'all';    // 名冊身分別篩選:all | role:<身分別> | 窗口 | 醫院(chip 由資料自動生)
  var rosterSub = 'all';       // 名冊第二層篩選(委員→構面 / 窗口·其他醫院→醫院)
  var rosterView = 'contacts'; // 名冊模式:contacts|sessions
  var openSession = null;       // 點進某場次(場次 key)
  var sessEdit = false;        // 場次編輯模式
  var sessPollT = null;         // 場次詳情頁自動刷新 interval
  var sessSyncing = 0;          // 進行中的場次寫入數(>0 時暫停自動刷新,避免蓋掉樂觀更新)
  var sessSyncedAt = 0;         // 上次成功自動刷新的時間
  var openLongList = false;     // 點總覽的「長期追蹤」入口卡 → 進清單頁
  var openLong = null;          // 從清單再點某個長期任務(id) → 進詳情頁
  var ltLaterOpen = false;      // 清單頁「還沒到檔期」展開了沒
  var ltDoneOpen = false;       // 清單頁「已結案」展開了沒
  var ltCloseArm = null;        // 詳情頁「結案」兩段式:第一次按記下 rowId,4 秒歸零
  var ltNoticeOpen = false;     // 詳情頁「注意」區:沒有事項時預設摺疊,點「＋ 加一條注意」才展開
  var ltShowUpd = false;        // 詳情頁 poll 偵測到別人改動 → header 顯示「🔄 剛更新」
  var ltUpdTimer = null;
  var ltTagSel = null;          // 長期詳情頁「記一筆」目前選的類型
  var ltPollT = null;           // 長期詳情頁自動刷新 interval
  var ltFreshSnap = null;       // 這次進詳情頁「當下有哪些是新的」快照(進去後就標記已讀,但本次仍顯示「新」)
  var openCourseList = false;   // 長期追蹤「📋 課程追蹤」入口 → 進課程種類列表
  var openCourseKey = null;     // 列表再點某種課程(courseName) → 進該課程人員名單
  var openCoursePersonId = null; // 名單再點某個人(id) → 進該人詳情頁
  var courseCohortF = 'all';    // 課程名單頁:場次篩選
  var courseStatusF = 'all';    // 課程名單頁:狀態篩選(all/pass/fail/pending)
  var calMonth = null;          // 日曆 tab 目前看的月份 'yyyy-MM'(null = 本月)
  var calDay = null;            // 日曆 tab 點選的某一天 'yyyy-MM-dd'
  var calView = 'month';        // 日曆 tab 檢視:'month' | 'list'
  var calPeople = [];           // 日曆 tab 人員篩選(空 = 全部);id + 'pool'
  var calListDays = 14;         // 清單檢視看未來幾天
  var screen = document.getElementById('screen');
  var modalRoot = document.getElementById('modalRoot');

  // ═══ 純工具(對應 Logic.gs)═══
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pd(d) { var p = String(d).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fd(x) {
    var m = x.getMonth() + 1, dd = x.getDate();
    return x.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (dd < 10 ? '0' + dd : dd);
  }
  function addDays(d, n) { var x = pd(d); x.setDate(x.getDate() + n); return fd(x); }
  function prevFri(d) { var x = pd(d); while (x.getDay() !== 5) x.setDate(x.getDate() - 1); return fd(x); }
  function dd(a, b) { if (!a || !b) return 9999; return Math.round((pd(b) - pd(a)) / 86400000); }
  // ── 國定假日(board.holidays,台灣行事曆表,伺服端 Holidays.gs)──
  function holOff() { return (board.holidays && board.holidays.off) || {}; }
  function holWork() { return (board.holidays && board.holidays.work) || {}; }
  function holName(ds) { return holOff()[ds] || ''; }
  function holShort(nm) {
    return nm.replace(/彈性放假$|放假$/, '').replace(/補假$/, '補').replace(/^臺灣/, '').replace(/紀念日$/, '');
  }
  function isWknd(ds) { var w = pd(ds).getDay(); return w === 0 || w === 6; }
  // ── Google 行事曆(board.calEvents,伺服端 GCal 讀小組共用行事曆)──
  function calEventsOn(ds) {
    return (board.calEvents || []).filter(function (e) { return e.date === ds; });
  }
  // 選日期時的衝突提醒字串(那天行事曆已有事 → 回一句話,沒有 → '')
  function conflictLine(ds) {
    if (!ds) return '';
    var hits = calEventsOn(ds);
    if (!hits.length) return '';
    var names = hits.slice(0, 3).map(function (e) { return (e.time ? e.time + ' ' : '') + e.title; });
    return '⚠ 這天行事曆已有：' + names.join('、') + (hits.length > 3 ? ' 等 ' + hits.length + ' 件' : '');
  }
  // 這天不上班嗎:補班日照上 → 國定假日放 → 其餘看週末。
  function isOffDay(ds) {
    if (holWork()[ds]) return false;
    if (holOff()[ds]) return true;
    return isWknd(ds);
  }
  // 個人「即將到期」提前提醒門檻(工作天)。每個帳號可在 ⚙ 設定,預設 5。
  function soonDays() { return (board && board.myPrefs && +board.myPrefs.soonDays) || 5; }

  // 從今天到 due 之間還有幾個「工作天」(不含週六日 + 國定假日)。當天到期 → 0;已逾期 → 回日曆差(負)。
  function workdaysUntil(due) {
    if (!due) return 9999;
    var d = dd(TODAY(), due);
    if (d <= 0) return d;
    var n = 0, x = pd(TODAY());
    for (var i = 0; i < d; i++) {
      x.setDate(x.getDate() + 1);
      if (!isOffDay(fd(x))) n++;
    }
    return n;
  }
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  function TODAY() { return board.today; }
  function pName(id) { var p = pget(id); return p ? p.name : (id || '—'); }
  function pShort(id) { var p = pget(id); return p ? p.short : '?'; }
  function pget(id) { return (board.people || []).filter(function (x) { return x.id === id; })[0]; }
  function ME() { return board.me.id; }
  // ── 共同執行(團隊)──
  function coOf(t) { return (t && t.coOwners) || []; }
  function isTeam(t) { return coOf(t).length >= 2; }
  function iOwn(t) { return t.owner === ME() || coOf(t).indexOf(ME()) >= 0; }
  function ownerLabel(t) { return isTeam(t) ? '團隊' : (t.owner ? pName(t.owner) : '待認領'); }
  function teamNames(t) { return coOf(t).map(pName).join('、'); }
  function suggestSecond(F, m) {
    if (!F || !m.hasSecond) return '';
    return m.secondWeekday === '五' ? prevFri(addDays(F, m.secondOff)) : addDays(F, m.secondOff);
  }
  function waitStage(t) {
    if (t.status === 'done' || !t.waitWho) return 0;
    if (!t.waitReplyBy) return 1;
    if (dd(TODAY(), t.waitReplyBy) > 0) return 1;
    if (t.waitHardBy && dd(TODAY(), t.waitHardBy) < 0) return 3;
    return 2;
  }
  function urgency(t) {
    var ws = waitStage(t);
    if (ws === 3) return 'overdue';
    if (ws === 2) return 'due';
    if (ws === 1) return 'wait';
    if (!t.due) return 'unscheduled';
    var d = dd(TODAY(), t.due);
    if (d < 0) return 'overdue';
    if (d === 0) return 'due';
    if (d <= 7) return 'thisweek';
    return 'later';
  }
  function loadNear(pid, refDue, exclRow) {
    var refD = refDue ? dd(TODAY(), refDue) : null, week = 0, soon = 0;
    board.tasks.forEach(function (t) {
      if (t.status !== 'open' || t.owner !== pid || !t.due || t.rowId === exclRow) return;
      var d = dd(TODAY(), t.due);
      if (d >= 0 && d <= 14) soon++;
      if (refD != null && Math.abs(d - refD) <= 3) week++;
    });
    return { week: week, soon: soon };
  }
  function loadBadge(pid, refDue, exclRow) {
    var l = loadNear(pid, refDue, exclRow), jam = board.jam.threshold;
    if (refDue) return '<span class="ld' + (l.week >= jam ? ' hot' : '') + '">到期那週 ' + l.week + ' 件</span>';
    return '<span class="ld">未來 14 天 ' + l.soon + ' 件</span>';
  }
  function computeNextSteps(list) {
    var map = {}, firstOpen = -1, lastDone = -1;
    list.forEach(function (t, i) {
      if (t.status === 'done') lastDone = i;
      else if (firstOpen < 0) firstOpen = i;
    });
    if (firstOpen < 0) return map;
    map[list[firstOpen].rowId] = 'next';
    if (lastDone <= firstOpen) list.forEach(function (t, i) {
      if (i > firstOpen && t.status !== 'done') map[t.rowId] = 'later';
    });
    return map;
  }

  // ═══ 送動作 ═══
  function go(type, params, okMsg) {
    if (busy) return;
    busy = true; render();
    api.submit(type, params).then(function (b) {
      board = b; boardLoadedAt = Date.now(); busy = false; sel = {}; closeModal();
      if (okMsg) toast(okMsg);
      render();
    }).catch(function (err) { busy = false; render(); toast('⚠ ' + (err.message || err)); });
  }

  // ═══ UI builders ═══
  function divider(title, count, note, opts) {
    opts = opts || {};
    return '<div class="divider' + (opts.muted ? ' muted' : '') + '">' +
      '<span class="d-t">' + esc(title) + '</span>' +
      (count != null ? '<span class="d-count">' + count + '</span>' : '') +
      (opts.act || '') +
      (note ? '<span class="d-n">' + note + '</span>' : '') + '</div>';
  }
  // 衍生任務在總覽/待辦各區的識別:一顆「📌 衍生任務」chip,點了跳去母任務
  function ltFromChip(t) {
    if (!t.parentLt) return '';
    // 不寫母任務全名 —— 點了就跳過去,名字在那邊看得到
    if (!T(t.parentLt)) return '<span class="tag lt-from">📌 衍生任務</span>';
    return '<button class="tag lt-from" data-ltopen="' + esc(t.parentLt) + '">📌 衍生任務 ›</button>';
  }
  function whenChip(t) {
    if (!t.due) return '<span class="when">未排期</span>';
    var d = dd(TODAY(), t.due), u = urgency(t);
    var soon = d > 0 && workdaysUntil(t.due) <= soonDays();   // 個人可調的提前提醒門檻
    var lbl = d === 0 ? '今天' : d < 0 ? Math.abs(d) + ' 天前'
      : soon ? '還 ' + workdaysUntil(t.due) + ' 個工作天' : d + ' 天後';
    var c = u === 'overdue' ? ' overdue' : (u === 'due' || soon ? ' due' : '');
    return '<span class="when' + c + '">' + t.due.slice(5) + ' 週' + WD[pd(t.due).getDay()] + ' · ' + lbl + '</span>';
  }
  // ── 子項清單(checklist)──
  function taskById(id) { return board.tasks.filter(function (x) { return x.rowId === id; })[0]; }
  function ckOf(t) { return (t && t.checklist) || []; }
  function ckPush(rowId) {
    var t = taskById(rowId);
    ltPush('ckSet', { rowId: rowId, items: ckOf(t) });
  }
  function ckId() { return 'c' + Math.random().toString(16).slice(2, 8); }
  function ckRender(t) {
    var arr = ckOf(t), doneN = arr.filter(function (i) { return i.done; }).length;
    var pct = arr.length ? Math.round(doneN / arr.length * 100) : 0, open = !!openCk[t.rowId];
    var h = '<div class="ck">'
      + '<button class="ck-hd" data-ckopen="' + t.rowId + '" aria-expanded="' + open + '">'
      + '<span class="caret">▶</span>📋 子項 <b>' + doneN + '/' + arr.length + '</b>'
      + (arr.length ? '<span class="ck-bar"><i style="width:' + pct + '%"></i></span>' : '') + '</button>';
    if (open) {
      h += '<div class="ck-body">'
        + arr.map(function (it) {
          return '<label class="ck-row' + (it.done ? ' on' : '') + '">'
            + '<input type="checkbox" data-cktick="' + t.rowId + '¦' + it.id + '"' + (it.done ? ' checked' : '') + '>'
            + '<span class="ck-t">' + esc(it.t) + (it.qty ? ' <b>×' + it.qty + '</b>' : '') + '</span>'
            + (it.done && it.by ? '<span class="ck-by">' + esc(it.by) + '</span>' : '')
            + '<button class="ck-x" data-ckdel="' + t.rowId + '¦' + it.id + '" title="刪除">✕</button></label>';
        }).join('')
        + '<div class="ck-add"><input id="ckin-' + t.rowId + '" placeholder="加一項…（可貼多行）">'
        + '<button data-ckadd="' + t.rowId + '">＋</button></div>'
        + '<div class="ck-foot">'
        + '<button class="ck-docs" data-ckdocs="' + t.rowId + '">📋 帶入備妥文件…</button>'
        + (doneN ? '<button class="ck-clear" data-ckclear="' + t.rowId + '">清掉打勾的 ' + doneN + '</button>' : '')
        + '</div>'
        + '</div>';
    }
    return h + '</div>';
  }
  function docsModal(rowId) {
    var t = T(rowId);
    openModal('<div class="lede">帶入備妥文件</div><h3>' + esc(t.name) + '</h3>'
      + '<div class="fld"><span>要帶哪一組</span><div class="hchips" id="dcSet">'
      + '<button type="button" data-set="紙本" aria-pressed="true">紙本（算份數）</button>'
      + '<button type="button" data-set="電子" aria-pressed="false">電子檔</button></div></div>'
      + '<div id="dcNums"><div class="fld3">'
      + '<label class="fld"><span>委員數</span><input type="number" id="dcC" min="0" value="5"></label>'
      + '<label class="fld"><span>實習觀察員</span><input type="number" id="dcOI" min="0" value="2"></label>'
      + '<label class="fld"><span>工作人員</span><input type="number" id="dcW" min="0" value="3"></label>'
      + '</div></div>'
      + '<div class="sheet-fx">會加進子項清單,同名的略過;份數依上面人數算好。紙本 15 項 / 電子 12 項(從原型搬)。</div>'
      + '<div class="sheet-acts"><button class="btn primary" id="dcGo">帶入</button>'
      + '<button class="btn ghost" data-close>取消</button></div>');
    var set = '紙本';
    document.getElementById('dcSet').onclick = function (e) {
      var b = e.target.closest('[data-set]'); if (!b) return;
      set = b.dataset.set;
      [].forEach.call(this.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.getElementById('dcNums').hidden = (set === '電子');
    };
    document.getElementById('dcGo').onclick = function () {
      go('ckLoadDocs', { rowId: rowId, set: set, C: v('dcC'), OI: v('dcOI'), W: v('dcW') }, '已帶入備妥文件');
    };
  }

  function taskCard(t, o) {
    o = o || {};
    if (t.longTrack) return ltInlineCard(t);   // 長期追蹤任務:留在小節原位,但走另一條路
    var u = urgency(t), ws = waitStage(t);
    var cls = 'task' + (t.status === 'done' ? ' done'
      : o.ns === 'later' ? ' later'
      : u === 'overdue' ? ' overdue' : (u === 'due' || u === 'wait') ? ' due' : '')
      + (isTeam(t) && t.status !== 'done' ? ' teamtask' : '');
    var h = '<div class="' + cls + '">';
    if (t.handoffFrom && t.handoffFrom !== ME() && t.owner === ME() && !t.seenAt)
      h += '<span class="fresh">📨 剛交接給你</span>';
    h += '<div class="task-top">'
      + (o.selectable ? '<label class="claimcheck"><input type="checkbox" data-sel="' + t.rowId + '"' + (sel[t.rowId] ? ' checked' : '') + '></label>' : '')
      + '<span class="task-name">' + esc(t.name) + '</span></div>';
    // 到期日改放 chip 列第一個 —— 跟名字並排時會把長名字擠成一直條
    var tags = [whenChip(t)];
    if (o.ns === 'next') tags.push('<span class="tag next">▶ 建議先做</span>');
    if (t.kind) tags.push('<span class="tag kind">' + esc(t.kind) + '</span>');
    if (t.site && !o.hideSite) tags.push('<span class="tag">' + esc(t.site) + '</span>');
    if (t.groupName) tags.push('<span class="tag stage">小節 ' + (t.pos || '?') + '/' + (t.posN || '?') + '</span>');
    if (t.stageT > 1) tags.push('<span class="tag stage">階段 ' + t.stageN + '/' + t.stageT + '</span>');
    tags.push(ltFromChip(t));
    h += '<div class="tags">' + tags.filter(String).join('') + '</div>';
    if (t.flow) h += '<div class="task-flow">💡 ' + esc(t.flow) + '</div>';
    if (t.folder) h += '<a class="task-doc" href="' + esc(t.folder) + '" target="_blank" rel="noopener">📁 開啟文件 ↗</a>';
    if (t.note2) h += '<div class="task-note">📝 ' + esc(t.note2) + '</div>';
    if (ckOf(t).length || openCk[t.rowId]) h += ckRender(t);
    if (t.handoffNote) h += '<div class="task-note">📩 交接附註:' + esc(t.handoffNote) + '</div>';
    if (o.helped) h += '<div class="task-note helped">🤝 你有一起做 · 主責是 ' + esc(pName(t.owner)) + '(他標的完成)</div>';
    if (ws) {
      var s2 = ws >= 2 ? (ws === 3 ? ' s3' : ' s2') : '';
      var wt = '<b>⏳ 等 ' + esc(t.waitWho) + '</b>';
      if (t.waitReplyBy) wt += '<span>對方應回覆 ' + t.waitReplyBy + (dd(TODAY(), t.waitReplyBy) < 0 ? ' · 已過' : '') + '</span>';
      if (ws === 3) wt += '<span>‼ 已過內部硬截止 ' + (t.waitHardBy || '') + '</span>';
      else if (ws === 2 && t.waitHardBy) wt += '<span>距內部硬截止還有 ' + dd(TODAY(), t.waitHardBy) + ' 天</span>';
      h += '<div class="wait' + s2 + '">' + wt + '</div>';
    }
    // owner line
    if (t.status === 'done') {
      h += '<div class="owner-pill">✅ ' + (isTeam(t) ? '團隊（' + esc(teamNames(t)) + '）' : esc(pName(t.owner))) + ' 完成'
        + (t.helpers && t.helpers.length ? ' · ' + t.helpers.map(pName).join('、') + ' 一起做' : '')
        + (t.doneNote ? ' · ' + esc(t.doneNote) : '') + '</div>';
    } else if (isTeam(t)) {
      h += '<div class="owner-top"><span class="owner-pill"><span class="av-sm team">' + ICO_USERS + '</span>團隊'
        + '<span class="team-sub"> · ' + esc(teamNames(t)) + '</span></span>'
        + (o.takeover && !iOwn(t) ? '<button class="mini-take" data-modal="reassign" data-row="' + t.rowId + '">我接手</button>' : '')
        + '</div>';
    } else if (t.owner) {
      h += '<div class="owner-top"><span class="owner-pill"><span class="av-sm">' + esc(pShort(t.owner)) + '</span>'
        + esc(pName(t.owner)) + '</span>'
        + (o.takeover && t.owner !== ME() ? '<button class="mini-take" data-modal="reassign" data-row="' + t.rowId + '">我接手</button>' : '')
        + '</div>';
    } else {
      h += '<div class="owner-pill">🫙 待認領</div>';
    }
    // actions
    var a = [];
    if (t.status === 'done' && o.mineHistory) {
      a.push('<button class="btn ghost" data-act="reopen" data-row="' + t.rowId + '">↩ 退回未完成</button>');
    } else if (o.mine) {
      a.push('<button class="btn primary" data-modal="done" data-row="' + t.rowId + '">完成</button>');
      a.push('<button class="btn" data-modal="handoff" data-row="' + t.rowId + '">交接 ▾</button>');
      a.push('<button class="btn ghost" data-modal="reassign" data-row="' + t.rowId + '">改派 ▾</button>');
      if (!ws) a.push('<button class="btn ghost" data-modal="wait" data-row="' + t.rowId + '">等外部</button>');
      else a.push('<button class="btn ghost" data-act="endWait" data-row="' + t.rowId + '">結束等待</button>');
    } else if (!t.owner && o.claimable) {
      a.push('<button class="btn primary" data-act="claimQ" data-row="' + t.rowId + '">我認領</button>');
    }
    if (a.length) h += '<div class="acts">' + a.join('') + '</div>';
    var teamJoin = !t.owner && !isTeam(t) && t.status === 'open' && (o.pool || o.claimable);
    if (o.mine || o.pool || o.editable || teamJoin || (o.claimable && !t.owner && t.status === 'open')) {
      h += '<div class="card-manage">'
        + (o.mine ? '<img class="mouse-deco" src="https://nadiyalin.github.io/jiaobanzhan/mouse-crown.png?v=1" alt="" loading="lazy">' : '')
        + (teamJoin ? '<button class="cm-team" data-modal="teamclaim" data-row="' + t.rowId + '">' + ICO_UADD + '找人一起</button>' : '')
        + (!ckOf(t).length && !openCk[t.rowId] ? '<button data-cknew="' + t.rowId + '">＋ 子項清單</button>' : '')
        + '<button data-modal="edit" data-row="' + t.rowId + '">編輯 / 刪除</button></div>';
    }
    h += '</div>';
    return h;
  }
  function byDue(a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; }

  // ── 時間範圍 ──
  function inHorizon(t) {
    if (!horizon) return true;
    if (t.status === 'done') return true;
    if (!t.due) return false;
    return dd(TODAY(), t.due) <= horizon;
  }
  function splitHorizon(list) {
    if (!horizon) return { inn: list, out: [] };
    var inn = [], out = [];
    list.forEach(function (t) { (inHorizon(t) ? inn : out).push(t); });
    return { inn: inn, out: out };
  }
  function horizonChips(note) {
    var opts = [[7, '近 7 天'], [30, '近 30 天'], [0, '全部']];
    return '<div class="horizon"><span class="h-lb">時間範圍</span>' +
      opts.map(function (o) {
        return '<button data-horizon="' + o[0] + '" aria-pressed="' + (horizon === o[0]) + '">' + o[1] + '</button>';
      }).join('') + '</div>' +
      (note ? '<div class="horizon-note">' + note + '</div>' : '');
  }
  function beyondLine(out) {
    if (!out.length) return '';
    var un = out.filter(function (t) { return !t.due; }).length;
    return '<button class="beyond" data-horizon="0">另有 <b>' + out.length + '</b> 件在 ' + horizon + ' 天後' +
      (un ? '(含 ' + un + ' 件未排期)' : '') + ' · 顯示全部 →</button>';
  }

  // ── 哪幾天會塞(不看人,只看日子)──
  function dueCounts(list) {
    var m = {};
    list.forEach(function (t) { if (t.status === 'done' || !t.due) return; m[t.due] = (m[t.due] || 0) + 1; });
    return m;
  }
  function jamDays(list) {
    var m = dueCounts(list), out = [], W = (board.jam && board.jam.window) || 14;
    Object.keys(m).forEach(function (d) {
      var x = dd(TODAY(), d);
      if (x < 0 || x > W) return;
      out.push({ due: d, n: m[d], jam: m[d] >= ((board.jam && board.jam.threshold) || 4) });
    });
    out.sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    return out;
  }
  function renderJam(list) {
    var W = (board.jam && board.jam.window) || 14, TH = (board.jam && board.jam.threshold) || 4;
    var days = jamDays(list), jams = days.filter(function (d) { return d.jam; });
    var h = divider('哪幾天會塞', jams.length ? jams.length + ' 天偏擠' : '都不擠',
      '未來 ' + W + ' 天每天有幾件到期 —— <b>看的是日子不是人</b>。點一天看那天有哪些事、誰負責',
      { muted: !jams.length, act: '<button class="divider-act" data-jamtoggle="1">' + (jamOpen ? '收合' : '展開 ' + days.length + ' 天') + '</button>' });
    if (!jamOpen) return h;
    if (!days.length) return h + '<div class="sect-empty">未來 ' + W + ' 天沒有到期的項目</div>';
    var max = Math.max.apply(null, days.map(function (d) { return d.n; }));
    h += '<div class="jam">' + days.map(function (d) {
      return '<button class="jam-row' + (d.jam ? ' hot' : '') + (boardDay === d.due ? ' on' : '') + '" data-jamday="' + d.due + '">' +
        '<span class="jam-d mono">' + d.due.slice(5) + ' 週' + WD[pd(d.due).getDay()] + '</span>' +
        '<span class="jam-bar"><i style="width:' + Math.round(d.n / max * 100) + '%"></i></span>' +
        '<span class="jam-n mono">' + d.n + '</span>' +
        (d.jam ? '<span class="jam-flag">⚠</span>' : '') + '</button>';
    }).join('') + '</div>';
    h += '<div class="sect-empty">' + TH + ' 件以上標 ⚠。塞的那天可以把幾件<b>改派</b>給比較空的人,或用場次「排入時程」整批平移。</div>';
    return h;
  }

  // ── 依小節分組的可摺疊清單(總覽用;pool=true 每組有勾選框)──
  function boardGroups(list, sec, opts) {
    opts = opts || {};
    var groups = [], order = [];
    list.forEach(function (t) {
      var gname = t.groupName || '單件任務', gkey = sec + '¦' + t.site + '¦' + gname;
      var g = groups[gkey];
      if (!g) { g = groups[gkey] = { key: gkey, site: t.site, gname: gname, loose: !t.groupName, items: [] }; order.push(gkey); }
      g.items.push(t);
    });
    order.forEach(function (k) { groups[k].next = groups[k].items.map(function (t) { return t.status === 'open' ? t.due : null; }).filter(Boolean).sort()[0] || ''; });
    order.sort(function (a, b) {
      var ga = groups[a], gb = groups[b];
      if (!ga.next !== !gb.next) return ga.next ? -1 : 1;
      if (ga.next && gb.next && ga.next !== gb.next) return ga.next < gb.next ? -1 : 1;
      if (ga.loose !== gb.loose) return ga.loose ? 1 : -1;
      return 0;
    });
    var keyList = order.join(',');
    var allOpen = order.every(function (k) { return openGroups[k]; });
    var h = '<div class="gsec-wrap">';
    if (order.length > 1) {
      h += '<div class="gsec-bar"><span>' + order.length + ' 節 · ' + list.length + ' 件</span>' +
        '<button data-gall="' + (allOpen ? 'close' : 'open') + '" data-gkeys="' + esc(keyList) + '">' + (allOpen ? '全部收合' : '全部展開') + '</button></div>';
    }
    order.forEach(function (k) {
      var g = groups[k], open = !!openGroups[k];
      var items = g.items.slice().sort(function (a, b) { return (a.pos && b.pos) ? a.pos - b.pos : byDue(a, b); });
      var doneN = items.filter(function (t) { return t.status === 'done'; }).length;
      var urg = items.filter(function (t) { return urgency(t) === 'overdue' || urgency(t) === 'due'; }).length;
      var picked = opts.pool ? items.filter(function (t) { return sel[t.rowId]; }).length : 0;
      var pct = items.length ? Math.round(doneN / items.length * 100) : 0;
      var summary = opts.pool ? (picked ? picked + '/' + items.length + ' 已勾' : items.length + ' 件') : doneN + '/' + items.length;
      h += '<div class="gcol">';
      h += '<button class="gcol-hd' + (g.loose ? ' loose' : '') + '" aria-expanded="' + open + '" data-gcol="' + esc(k) + '">' +
        (opts.pool ? '<label class="gcol-sel"><input type="checkbox" data-gselect="1" data-gids="' + items.map(function (t) { return t.rowId; }).join(',') + '"' + (picked === items.length ? ' checked' : '') + '></label>' : '') +
        '<span class="caret">▶</span>' +
        '<span class="gname"><b class="g-site">' + esc(g.site) + '</b><b class="g-sec">' + esc(g.gname) + '</b></span>' +
        (urg ? '<span class="gwarn">⚠' + urg + '</span>' : '') +
        '<span class="gbar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="gcount">' + summary + '</span></button>';
      if (open) {
        h += '<div class="gcol-body' + (g.loose ? ' loose' : '') + '">' +
          items.map(function (t) {
            return taskCard(t, opts.pool
              ? { selectable: true, pool: true, hideSite: true }
              : { mine: iOwn(t) && t.status === 'open', takeover: opts.takeover && !isTeam(t) && t.owner && t.owner !== ME(),
                  claimable: !t.owner && !isTeam(t) && t.status === 'open', editable: t.status === 'open', hideSite: true });
          }).join('') + '</div>';
      }
      h += '</div>';
    });
    return h + '</div>';
  }

  // ── 待認領:依站點分組(色塊 + 依最急排序 + 收合小字)──
  // 配色 = 站點在 board.tasks 的出現順序(穩定、不隨急迫度重排),第 1 個站青綠、第 2 個藍…
  function poolSiteColorMap() {
    var idx = {}, n = 0;
    (board.tasks || []).forEach(function (t) {
      var s = t.site || '（未填站點）';
      if (!(s in idx)) idx[s] = 's' + ((n++) % 6);
    });
    return idx;
  }
  function nearLabel(t) {
    if (!t.due) return '未排期';
    var d = dd(TODAY(), t.due), md = t.due.slice(5);
    if (d < 0) return md + ' · 逾期 ' + Math.abs(d) + ' 天';
    if (d === 0) return md + ' · 今天到期';
    var wd = workdaysUntil(t.due);
    return (wd > 0 && wd <= 5) ? md + ' · 還 ' + wd + ' 個工作天' : md;
  }
  function poolSiteList(pool) {
    var by = {}, order = [];
    pool.forEach(function (t) {
      var s = t.site || '（未填站點）';
      if (!by[s]) { by[s] = { site: s, items: [] }; order.push(s); }
      by[s].items.push(t);
    });
    var out = order.map(function (s) {
      var g = by[s];
      g.near = g.items.filter(function (t) { return t.due; }).sort(byDue)[0] || null;
      return g;
    });
    out.sort(function (a, b) {
      if (!a.near !== !b.near) return a.near ? -1 : 1;              // 有排期的站排前面
      if (a.near && b.near && a.near.due !== b.near.due) return a.near.due < b.near.due ? -1 : 1;
      return a.site < b.site ? -1 : 1;
    });
    return out;
  }
  function poolSecGroups(items) {   // 站點內再依「小節」分,單件的排最後
    var by = {}, order = [];
    items.forEach(function (t) {
      var k = t.groupName || ' loose';
      if (!by[k]) { by[k] = { gname: t.groupName || '單件任務', loose: !t.groupName, items: [] }; order.push(k); }
      by[k].items.push(t);
    });
    var out = order.map(function (k) {
      var g = by[k];
      g.items.sort(function (a, b) { return (a.pos && b.pos) ? a.pos - b.pos : byDue(a, b); });
      g.next = g.items.map(function (t) { return t.due || null; }).filter(Boolean).sort()[0] || '';
      return g;
    });
    out.sort(function (a, b) {
      if (a.loose !== b.loose) return a.loose ? 1 : -1;
      if (!a.next !== !b.next) return a.next ? -1 : 1;
      if (a.next && b.next && a.next !== b.next) return a.next < b.next ? -1 : 1;
      return 0;
    });
    return out;
  }
  function poolTaskCard(t) { return taskCard(t, { selectable: true, pool: true, hideSite: true }); }
  function renderPoolBySite(sites) {
    var cmap = poolSiteColorMap();
    var h = '<div class="gsec-wrap">';
    sites.forEach(function (g) {
      var key = 'pool¦' + g.site, isOpen = !!openGroups[key], c = cmap[g.site] || 's0';
      var items = g.items.slice().sort(function (a, b) {
        if (!a.due !== !b.due) return a.due ? -1 : 1;
        return byDue(a, b);
      });
      var picked = items.filter(function (t) { return sel[t.rowId]; }).length;
      var secs = poolSecGroups(items);
      var secN = secs.filter(function (s) { return !s.loose; }).length;
      var warnNear = g.near && (urgency(g.near) === 'overdue' || urgency(g.near) === 'due'
        || (g.near.due && workdaysUntil(g.near.due) > 0 && workdaysUntil(g.near.due) <= 5));
      var hint = isOpen ? ''
        : '<span class="ps-hint' + (warnNear ? ' warn' : '') + '">'
          + (g.near ? '最近 ' + esc(nearLabel(g.near)) : '都未排期')
          + (secN ? ' · ' + secN + ' 小節' : '') + '</span>';
      h += '<div class="pool-site" style="--sc:var(--' + c + ')">'
        + '<button class="pool-site-hd" aria-expanded="' + isOpen + '" data-gcol="' + esc(key) + '">'
        + '<label class="gcol-sel"><input type="checkbox" data-gselect="1" data-gids="'
          + items.map(function (t) { return t.rowId; }).join(',') + '"' + (picked === items.length ? ' checked' : '') + '></label>'
        + '<span class="caret">▶</span><span class="ps-dot"></span>'
        + '<span class="ps-name">' + esc(g.site) + '</span>' + hint
        + '<span class="ps-cnt">' + (picked ? picked + '/' + items.length + ' 已勾' : items.length + ' 件') + '</span></button>';
      if (isOpen) {
        h += '<div class="pool-site-body">';
        if (secs.length < 2) {
          h += items.map(poolTaskCard).join('');   // 只有一組 —— 直接列卡,不用再點
        } else {
          var kkeys = secs.map(function (s) { return key + '¦' + s.gname; });
          var allK = kkeys.every(function (k) { return openGroups[k]; });
          h += '<div class="pool-sec-bar"><span>' + secN + ' 小節'
            + (secs.length > secN ? ' + 單件' : '') + '</span>'
            + '<button data-gall="' + (allK ? 'close' : 'open') + '" data-gkeys="' + esc(kkeys.join(',')) + '">'
            + (allK ? '全部收合' : '全部展開') + '</button></div>';
          secs.forEach(function (s) {
            var kkey = key + '¦' + s.gname, kOpen = !!openGroups[kkey];
            var sp = s.items.filter(function (t) { return sel[t.rowId]; }).length;
            var urg = s.items.filter(function (t) { return urgency(t) === 'overdue' || urgency(t) === 'due'; }).length;
            var nd = s.items.filter(function (t) { return t.due; }).sort(byDue)[0];
            var ndWarn = nd && (urgency(nd) === 'overdue' || urgency(nd) === 'due'
              || (nd.due && workdaysUntil(nd.due) > 0 && workdaysUntil(nd.due) <= 5));
            h += '<div class="pool-sec' + (s.loose ? ' loose' : '') + '">'
              + '<button class="pool-sec-hd" aria-expanded="' + kOpen + '" data-gcol="' + esc(kkey) + '">'
              + '<label class="gcol-sel"><input type="checkbox" data-gselect="1" data-gids="'
                + s.items.map(function (t) { return t.rowId; }).join(',') + '"' + (sp === s.items.length ? ' checked' : '') + '></label>'
              + '<span class="caret">▶</span>'
              + '<span class="pool-sec-name">' + esc(s.gname) + '</span>'
              + (urg ? '<span class="gwarn">⚠' + urg + '</span>' : '')
              + (nd ? '<span class="pool-sec-due' + (ndWarn ? ' warn' : '') + '">' + esc(nd.due.slice(5)) + '</span>' : '')
              + '<span class="pool-sec-cnt">' + (sp ? sp + '/' + s.items.length : s.items.length + ' 件') + '</span></button>';
            if (kOpen) h += '<div class="pool-sec-body">' + s.items.map(poolTaskCard).join('') + '</div>';
            h += '</div>';
          });
        }
        h += '</div>';
      }
      h += '</div>';
    });
    return h + '</div>';
  }

  function section(title, tasks, o, note, alwaysShow, emptyDeco) {
    if (!tasks.length && !alwaysShow) return '';
    var head = divider(title, tasks.length, note, o && o.dopts);
    if (!tasks.length) {
      return head + '<div class="sect-empty">目前沒有'
        + (emptyDeco ? '<img class="sect-empty-deco" src="https://nadiyalin.github.io/jiaobanzhan/' + emptyDeco + '" alt="" loading="lazy">' : '')
        + '</div>';
    }
    return head + tasks.map(function (t) { return taskCard(t, o); }).join('');
  }

  // ── 場次卡 ──
  function auditStat(auditId) {
    var rows = board.tasks.filter(function (t) { return t.auditId === auditId && !t.longTrack; });
    var done = rows.filter(function (t) { return t.status === 'done'; }).length;
    var overdue = rows.filter(function (t) { return t.status === 'open' && urgency(t) === 'overdue'; }).length;
    var pool = rows.filter(function (t) { return t.status === 'open' && !t.owner; }).length;
    var wait = rows.filter(function (t) { return waitStage(t) >= 2; }).length;
    var anchor = rows.map(function (t) { return t.status === 'open' ? t.due : null; }).filter(Boolean).sort()[0] || '';
    var scheduled = rows.some(function (t) { return !!t.due; });
    return { total: rows.length, done: done, overdue: overdue, pool: pool, wait: wait, anchor: anchor, scheduled: scheduled,
      site: rows[0] && rows[0].site, tplKey: rows[0] && rows[0].tplKey, bizType: rows[0] && rows[0].bizType };
  }
  var TPL_LABEL = { audit: '實地稽核', guide: '醫院輔導', annual: '年度計畫' };
  function auditKind(s) { return TPL_LABEL[s.tplKey] || s.bizType || '場次'; }
  function auditCard(auditId, mini) {
    var s = auditStat(auditId);
    var pct = s.total ? Math.round(s.done / s.total * 100) : 0;
    var nums = [];
    if (s.overdue) nums.push('<span class="n-crit">⚠' + s.overdue + ' 逾期</span>');
    if (s.pool) nums.push(s.pool + ' 待認領');
    if (s.wait) nums.push('<span class="n-warn">' + s.wait + ' 等外部</span>');
    return '<button class="acard' + (mini ? ' mini' : '') + (s.overdue ? ' hot' : '') + (openAudit === auditId ? ' on' : '')
      + '" data-audit="' + auditId + '">' +
      '<div class="ac-top"><span class="ac-title">' + esc(s.site || auditId) + '</span><span class="ac-go">›</span></div>' +
      '<div class="ac-kind">' + esc(auditKind(s)) + '</div>' +
      '<div class="ac-sub">' + (s.anchor ? '最近 ' + s.anchor.slice(5) : s.scheduled ? '全部有排期' : '⚠ 尚未排時程') + '</div>' +
      '<div class="ac-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="ac-nums"><b>' + s.done + '/' + s.total + '</b>' + (nums.length ? ' · ' + nums.join(' · ') : '') + '</div>' +
      '</button>';
  }

  // ── 小節摺疊(場次鑽入用)──
  function gcol(key, site, secName, tasks, loose) {
    var open = openGroups[key];
    var done = tasks.filter(function (t) { return t.status === 'done'; }).length;
    var overdue = tasks.filter(function (t) { return t.status === 'open' && urgency(t) === 'overdue'; }).length;
    var pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    var ns = computeNextSteps(tasks.slice().sort(function (a, b) { return (a.pos || 0) - (b.pos || 0); }));
    var h = '<div class="gcol">';
    h += '<button class="gcol-hd' + (loose ? ' loose' : '') + '" aria-expanded="' + (open ? 'true' : 'false') + '" data-gcol="' + key + '">' +
      '<span class="caret">▶</span>' +
      '<span class="gname"><b class="g-site">' + esc(site) + '</b><b class="g-sec">' + esc(secName) + '</b></span>' +
      '<span class="gbar"><i style="width:' + pct + '%"></i></span>' +
      '<span class="gcount">' + done + '/' + tasks.length + '</span>' +
      (overdue ? '<span class="gwarn">⚠' + overdue + '</span>' : '') + '</button>';
    if (open) {
      h += '<div class="gcol-body' + (loose ? ' loose' : '') + '">' +
        tasks.slice().sort(function (a, b) { return (a.pos || 0) - (b.pos || 0); }).map(function (t) {
          return taskCard(t, { mine: iOwn(t) && t.status === 'open', takeover: !isTeam(t) && t.owner && t.owner !== ME(),
            claimable: !t.owner && !isTeam(t), hideSite: true, ns: ns[t.rowId] });
        }).join('') + '</div>';
    }
    h += '</div>';
    return h;
  }

  // ═══ 總覽 ═══
  function poolBar() {
    var n = selCount();
    // 勾選時長條按鈕本身跟沒勾選時形狀不變(認領勾選的N件)——左邊多貼一顆✕取消,中間不切分隔線
    var main = n
      ? '<span class="pool-split">'
        + '<button class="btn primary pool-x" data-act="clearSel" aria-label="取消勾選">' + ICO_X + '</button>'
        + '<button class="btn primary" data-act="claimSel">認領勾選的 ' + n + ' 件</button>'
        + '</span>'
      : '<button class="btn primary" data-act="claimSel" disabled>認領勾選的 0 件</button>';
    // 裝飾:沒勾選時是便利貼(純裝飾);一勾選換成兩人插畫,同時變成可點的「團隊」按鈕(浮在長條上方,不疊到任何按鈕)
    var deco = n
      ? '<button class="pool-team-btn" data-act="claimSelTeam" aria-label="找人一起團隊認領">'
        + '<img src="https://nadiyalin.github.io/jiaobanzhan/pool-team.png?v=1" alt="">'
        + '<span class="pool-team-tag">團隊</span></button>'
      : '<img class="pool-notes" src="https://nadiyalin.github.io/jiaobanzhan/pool-notes.png?v=1" alt="" loading="lazy">';
    return '<div class="pool-bar">' + main + deco + '</div>';
  }
  function renderBoard() {
    if (openLong) return renderLongDetail();
    if (openCoursePersonId) return renderCoursePersonDetail();
    if (openCourseKey) return renderCourseDetail();
    if (openCourseList) return renderCourseList();
    if (openLongList) return renderLongList();
    if (openAudit) return renderAuditDrill();
    var all = board.tasks;
    // 長期追蹤任務不進「到期日」那一整套指標 / 分群
    var open = all.filter(function (t) { return t.status === 'open' && !t.longTrack; });
    var done = all.filter(function (t) { return t.status === 'done' && !t.longTrack; });

    // 指標永遠算全量
    var overdue = open.filter(function (t) { return urgency(t) === 'overdue'; }).sort(byDue);
    var dueToday = open.filter(function (t) { return urgency(t) === 'due'; }).sort(byDue);
    var unsched = open.filter(function (t) { return !t.due; });
    var pool = open.filter(function (t) { return !t.owner; }).sort(byDue);
    var waitingT = open.filter(function (t) { return t.owner && waitStage(t); }).sort(byDue);
    var owned = open.filter(function (t) { return t.owner && !waitStage(t); }).sort(byDue);
    var chase = waitingT.filter(function (t) { return waitStage(t) >= 2; }).sort(byDue);
    var attn = owned.filter(function (t) {
      var u = urgency(t);
      if (u === 'overdue' || u === 'due') return true;
      if (t.due) { var wd = workdaysUntil(t.due); return wd > 0 && wd <= soonDays(); }   // 個人可調的提前預警門檻
      return false;
    }).sort(byDue);
    var unseen = open.filter(function (t) { return t.handoffFrom === ME() && t.owner !== ME() && !t.seenAt; });

    var total = all.filter(function (t) { return !t.longTrack; }).length, dn = done.length;
    var pctD = total ? dn / total * 100 : 0, pctO = total ? overdue.length / total * 100 : 0, pctW = total ? dueToday.length / total * 100 : 0;

    var FOCUS = {
      overdue: { label: '已逾期', list: overdue, takeover: true },
      due: { label: '今天到期', list: dueToday, takeover: true },
      unsched: { label: '未排期', list: unsched, takeover: true },
      pool: { label: '待認領', list: pool, pool: true },
      owned: { label: '有人在做', list: owned, takeover: true },
      waiting: { label: '等外部', list: waitingT, takeover: true }
    };
    if (boardFocus && !FOCUS[boardFocus]) boardFocus = null;

    var auditIds = [];
    all.forEach(function (t) { if (t.auditId && auditIds.indexOf(t.auditId) < 0) auditIds.push(t.auditId); });
    // 場次卡也要照急迫度排:有逾期任務的場次最前面,再來依最近到期日(anchor)排,
    // 還沒排時程的排最後 —— 原本是純建立順序,快到期的場次會被埋在後面。
    auditIds.sort(function (idA, idB) {
      var sa = auditStat(idA), sb = auditStat(idB);
      var ra = sa.overdue > 0 ? 0 : (sa.scheduled ? 1 : 2);
      var rb = sb.overdue > 0 ? 0 : (sb.scheduled ? 1 : 2);
      if (ra !== rb) return ra - rb;
      if (ra < 2 && sa.anchor !== sb.anchor) return sa.anchor < sb.anchor ? -1 : 1;
      return 0;
    });
    var lts = ltList();
    var ltUnreadN = lts.reduce(function (n, t) { return n + ltUnread(t); }, 0);
    var h = '';
    if (auditIds.length || lts.length) {
      h += divider('長期追蹤 · 場次', (lts.length ? 1 : 0) + auditIds.length,
        '橫向滑看 —— 點一張進去。第一張是長期追蹤入口,後面是稽核場次',
        { act: ltUnreadN ? '<span class="lt-unread">🔴 ' + ltUnreadN + ' 則新動態</span>' : '' });
      h += '<div class="acards rail">'
        + (lts.length ? ltEntryCard(lts, ltUnreadN) : '')
        + auditIds.map(function (id) { return auditCard(id, true); }).join('')
        + '</div>';
    }

    h += horizonChips('只影響下面的清單 —— <b>上面的進度條與指標永遠算全部</b>');

    h += '<div class="board-prog">' +
      '<div class="board-prog-top"><span><b>' + dn + '</b> / ' + total + ' 件完成 <em>(' + Math.round(pctD) + '%)</em></span></div>' +
      '<div class="board-prog-bar"><i class="d" style="width:' + pctD + '%"></i><i class="o" style="width:' + pctO + '%"></i><i class="w" style="width:' + pctW + '%"></i></div>' +
      '<div class="board-prog-lg"><s class="d">已完成 ' + dn + '</s><s class="o">逾期 ' + overdue.length + '</s><s class="w">今天 ' + dueToday.length + '</s><s class="r">其餘 ' + (total - dn - overdue.length - dueToday.length) + '</s></div>' +
      '<img class="prog-hug" src="https://nadiyalin.github.io/jiaobanzhan/prog-hug.png?v=1" alt="" loading="lazy"></div>';

    function stat(key, cls) {
      var f = FOCUS[key], n = f.list.length;
      return '<button class="stat ' + (n ? cls : 'zero') + '" data-focus="' + key + '" aria-pressed="' + (boardFocus === key) + '"><b>' + n + '</b><span>' + f.label + '</span></button>';
    }
    h += '<div class="statgrp"><div class="statgrp-lb">要盯的 · 依到期</div><div class="stats">' +
      stat('overdue', 'crit') + stat('due', 'warn') + stat('unsched', '') + '</div></div>';
    h += '<div class="statgrp"><div class="statgrp-lb">球在誰那邊(三格 + 已完成 = 全部)</div><div class="stats">' +
      stat('pool', 'warn') + stat('owned', '') + stat('waiting', '') + '</div></div>';
    h += '<div class="ball-deco">' +
      '<img class="bd-clutter" src="https://nadiyalin.github.io/jiaobanzhan/clutter-wide.png?v=1" alt="" loading="lazy">' +
      '<img class="bd-rest" src="https://nadiyalin.github.io/jiaobanzhan/rest-wide.png?v=1" alt="" loading="lazy"></div>';

    if (boardFocus) {
      var f = FOCUS[boardFocus];
      h += '<div class="focus-bar"><span>只看「' + esc(f.label) + '」· ' + f.list.length + ' 件</span><button data-focusclear="1">看全部 ✕</button></div>';
      if (!f.list.length) h += '<div class="empty">這一群目前是空的</div>';
      else if (f.pool) h += renderPoolBySite(poolSiteList(f.list));   // 待認領 → 站點色塊 + 站內小節收合(跟主總覽一致)
      else h += boardGroups(f.list, 'focus', { takeover: f.takeover });
      if (f.pool) h += poolBar();
      screen.innerHTML = h; return;
    }
    if (boardDay) {
      var dayList = open.filter(function (t) { return t.due === boardDay; }).sort(byDue);
      h += '<div class="focus-bar"><span>只看 ' + boardDay.slice(5) + ' 週' + WD[pd(boardDay).getDay()] + ' 到期 · ' + dayList.length + ' 件</span><button data-jamday="">看全部 ✕</button></div>';
      h += dayList.length ? boardGroups(dayList, 'day', { takeover: true }) : '<div class="empty">那天沒有到期的項目</div>';
      screen.innerHTML = h; return;
    }

    h += renderJam(open);

    var poolSites = poolSiteList(pool);
    h += divider('待認領', poolSites.length + ' 站 · ' + pool.length + ' 件',
      '還沒有人負責 —— 依站點分組,最急的排前面。勾選後可一次認領多筆,合併成一則 LINE');
    if (!pool.length) h += '<div class="sect-empty">目前沒有待認領的</div>';
    else h += renderPoolBySite(poolSites) + poolBar();

    h += section('該去催外部', chase, { takeover: true }, '對方超過應回覆日了 —— 打電話或寄信催', true, 'chase-call.png?v=2');
    h += section('需要注意的', attn, { takeover: true }, '已有人做,而且逾期 / 今天到期 / 5 個工作天內要交(不含週末 / 國定假日)', true);
    h += section('交接後對方還沒看到', unseen, { dopts: { muted: true } }, '你交出去了,對方還沒開過「我的待辦」', unseen.length > 0);
    screen.innerHTML = h;
  }

  // ═══ 長期追蹤(折進 tasks;id = 任務的 rowId)═══
  function ltById(id) { return (board.tasks || []).filter(function (x) { return x.rowId === id; })[0]; }
  function ltList() { return (board.tasks || []).filter(function (t) { return t.longTrack && t.status === 'open'; }); }
  function ltTagsArr(t) {
    return String(t.ltTags || '').split(/\s*[,、]\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function ltName(t) { return t.name || '(未命名)'; }
  function ltLog(id) {
    return (board.ltlog || []).filter(function (e) { return e.id === id; })
      .sort(function (a, b) { return a.t < b.t ? 1 : -1; });   // 新 → 舊
  }
  function ltLastT(t) { var l = ltLog(t.rowId)[0]; return l ? l.t : ''; }
  function ltSeenAt(id) { return (board.ltSeen || {})[id] || ''; }
  function ltUnread(t) {
    var seen = ltSeenAt(t.rowId), meName = board.me.name;
    return ltLog(t.rowId).filter(function (e) { return e.who !== meName && e.t > seen; }).length;
  }
  function ltFreshIds(t) {
    var seen = ltSeenAt(t.rowId), meName = board.me.name;
    return ltLog(t.rowId).filter(function (e) { return e.who !== meName && e.t > seen; }).map(function (e) { return e.t; });
  }
  function ltWhos(t) {
    var seen = {}, out = [];
    ltLog(t.rowId).forEach(function (e) { if (e.who && !seen[e.who]) { seen[e.who] = 1; out.push(e.who); } });
    return out;
  }
  function ltSpanState(t) {
    var from = t.ltFrom, to = t.due;
    if (!from || !to) return null;   // 缺任一 = 無期限
    var n = TODAY(), rng = from.slice(5) + ' ～ ' + to.slice(5);
    if (n < from) return { phase: 'later', range: rng };
    if (n > to) return { phase: 'over', label: '檔期已過,該收尾了', range: rng };
    var left = dd(n, to);
    if (left <= 10) return { phase: 'soon', label: '檔期剩 ' + left + ' 天', range: rng };
    return { phase: 'live', label: '檔期進行中', range: rng };
  }
  function ltRel(t) {   // t = "yyyy-MM-dd HH:mm"
    var day = t.slice(0, 10), hm = t.slice(11);
    var n = dd(day, TODAY());
    var r = n === 0 ? '今天' : n === 1 ? '昨天' : (n > 1 && n < 7) ? n + ' 天前' : day.slice(5);
    return r + ' ' + hm;
  }
  function nowLocalStamp() {
    var d = new Date();
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function ltMarkSeenLocal(id) { (board.ltSeen = board.ltSeen || {})[id] = nowLocalStamp(); }
  function ltPush(type, params) {
    api.submit(type, params).catch(function (e) { toast('⚠ 同步失敗:' + (e && e.message || e)); });
  }
  function ltWorkingName(t) { return t.ltWorking ? pName(t.ltWorking) : ''; }
  // 文件位置 —— 長期追蹤詳情頁也要能一鍵開資料夾;沒設過就給一顆直接去設定的鈕
  function ltDocRow(t) {
    if (t.folder) return '<div class="lt-doc"><a class="task-doc" href="' + esc(t.folder)
      + '" target="_blank" rel="noopener">📁 開啟文件 ↗</a></div>';
    return '<div class="lt-doc"><button class="task-doc empty" id="ltDocSet">📁 ＋ 設定文件位置</button></div>';
  }
  function ltDoneList() { return (board.tasks || []).filter(function (t) { return t.longTrack && t.status === 'done'; }); }

  // ── 注意事項(B):到 remindOn 那天早報會頂出來;逾期未劃掉的排前面 ──
  function ltNoticeArr(t) { return (t && t.ltNotice) || []; }
  function ltNoticeBlock(it) {
    var arr = ltNoticeArr(it).slice();
    var today = TODAY();
    arr.sort(function (a, b) {
      var ap = a.remindOn && a.remindOn <= today ? 0 : (a.remindOn ? 1 : 2);
      var bp = b.remindOn && b.remindOn <= today ? 0 : (b.remindOn ? 1 : 2);
      return ap - bp || ((a.remindOn || '9999') < (b.remindOn || '9999') ? -1 : 1);
    });
    // 沒有任何注意事項 → 摺疊成一行,點了才展開輸入
    if (!arr.length && !ltNoticeOpen)
      return '<button class="lt-nc-collapsed" data-ltnoticeexpand="1">⚠ 注意　＋ 加一條</button>';
    var hot = arr.some(function (n) { return n.remindOn && n.remindOn <= today; });
    var h = '<div class="lt-notice' + (hot ? ' on' : '') + '">'
      + '<div class="lt-nc-h">⚠ 注意' + (arr.length ? ' <span class="d-count">' + arr.length + '</span>' : '')
      + (!arr.length ? '<button class="lt-nc-x" data-ltnoticecollapse="1">收起</button>' : '') + '</div>';
    arr.forEach(function (n) {
      var due = n.remindOn && n.remindOn <= today;
      var rb = n.remindOn
        ? '<span class="lt-ni-r' + (due ? ' past' : '') + '">提醒 ' + esc(n.remindOn.slice(5)) + '</span>'
        : '<span>無提醒日</span>';
      h += '<div class="lt-ni' + (n.remindOn ? '' : ' plain') + '">'
        + '<div class="lt-ni-x"><span>' + esc(n.text) + '</span>'
        + '<button class="lt-ni-del" data-ltnoticedel="' + esc(it.rowId) + '¦' + esc(n.id) + '" title="刪除">✕</button></div>'
        + '<div class="lt-ni-m">' + rb + (n.by ? '<span>· ' + esc(n.by) + '</span>' : '')
        + (n.at ? '<span>· ' + esc(ltRel(n.at)) + '</span>' : '') + '</div></div>';
    });
    if (!arr.length) h += '<div class="sect-empty" style="padding:0">還沒有注意事項。想提醒同事「即將要做什麼 / 注意某變動」就加一條。</div>';
    h += '<div class="lt-nc-add">'
      + '<input type="text" id="ltNcText" placeholder="加一條注意…">'
      + '<input type="date" id="ltNcDate" title="提醒日(選填)">'
      + '<button class="btn primary" data-ltnoticeadd="' + esc(it.rowId) + '">加入</button></div>';
    return h + '</div>';
  }

  // ── 衍生任務:從母任務拆出來的一般任務(有負責人 / 到期日,會進早報)──
  function ltChildren(id) {
    return (board.tasks || []).filter(function (t) { return t.parentLt === id && t.status !== 'deleted'; })
      .sort(function (a, b) {
        if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
        return (a.due || '9999') < (b.due || '9999') ? -1 : 1;
      });
  }
  function ltSpinCard(t) {
    var done = t.status === 'done', ws = waitStage(t), u = done ? '' : urgency(t);
    var cls = 'lt-spin';
    if (done) cls += ' done';
    else if (ws) cls += ' waiting';
    else if (u === 'overdue') cls += ' overdue';
    else if (u === 'due') cls += ' due';
    var whenTxt, whenCls = 'lt-spin-when';
    if (done) whenTxt = '✓ 完成';
    else if (!t.due) whenTxt = '未排期';
    else {
      var d = dd(TODAY(), t.due), soon = d > 0 && workdaysUntil(t.due) <= soonDays();
      whenTxt = t.due.slice(5) + '（' + (d === 0 ? '今天' : d < 0 ? Math.abs(d) + ' 天前' : soon ? '還 ' + workdaysUntil(t.due) + ' 工作天' : d + ' 天後') + '）';
      if (u === 'overdue') whenCls += ' overdue'; else if (u === 'due' || soon) whenCls += ' due';
    }
    // 資訊排列跟一般任務卡一致:名稱+到期 → 類型/站點/小節 → 文件 → 備註 → 負責人 → 等外部
    var tags = [];
    if (t.kind) tags.push('<span class="tag kind">' + esc(t.kind) + '</span>');
    if (t.site) tags.push('<span class="tag">' + esc(t.site) + '</span>');
    if (t.groupName) tags.push('<span class="tag stage">小節 ' + (t.pos || '?') + '/' + (t.posN || '?') + '</span>');
    tags.unshift('<span class="' + whenCls + ' tagged">' + esc(whenTxt) + '</span>');
    var h = '<div class="' + cls + '"><button class="lt-spin-hit" data-ltchild="' + esc(t.rowId) + '">'
      + '<div class="lt-spin-top"><span class="lt-spin-name">' + esc(t.name) + '</span></div>'
      + '<div class="tags">' + tags.join('') + '</div>'
      + (t.note2 ? '<div class="task-note">📝 ' + esc(t.note2) + '</div>' : '')
      + (isTeam(t)
          ? '<div class="lt-spin-m"><span class="av-sm">' + ICO_USERS + '</span>團隊<span class="team-sub"> · ' + esc(teamNames(t)) + '</span></div>'
          : '<div class="lt-spin-m"><span class="av-sm">' + esc(t.owner ? pShort(t.owner) : '?') + '</span>'
            + esc(t.owner ? pName(t.owner) : '待認領') + '</div>');
    if (!done && ws)
      h += '<div class="lt-spin-wait">⏳ 等 ' + esc(t.waitWho) + (t.waitReplyBy ? ' · 應回 ' + esc(t.waitReplyBy.slice(5)) : '') + '</div>';
    h += '</button>';
    if (t.folder) h += '<a class="task-doc" href="' + esc(t.folder) + '" target="_blank" rel="noopener">📁 開啟文件 ↗</a>';
    return h + '</div>';
  }

  // 總覽橫向排的「長期追蹤」單一入口卡
  function ltEntryCard(lts, unreadN) {
    var running = 0, over = 0, working = 0, lastT = '', lastWho = '';
    lts.forEach(function (t) {
      var ss = ltSpanState(t);
      if (ss && ss.phase === 'over') over++;
      else if (!ss || ss.phase !== 'later') running++;
      if (t.ltWorking) working++;
      var l = ltLog(t.rowId)[0];
      if (l && l.t > lastT) { lastT = l.t; lastWho = l.who; }
    });
    var hot = unreadN > 0 || over > 0;
    var nums = lastT ? ('最後 ' + esc(ltRel(lastT)) + (lastWho ? ' ' + esc(lastWho[0]) : '')) : '尚無動態';
    if (working) nums += ' · <span class="n-warn">👀' + working + '</span>';
    if (unreadN) nums += ' · <span class="n-crit">🔴' + unreadN + '</span>';
    return '<button class="acard lt' + (hot ? ' hot' : '') + '" data-ltentry="1">'
      + '<div class="lt-body">'
      + '<div class="ac-top"><span class="ac-title">📌 長期追蹤</span><span class="ac-go">›</span></div>'
      + '<div class="ac-kind">跨很多天 · 誰在顧 / 誰動過</div>'
      + '<div class="ac-sub">共 ' + lts.length + ' 件 · 進行中 ' + running + (over ? ' · 過期 ' + over : '') + '</div>'
      + '<div class="ac-nums">' + nums + '</div>'
      + '</div>'
      + '<div class="lt-peek-wrap" aria-hidden="true"><img class="lt-peek" src="https://nadiyalin.github.io/jiaobanzhan/lt-peek.png?v=3" alt="" loading="lazy" width="52" height="91"></div>'
      + '</button>';
  }

  // 小節裡的長期追蹤卡(留在原位,青綠色條 + 📌,點一下進詳情)
  function ltInlineCard(t) {
    var ss = ltSpanState(t), u = ltUnread(t), last = ltLog(t.rowId)[0];
    var whenTxt = ss ? ss.range : '無期限';
    var h = '<button class="task lt' + (u || (ss && ss.phase === 'over') ? ' hot' : '') + '" data-ltopen="' + esc(t.rowId) + '">'
      + '<div class="task-top"><span class="task-name">' + esc(ltName(t)) + '</span>'
      + '<span class="when">' + esc(whenTxt) + '</span></div>'
      + '<div class="tags"><span class="tag stage">📌 長期追蹤</span>'
      + (ss && ss.phase === 'over' ? '<span class="tag kind">檔期已過</span>'
         : (ss && ss.phase === 'soon' ? '<span class="tag kind">' + esc(ss.label) + '</span>' : '')) + '</div>'
      + '<div class="owner-top"><span class="owner-pill">'
      + (last ? '<span class="av-sm">' + esc(last.who ? last.who[0] : '?') + '</span>最後動作 ' + esc(ltRel(last.t)) + ' · ' + esc(last.who)
             : '🕔 尚無動態')
      + '</span>' + (u ? '<span class="fresh">● ' + u + ' 則新動態</span>' : '') + '</div>';
    if (t.ltWorking && t.ltWorking !== ME())
      h += '<div class="wait s2"><b>👀 ' + esc(ltWorkingName(t)) + ' 正在顧這攤</b><span>先去忙別的,別重工</span></div>';
    else if (t.ltWorking === ME())
      h += '<div class="wait s2" style="border-left-color:var(--accent);background:var(--accent-soft);color:var(--accent-ink)"><b>👀 你正在顧這攤</b></div>';
    return h + '<div class="lt-hint">進長期追蹤 ›</div></button>';
  }

  // 清單頁的單一任務卡
  function ltListCard(t) {
    var ss = ltSpanState(t), u = ltUnread(t), last = ltLog(t.rowId)[0];
    var cls = 'task lt', whenCls = 'when', whenTxt = ss ? ss.range : '無期限', tag = '';
    if (t.status === 'done') {
      return '<button class="task lt later" data-ltopen="' + esc(t.rowId) + '">'
        + '<div class="task-top"><span class="task-name">' + esc(ltName(t)) + '</span>'
        + '<span class="when">' + esc(t.doneAt ? t.doneAt.slice(5, 10) : '') + '</span></div>'
        + '<div class="tags"><span class="tag close">✓ 已結案</span>'
        + (t.doneNote ? '<span class="tag">' + esc(t.doneNote.slice(0, 20)) + '</span>' : '') + '</div></button>';
    }
    if (ss && ss.phase === 'later') cls += ' later';
    if (ss && ss.phase === 'over') { cls += ' overdue'; whenCls += ' overdue'; tag = '<span class="tag kind">檔期已過</span>'; }
    else if (ss && ss.phase === 'soon') { cls += ' due'; whenCls += ' due'; tag = '<span class="tag kind">' + esc(ss.label) + '</span>'; }
    else if (ss && ss.phase === 'live') tag = '<span class="tag stage">' + esc(ss.label) + '</span>';
    else tag = '<span class="tag">無期限</span>';
    var h = '<button class="' + cls + '" data-ltopen="' + esc(t.rowId) + '">'
      + '<div class="task-top"><span class="task-name">' + esc(ltName(t)) + '</span>'
      + '<span class="' + whenCls + '">' + esc(whenTxt) + '</span></div>'
      + '<div class="tags"><span class="tag stage">📌 長期追蹤</span>' + tag
      + (t.site ? '<span class="tag">' + esc(t.site) + (t.groupName ? ' · ' + esc(t.groupName) : '') + '</span>' : '') + '</div>';
    h += '<div class="owner-top"><span class="owner-pill"><span class="av-sm">'
      + esc(last ? (last.who ? last.who[0] : '?') : '—') + '</span>最後動作 '
      + (last ? esc(ltRel(last.t)) + ' · ' + esc(last.who) : '尚無動態') + '</span>'
      + (u ? '<span class="fresh">● ' + u + ' 則新動態</span>' : '') + '</div>';
    if (t.ltWorking && t.ltWorking !== ME())
      h += '<div class="wait s2"><b>👀 ' + esc(ltWorkingName(t)) + ' 正在顧這攤</b><span>先去忙別的,別重工</span></div>';
    else if (t.ltWorking === ME())
      h += '<div class="wait s2" style="border-left-color:var(--accent);background:var(--accent-soft);color:var(--accent-ink)"><b>👀 你正在顧這攤</b></div>';
    return h + '</button>';
  }

  // 急迫度排序用:已過期(0)最前面、檔期剩 ≤10 天(1)其次、其餘(含沒期限的)排最後(2)。
  // 同一級再比剩餘天數(越少越前);沒有急迫性的才回頭比未讀動態 / 最後動作時間。
  function ltUrgencyRank(t) {
    var ss = ltSpanState(t);
    if (ss && ss.phase === 'over') return 0;
    if (ss && ss.phase === 'soon') return 1;
    return 2;
  }
  function renderLongList() {
    var all = ltList();
    var active = [], later = [];
    all.forEach(function (t) {
      var ss = ltSpanState(t);
      if (ss && ss.phase === 'later') later.push(t); else active.push(t);
    });
    active.sort(function (a, b) {
      var ra = ltUrgencyRank(a), rb = ltUrgencyRank(b);
      if (ra !== rb) return ra - rb;
      if (ra < 2) {
        var da = dd(TODAY(), a.due), db = dd(TODAY(), b.due);
        if (da !== db) return da - db;
      }
      return (ltUnread(b) - ltUnread(a)) || (ltLastT(b) < ltLastT(a) ? -1 : 1);
    });
    var unreadN = active.reduce(function (n, t) { return n + ltUnread(t); }, 0);

    var courseFailN = courseAll().filter(function (c) { return c.passed === false; }).length;
    var h = '<div class="roster-head"><button class="btn ghost-btn" id="llBack">← 總覽</button>'
      + '<button class="btn ghost-btn course-entry" id="courseEntry">' + ICO_COURSE
      + '課程追蹤' + (courseFailN ? '<span class="badge">' + courseFailN + '</span>' : '') + '</button>'
      + '</div>';
    h += divider('長期追蹤', active.length,
      '一直都在、跨很多天的任務 —— 誰動過、動了什麼、現在誰在顧',
      { act: unreadN ? '<span class="lt-unread">🔴 ' + unreadN + ' 則新動態</span>' : '' });
    var done = ltDoneList();
    if (!active.length && !later.length && !done.length) h += '<div class="empty">還沒有長期追蹤任務 —— 在任務卡的「編輯」裡打開「長期追蹤」開關</div>';
    active.forEach(function (t) { h += ltListCard(t); });
    if (later.length) {
      h += '<div class="divider muted"><span class="d-t">還沒到檔期</span><span class="d-count">' + later.length + '</span>'
        + '<button class="divider-act" data-lllater="1">' + (ltLaterOpen ? '收合' : '展開') + '</button></div>';
      if (ltLaterOpen) later.forEach(function (t) { h += ltListCard(t); });
    }
    if (done.length) {
      done.sort(function (a, b) { return (b.doneAt || '') < (a.doneAt || '') ? -1 : 1; });
      h += '<div class="divider muted"><span class="d-t">已結案</span><span class="d-count">' + done.length + '</span>'
        + '<button class="divider-act" data-ltdone="1">' + (ltDoneOpen ? '收合' : '展開') + '</button></div>';
      if (ltDoneOpen) done.forEach(function (t) { h += ltListCard(t); });
    }
    screen.innerHTML = h;
    document.getElementById('llBack').onclick = function () { stopLtPoll(); openLongList = false; render(); };
    document.getElementById('courseEntry').onclick = function () { stopLtPoll(); openLongList = false; openCourseList = true; render(); };
  }

  // ═══ 課程 / 證照追蹤 ═══
  function courseAll() { return board.courses || []; }
  function courseRetakeState(c) {
    if (c.passed === true) return { label: '不需要', cls: 'n' };
    if (c.retakeApplied !== true) return { label: '尚未申請', cls: 'a' };
    if (c.retakePassed === true) return { label: '已通過', cls: 'g' };
    if (c.retakePassed === false) return { label: '未通過', cls: 'r' };
    return { label: '結果未定', cls: 'a' };
  }
  // 篩選用的粗分類:pass=已通過、fail=未通過、pending=未通過且還沒申請補考
  function courseStatusCls(c) {
    if (c.passed === true) return 'pass';
    if (c.passed === false) return 'fail';
    return '';
  }
  function courseMatchesStatus(c, f) {
    if (f === 'all') return true;
    if (f === 'pass') return c.passed === true;
    if (f === 'fail') return c.passed === false;
    if (f === 'pending') return c.passed === false && c.retakeApplied !== true;
    return true;
  }
  function coursePill(label, cls) { return '<span class="pill ' + cls + '">' + esc(label) + '</span>'; }
  function courseCard(c) {
    var pills = coursePill(c.replied === true ? '回信' : c.replied === false ? '未回信' : '待聯絡',
        c.replied === true ? 'g' : c.replied === false ? 'r' : 'n')
      + coursePill(c.docsOk === true ? '已繳齊' : c.docsOk === false ? '未繳齊' : '待確認',
        c.docsOk === true ? 'g' : c.docsOk === false ? 'r' : 'n')
      + coursePill(c.passed === true ? '已通過' : c.passed === false ? '未通過' : '待放榜',
        c.passed === true ? 'g' : c.passed === false ? 'r' : 'n');
    var rt = courseRetakeState(c);
    if (c.passed !== true) pills += coursePill(rt.label === '尚未申請' ? '尚未申請補考' : '補考' + rt.label, rt.cls);
    return '<button class="person ' + courseStatusCls(c) + '" data-cid="' + c.id + '">'
      + '<div class="person-top"><span class="p-av">' + esc((c.name || '?').slice(0, 1)) + '</span>'
      + '<span class="p-body"><div class="p-name">' + esc(c.name) + '</div>'
      + '<div class="p-org">' + esc([c.org, c.dept].filter(Boolean).join(' · ')) + '</div></span></div>'
      + '<div class="pill-row">' + pills + '</div></button>';
  }

  function renderCourseList() {
    var by = {};
    courseAll().forEach(function (c) { (by[c.courseName] = by[c.courseName] || []).push(c); });
    var names = Object.keys(by);
    var h = '<div class="roster-head"><button class="btn ghost-btn" id="clBack">← 長期追蹤</button></div>'
      + '<div class="scroll2">';
    if (!names.length) h += '<div class="empty">還沒有課程追蹤資料</div>';
    names.forEach(function (name) {
      var list = by[name], pass = list.filter(function (c) { return c.passed === true; }).length,
        fail = list.filter(function (c) { return c.passed === false; }).length,
        pending = list.filter(function (c) { return c.passed === false && c.retakeApplied !== true; }).length,
        cohorts = [];
      list.forEach(function (c) { if (c.cohort && cohorts.indexOf(c.cohort) < 0) cohorts.push(c.cohort); });
      cohorts.sort();
      h += '<button class="course-card" data-course="' + esc(name) + '">'
        + '<span class="course-ico">' + ICO_COURSE + '</span>'
        + '<span class="course-body"><div class="course-t">' + esc(name) + '</div>'
        + '<div class="course-s">' + esc(cohorts.join('–') || '未分場次') + ' · 共 ' + list.length + ' 人</div>'
        + '<div class="course-stats">' + coursePill('✅ 通過 ' + pass, 'g') + coursePill('❌ 未過 ' + fail, 'r')
        + coursePill('🕓 待補考 ' + pending, 'a') + '</div></span>'
        + '<span class="course-chev">' + ICO_CHEV + '</span></button>';
    });
    h += '<button class="add-course" id="courseAddBtn">' + ICO_PLUS + '加一種課程 / 證照追蹤</button></div>';
    screen.innerHTML = h;
    document.getElementById('clBack').onclick = function () { openCourseList = false; render(); };
    document.getElementById('courseAddBtn').onclick = function () { courseNewModal(); };
    screen.querySelectorAll('[data-course]').forEach(function (btn) {
      btn.onclick = function () { openCourseKey = btn.dataset.course; courseCohortF = 'all'; courseStatusF = 'all'; render(); };
    });
  }

  function renderCourseDetail() {
    var courseName = openCourseKey;
    var all = courseAll().filter(function (c) { return c.courseName === courseName; });
    if (!all.length) { openCourseKey = null; return renderCourseList(); }
    var cohorts = [];
    all.forEach(function (c) { if (c.cohort && cohorts.indexOf(c.cohort) < 0) cohorts.push(c.cohort); });
    cohorts.sort();
    var h = '<div class="roster-head"><button class="btn ghost-btn" id="cdBack">← 課程追蹤</button></div>'
      + '<div class="scroll2">'
      + '<div class="filter-row" id="cohortFilter"><button class="fbtn' + (courseCohortF === 'all' ? ' on' : '') + '" data-f="all">全部場次</button>'
      + cohorts.map(function (co) { return '<button class="fbtn' + (courseCohortF === co ? ' on' : '') + '" data-f="' + esc(co) + '">' + esc(co) + '</button>'; }).join('')
      + '</div>'
      + '<div class="filter-row status-filter" id="statusFilter">'
      + ['all', 'pass', 'fail', 'pending'].map(function (f) {
          var lbl = { all: '全部狀態', pass: '✅ 已通過', fail: '❌ 未通過', pending: '🕓 尚未申請補考' }[f];
          return '<button class="fbtn' + (courseStatusF === f ? ' on' : '') + '" data-sf="' + f + '">' + lbl + '</button>';
        }).join('')
      + '</div>';
    var byCohort = {};
    all.forEach(function (c) { (byCohort[c.cohort || '（未填場次）'] = byCohort[c.cohort || '（未填場次）'] || []).push(c); });
    var cohortOrder = Object.keys(byCohort).sort().reverse();
    var anyShown = false;
    cohortOrder.forEach(function (co) {
      var list = byCohort[co].filter(function (c) {
        return (courseCohortF === 'all' || co === courseCohortF) && courseMatchesStatus(c, courseStatusF);
      });
      if (!list.length) return;
      anyShown = true;
      h += '<div class="cohort-hd">' + esc(co) + '<span class="cnt">' + list.length + ' 人</span></div>';
      list.forEach(function (c) { h += courseCard(c); });
    });
    if (!anyShown) h += '<div class="empty-hint">這個篩選條件下沒有人</div>';
    h += '</div><button class="fab" id="coursePersonAdd" title="新增人員">' + ICO_PLUS + '</button>';
    screen.innerHTML = h;
    screen.classList.add('has-fab');
    document.getElementById('cdBack').onclick = function () { openCourseKey = null; render(); };
    document.getElementById('coursePersonAdd').onclick = function () {
      courseBatchModal({ courseName: courseName, cohort: courseCohortF !== 'all' ? courseCohortF : '' }, true);
    };
    document.querySelectorAll('#cohortFilter .fbtn').forEach(function (b) {
      b.onclick = function () { courseCohortF = b.dataset.f; render(); };
    });
    document.querySelectorAll('#statusFilter .fbtn').forEach(function (b) {
      b.onclick = function () { courseStatusF = b.dataset.sf; render(); };
    });
    screen.querySelectorAll('.person[data-cid]').forEach(function (btn) {
      btn.onclick = function () { openCoursePersonId = btn.dataset.cid; render(); };
    });
  }

  // 單一欄位切換(是否回信/資料已繳齊/是否通過/補考…)—— 跟 go() 一樣送出+重讀 board,
  // 但不關 modal、不清 sel、不彈 toast,因為這裡是畫面上直接點按鈕切換,不是彈窗表單送出。
  function courseGo(type, params) {
    if (busy) return;
    busy = true; render();
    api.submit(type, params).then(function (b) { board = b; busy = false; render(); })
      .catch(function (err) { busy = false; render(); toast('⚠ ' + (err.message || err)); });
  }

  function renderCoursePersonDetail() {
    var c = courseAll().filter(function (x) { return x.id === openCoursePersonId; })[0];
    if (!c) { openCoursePersonId = null; return renderCourseDetail(); }
    function toggle(field, val, on) {
      return '<button class="' + (on ? 'on ' + (val ? 'g' : 'r') : '') + '" data-cf="' + field + '" data-cv="' + val + '">' + (val ? '是' : '否') + '</button>';
    }
    var h = '<div class="roster-head"><button class="btn ghost-btn" id="cpBack">← ' + esc(c.courseName) + '</button>'
      + '<button class="btn ghost-btn" id="cpEdit">✎ 編輯</button></div>'
      + '<div class="scroll2">'
      + '<div class="cp-hd"><div class="cp-name">' + esc(c.name) + '</div>'
      + '<div class="cp-org">' + esc([c.org, c.dept, c.title].filter(Boolean).join(' · ')) + '</div></div>'
      + '<div class="fld-grid">'
      + '<div class="fld"><span>課程</span><div class="v">' + esc(c.courseName) + '</div></div>'
      + '<div class="fld"><span>場次</span><div class="v">' + esc(c.cohort || '—') + '</div></div>'
      + '<div class="fld"><span>電話</span><div class="v">' + esc(c.tel || '—') + '</div></div>'
      + '<div class="fld"><span>Email</span><div class="v">' + esc(c.mail || '—') + '</div></div>'
      + '</div>'
      + '<div class="status-grid">'
      + '<div class="status-row"><span class="lbl">是否回信</span><div class="seg">' + toggle('replied', true, c.replied === true) + toggle('replied', false, c.replied === false) + '</div></div>'
      + '<div class="status-row"><span class="lbl">資料已繳齊</span><div class="seg">' + toggle('docsOk', true, c.docsOk === true) + toggle('docsOk', false, c.docsOk === false) + '</div></div>'
      + '<div class="status-row"><span class="lbl">是否通過</span><div class="seg">' + toggle('passed', true, c.passed === true) + toggle('passed', false, c.passed === false) + '</div></div>'
      + (c.passed === true
        ? '<div class="status-row"><span class="lbl">補考</span><span class="cp-noretake">🎉 已通過,不需要補考</span></div>'
        : '<div class="status-row"><span class="lbl">是否申請補考</span><div class="seg">' + toggle('retakeApplied', true, c.retakeApplied === true) + toggle('retakeApplied', false, c.retakeApplied === false) + '</div></div>'
          + '<div class="status-row"><span class="lbl">補考是否通過</span><div class="seg">' + toggle('retakePassed', true, c.retakePassed === true) + toggle('retakePassed', false, c.retakePassed === false) + '</div></div>')
      + '</div>'
      + '<div class="lt-notice"><div class="lt-nc-h">📝 工作附註<span class="cnt">' + (c.log || []).length + '</span></div>'
      + (c.log || []).slice().reverse().map(function (n) {
          return '<div class="lt-ni"><div class="lt-ni-x">' + esc(n.text) + '</div>'
            + '<div class="lt-ni-m"><span>' + esc(n.at) + '</span><span>' + esc(n.by) + '</span></div></div>';
        }).join('')
      + '<div class="lt-nc-add"><input id="cNoteInp" type="text" placeholder="加一筆聯絡紀錄…"><button class="btn primary" id="cNoteGo">加入</button></div></div>'
      + '<button class="btn warn-btn" id="cpDel" style="width:100%">刪除人員</button>'
      + '</div>';
    screen.innerHTML = h;
    document.getElementById('cpBack').onclick = function () { openCoursePersonId = null; render(); };
    document.getElementById('cpEdit').onclick = function () { courseFormModal(c.id); };
    screen.querySelectorAll('[data-cf]').forEach(function (b) {
      b.onclick = function () {
        var patch = { id: c.id };
        patch[b.dataset.cf] = b.dataset.cv === 'true';
        courseGo('courseEdit', patch);
      };
    });
    document.getElementById('cNoteGo').onclick = function () {
      var t = document.getElementById('cNoteInp').value.trim();
      if (!t) return;
      document.getElementById('cNoteInp').value = '';
      courseGo('courseNoteAdd', { id: c.id, text: t });
    };
    document.getElementById('cpDel').onclick = function () {
      if (!confirm('刪除「' + c.name + '」的課程追蹤紀錄?')) return;
      openCoursePersonId = null;
      go('courseDelete', { id: c.id, name: c.name }, '已刪除');
    };
  }

  // 編輯基本資料(課程名稱/場次/姓名/機構…)。狀態欄位(是否通過等)在詳情頁直接點按鈕切換,不在這裡。
  // 新增人員(單筆或整批)走 courseBatchModal,不在這裡 —— 這支只處理「改一個已存在的人」。
  function courseFormModal(id) {
    var c = courseAll().filter(function (x) { return x.id === id; })[0];
    if (!c) { toast('找不到這筆'); return; }
    var courseNames = [];
    courseAll().forEach(function (x) { if (courseNames.indexOf(x.courseName) < 0) courseNames.push(x.courseName); });
    var courseOpts = courseNames.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    openModal('<div class="lede">編輯基本資料</div>'
      + '<div class="fld"><span>課程名稱</span><input id="crCourse" list="crCourseList" value="' + esc(c.courseName || '') + '" placeholder="例:IEC62443主導稽核師"></div>'
      + '<datalist id="crCourseList">' + courseOpts + '</datalist>'
      + '<div class="fld"><span>場次 / 年度</span><input id="crCohort" value="' + esc(c.cohort || '') + '" placeholder="例:115年"></div>'
      + '<div class="fld"><span>姓名</span><input id="crName" value="' + esc(c.name || '') + '"></div>'
      + '<div class="fld-row"><div class="fld"><span>服務機構</span><input id="crOrg" value="' + esc(c.org || '') + '"></div>'
      + '<div class="fld"><span>單位</span><input id="crDept" value="' + esc(c.dept || '') + '"></div></div>'
      + '<div class="fld"><span>職稱</span><input id="crTitle" value="' + esc(c.title || '') + '"></div>'
      + '<div class="fld-row"><div class="fld"><span>電話</span><input id="crTel" inputmode="tel" value="' + esc(c.tel || '') + '"></div>'
      + '<div class="fld"><span>Email</span><input id="crMail" value="' + esc(c.mail || '') + '"></div></div>'
      + '<div class="sheet-acts"><button class="btn primary" id="crGo">儲存</button>'
      + '<button class="btn ghost" data-close>取消</button></div>');
    document.getElementById('crGo').onclick = function () {
      if (!v('crCourse')) { toast('請填課程名稱'); return; }
      if (!v('crName')) { toast('請填姓名'); return; }
      go('courseEdit', {
        id: id, courseName: v('crCourse'), cohort: v('crCohort'), name: v('crName'),
        org: v('crOrg'), dept: v('crDept'), title: v('crTitle'), tel: v('crTel'), mail: v('crMail')
      }, '已儲存');
    };
  }

  // 批次新增人員(一筆一筆快速加、最後一次送出,比照 batchTaskModal)。課程名稱/場次是整批共用的
  // sticky 欄位 —— 打新的場次值就等於「幫這個課程加一個新年度」,不用另外做「新增場次」的功能。
  function courseNewModal() {
    var courseNames = [];
    courseAll().forEach(function (x) { if (courseNames.indexOf(x.courseName) < 0) courseNames.push(x.courseName); });
    var courseOpts = courseNames.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    openModal('<div class="lede">新增一種課程 / 證照追蹤</div><h3>先建立課程 + 第一位人員,之後在課程裡繼續加人</h3>'
      + '<div class="fld"><span>課程名稱</span><input id="cnCourse" list="cnCourseList" placeholder="例:IEC62443主導稽核師"></div>'
      + '<datalist id="cnCourseList">' + courseOpts + '</datalist>'
      + '<div class="fld"><span>場次 / 年度</span><input id="cnCohort" placeholder="例:116年"></div>'
      + '<div class="fld"><span>姓名</span><input id="cnName" placeholder="例:王小明"></div>'
      + '<div class="fld-row"><div class="fld"><span>服務機構</span><input id="cnOrg"></div>'
      + '<div class="fld"><span>單位</span><input id="cnDept"></div></div>'
      + '<div class="fld"><span>職稱</span><input id="cnTitle"></div>'
      + '<div class="fld-row"><div class="fld"><span>電話</span><input id="cnTel" inputmode="tel"></div>'
      + '<div class="fld"><span>Email</span><input id="cnMail"></div></div>'
      + '<div class="fld-hint">之後要加同課程的其他人 / 其他年度,進到這個課程裡用右下角「＋」加,不要在這裡重複建立。</div>'
      + '<div class="sheet-acts"><button class="btn primary" id="cnDone">建立</button>'
      + '<button class="btn ghost" data-close>取消</button></div>');
    document.getElementById('cnDone').onclick = function () {
      var c = {
        courseName: v('cnCourse'), cohort: v('cnCohort'), name: v('cnName'),
        org: v('cnOrg'), dept: v('cnDept'), title: v('cnTitle'), tel: v('cnTel'), mail: v('cnMail')
      };
      if (!c.courseName) { toast('請填課程名稱'); document.getElementById('cnCourse').focus(); return; }
      if (!c.name) { toast('請填姓名'); document.getElementById('cnName').focus(); return; }
      go('courseAddBatch', { rows: [c] }, '已建立課程追蹤');
    };
  }

  function courseBatchModal(prefill) {
    prefill = prefill || {};
    var lockedName = prefill.courseName || '';
    var pend = [];
    openModal('<div class="lede">新增人員到「' + esc(lockedName) + '」</div><h3>一筆一筆快速加 · 最後一次送出</h3>'
      + '<div class="batch-basket" id="crBkBasket"></div>'
      + '<div class="fld"><span>課程名稱</span><div class="v">' + esc(lockedName) + '</div></div>'
      + '<div class="fld"><span>場次 / 年度</span><input id="crBkCohort" value="' + esc(prefill.cohort || '') + '" placeholder="例:116年（打新的年度就是加新場次）"></div>'
      + '<div class="fld"><span>姓名</span><input id="crBkName" placeholder="例:王小明"></div>'
      + '<div class="fld-row"><div class="fld"><span>服務機構</span><input id="crBkOrg"></div>'
      + '<div class="fld"><span>單位</span><input id="crBkDept"></div></div>'
      + '<div class="fld"><span>職稱</span><input id="crBkTitle"></div>'
      + '<div class="fld-row"><div class="fld"><span>電話</span><input id="crBkTel" inputmode="tel"></div>'
      + '<div class="fld"><span>Email</span><input id="crBkMail"></div></div>'
      + '<div class="fld-hint">場次加下一筆時會留著;姓名跟其他基本資料每筆分開填。</div>'
      + '<button class="btn" id="crBkAdd" style="width:100%">＋ 再加一筆</button>'
      + '<div class="sheet-acts"><button class="btn primary" id="crBkDone" disabled>完成</button>'
      + '<button class="btn ghost" data-close>取消</button></div>');
    function cur() {
      return {
        courseName: lockedName, cohort: v('crBkCohort'), name: v('crBkName'),
        org: v('crBkOrg'), dept: v('crBkDept'), title: v('crBkTitle'), tel: v('crBkTel'), mail: v('crBkMail')
      };
    }
    function draw() {
      var bk = document.getElementById('crBkBasket');
      if (!pend.length) bk.innerHTML = '<span class="bk-empty">還沒加任何一筆 —— 填好下面按「＋ 再加一筆」</span>';
      else bk.innerHTML = '<span class="bk-t">這批 ' + pend.length + ' 筆</span>' + pend.map(function (r, i) {
        return '<span class="bk-chip"><span class="bk-n">' + esc(r.name) + '</span><span class="bk-m">' + esc(r.cohort || '未填場次') + '</span><button data-crbkdel="' + i + '" aria-label="移除">✕</button></span>';
      }).join('');
      var n = pend.length + (v('crBkName') ? 1 : 0);
      var d = document.getElementById('crBkDone');
      d.textContent = n ? '完成 · 新增 ' + n + ' 筆' : '完成';
      d.disabled = !n;
    }
    document.getElementById('crBkName').oninput = draw;
    document.getElementById('crBkBasket').onclick = function (e) {
      var x = e.target.closest('[data-crbkdel]'); if (x) { pend.splice(+x.dataset.crbkdel, 1); draw(); }
    };
    document.getElementById('crBkAdd').onclick = function () {
      var c = cur();
      if (!c.name) { toast('請填姓名'); document.getElementById('crBkName').focus(); return; }
      pend.push(c);
      ['crBkName', 'crBkOrg', 'crBkDept', 'crBkTitle', 'crBkTel', 'crBkMail'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('crBkName').focus();
      draw();
    };
    document.getElementById('crBkDone').onclick = function () {
      var all = pend.slice();
      var c = cur(); if (c.name) all.push(c);
      if (!all.length) return;
      go('courseAddBatch', { rows: all }, '已新增 ' + all.length + ' 筆');
    };
    draw();
  }

  function renderLongDetail() {
    var it = ltById(openLong);
    if (!it || !it.longTrack) { openLong = null; return renderBoard(); }
    var meId = ME(), meName = board.me.name;
    if (ltFreshSnap === null) {
      ltFreshSnap = ltFreshIds(it);
      ltMarkSeenLocal(it.rowId);
      ltPush('ltSeen', { id: it.rowId });
    }
    var ss = ltSpanState(it), fresh = ltFreshSnap;
    var logs = ltLog(it.rowId), whos = ltWhos(it), tags = ltTagsArr(it);
    var working = it.ltWorking, workingIsMe = working === meId;

    var isDone = it.status === 'done';
    var ws = waitStage(it);

    var h = '<div class="roster-head"><button class="btn ghost-btn" id="ltBack">← 長期追蹤</button>'
      + '<button class="btn ghost-btn" id="ltEdit">編輯</button>'
      + (ltShowUpd ? '<span class="lt-upd">🔄 剛更新</span>' : '')
      + '</div>';
    h += '<div class="sess-dh"><div class="sess-hosp">' + esc(ltName(it)) + '</div>'
      + '<div class="sess-sub">'
      + (it.site ? esc(it.site) + (it.groupName ? ' · ' + esc(it.groupName) : '') + ' · ' : '')
      + (whos.length ? esc(whos.join('、')) + ' · ' : '')
      + (ss ? '檔期 <b>' + esc(ss.range) + '</b>' : '無期限') + '</div></div>';
    h += ltDocRow(it);

    if (isDone) {
      h += '<div class="wait s2" style="border-left-color:var(--done);background:var(--done-soft);color:var(--done)">'
        + '<b>✓ 已結案</b><span>' + esc(it.doneAt || '') + (it.doneNote ? ' · ' + esc(it.doneNote) : '') + '</span></div>'
        + '<div class="acts"><button class="btn" data-ltreopen="' + esc(it.rowId) + '">重新開啟</button></div>';
    } else {
      if (ss && ss.phase === 'over')
        h += '<div class="wait s3"><b>檔期已過,該收尾了</b><span>原檔期 ' + esc(ss.range) + '</span></div>';
      else if (ss && ss.phase === 'soon')
        h += '<div class="wait s2"><b>' + esc(ss.label) + '</b><span>檔期 ' + esc(ss.range) + '</span></div>';

      // ── 注意事項(釘在最上面,開工前先看;沒事項時摺疊)──
      if (ltNoticeArr(it).length || ltNoticeOpen)
        h += divider('注意', ltNoticeArr(it).length || null, '提醒同事「即將要做什麼 / 注意某某變動」。填了提醒日,到那天早報會自動頂出來');
      h += ltNoticeBlock(it);

      // ── 認工 · 等外部 ──
      h += divider('認工 · 等外部', null, '要開工先講一聲,結束時回報 —— 兩邊都會發 LINE 給團隊');
      if (working && !workingIsMe)
        h += '<div class="wait s2"><b>👀 ' + esc(ltWorkingName(it)) + ' 正在顧這攤</b><span>先去忙別的,別重工！</span></div>';
      else if (workingIsMe)
        h += '<div class="focus-bar"><span>👀 你正在顧這攤 · 已通知團隊</span><button id="ltRelease">結束並回報</button></div>';
      else
        h += '<div class="acts"><button class="btn" id="ltClaim">這攤我先顧 —— 通知大家先忙別的 🙋</button></div>';
      if (it.waitWho)
        h += '<div class="wait ' + (ws >= 3 ? 's3' : ws >= 2 ? 's2' : '') + '"><b>⏳ 整件在等 ' + esc(it.waitWho) + '</b>'
          + '<span>' + (it.waitReplyBy ? '對方應回 ' + esc(it.waitReplyBy) + (ws >= 2 ? '（已逾期）' : '') + ' · ' : '')
          + '<button type="button" class="lnk" data-act="endWait" data-row="' + esc(it.rowId) + '">結束等待</button></span></div>';
      else
        h += '<div class="acts"><button class="btn ghost" data-modal="wait" data-row="' + esc(it.rowId) + '">整件在等外部…</button></div>';

      // ── 記一筆動態 ──
      h += divider('記一筆動態', null, '動了就按「我今天動過了」,不用打字。想講清楚就先選類型、補一句,會一起記上');
      h += '<div class="lt-panel">'
        + '<div class="hchips" id="ltTagRow">'
        + tags.map(function (x) {
            return '<button data-lttag="' + esc(x) + '" aria-pressed="' + (ltTagSel === x) + '">' + esc(x) + '</button>';
          }).join('')
        + '<button class="lt-more" id="ltTagMore">＋ 類型</button></div>'
        + '<input class="lt-say" id="ltSay" placeholder="做了什麼？一句話就好（選填）">'
        + '<button class="btn primary" id="ltDid">我今天動過了</button></div>';

      // ── 衍生任務 ──
      var kids = ltChildren(it.rowId);
      h += divider('衍生任務', kids.length || null, '執行中拆出來的真任務 —— 有負責人、到期日,會進早報和「我的待辦」');
      kids.forEach(function (t) { h += ltSpinCard(t); });
      h += '<button class="lt-spin-add" data-ltspin="' + esc(it.rowId) + '">＋ 從這個任務拆一個</button>';

      // ── 子項清單 ──
      h += divider('子項清單', null, '小勾勾,沒有負責人 / 到期日。開工前掃一眼還缺哪些');
      h += ckRender(it);
    }
    h += divider('進度時間軸', logs.length || null);
    if (!logs.length) h += '<div class="sect-empty">還沒有紀錄</div>';
    else {
      h += '<div class="tl">';
      logs.forEach(function (e) {
        var isFresh = fresh.indexOf(e.t) >= 0, mine = e.who === meName;
        var close = e.tag === '結案' || e.tag === '重啟';
        var spin = e.tag === '衍生' || e.tag === '衍生完成';   // 從主線拆出去的支線,時間軸上要一眼看得出
        var tagged = close || spin;
        var tagCls = close ? 'close' : spin ? 'spin' : 'stage';
        h += '<div class="ev' + (mine ? ' mine' : '') + (isFresh ? ' new' : '') + (close ? ' close' : '') + (spin ? ' spin' : '') + '">'
          + '<div class="ev-top"><span class="ev-who">' + esc(e.who) + (mine ? '（我）' : '') + '</span>'
          + (e.tag ? '<span class="tag ' + tagCls + '">' + esc(e.tag) + '</span>' : '')
          + (isFresh ? '<span class="ev-new">新</span>' : '')
          + '<span class="ev-t">' + esc(ltRel(e.t)) + '</span></div>'
          + (e.text
              ? '<div class="ev-x">' + (spin ? '<span class="ev-branch">↳</span> ' : '') + esc(e.text) + '</div>'
              : (tagged ? '' : '<div class="ev-x plain">（只按了「動過了」,沒留字）</div>'))
          + '</div>';
      });
      h += '</div>';
    }
    h += '<div class="task-note">📄 文件在 OneDrive;交班站只記「誰碰過、碰了什麼」。別人開這頁,你剛記的會標「新」,看過就自動清掉。</div>';

    if (!isDone) {
      if (ltCloseArm === it.rowId) {
        h += '<div class="lt-closebar"><input class="lt-say" id="ltCloseGist" placeholder="結案說明（選填）" style="flex:1">'
          + '<button class="btn warn-btn arm" data-ltclose="' + esc(it.rowId) + '">確認結案</button></div>';
      } else {
        h += '<div class="lt-closebar"><button class="btn warn-btn" data-ltclose="' + esc(it.rowId) + '">✓ 結案 —— 這件整個收掉</button></div>';
      }
    }

    screen.innerHTML = h;

    // 「🔄 剛更新」10 秒後自動收掉
    if (ltUpdTimer) { clearTimeout(ltUpdTimer); ltUpdTimer = null; }
    if (ltShowUpd) ltUpdTimer = setTimeout(function hideUpd() {
      if (ltIsEditingKeepField()) { ltUpdTimer = setTimeout(hideUpd, 10000); return; }
      ltShowUpd = false; if (openLong === it.rowId) ltPreserve(renderLongDetail);
    }, 10000);

    document.getElementById('ltBack').onclick = function () { stopLtPoll(); openLong = null; ltTagSel = null; ltCloseArm = null; ltNoticeOpen = false; ltShowUpd = false; ltFreshSnap = null; render(); };
    document.getElementById('ltEdit').onclick = function () { editModal(it.rowId); };
    var ltDocBtn = document.getElementById('ltDocSet');
    if (ltDocBtn) ltDocBtn.onclick = function () { editModal(it.rowId); };
    var say = document.getElementById('ltSay'), did = document.getElementById('ltDid');
    if (say && did) {
      var commit = function () {
        var txt = say.value.trim(), tag = ltTagSel || '';
        ltTagSel = null;
        go('ltNote', { id: it.rowId, tag: tag, text: txt },
          txt ? '記了一筆' : (tag ? '記了一筆：' + tag : '記了「動過了」'));
      };
      did.onclick = commit;
      say.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); });
      say.addEventListener('input', function () { did.textContent = this.value.trim() ? '記下這一筆' : '我今天動過了'; });
    }
    [].forEach.call(screen.querySelectorAll('[data-lttag]'), function (b) {
      b.onclick = function () { ltTagSel = ltTagSel === b.dataset.lttag ? null : b.dataset.lttag; renderLongDetail(); };
    });
    if (document.getElementById('ltTagMore')) document.getElementById('ltTagMore').onclick = function () { ltPickerModal(it.rowId); };
    if (document.getElementById('ltClaim')) document.getElementById('ltClaim').onclick = function () { go('ltClaim', { id: it.rowId }); };
    if (document.getElementById('ltRelease')) document.getElementById('ltRelease').onclick = function () { ltEndModal(it.rowId); };

    startLtPoll();
  }

  function ltPickerModal(id) {
    var it = ltById(id);
    if (!it) return;
    var GROUPS = board.ltTagGroups || [];
    var tags = ltTagsArr(it);
    function poolHas(t) { return GROUPS.some(function (g) { return g[1].indexOf(t) >= 0; }); }
    function draw() {
      var g = '<div class="lede">這個任務的常用類型</div>'
        + '<div class="pick-note">點一下加入 / 移除常用列（藍色＝已在列上）。記一筆時再從膠囊列點選。</div>';
      g += GROUPS.map(function (grp) {
        return '<div class="lt-tg"><div class="lt-tg-h">' + esc(grp[0]) + '</div><div class="hchips">'
          + grp[1].map(function (t) {
              return '<button data-ltpin="' + esc(t) + '"' + (tags.indexOf(t) >= 0 ? ' aria-pressed="true"' : '') + '>' + esc(t) + '</button>';
            }).join('') + '</div></div>';
      }).join('');
      var extra = tags.filter(function (t) { return !poolHas(t); });
      if (extra.length)
        g += '<div class="lt-tg"><div class="lt-tg-h">自訂</div><div class="hchips">'
          + extra.map(function (t) { return '<button data-ltpin="' + esc(t) + '" aria-pressed="true">' + esc(t) + '</button>'; }).join('')
          + '</div></div>';
      g += '<div class="fld"><span>清單沒有就自己打</span><div class="lt-newrow">'
        + '<input id="ltNewTag" placeholder="例：訪談紀錄"><button class="btn" id="ltNewTagGo">加入</button></div></div>'
        + '<div class="sheet-acts"><button class="btn primary" id="ltPickDone">完成</button></div>';
      return g;
    }
    function commitTags() { it.ltTags = tags.join(','); ltPush('ltSetTags', { id: it.rowId, tags: tags.slice() }); }
    function wire() {
      var sh = modalRoot.querySelector('.sheet');
      [].forEach.call(sh.querySelectorAll('[data-ltpin]'), function (b) {
        b.onclick = function () {
          var t = b.dataset.ltpin, i = tags.indexOf(t);
          if (i >= 0) { tags.splice(i, 1); if (ltTagSel === t) ltTagSel = null; }
          else tags.push(t);
          redraw();
        };
      });
      function add() {
        var t = (document.getElementById('ltNewTag').value || '').trim();
        if (t && tags.indexOf(t) < 0) tags.push(t);
        redraw();
      }
      document.getElementById('ltNewTagGo').onclick = add;
      document.getElementById('ltNewTag').addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
      document.getElementById('ltPickDone').onclick = function () { commitTags(); closeModal(); renderLongDetail(); };
    }
    function redraw() { modalRoot.querySelector('.sheet').innerHTML = draw(); wire(); }
    openModal(draw());
    document.getElementById('bd').addEventListener('click', function (e) {
      if (e.target.id === 'bd') { commitTags(); renderLongDetail(); }
    });
    wire();
  }

  function ltEndModal(id) {
    var it = ltById(id);
    if (!it) return;
    var last = ltLog(it.rowId).filter(function (e) { return e.who === board.me.name && (e.text || e.tag); })[0];
    var lastTag = (last && last.tag) || '';
    openModal('<div class="lede">結束顧這攤</div><h3>' + esc(ltName(it)) + '</h3>'
      + '<div class="fld"><span>完成進度簡述（可留空）</span>'
      + '<textarea class="form-ta" id="ltEndGist" placeholder="這次做到哪裡了？">' + esc(last ? last.text : '') + '</textarea></div>'
      + '<div class="sheet-fx">會補進時間軸,並發 LINE 告訴大家這攤開放了。'
      + (lastTag ? '<br>類型沿用最後一筆「' + esc(lastTag) + '」,一起帶進訊息。' : '') + '</div>'
      + '<div class="sheet-acts"><button class="btn primary" id="ltEndGo">結束並發 LINE</button>'
      + '<button class="btn ghost" data-close>取消</button></div>');
    document.getElementById('ltEndGo').onclick = function () {
      var g = (document.getElementById('ltEndGist').value || '').trim();
      go('ltRelease', { id: it.rowId, tag: lastTag, text: g }, '已結束認工,發了 LINE');
    };
  }

  // 從長期追蹤任務拆一個「衍生任務」(本身是一般任務)
  function ltSpinModal(parentId) {
    var it = ltById(parentId);
    if (!it) return;
    var siteOpts = board.sites.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    var ownerOpts = '<option value="">待認領</option><option value="__me__">我來負責</option>'
      + board.people.filter(function (p) { return !board.me || p.id !== board.me.id; })
          .map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('')
      + '<option value="__team__">👥 團隊共同執行</option>';
    var teamPicked = {};
    var pend = [];
    openModal('<div class="lede">從長期追蹤拆衍生任務</div><h3>' + esc(ltName(it)) + '</h3>'
      + '<div class="batch-basket" id="spBasket"></div>'
      + '<div class="fld"><span>任務名</span><input id="spName" placeholder="例:函詢法制室 —— 第7條主管機關"></div>'
      + '<div class="fld-row"><div class="fld"><span>站點</span><select id="spSite">' + board.sites.map(function (s) { return '<option' + (s === (it.site || '') ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>'
      + '<div class="fld"><span>類型</span><select id="spKind"><option>公文</option><option>信件</option><option>文件</option><option>報帳</option><option>表單</option><option>其他行政</option></select></div></div>'
      + '<div class="fld-row"><div class="fld"><span>目標結束日 選填</span><input id="spDue" type="date"></div>'
      + '<div class="fld"><span>負責人</span><select id="spOwner">' + ownerOpts + '</select></div></div>'
      + '<div class="fld" id="spTeamBox" style="display:none"><span>誰一起扛(至少勾 2 人)</span><div class="hchips" id="spTeam">'
      + board.people.map(function (p) { return '<button type="button" data-sptm="' + p.id + '" aria-pressed="false"><span class="av-sm">' + esc(p.short) + '</span>' + esc(p.name) + '</button>'; }).join('')
      + '</div></div>'
      + '<div class="fld"><span>文件位置 選填 · 留白 = 沿用母任務的</span><input id="spFolder" placeholder="https://..." value="' + esc(it.folder || '') + '"></div>'
      + '<div class="fld"><span>附註 選填</span><textarea id="spNote" rows="2"></textarea></div>'
      + '<div class="fld-hint">站點 / 類型 / 到期 / 負責 加下一筆時會留著;任務名、文件位置、附註每筆分開填。整批只在時間軸記一筆、LINE 只發一則。</div>'
      + '<button class="btn" id="spAdd" style="width:100%">＋ 再拆一筆</button>'
      + '<div class="sheet-acts"><button class="btn primary" id="spGo" disabled>完成</button>'
      + '<button class="btn ghost" data-close>取消</button></div>');
    function cur() {
      var o = v('spOwner'), team = o === '__team__' ? Object.keys(teamPicked).filter(function (k) { return teamPicked[k]; }) : null;
      return { name: v('spName'), site: v('spSite'), kind: v('spKind'), due: v('spDue'), owner: team ? '' : o, coOwners: team, folder: v('spFolder'), note2: v('spNote') };
    }
    document.getElementById('spOwner').onchange = function () {
      document.getElementById('spTeamBox').style.display = this.value === '__team__' ? '' : 'none';
    };
    document.getElementById('spTeam').onclick = function (e) {
      var b = e.target.closest('[data-sptm]'); if (!b) return;
      var k = b.dataset.sptm; teamPicked[k] = !teamPicked[k]; b.setAttribute('aria-pressed', String(!!teamPicked[k]));
    };
    function draw() {
      var bk = document.getElementById('spBasket');
      if (!pend.length) bk.innerHTML = '<span class="bk-empty">還沒拆任何一筆 —— 填好下面按「＋ 再拆一筆」</span>';
      else bk.innerHTML = '<span class="bk-t">這批 ' + pend.length + ' 筆</span>' + pend.map(function (r, i) {
        return '<span class="bk-chip"><span class="bk-n">' + esc(r.name) + '</span><span class="bk-m">' + esc(r.site) + '·' + esc(r.kind) + '</span><button data-spdel="' + i + '" aria-label="移除">✕</button></span>';
      }).join('');
      var n = pend.length + (v('spName') ? 1 : 0);
      var d = document.getElementById('spGo');
      d.textContent = n ? '完成 · 拆 ' + n + ' 筆' : '完成';
      d.disabled = !n;
    }
    document.getElementById('spName').oninput = draw;
    document.getElementById('spBasket').onclick = function (e) {
      var x = e.target.closest('[data-spdel]'); if (x) { pend.splice(+x.dataset.spdel, 1); draw(); }
    };
    document.getElementById('spAdd').onclick = function () {
      var c = cur();
      if (!c.name) { toast('請填任務名'); document.getElementById('spName').focus(); return; }
      if (c.coOwners && c.coOwners.length < 2) { toast('團隊共同執行至少要勾 2 人'); return; }
      pend.push(c);
      document.getElementById('spNote').value = '';
      var ni = document.getElementById('spName'); ni.value = ''; ni.focus();
      draw();
    };
    document.getElementById('spGo').onclick = function () {
      var all = pend.slice();
      var c = cur(); if (c.name) all.push(c);
      if (!all.length) return;
      if (c.name && c.coOwners && c.coOwners.length < 2) { toast('團隊共同執行至少要勾 2 人'); return; }
      var rows = all.map(function (r) {
        var own = (r.owner === '__me__') ? (board.me ? board.me.id : '') : r.owner;
        return { name: r.name, site: r.site, kind: r.kind, due: r.due, owner: own, coOwners: r.coOwners, folder: r.folder, note2: r.note2 };
      });
      if (rows.length === 1) {
        var r0 = rows[0];
        go('ltSpin', { id: parentId, name: r0.name, site: r0.site, kind: r0.kind, due: r0.due, owner: r0.owner, coOwners: r0.coOwners, folder: r0.folder, note2: r0.note2 }, '已拆出衍生任務');
      } else {
        go('ltSpinBatch', { id: parentId, rows: rows }, '已拆出 ' + rows.length + ' 個衍生任務');
      }
    };
    draw();
  }

  function stopLtPoll() { if (ltPollT) { clearInterval(ltPollT); ltPollT = null; } }
  function startLtPoll() { if (!ltPollT) ltPollT = setInterval(ltPollTick, 15000); }
  // 使用者正焦點在任何一個文字輸入框/多行輸入框裡(不限於「記一筆動態」那幾個固定欄位 ——
  // 子項清單「加一項」這類動態 id 的輸入框也算)—— 這時就算資料有變也先別重繪,
  // 不然重繪換掉輸入框會打斷正在打的字(尤其中文組字,ltPreserve 只救得回已送出的字元)
  function ltIsEditingKeepField() {
    var act = document.activeElement;
    return !!(act && (act.tagName === 'INPUT' || act.tagName === 'TEXTAREA'));
  }
  function ltSig(bd, id) {
    return (bd.ltlog || []).filter(function (e) { return e.id === id; })
      .map(function (e) { return e.t + '|' + e.who + '|' + e.tag + '|' + e.text; }).sort().join('§')
      + '¦' + JSON.stringify((bd.tasks || []).filter(function (x) { return x.rowId === id; })[0] || {});
  }
  // 詳情頁每 15 秒會被輪詢重繪。重繪 = 整段 innerHTML 換掉,打到一半還沒送出的字會不見(使用者回報)。
  // 所以重繪前先把這幾個輸入框的值、游標位置、捲動位置抓下來,繪完再放回去。
  var LT_KEEP = ['ltSay', 'ltNcText', 'ltNcDate', 'ltCloseGist'];
  function ltPreserve(fn) {
    var vals = {}, act = document.activeElement, fid = act && act.id, s0 = null, s1 = null;
    LT_KEEP.forEach(function (id) { var e = document.getElementById(id); if (e) vals[id] = e.value; });
    if (fid && LT_KEEP.indexOf(fid) >= 0) { try { s0 = act.selectionStart; s1 = act.selectionEnd; } catch (er) {} }
    var top = screen.scrollTop;
    fn();
    LT_KEEP.forEach(function (id) { var e = document.getElementById(id); if (e && vals[id]) e.value = vals[id]; });
    screen.scrollTop = top;
    if (fid && LT_KEEP.indexOf(fid) >= 0) {
      var e2 = document.getElementById(fid);
      if (e2) { e2.focus(); if (s0 !== null) { try { e2.setSelectionRange(s0, s1); } catch (er) {} } }
    }
  }
  function ltPollTick() {
    if (scr !== 'board' || !openLong) { stopLtPoll(); return; }
    if (busy || modalRoot.firstChild || document.hidden || ltIsEditingKeepField()) return;
    var id = openLong;
    api.getBoard().then(function (b) {
      if (!b || b.error) return;
      if (scr !== 'board' || openLong !== id || busy || modalRoot.firstChild) return;
      if (ltSig(board, id) !== ltSig(b, id)) { board = b; ltShowUpd = true; ltPreserve(renderLongDetail); }
      else board = b;
    }).catch(function () {});
  }

  function renderAuditDrill() {
    var rows = board.tasks.filter(function (t) { return t.auditId === openAudit; });
    var s = auditStat(openAudit);
    var h = '<button class="back-bar" data-act="backBoard">‹ 回總覽</button>';
    h += divider((s.site || openAudit) + ' · ' + auditKind(s), s.done + '/' + s.total,
      (s.anchor ? '最近到期 ' + s.anchor : s.scheduled ? '未完成的都排好了' : '尚未排時程'),
      { act: '<button class="divider-act" data-act="schedule" data-audit="' + openAudit + '">排入時程 / 改期</button>' });
    if (!s.scheduled) h += '<div class="sch-banner">⚠ 這場還沒排時程 —— 按上面「排入時程」填錨點日,系統會把所有列的日期算出來</div>';

    // 依小節分組
    var groups = {}, order = [];
    rows.forEach(function (t) {
      var key = openAudit + '¦' + (t.groupName || '單件任務');
      if (!groups[key]) { groups[key] = { site: t.site, sec: t.groupName || '站點 · 單件任務', items: [], loose: !t.groupName }; order.push(key); }
      groups[key].items.push(t);
    });
    order.sort(function (a, b) {
      var ga = groups[a], gb = groups[b];
      if (ga.loose !== gb.loose) return ga.loose ? 1 : -1;
      var da = ga.items.map(function (t) { return t.status === 'open' ? t.due : null; }).filter(Boolean).sort()[0] || '9999';
      var db = gb.items.map(function (t) { return t.status === 'open' ? t.due : null; }).filter(Boolean).sort()[0] || '9999';
      return da < db ? -1 : 1;
    });
    var anyOpen = order.some(function (k) { return openGroups[k]; });
    h += '<div class="gsec-wrap"><div class="gsec-bar"><span>' + order.length + ' 節 · ' + rows.length + ' 件</span>' +
      '<button data-gall="' + (anyOpen ? 'close' : 'open') + '">' + (anyOpen ? '全部收合' : '全部展開') + '</button></div>';
    h += order.map(function (k) { return gcol(k, groups[k].site, groups[k].sec, groups[k].items, groups[k].loose); }).join('');
    h += '</div>';
    screen.innerHTML = h;
  }

  // ═══ 我的待辦 ═══
  function renderTodo() {
    var mine = board.tasks.filter(function (t) { return t.status === 'open' && iOwn(t); });
    var b = { overdue: [], today: [], week: [], later: [] };
    mine.forEach(function (t) {
      var u = urgency(t);
      if (u === 'overdue') b.overdue.push(t);
      else if (u === 'due' || u === 'wait') b.today.push(t);
      else if (u === 'thisweek') b.week.push(t);
      else b.later.push(t);
    });
    var o = { mine: true };
    var h = '';
    h += section('早該做完了', b.overdue.sort(byDue), o);
    h += section('今天之內', b.today.sort(byDue), o);
    h += section('本週', b.week.sort(byDue), o);
    h += section('之後', b.later.sort(byDue), o);
    var helped = board.tasks.filter(function (t) {
      return t.status === 'done' && t.owner !== ME() && t.helpers && t.helpers.indexOf(ME()) >= 0;
    });
    if (helped.length) h += section('我幫忙完成的', helped, { helped: true, dopts: { muted: true } }, '主責是別人,不算進你的負載');
    if (!h) h = '<div class="empty todo-empty">待辦清空了 —— 可以正大光明地放空一下'
      + '<img class="todo-empty-img" src="data:image/png;base64,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" alt=""></div>';
    screen.innerHTML = h;

    // 最近完成 —— 不佔待辦清單版面,收在右下角垃圾車浮鈕裡,只放「已完成」的任務
    var df = document.getElementById('doneFab');
    if (!df) return;
    var doneList = board.tasks.filter(function (t) { return t.status === 'done' && iOwn(t); })
      .sort(function (a, c) { return (c.doneAt || '') < (a.doneAt || '') ? -1 : 1; }).slice(0, 8);
    screen.classList.toggle('has-fab', !!doneList.length);
    if (!doneList.length) { df.innerHTML = ''; doneOpen = false; return; }
    var fab = '<button class="done-fab" type="button" data-donefab aria-label="最近完成 ' + doneList.length + ' 件"></button>';
    if (doneOpen) fab += doneSheet(doneList);
    df.innerHTML = fab;
  }

  function doneSheet(list) {
    var cards = list.map(function (t) { return taskCard(t, { mineHistory: true, dopts: { muted: true } }); }).join('');
    return '<div class="done-sheet" id="doneSheetBd"><div class="done-sheet-in">'
      + '<div class="done-sheet-hd"><b>最近完成 · ' + list.length + '</b>'
      + '<button class="done-sheet-x" type="button" data-doneclose aria-label="關閉">✕</button></div>'
      + cards + '</div></div>';
  }

  // ═══ 名冊 ═══
  // 醫院名稱正規化 —— 名冊機關欄、場次醫院欄各種拼法都收斂成一個標準名(統一標籤)
  var HOSP_ALIAS = {
    '臺大醫院': '臺大總院', '臺大總醫院': '臺大總院',
    '臺大北護分院': '臺大-北護分院', '北護分院': '臺大-北護分院',
    '臺大新竹臺大分院': '臺大-新竹臺大分院', '臺大新竹分院': '臺大-新竹臺大分院',
    '臺大-新竹分院': '臺大-新竹臺大分院', '新竹臺大分院': '臺大-新竹臺大分院', '新竹分院': '臺大-新竹臺大分院',
    '臺大雲林分院': '臺大-雲林分院', '雲林分院': '臺大-雲林分院',
    '臺大金山分院': '臺大-金山分院', '金山分院': '臺大-金山分院',
    '臺大癌醫中心分院': '臺大-癌醫中心分院', '臺大癌醫分院': '臺大-癌醫中心分院',
    '臺大-癌醫分院': '臺大-癌醫中心分院', '癌醫中心分院': '臺大-癌醫中心分院', '癌醫分院': '臺大-癌醫中心分院',
    '成大醫院': '成大總院', '成大總醫院': '成大總院',
    '成大斗六分院': '成大-斗六分院', '成大-斗六': '成大-斗六分院', '斗六分院': '成大-斗六分院',
    '陽明交大附設醫院': '陽明交大醫院', '陽明大學附設醫院': '陽明交大醫院', '陽交大醫院': '陽明交大醫院'
  };
  function normHosp(raw) {
    var s = String(raw || '').replace(/\s+/g, '').replace(/台/g, '臺');
    return HOSP_ALIAS[s] || s;
  }
  function isHospContact(c) { return !!c.window || /^醫院/.test(c.role || ''); }
  // 姓名依姓氏筆畫排序(zh-Hant 預設就是筆畫序;明確指定 co-stroke 更保險)
  var _nameColl;
  function nameCmp(a, b) {
    if (_nameColl === undefined) {
      _nameColl = null;
      try { _nameColl = new Intl.Collator('zh-Hant-u-co-stroke'); }
      catch (e) { try { _nameColl = new Intl.Collator('zh-Hant'); } catch (e2) { _nameColl = null; } }
    }
    a = a || ''; b = b || '';
    return _nameColl ? _nameColl.compare(a, b) : a.localeCompare(b, 'zh-Hant');
  }
  function rosterSorted() {
    return (board.contacts || []).slice().sort(function (a, b) {
      if (!!b.window !== !!a.window) return b.window ? 1 : -1;      // 窗口整群排前面
      if (isHospContact(a) && isHospContact(b)) {                   // 醫院的人:先依醫院
        var h = nameCmp(normHosp(a.org), normHosp(b.org));
        if (h) return h;
      }
      return nameCmp(a.name, b.name);                              // 再依姓氏筆畫
    });
  }
  function rosterMatch(c, f) {
    if (f && f.indexOf('role:') === 0) return String(c.role || '').trim() === f.slice(5);
    if (f === '窗口') return !!c.window;
    if (f === '醫院') return /^醫院/.test(c.role || '') && !c.window;
    return true;
  }
  /**
   * 名冊篩選 chip:全部 → 各身分別(從資料自動生,不用手動維護)→ 窗口 → 其他醫院。
   * 「醫院窗口 / 醫院其他」不另外生 chip —— 已由固定的「窗口 / 其他醫院」涵蓋。
   */
  var ROLE_CHIP_ORDER = ['委員', '觀察員', '實習觀察員', '領隊', '副領隊'];
  function rosterChipDefs(all) {
    var seen = {}, roles = [];
    all.forEach(function (c) {
      var r = String(c.role || '').trim();
      if (!r || /^醫院/.test(r)) return;
      if (!seen[r]) { seen[r] = 1; roles.push(r); }
    });
    roles.sort(function (a, b) {
      var ia = ROLE_CHIP_ORDER.indexOf(a), ib = ROLE_CHIP_ORDER.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return nameCmp(a, b);
    });
    return [['all', '全部']]
      .concat(roles.map(function (r) { return ['role:' + r, r]; }))
      .concat([['窗口', '窗口'], ['醫院', '其他醫院']]);
  }
  // 第二排篩選:委員 → 依構面(職稱欄);窗口/其他醫院 → 依醫院
  function subFilterDef() {
    if (rosterFilter === 'role:委員') return { label: '構面', of: function (c) { return c.title || '未分'; } };
    if (rosterFilter === '窗口' || rosterFilter === '醫院') return { label: '醫院', of: function (c) { return normHosp(c.org) || '未填機關'; } };
    return null;
  }
  // ═══ 日曆 tab ═══
  function calShift(ym, n) {
    var y = +ym.slice(0, 4), mo = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    return y + '-' + (mo + 1 < 10 ? '0' : '') + (mo + 1);
  }
  function isMilestone(t) { return /【[^】]*】/.test(t.name || '') || /里程碑/.test(t.name || ''); }
  function calName(t) { return String(t.name || '').replace(/^【[^】]*】\s*/, ''); }
  var CAL_TAG = { wu: '恭', lin: '珏', tsai: '佐', pool: '認', team: '共', lt: '追' };
  function calTagOf(o) {
    if (o === 'pool' || o === 'team' || o === 'lt') return CAL_TAG[o];
    var p = pget(o); return p && p.tag ? p.tag : CAL_TAG[o] || '?';
  }
  // 長期追蹤任務不進認領池 —— 沒人顧(ltWorking)時歸「追」這桶,不要當成待認領
  // 團隊共同執行(coOwners ≥2 人)一律歸「共」,不管 owner 欄還留著誰
  function calOwnerOf(t) { return isTeam(t) ? 'team' : (t.owner || t.ltWorking || (t.longTrack ? 'lt' : 'pool')); }
  // 這個 owner(wu/lin/tsai/pool/team)在目前篩選下要不要顯示;team 一律顯示
  function calShow(o) { return o === 'team' || !calPeople.length || calPeople.indexOf(o) >= 0; }

  // 收集 [fromStr, toStr] 之間所有東西(任務 / 場次 / 行事曆),未篩選。
  function calItems(fromStr, toStr) {
    var out = [];
    board.tasks.forEach(function (t) {
      if (t.status === 'deleted' || !t.due || t.due < fromStr || t.due > toStr) return;
      out.push({ date: t.due, kind: t.longTrack ? 'lt' : (isMilestone(t) ? 'ms' : 'task'), owner: calOwnerOf(t), t: t });
    });
    sessionGroups().forEach(function (g) {
      if (!g.date || !g.hosp || g.date < fromStr || g.date > toStr) return;
      out.push({ date: g.date, kind: 'sess', owner: 'team', g: g });
    });
    (board.calEvents || []).forEach(function (e) {
      if (!e.date || e.date < fromStr || e.date > toStr) return;
      out.push({ date: e.date, kind: 'gcal', owner: e.owner || 'team', e: e });
    });
    return out;
  }

  function calMonthPicker(ym) {
    var base = board.today.slice(0, 7), o = '';
    for (var i = -6; i <= 18; i++) {
      var m = calShift(base, i);
      o += '<option value="' + m + '"' + (m === ym ? ' selected' : '') + '>' + m.slice(0, 4) + ' 年 ' + (+m.slice(5, 7)) + ' 月</option>';
    }
    return '<select class="cal-mo" data-calmo>' + o + '</select>';
  }
  var CAL_PPL_ORDER = ['wu', 'lin', 'tsai'];   // 恭漢 → 珏君 → 佐晨
  function calPeoplePicker() {
    var h = '<button class="pchip' + (calPeople.length ? '' : ' on') + '" data-calppl="">全部</button>';
    CAL_PPL_ORDER.forEach(function (id) {
      var p = pget(id); if (!p) return;
      var on = calPeople.indexOf(id) >= 0;
      h += '<button class="pchip' + (on ? ' on' : '') + '" data-calppl="' + id + '">'
        + '<span class="pdot ' + id + '"></span>' + String(p.name || id).slice(-2) + '</button>';
    });
    var lon = calPeople.indexOf('lt') >= 0;
    h += '<button class="pchip' + (lon ? ' on' : '') + '" data-calppl="lt"><span class="pdot lt"></span>追蹤</button>';
    var pon = calPeople.indexOf('pool') >= 0;
    h += '<button class="pchip' + (pon ? ' on' : '') + '" data-calppl="pool"><span class="pdot pool"></span>認領</button>';
    return '<div class="cal-ppl">' + h + '</div>';
  }

  function calBar() {
    var seg = '<div class="cal-seg">'
      + '<button data-calview="month" class="' + (calView === 'month' ? 'on' : '') + '">月</button>'
      + '<button data-calview="list" class="' + (calView === 'list' ? 'on' : '') + '">清單</button></div>';
    var nav;
    if (calView === 'month') {
      var ym = calMonth || board.today.slice(0, 7);
      nav = '<button class="cal-nav" data-calshift="-1">‹</button>' + calMonthPicker(ym)
        + '<button class="cal-nav" data-calshift="1">›</button>'
        + '<button class="cal-today" data-caltoday="1">今天</button>';
    } else {
      nav = '<button class="cal-today" data-caltoday="1">今天</button>'
        + '<select class="cal-range" data-calrange>'
        + [[14, '未來 2 週'], [21, '未來 3 週'], [28, '未來 4 週']].map(function (o) {
            return '<option value="' + o[0] + '"' + (calListDays === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('')
        + '</select>';
    }
    // ⟳ 重新抓 Google 行事曆 —— 平常快取 10 分鐘,剛改完行事曆想馬上看到就按這顆
    var refresh = '<button class="cal-refresh" data-calrefresh="1"' + (busy ? ' disabled' : '')
      + ' title="重新抓 Google 行事曆(平常快取 10 分鐘)">' + (busy ? '…' : '⟳') + '</button>';
    return '<div class="cal-bar">' + nav + refresh + seg + '</div>' + calPeoplePicker();
  }

  var CAL_RANK = { sess: 0, gcal: 1, ms: 2, task: 3, lt: 4 };
  // 排序:已完成的一律沉到當天最下面(超前做完的不該卡在待辦前面),其餘依 CAL_RANK
  function calCmp(a, b) {
    var da = a.t && a.t.status === 'done' ? 1 : 0, db = b.t && b.t.status === 'done' ? 1 : 0;
    if (da !== db) return da - db;
    return (CAL_RANK[a.kind] || 3) - (CAL_RANK[b.kind] || 3);
  }
  function calRow(it) {
    if (it.kind === 'sess') {
      return '<div class="cal-row cr-sess">🏥 <b>' + esc(it.g.hosp) + '</b> 稽核場次 · ' + it.g.people.length + ' 人</div>';
    }
    if (it.kind === 'gcal') {
      return '<div class="cal-row cr-gcal"><span class="cal-who ' + it.owner + '">' + calTagOf(it.owner) + '</span>'
        + '<span class="cal-name">📅 ' + (it.e.time ? '<b>' + esc(it.e.time) + '</b> ' : '') + esc(it.e.title) + '</span>'
        + (it.e.cal ? '<span class="cal-src">' + esc(it.e.cal) + '</span>' : '') + '</div>';
    }
    var t = it.t, u = urgency(t);
    var emj = it.kind === 'ms' ? '◆ ' : it.kind === 'lt' ? '📌 ' : (u === 'overdue' ? '🔴 ' : u === 'due' ? '🟠 ' : '');
    var doneCls = t.status === 'done' ? ' done' : '';
    return '<button class="cal-row cr-task' + doneCls + (u === 'overdue' ? ' over' : u === 'due' ? ' due' : '') + '" data-calopen="' + t.rowId + '">'
      + '<span class="cal-who ' + it.owner + '">' + calTagOf(it.owner) + '</span>'
      + '<span class="cal-name">' + emj + esc(calName(t)) + '</span>'
      + (t.site ? '<span class="cal-site">' + esc(t.site) + '</span>' : '')
      + (t.status === 'done' ? '<span class="cal-done">✓</span>' : '') + '</button>';
  }

  function calCacheNote() {
    if (!boardLoadedAt) return '';
    var d = new Date(boardLoadedAt), hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return '<div class="cal-cache-note">📅 行事曆快取 30 分鐘 · 資料整理於 ' + hm
      + '。如剛改過行事曆事件、不確定有沒有反映,按上面「⟳」重新抓一次。</div>';
  }
  function renderCal() {
    screen.innerHTML = calBar() + (calView === 'list' ? calListBody() : calMonthBody()) + calCacheNote();
  }

  function calMonthBody() {
    var ym = calMonth || board.today.slice(0, 7);
    var y = +ym.slice(0, 4), mo = +ym.slice(5, 7) - 1;
    var lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    var daysInMo = new Date(y, mo + 1, 0).getDate();
    var to = ym + '-' + (daysInMo < 10 ? '0' : '') + daysInMo;
    var byDay = {};
    calItems(ym + '-01', to).forEach(function (it) { (byDay[it.date] = byDay[it.date] || []).push(it); });
    var todayS = board.today;

    var h = '<div class="cal-grid">'
      + ['一', '二', '三', '四', '五'].map(function (w) { return '<div class="cal-wd">' + w + '</div>'; }).join('')
      + '<div class="cal-wd wknd">六</div><div class="cal-wd wknd">日</div>';
    for (var d = 1; d <= daysInMo; d++) {
      var ds = ym + '-' + (d < 10 ? '0' : '') + d;
      var items = (byDay[ds] || []).filter(function (it) { return calShow(it.owner); });
      var hasSess = false, hasMs = false, cnt = {};
      items.forEach(function (it) {
        if (it.kind === 'sess') { hasSess = true; return; }
        if (it.kind === 'ms') hasMs = true;
        cnt[it.owner] = (cnt[it.owner] || 0) + 1;
      });
      var pills = '';
      ['wu', 'lin', 'tsai', 'lt', 'pool', 'team'].forEach(function (o) {
        if (cnt[o]) pills += '<span class="cpill ' + o + '">' + calTagOf(o) + cnt[o] + '</span>';
      });
      var hol = holName(ds);
      var cls = 'cal-cell' + (ds === todayS ? ' today' : '') + (ds === calDay ? ' sel' : '')
        + (isOffDay(ds) ? ' wknd' : '') + (hol ? ' hol' : '') + (hasSess ? ' sess' : '');
      h += '<button class="' + cls + '"' + (d === 1 ? ' style="grid-column-start:' + (lead + 1) + '"' : '')
        + ' data-calday="' + ds + '"><span class="cal-d">'
        + (hasSess ? '<span class="sq">🏥</span>' : '') + '<span>' + d + '</span>'
        + (hasMs ? '<span class="ms">◆</span>' : '') + '</span>'
        + (hol && !pills ? '<span class="cal-holtag">' + esc(holShort(hol)) + '</span>' : '')
        + '<span class="cpills">' + pills + '</span></button>';
    }
    h += '</div>';

    if (calDay && calDay.slice(0, 7) === ym) {
      var day = (byDay[calDay] || []).filter(function (it) { return calShow(it.owner); })
        .slice().sort(calCmp);
      h += '<div class="cal-day"><div class="cal-day-hd">' + calDay.slice(5).replace('-', '/')
        + '（' + WD[pd(calDay).getDay()] + '）'
        + (holName(calDay) ? ' · <span class="cal-day-hol">' + esc(holName(calDay)) + '</span>' : '')
        + ' · ' + day.length + ' 件</div>'
        + '<img class="cal-day-deco" src="https://nadiyalin.github.io/jiaobanzhan/cal-day-girl.png?v=2" alt="" loading="lazy">';
      if (!day.length) h += '<div class="sect-empty">' + (holName(calDay) ? '國定假日,沒排事' : isOffDay(calDay) ? '週末,沒排事' : '這天沒有排定的事') + '</div>';
      day.forEach(function (it) { h += calRow(it); });
      h += '</div>';
    } else {
      h += '<div class="cal-hint">'
        + '<span class="lg"><i class="sw wu">恭</i><i class="sw lin">珏</i><i class="sw tsai">佐</i>各人件數</span>'
        + '<span class="lg"><i class="sw lt">追</i>長期追蹤</span>'
        + '<span class="lg"><i class="sw pool">認</i>待認領</span>'
        + '<span class="lg"><i class="sw team">共</i>團隊行事曆</span>'
        + '<span class="lg">◆ 里程碑</span>'
        + '<span class="lg">🏥 場次（整格藍）</span>'
        + '<span class="lg"><i class="sw off"></i>假日 / 週末</span>'
        + '<span class="lg dim">點一格看當天細節</span>'
        + '</div>';
    }
    return h;
  }

  function calListBody() {
    var from = board.today, to = addDays(board.today, calListDays);
    var items = calItems(from, to).filter(function (it) { return calShow(it.owner); });
    var overdue = board.tasks.filter(function (t) {
      return t.status !== 'deleted' && t.status !== 'done' && !t.longTrack && t.due && t.due < board.today;
    }).filter(function (t) { return calShow(calOwnerOf(t)); }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });

    var h = '<div class="cal-list">';
    if (overdue.length) {
      h += '<div class="cal-lh crit"><b>逾期未完成</b><span class="n">' + overdue.length + '</span></div>';
      overdue.forEach(function (t) { h += calRow({ kind: 'task', owner: calOwnerOf(t), t: t }); });
    }
    var byDay = {};
    items.forEach(function (it) { (byDay[it.date] = byDay[it.date] || []).push(it); });
    var keys = Object.keys(byDay).sort();
    keys.forEach(function (ds) {
      var day = byDay[ds].slice().sort(calCmp);
      h += '<div class="cal-lh"><b>' + ds.slice(5).replace('-', '/') + '</b>'
        + '<span class="wd">（' + WD[pd(ds).getDay()] + '）</span>'
        + (ds === board.today ? '<span class="tag">今天</span>' : '')
        + (holName(ds) ? '<span class="tag hol">' + esc(holShort(holName(ds))) + '</span>' : '') + '</div>';
      day.forEach(function (it) { h += calRow(it); });
    });
    if (!overdue.length && !keys.length) h += '<div class="sect-empty">未來 ' + (calListDays / 7) + ' 週沒有排定的事</div>';
    return h + '</div>';
  }

  function renderRoster() {
    if (rosterView === 'sessions') return renderSessions();
    if (rosterView === 'attendance') return renderAttendance();
    var all = rosterSorted();
    var defs = rosterChipDefs(all);
    if (rosterFilter !== 'all' && !defs.some(function (d) { return d[0] === rosterFilter; })) rosterFilter = 'all';
    var chips = defs.map(function (d) {
      var n = d[0] === 'all' ? all.length : all.filter(function (c) { return rosterMatch(c, d[0]); }).length;
      if (d[0] !== 'all' && !n) return '';
      return '<button data-rfilter="' + d[0] + '" aria-pressed="' + (rosterFilter === d[0]) + '">' + d[1] + ' ' + n + '</button>';
    }).join('');
    // 主篩選是委員 / 窗口 / 其他醫院時,多一排第二層篩選 chip(構面 or 醫院)
    var sub = subFilterDef(), subRow = '';
    if (sub) {
      var pool = all.filter(function (c) { return rosterMatch(c, rosterFilter); });
      var by = {};
      pool.forEach(function (c) { var v = sub.of(c); by[v] = (by[v] || 0) + 1; });
      var vs = Object.keys(by).sort(function (a, b) { return nameCmp(a, b); });
      if (vs.length > 1) {
        subRow = '<div class="horizon roster-filter roster-hosp" id="rSub">' +
          '<button data-rsub="all" aria-pressed="' + (rosterSub === 'all') + '">全部' + sub.label + ' ' + pool.length + '</button>' +
          vs.map(function (v) {
            return '<button data-rsub="' + esc(v) + '" aria-pressed="' + (rosterSub === v) + '">' + esc(v) + ' ' + by[v] + '</button>';
          }).join('') + '</div>';
      }
    }
    screen.innerHTML =
      '<div class="roster-head">' +
      '<input class="search" id="rSearch" placeholder="搜尋姓名 / 機關 / 身分別">' +
      '<button class="btn rbtn ghost-btn" id="rSess">📋 場次</button>' +
      '<button class="btn primary rbtn" id="rAdd">＋ 新增</button>' +
      '</div>' +
      '<div class="horizon roster-filter" id="rFilter">' + chips + '</div>' +
      subRow +
      '<div id="rList">' + rosterList(applyRosterFilter(all)) + '</div>';
    if (document.getElementById('rSess')) document.getElementById('rSess').onclick = function () { rosterView = 'sessions'; openSession = null; renderRoster(); };
    document.getElementById('rAdd').onclick = function () { contactModal(null); };
    document.getElementById('rFilter').onclick = function (e) {
      var b = e.target.closest('[data-rfilter]'); if (!b) return;
      rosterFilter = b.dataset.rfilter;
      rosterSub = 'all';
      renderRoster();
    };
    if (document.getElementById('rSub')) document.getElementById('rSub').onclick = function (e) {
      var b = e.target.closest('[data-rsub]'); if (!b) return;
      rosterSub = b.dataset.rsub;
      renderRoster();
    };
    document.getElementById('rSearch').oninput = function () {
      document.getElementById('rList').innerHTML = rosterList(applyRosterFilter(all, this.value.trim()));
    };
    document.getElementById('rList').onclick = function (e) {
      var cp = e.target.closest('[data-copy]');
      if (cp) { copyText(cp.dataset.copy, '信箱已複製'); return; }
      var b = e.target.closest('[data-cedit]'); if (!b) return;
      contactModal(b.dataset.cedit);
    };
  }
  function applyRosterFilter(all, q) {
    var sub = subFilterDef();
    return all.filter(function (c) {
      if (!rosterMatch(c, rosterFilter)) return false;
      if (sub && rosterSub !== 'all' && sub.of(c) !== rosterSub) return false;
      if (q && (c.name + c.org + c.role + c.title + c.deputy).indexOf(q) < 0) return false;
      return true;
    });
  }

  // ═══ 場次出席 ═══
  var ROLE_ORDER = { '委員': 0, '觀察員': 1, '實習觀察員': 2, '領隊': 3, '副領隊': 4 };
  var SESS_ROLES = ['委員', '觀察員', '實習觀察員', '領隊', '副領隊'];
  // 樂觀更新:本地 board.sessions 立即改 + 重繪,api.submit 純寫回(fire-and-forget)。
  // ⚠ 不要拿回傳的看板覆蓋 board —— 連點多個勾選時,多個 submit 同時在飛,
  //   回來的是各自時間點的舊快照,覆蓋 + 重繪就會「自己勾/自己取消」跳來跳去。
  //   失敗才 revert 那一筆 + toast。別人的異動下次整頁刷新(切分頁 / getBoard)才會進來。
  function sessSync(type, params, onErr) {
    sessSyncing++;
    api.submit(type, params).then(function (b) {
      sessSyncing = Math.max(0, sessSyncing - 1);
      if (b && b.error) { if (onErr) onErr(); toast('⚠ ' + b.error); if (rosterView === 'sessions') renderRoster(); }
    }).catch(function (e) {
      sessSyncing = Math.max(0, sessSyncing - 1);
      if (onErr) onErr();
      toast('⚠ 同步失敗:' + (e && e.message || e));
      if (rosterView === 'sessions') renderRoster();
    });
  }

  // ── 場次詳情頁自動刷新:每 15 秒拉一次,讓別人的簽到 / 改名單進來。
  //    只在「看某場、非編輯、沒有待寫入」時跑;有變動才重繪 + toast,沒變動只更新時間戳。
  //    畫面上永遠有「自動同步」那行字 —— 不然勾勾自己變會很像鬼故事。
  function stopSessPoll() { if (sessPollT) { clearInterval(sessPollT); sessPollT = null; } }
  function startSessPoll() { if (!sessPollT) sessPollT = setInterval(sessPollTick, 15000); }
  function sessSig(bd, sk) {
    return (bd.sessions || []).filter(function (r) { return r.key === sk; })
      .map(function (r) { return r.name + '|' + r.role + '|' + (r.signed ? 1 : 0) + '|' + (r.signedAt || '') + '|' + r.date + '|' + r.hosp + '|' + (r.note || ''); })
      .sort().join('§');
  }
  function setSyncNote(txt) { var e = document.getElementById('sessSyncNote'); if (e) e.textContent = txt; }
  function syncNoteText() {
    if (!sessSyncedAt) return '🔄 自動同步中 · 每 15 秒';
    var d = new Date(sessSyncedAt);
    return '🔄 自動同步中 · 剛更新 ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function sessPollTick() {
    if (scr !== 'roster' || rosterView !== 'sessions' || !openSession || sessEdit) { stopSessPoll(); return; }
    if (sessSyncing > 0 || busy || modalRoot.firstChild || document.hidden) return;   // 暫時跳過,下次再試
    var sk = openSession;
    setSyncNote('🔄 同步中…');
    api.getBoard().then(function (b) {
      if (!b || b.error) { setSyncNote('🔄 同步失敗,稍後再試'); return; }
      if (scr !== 'roster' || rosterView !== 'sessions' || openSession !== sk || sessEdit || sessSyncing > 0) return;
      var changed = sessSig(board, sk) !== sessSig(b, sk);
      board = b;
      sessSyncedAt = Date.now();
      if (changed) { renderRoster(); toast('🔄 名單已更新(有人剛改)'); }
      else setSyncNote(syncNoteText());
    }).catch(function () { setSyncNote('🔄 同步失敗,稍後再試'); });
  }
  function nowHM() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function sessRowOf(sk, name) { return (board.sessions || []).filter(function (r) { return r.key === sk && r.name === name; })[0]; }
  function isSigned(sk, name) { var r = sessRowOf(sk, name); return !!(r && r.signed); }
  function toggleSign(sk, name) {
    var r = sessRowOf(sk, name); if (!r) return;
    var wasOn = r.signed, wasAt = r.signedAt;
    r.signed = !r.signed;
    r.signedAt = r.signed ? nowHM() : '';
    sessSync('sessionSign', { key: sk, name: name, on: r.signed }, function () { r.signed = wasOn; r.signedAt = wasAt; });
    renderRoster();
  }
  function sessNote(sk, name, note) {
    var r = sessRowOf(sk, name); if (!r) return;
    var was = r.note || '';
    r.note = note;
    sessSync('sessionSetNote', { key: sk, name: name, note: note }, function () { r.note = was; });
    renderRoster();
  }
  function sessNoteModal(sk, name) {
    var r = sessRowOf(sk, name) || {};
    openModal('<div class="lede">' + esc(name) + ' · 場次備註</div>' +
      '<p class="pick-note">只記在這場(例:只到中午 / 由XX代理 / 遲到)</p>' +
      '<textarea id="snText" class="form-ta">' + esc(r.note || '') + '</textarea>' +
      '<div class="sheet-acts"><button class="btn primary" id="snGo">儲存</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    var ta = document.getElementById('snText'); ta.focus();
    document.getElementById('snGo').onclick = function () {
      sessNote(sk, name, ta.value.trim());
      closeModal();
    };
  }
  function sessAdd(sk, date, hosp, name, role) {
    var row = { key: sk, date: date, hosp: hosp, name: name, role: role, signed: false };
    (board.sessions = board.sessions || []).push(row);
    sessSync('sessionAddPerson', { key: sk, name: name, role: role, date: date, hosp: hosp },
      function () { board.sessions = board.sessions.filter(function (r) { return r !== row; }); });
  }
  function sessRemove(sk, name) {
    var rows = board.sessions || [];
    var gone = rows.filter(function (r) { return r.key === sk && r.name === name; });
    var kept = rows.filter(function (r) { return !(r.key === sk && r.name === name); });
    if (!kept.some(function (r) { return r.key === sk; })) {          // 別讓場次整個消失
      var m = rows.filter(function (r) { return r.key === sk; })[0] || {};
      kept.push({ key: sk, date: m.date, hosp: m.hosp, name: '', role: '', signed: false });
    }
    board.sessions = kept;
    sessSync('sessionRemovePerson', { key: sk, name: name },
      function () { board.sessions = (board.sessions || []).concat(gone); });
  }
  function sessSetRole(sk, name, role) {
    var prev = {};
    (board.sessions || []).forEach(function (r) { if (r.key === sk && r.name === name) { prev[r.name] = r.role; r.role = role; } });
    sessSync('sessionSetRole', { key: sk, name: name, role: role },
      function () { (board.sessions || []).forEach(function (r) { if (r.key === sk && r.name === name) r.role = prev[r.name]; }); });
  }
  function sessSetMeta(sk, date, hosp) {
    (board.sessions || []).forEach(function (r) { if (r.key === sk) { r.date = date; r.hosp = hosp; } });
    sessSync('sessionSetMeta', { key: sk, date: date, hosp: hosp });
  }
  function sessDelete(sk) {
    var gone = (board.sessions || []).filter(function (r) { return r.key === sk; });
    board.sessions = (board.sessions || []).filter(function (r) { return r.key !== sk; });
    sessSync('sessionDelete', { key: sk },
      function () { board.sessions = (board.sessions || []).concat(gone); openSession = sk; });
  }
  function sessionGroups() {
    var by = {};
    (board.sessions || []).forEach(function (r) {
      var g = by[r.key] = by[r.key] || { key: r.key, date: r.date, hosp: normHosp(r.hosp), people: [] };
      g.date = r.date; g.hosp = normHosp(r.hosp);
      if (r.name) g.people.push(r);
    });
    return Object.keys(by).map(function (k) { return by[k]; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  function contactByName(name) {
    return (board.contacts || []).filter(function (c) { return c.name === name; })[0];
  }
  function renderSessions() {
    if (openSession) return renderSessionDetail(openSession);
    var gs = sessionGroups();
    var rows = gs.map(function (g) {
      var n = {};
      g.people.forEach(function (p) { n[p.role] = (n[p.role] || 0) + 1; });
      var done = g.people.filter(function (p) { return isSigned(g.key, p.name); }).length;
      return '<button class="sess-row" data-session="' + esc(g.key) + '">' +
        '<div class="sess-when">' + esc(g.date.slice(5)) + ' 週' + WD[pd(g.date).getDay()] + '</div>' +
        '<div class="sess-main"><div class="sess-hosp">' + esc(g.hosp) + '</div>' +
        '<div class="sess-sub">委員 ' + (n['委員'] || 0) + ' · 觀察員 ' + (n['觀察員'] || 0) + (n['領隊'] ? ' · 領隊 ' + n['領隊'] : '') + (n['副領隊'] ? ' · 副領隊 ' + n['副領隊'] : '') +
        (done ? ' <span class="sess-done">已到 ' + done + '</span>' : '') + '</div></div>' +
        '<div class="sess-arrow">›</div></button>';
    }).join('');
    screen.innerHTML =
      '<div class="roster-head"><button class="btn ghost-btn" id="sBack">← 回名冊</button>' +
      '<button class="btn ghost-btn" id="sAtt">👥 出席總表</button>' +
      '<button class="btn primary rbtn" id="sNew">＋ 新增場次</button></div>' +
      '<div class="sess-title-row">實地稽核場次</div>' +
      '<div id="sList">' + (rows || '<div class="empty">還沒有場次 —— 按右上「＋ 新增場次」</div>') + '</div>';
    document.getElementById('sBack').onclick = function () { stopSessPoll(); rosterView = 'contacts'; renderRoster(); };
    document.getElementById('sAtt').onclick = function () { stopSessPoll(); rosterView = 'attendance'; renderRoster(); };
    document.getElementById('sNew').onclick = newSessionModal;
    document.getElementById('sList').onclick = function (e) {
      var b = e.target.closest('[data-session]'); if (!b) return;
      openSession = b.dataset.session; sessEdit = false; renderRoster();
    };
  }
  // ── 委員出席總表:排場次時參考「誰穩定、誰熟哪家醫院」。純看 board.sessions 裡 role==='委員' 的列,
  // 不用另外存資料。「近三年」窗口 = 今年往前推 2 年(含今年);純前端算,不影響 Store/資料庫。
  function renderAttendance() {
    var todayYr = +board.today.slice(0, 4);
    var winFrom = todayYr - 2, winTo = todayYr;
    var byName = {};
    (board.sessions || []).forEach(function (r) {
      if (r.role !== '委員' || !r.name) return;
      var yr = +String(r.date).slice(0, 4);
      (byName[r.name] = byName[r.name] || []).push({ yr: yr, hosp: normHosp(r.hosp) });
    });
    var names = Object.keys(byName).sort(nameCmp);
    var rows = names.map(function (name) {
      var all = byName[name];
      var inWin = all.filter(function (s) { return s.yr >= winFrom && s.yr <= winTo; });
      var gone = inWin.length === 0;
      var yearsPresent = {};
      all.forEach(function (s) { yearsPresent[s.yr] = true; });
      var firstYr = Math.min.apply(null, all.map(function (s) { return s.yr; }));
      var winYears = []; for (var wy = winFrom; wy <= winTo; wy++) winYears.push(wy);
      var coverage = winYears.filter(function (y) { return yearsPresent[y]; }).length / winYears.length;
      var tagCls, tagText;
      if (gone) { tagCls = 'bad'; tagText = '查不到'; }
      else if (todayYr - firstYr <= 1) { tagCls = 'good'; tagText = '新進'; }
      else if (coverage >= 0.9) { tagCls = 'accent'; tagText = '常任'; }
      else { tagCls = 'warn'; tagText = '不定期'; }

      // 真實醫院名稱長短不一(「臺大-新竹臺大分院」到「臺大總院」都有),硬塞固定寬度的欄位會擠爆一整行、
      // 標籤互相疊到 —— 熟悉站點清單改放進點開才看到的細節裡,收起來的那一行只留看一眼就懂的「狀態 + 次數」。
      var hospCount = {};
      all.forEach(function (s) { hospCount[s.hosp] = (hospCount[s.hosp] || 0) + 1; });
      var siteHtml = !Object.keys(hospCount).length ? '<span class="ah-site-none">近三年內沒有場次紀錄</span>' :
        '<div class="ah-site-pills">' + Object.keys(hospCount).map(function (h) { return { h: h, n: hospCount[h] }; })
          .sort(function (a, b) { return b.n - a.n; })
          .map(function (x) { return '<span class="ah-site-pill">' + esc(x.h) + '<b>×' + x.n + '</b></span>'; }).join('') + '</div>';

      var countHtml = inWin.length === all.length ? String(inWin.length)
        : (inWin.length + '<span class="all">／' + all.length + '</span>');

      var byYear = {};
      all.forEach(function (s) { (byYear[s.yr] = byYear[s.yr] || []).push(s); });
      var yearHtml = Object.keys(byYear).map(Number).sort(function (a, b) { return b - a; }).map(function (yr) {
        var out = yr < winFrom || yr > winTo;
        return '<div class="ah-yr-head"><span class="ah-yr-pill' + (out ? ' outwin' : '') + '">' + yr + ' 年</span>' +
          '<span style="font-size:11px;color:var(--ink-faint)">' + (out ? '已掉出近三年' : '近三年內') + '</span></div>' +
          byYear[yr].map(function (s) { return '<div class="ah-drow' + (out ? ' outwin' : '') + '">' + esc(s.hosp) + '</div>'; }).join('');
      }).join('');
      var detailHtml = '<div class="ah-site-hd">熟悉站點</div>' + siteHtml + yearHtml;

      return '<div class="ah-row-wrap">' +
        '<div class="ah-row' + (gone ? ' gone' : '') + '" data-att="' + esc(name) + '">' +
          '<span class="ah-chev">▸</span><span class="ah-name">' + esc(name) + '</span>' +
          '<span class="ah-tag ' + tagCls + '">' + tagText + '</span>' +
          '<span class="ah-count">' + countHtml + '</span>' +
        '</div>' +
        '<div class="ah-detail" id="attd-' + esc(name) + '">' + detailHtml + '</div>' +
      '</div>';
    }).join('');

    screen.innerHTML =
      '<div class="roster-head"><button class="btn ghost-btn" id="aBack">← 回場次列表</button></div>' +
      '<div class="sess-title-row">委員出席總表</div>' +
      '<div class="ah-legend">' +
        '<span><span class="ah-tag accent">常任</span>近三年幾乎每年都有出席</span>' +
        '<span><span class="ah-tag good">新進</span>第一次出席在最近 1 年內</span>' +
        '<span><span class="ah-tag warn">不定期</span>有出席但沒有每年都到</span>' +
        '<span><span class="ah-tag bad">查不到</span>近三年內完全沒紀錄</span>' +
      '</div>' +
      '<div id="attBody">' + (rows || '<div class="empty">還沒有委員出席紀錄</div>') + '</div>';
    document.getElementById('aBack').onclick = function () { rosterView = 'sessions'; renderRoster(); };
    var attBody = document.getElementById('attBody');
    if (attBody) attBody.onclick = function (e) {
      var row = e.target.closest('[data-att]'); if (!row) return;
      var d = document.getElementById('attd-' + row.dataset.att);
      d.classList.toggle('open');
      row.querySelector('.ah-chev').classList.toggle('open');
    };
  }
  function newSessionModal() {
    var siteOpts = (board.sites || []).map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    openModal('<div class="lede">新增場次</div>' +
      '<div class="fld"><span>日期</span><input id="nsDate" type="date"></div>' +
      '<div class="fld"><span>醫院 / 單位</span><input id="nsHosp" list="nsSites" placeholder="醫院名稱"><datalist id="nsSites">' + siteOpts + '</datalist></div>' +
      '<div class="sheet-fx conflict" id="nsConflict"></div>' +
      '<div class="sheet-acts"><button class="btn primary" id="nsGo">建立</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    document.getElementById('nsDate').oninput = function () {
      document.getElementById('nsConflict').textContent = conflictLine(v('nsDate'));
    };
    document.getElementById('nsGo').onclick = function () {
      var d = v('nsDate'), h = v('nsHosp');
      if (!d || !h) { toast('日期和醫院都要填'); return; }
      var sk = 'S' + Date.now();
      (board.sessions = board.sessions || []).push({ key: sk, date: d, hosp: h, name: '', role: '', signed: false });
      sessSync('sessionNew', { key: sk, date: d, hosp: h });
      closeModal(); openSession = sk; sessEdit = true; renderRoster();
    };
  }
  function renderSessionDetail(sk) {
    var g = sessionGroups().filter(function (x) { return x.key === sk; })[0];
    if (!g) { rosterView = 'contacts'; openSession = null; return renderRoster(); }
    // 編輯模式下維持原始順序、不依角色分組 —— 不然改角色那一列會立刻跳到別的分組,
    // 手感像下拉選單「跳掉」。只有非編輯(檢視)模式才依角色排序分組展示。
    var ppl = sessEdit ? g.people.slice() : g.people.slice().sort(function (a, b) {
      return (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) || nameCmp(a.name, b.name);
    });
    var done = ppl.filter(function (p) { return isSigned(sk, p.name); }).length;
    var roleOpts = function (sel) { return SESS_ROLES.map(function (r) { return '<option' + (r === sel ? ' selected' : '') + '>' + r + '</option>'; }).join(''); };
    var lastRole = null, body = '';
    ppl.forEach(function (p) {
      if (!sessEdit && p.role !== lastRole) { body += '<div class="divider"><span class="d-t">' + esc(p.role) + '</span></div>'; lastRole = p.role; }
      var c = contactByName(p.name) || {};
      if (sessEdit) {
        body += '<div class="att edit"><button class="att-x" data-rm="' + esc(p.name) + '">✕</button>' +
          '<div class="att-body"><div class="att-name">' + esc(p.name) +
          (c.name ? '' : ' <span class="att-t">名冊沒有</span>') + '</div>' +
          '<select class="att-role" data-role="' + esc(p.name) + '">' + roleOpts(p.role) + '</select></div></div>';
        return;
      }
      var on = isSigned(sk, p.name);
      var srow = sessRowOf(sk, p.name);
      var sAt = on && srow && srow.signedAt ? ' <span class="att-t">' + esc(String(srow.signedAt).slice(-5)) + ' 到</span>' : '';
      var pn = (srow && srow.note) || '';
      var links = contactSlots(c.tel, c.mobile, c.mail);
      body += '<div class="att' + (on ? ' on' : '') + '">' +
        '<button class="att-chk" data-sign="' + esc(p.name) + '" aria-pressed="' + on + '">' + (on ? '✓' : '') + '</button>' +
        '<div class="att-body"><div class="att-name">' + esc(p.name) +
        (c.title ? ' <span class="att-t">' + esc(c.title) + '</span>' : (c.name ? '' : ' <span class="att-t">名冊沒有</span>')) + sAt + '</div>' +
        '<div class="contact-links">' + links + '</div>' +
        (pn
          ? '<div class="att-note" data-note="' + esc(p.name) + '">📝 ' + esc(pn) + '</div>'
          : '<button class="att-note add" data-note="' + esc(p.name) + '">＋ 場次備註</button>') +
        '</div></div>';
    });
    if (sessEdit) {
      var nmeOpts = (board.contacts || []).map(function (c) { return '<option value="' + esc(c.name) + '">'; }).join('');
      body += '<div class="att-add"><input id="saName" list="saNames" placeholder="姓名"><datalist id="saNames">' + nmeOpts + '</datalist>' +
        '<select id="saRole">' + roleOpts('委員') + '</select><button class="btn primary" id="saGo">加入</button></div>' +
        '<button class="btn ghost sess-del" id="sDel">刪除這場場次</button>';
    }
    screen.innerHTML =
      '<div class="roster-head"><button class="btn ghost-btn" id="sBack">← 場次</button>' +
      (sessEdit
        ? '<button class="btn primary rbtn" id="sDone2">完成</button>'
        : '<button class="btn ghost-btn" id="sEdit">編輯</button><button class="btn primary rbtn" id="sCopy">複製名單</button>') +
      '</div>' +
      '<div class="sess-dh">' +
      (sessEdit
        ? '<div class="fld-row"><div class="fld"><span>日期</span><input id="sMDate" type="date" value="' + esc(g.date) + '"></div>' +
          '<div class="fld"><span>醫院</span><input id="sMHosp" value="' + esc(g.hosp) + '"></div></div>'
        : '<div class="sess-hosp">' + esc(g.hosp) + '</div>' +
          '<div class="sess-sub">' + esc(g.date.slice(5)) + ' 週' + WD[pd(g.date).getDay()] +
          ' · <b>已到 ' + done + '</b> / ' + ppl.length + '</div>' +
          '<div class="sess-sync" id="sessSyncNote">' + syncNoteText() + '</div>' +
          '<img class="sess-peek" src="https://nadiyalin.github.io/jiaobanzhan/sess-peek-boy.png?v=1" alt="" loading="lazy">') +
      '</div>' +
      (sessEdit || !ppl.length ? '' :
        '<div class="acts" style="margin-bottom:11px">' +
        '<button class="btn" id="sNotifyStatus">🚐 回報接駁地現況</button>' +
        '<button class="btn primary" id="sNotifyDepart">🚗 完成接駁 · 發車</button></div>') +
      (ppl.length || sessEdit ? body : '<div class="empty">還沒有人 —— 按「編輯」加人</div>');
    document.getElementById('sBack').onclick = function () { stopSessPoll(); openSession = null; sessEdit = false; renderRoster(); };
    if (document.getElementById('sEdit')) document.getElementById('sEdit').onclick = function () { stopSessPoll(); sessEdit = true; renderRoster(); };
    if (document.getElementById('sCopy')) document.getElementById('sCopy').onclick = function () { copySessionList(g, ppl); };
    if (document.getElementById('sNotifyStatus')) document.getElementById('sNotifyStatus').onclick = function () { sessNotifyStatusModal(sk, g, ppl); };
    if (document.getElementById('sNotifyDepart')) document.getElementById('sNotifyDepart').onclick = function () { sessNotifyDepartModal(sk, g); };
    if (document.getElementById('sDone2')) document.getElementById('sDone2').onclick = function () {
      sessSetMeta(sk, v('sMDate') || g.date, v('sMHosp') || g.hosp);
      sessEdit = false; renderRoster();
    };
    if (document.getElementById('sDel')) document.getElementById('sDel').onclick = function () {
      var b = document.getElementById('sDel');
      if (b.dataset.armed) { sessDelete(sk); openSession = null; sessEdit = false; renderRoster(); return; }
      b.dataset.armed = '1'; b.textContent = '再按一次 → 刪除整場「' + g.hosp + '」';
      setTimeout(function () { if (b) { b.dataset.armed = ''; b.textContent = '刪除這場場次'; } }, 4000);
    };
    if (document.getElementById('saGo')) document.getElementById('saGo').onclick = function () {
      var nm = v('saName'); if (!nm) { toast('填姓名'); return; }
      if (g.people.some(function (x) { return x.name === nm; })) { toast('已在名單裡'); return; }
      sessAdd(sk, g.date, g.hosp, nm, v('saRole') || '委員');
      renderRoster();
    };
    [].forEach.call(screen.querySelectorAll('[data-sign]'), function (btn) {
      btn.onclick = function () { toggleSign(sk, btn.dataset.sign); };
    });
    [].forEach.call(screen.querySelectorAll('[data-rm]'), function (btn) {
      btn.onclick = function () { sessRemove(sk, btn.dataset.rm); renderRoster(); };
    });
    [].forEach.call(screen.querySelectorAll('[data-role]'), function (sel) {
      sel.onchange = function () { sessSetRole(sk, sel.dataset.role, sel.value); renderRoster(); };
    });
    [].forEach.call(screen.querySelectorAll('[data-copy]'), function (el) {
      el.onclick = function () { copyText(el.dataset.copy, '信箱已複製'); };
    });
    [].forEach.call(screen.querySelectorAll('[data-note]'), function (el) {
      el.onclick = function () { sessNoteModal(sk, el.dataset.note); };
    });
    if (sessEdit) stopSessPoll(); else startSessPoll();
  }
  function sessNotifyStatusModal(sk, g, ppl) {
    var here = ppl.filter(function (p) { return isSigned(sk, p.name); });
    var pend = ppl.filter(function (p) { return !isSigned(sk, p.name); });
    var head = esc(g.hosp) + ' ' + esc(g.date.slice(5)) + '（週' + WD[pd(g.date).getDay()] + '）';
    openModal('<div class="lede">回報接駁地現況</div><h3>' + head + '</h3>' +
      '<div class="fld"><span>補充 選填(例:預計 09:10 前發車)</span><input id="snsNote"></div>' +
      '<div class="sheet-fx">會發這則到「醫院資安小組」LINE：<br>' +
      '🚐 ' + head + '接駁地現況<br>' +
      '已到 ' + here.length + ' / ' + ppl.length + ' 位：' + esc(here.map(function (p) { return p.name; }).join('、') || '（尚無）') + '<br>' +
      (pend.length
        ? '待確認交通 / 自行前往 ' + pend.length + ' 位：' + esc(pend.map(function (p) { return p.name + (p.role !== '委員' ? '(' + p.role + ')' : ''); }).join('、'))
        : '全員已抵達接駁地。') +
      '</div>' +
      '<div class="sheet-acts"><button class="btn primary" id="snsGo">送出 LINE</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    document.getElementById('snsGo').onclick = function () {
      go('sessNotifyStatus', { key: sk, note: v('snsNote') }, '已回報接駁地現況');
    };
  }
  function sessNotifyDepartModal(sk, g) {
    var head = esc(g.hosp) + ' ' + esc(g.date.slice(5)) + '（週' + WD[pd(g.date).getDay()] + '）';
    openModal('<div class="lede">完成接駁 · 發車</div><h3>' + head + '</h3>' +
      '<div class="fld"><span>補充 選填(例:預計 09:40 抵達)</span><input id="sndNote"></div>' +
      '<div class="sheet-fx">會發：🚗 ' + head + '接駁完成 —— 接駁地已完成接駁,車輛發車前往場地。</div>' +
      '<div class="sheet-acts"><button class="btn primary" id="sndGo">送出 LINE</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    document.getElementById('sndGo').onclick = function () {
      go('sessNotifyDepart', { key: sk, note: v('sndNote') }, '已通知發車');
    };
  }
  function copySessionList(g, ppl) {
    var lines = ['【' + g.hosp + ' ' + g.date.slice(5) + '（週' + WD[pd(g.date).getDay()] + '）稽核出席】', ''];
    var lastRole = null;
    ppl.forEach(function (p) {
      if (p.role !== lastRole) { lines.push(p.role); lastRole = p.role; }
      var c = contactByName(p.name) || {};
      var ph = c.mobile || c.tel || '';
      lines.push('　' + p.name + (ph ? '　' + ph : '') + (p.note ? '　(' + p.note + ')' : ''));
    });
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('名單已複製'); },
        function () { showCopyFallback(text); });
    } else showCopyFallback(text);
  }
  function showCopyFallback(text) {
    openModal('<div class="lede">複製名單</div><p class="pick-note">長按下面選取全部複製</p>' +
      '<textarea class="copy-ta" readonly>' + esc(text) + '</textarea>' +
      '<div class="sheet-acts"><button class="btn primary" data-close>好</button></div>');
    var ta = document.querySelector('.copy-ta'); ta.focus(); ta.select();
  }
  function splitAddrs(s) {
    return String(s || '').split(/[,;、\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function telHref(num) { return 'tel:' + String(num).replace(/[^\d+#*,;]/g, ''); }
  function telChip(num, label) {
    return '<a class="clink" title="' + esc(num) + '" href="' + esc(telHref(num)) + '"><b>' + label + '</b><span class="ck-v">' + esc(num) + '</span></a>';
  }
  // 信箱:點一下複製,不開寄信 App
  function copyText(str, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(function () { toast(okMsg || '已複製'); }, function () { showCopyFallback(str); });
    } else showCopyFallback(str);
  }
  function mailChips(raw) {
    return splitAddrs(raw).map(function (m) { return mailSlot('✉', m); }).join('');
  }
  // 固定 4 格:公務 | 手機 / 信箱 | 第二信箱 —— 沒資料的格也畫出來寫「無」(底色跟有資料的一樣)
  function noneChip(label) {
    return '<span class="clink clink-none"><b>' + label + '</b><span class="ck-v">無</span></span>';
  }
  function telSlot(label, num) {
    if (!num) return noneChip(label);
    return '<a class="clink" title="' + esc(num) + '" href="' + esc(telHref(num)) + '"><b>' + label + '</b><span class="ck-v">' + esc(num) + '</span></a>';
  }
  function mailSlot(label, addr) {
    if (!addr) return noneChip(label);
    return '<span class="clink clink-copy" role="button" tabindex="0" data-copy="' + esc(addr) + '" title="點一下複製 ' + esc(addr) + '"><b>' + label + '</b><span class="ck-v">' + esc(addr) + '</span></span>';
  }
  function contactSlots(tel, mobile, mailStr) {
    var em = splitAddrs(mailStr);
    return telSlot('公務', tel) + telSlot('手機', mobile) + mailSlot('✉', em[0]) + mailSlot('✉', em[1]);
  }
  function rosterList(cs) {
    if (!cs.length) return '<div class="empty">' + ((board.contacts || []).length ? '沒有符合的' : '名冊還沒有資料 —— 按右上「＋ 新增」') + '</div>';
    return cs.map(function (c) {
      var links = contactSlots(c.tel, c.mobile, c.mail);
      var dep = '';
      if (c.deputy || c.deputyTel || splitAddrs(c.deputyMail).length) {
        var dl = '';
        if (c.deputyTel) dl += telChip(c.deputyTel, '電話');
        dl += mailChips(c.deputyMail);
        dep = '<div class="contact-dep">' +
          '<div class="dep-head">代理／秘書' + (c.deputy ? ' · <b>' + esc(c.deputy) + '</b>' : '') + '</div>' +
          (dl ? '<div class="contact-links">' + dl + '</div>' : '') + '</div>';
      }
      return '<div class="contact">' +
        '<div class="contact-top"><span class="av-sm">' + esc(c.name.slice(0, 1)) + '</span>' +
        '<div class="contact-id"><div class="contact-name">' + esc(c.name) +
        (c.window ? ' <span class="win-tag">窗口</span>' : '') + '</div>' +
        (c.role || c.title ? '<div class="contact-role">' + esc([c.role, c.title].filter(Boolean).join(' · ')) + '</div>' : '') +
        '</div><button class="mini-edit" data-cedit="' + esc(c.id) + '" aria-label="編輯">✎</button></div>' +
        '<div class="contact-org">' + esc(isHospContact(c) ? normHosp(c.org) : (c.org || '')) + '</div>' +
        '<div class="contact-links">' + links + '</div>' +
        dep +
        (c.note ? '<div class="contact-note">' + esc(c.note) + '</div>' : '') +
        '</div>';
    }).join('');
  }
  function contactModal(id) {
    var c = id ? (board.contacts || []).filter(function (x) { return x.id === id; })[0] : null;
    if (id && !c) { toast('找不到這筆'); return; }
    c = c || {};
    var roles = ['委員', '觀察員', '實習觀察員', '領隊', '副領隊', '醫院窗口', '醫院其他', '教育部', '廠商', '其他'];
    if (c.role && roles.indexOf(c.role) < 0) roles.unshift(c.role);
    var roleOpts = '<option value="">— 選擇 —</option>' + roles.map(function (r) {
      return '<option' + (c.role === r ? ' selected' : '') + '>' + esc(r) + '</option>';
    }).join('');
    openModal('<div class="lede">' + (id ? '編輯聯絡人' : '新增聯絡人') + '</div>' +
      '<div class="fld"><span>姓名</span><input id="cName" value="' + esc(c.name || '') + '"></div>' +
      '<div class="fld-row"><div class="fld"><span>身分別</span><select id="cRole">' + roleOpts + '</select></div>' +
      '<div class="fld"><span>職稱</span><input id="cTitle" value="' + esc(c.title || '') + '"></div></div>' +
      '<div class="fld"><span>機關</span><input id="cOrg" value="' + esc(c.org || '') + '"></div>' +
      '<div class="fld"><span>Email · 多個用逗號分隔</span><input id="cMail" value="' + esc(c.mail || '') + '" placeholder="a@x.com, b@y.com"></div>' +
      '<div class="fld-row"><div class="fld"><span>公務電話</span><input id="cTel" inputmode="tel" value="' + esc(c.tel || '') + '" placeholder="含分機"></div>' +
      '<div class="fld"><span>手機</span><input id="cMobile" inputmode="tel" value="' + esc(c.mobile || '') + '" placeholder="0912…"></div></div>' +
      '<label class="chkline" style="font-size:12.5px;color:var(--ink-soft)"><input type="checkbox" id="cWin"' + (c.window ? ' checked' : '') + '> 這個機關的聯絡窗口</label>' +
      '<div class="fld"><span>代理人 / 秘書 選填</span><input id="cDep" value="' + esc(c.deputy || '') + '"></div>' +
      '<div class="fld-row"><div class="fld"><span>代理人電話</span><input id="cDepTel" inputmode="tel" value="' + esc(c.deputyTel || '') + '"></div>' +
      '<div class="fld"><span>代理人Email · 可多個</span><input id="cDepMail" value="' + esc(c.deputyMail || '') + '"></div></div>' +
      '<div class="fld"><span>備註 選填</span><textarea id="cNote">' + esc(c.note || '') + '</textarea></div>' +
      '<div class="sheet-acts"><button class="btn primary" id="cGo">' + (id ? '儲存' : '新增') + '</button>' +
      (id ? '<button class="btn ghost" id="cDel">刪除</button>' : '<button class="btn ghost" data-close>取消</button>') +
      '</div>');
    document.getElementById('cGo').onclick = function () {
      if (!v('cName')) { toast('請填姓名'); return; }
      var p = {
        name: v('cName'), role: v('cRole'), title: v('cTitle'), org: v('cOrg'), mail: v('cMail'),
        tel: v('cTel'), mobile: v('cMobile'), window: ck('cWin'), deputy: v('cDep'),
        deputyTel: v('cDepTel'), deputyMail: v('cDepMail'), note: v('cNote')
      };
      if (id) { p.id = id; go('editContact', p, '已儲存'); }
      else go('addContact', p, '已新增');
    };
    if (id) document.getElementById('cDel').onclick = function () {
      if (confirm('刪除聯絡人「' + (c.name || '') + '」?')) go('deleteContact', { id: id, name: c.name }, '已刪除');
    };
  }

  // ═══ render ═══
  var ICO_GEAR = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
  var ICO_BELL = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.6 8.5-2.6 8.5h17.2S18 15 18 8.5"></path><path d="M13.7 20.5a2 2 0 0 1-3.4 0"></path></svg>';
  // 共同執行:團隊標記(Feather users) / 找人一起(Feather user-plus) —— 早報 LINE 那邊維持 👥
  var ICO_USERS = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
  var ICO_UADD = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>';
  var ICO_X = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  // 課程追蹤:書本(入口/課程卡) / 右箭頭(進名單) / 加號(新增人員)
  var ICO_COURSE = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>';
  var ICO_CHEV = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';
  var ICO_PLUS = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>';
  var ICO_HELP = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"></circle><path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  function notifIco(k) { return k === '場次改期' ? '📅' : k === '編輯任務' ? '✏️' : k === '進度更新' ? '📝' : k === '範本' ? '✎' : k === '新增場次' ? '🗂️' : k === '認領' ? '🙋' : '🔔'; }
  function selCount() { return Object.keys(sel).filter(function (k) { return sel[k]; }).length; }
  function render() {
    if (!board) return;
    var meBtn = document.getElementById('meBtn');
    document.getElementById('meLabel').textContent = board.me ? board.me.name : '';
    meBtn.hidden = !board.me;
    var _nc = (board.notifs || []).length;
    document.getElementById('meIco').innerHTML = _nc
      ? ICO_BELL + '<span class="me-count">' + (_nc > 9 ? '9+' : _nc) + '</span>'
      : ICO_GEAR;
    meBtn.classList.toggle('has-notif', !!_nc);
    meBtn.setAttribute('aria-label', _nc ? (_nc + ' 則新通知') : '個人設定');
    document.getElementById('dt').textContent = board.today.slice(5) + ' 週' + WD[pd(board.today).getDay()];
    var unseen = board.tasks.filter(function (t) {
      return t.status === 'open' && t.owner === ME() && t.handoffFrom && t.handoffFrom !== ME() && !t.seenAt;
    }).length;
    var badge = document.getElementById('todoBadge');
    badge.hidden = !unseen; badge.textContent = unseen;
    screen.style.opacity = busy ? '.5' : '';
    screen.style.pointerEvents = busy ? 'none' : '';
    if (scr !== 'todo') { var _df = document.getElementById('doneFab'); if (_df) _df.innerHTML = ''; doneOpen = false; screen.classList.remove('has-fab'); }
    if (scr === 'board') renderBoard();
    else if (scr === 'todo') renderTodo();
    else if (scr === 'cal') renderCal();
    else renderRoster();
  }

  // ═══ MODALS ═══
  // ⚙ 個人設定
  function settingsBody() {
    var cur = soonDays();
    return '<div class="fld"><span>「即將到期」提前提醒 —— 到期日還剩幾個<b>工作天</b>就標黃、進「需要注意的」</span>'
      + '<div class="step-row"><button type="button" class="step-btn" data-step="-1">−</button>'
      + '<input id="setSoon" type="number" min="1" max="30" value="' + cur + '" inputmode="numeric">'
      + '<span class="step-unit">個工作天</span>'
      + '<button type="button" class="step-btn" data-step="1">＋</button></div>'
      + '<div class="fld-hint">例:設 2 = 只在剩 2 個工作天內才提醒;設 8 = 提早一週半就開始盯。預設 5。</div>'
      + '<button class="btn primary" id="setGo" style="align-self:flex-start;margin-top:2px">儲存設定</button></div>'
      + lineQuotaRow() + exportRow();
  }
  // 匯出報表——產生後直接寄到按鍵的人的 Email。不動正式資料庫,所有人都能按。
  // 按下去不關面板,原地顯示「匯出中…」→「✅ 已匯出成功」,讓人看得到結果,不用只靠會自動消失的 toast。
  function exportBtn(type, label) {
    var st = expState[type];
    if (st === 'done') return '<div class="exp-ok" style="flex:1;font-size:13px;color:var(--done);display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid var(--done);border-radius:8px;padding:8px">✅ ' + esc(label) + ' 匯出成功</div>';
    return '<button class="btn ghost" data-exp="' + type + '" style="flex:1" ' + (st === 'loading' ? 'disabled' : '') + '>'
      + (st === 'loading' ? '匯出中…' : (st === 'error' ? '⚠ 失敗,點我重試' : esc(label))) + '</button>';
  }
  function exportRow() {
    var box = 'margin-top:12px;border-top:1px solid var(--line);padding-top:11px;display:flex;flex-direction:column;gap:8px';
    return '<div style="' + box + '">'
      + '<div style="font-size:12px;color:var(--ink-faint)">📤 匯出報表 —— 產生後直接寄到你的 Email</div>'
      + '<div style="display:flex;gap:8px">'
      + exportBtn('exportKanban', '交班站看板') + exportBtn('exportYearArchive', '交班站年度存檔')
      + '</div></div>';
  }
  // 匯出按鈕的動作——不走 go()(那個會關掉整個面板),原地更新面板讓人看到「匯出中…」到「✅ 成功」。
  function doExport(type, label) {
    if (expState[type] === 'loading') return;
    expState[type] = 'loading';
    meMenu();
    api.submit(type, {}).then(function (b) {
      board = b; expState[type] = 'done'; meMenu();
    }).catch(function (err) {
      expState[type] = 'error'; meMenu(); toast('⚠ ' + (err.message || err));
    });
  }
  // 本月 LINE 推播用量 —— 讀 board.lineQuota(伺服端每 30 分抓一次 LINE 官方 API)
  function lineQuotaRow() {
    var q = board.lineQuota;
    var box = 'margin-top:12px;border-top:1px solid var(--line);padding-top:11px;font-size:12px;color:var(--ink-faint);line-height:1.6';
    if (!q) return '<div style="' + box + '">📊 本月 LINE 推播用量　<b>暫時讀不到</b>　·　等一下再開看看</div>';
    if (q.type !== 'limited')
      return '<div style="' + box + '">📊 本月 LINE 推播　<b class="mono">' + q.used + '</b> 則　·　目前方案無上限</div>';
    var pct = q.limit ? Math.round(q.used / q.limit * 100) : 0;
    var col = pct >= 90 ? 'var(--crit)' : pct >= 70 ? 'var(--warn)' : 'var(--done)';
    return '<div style="' + box + '">📊 本月 LINE 推播　'
      + '<b class="mono" style="color:' + col + '">' + q.used + ' / ' + q.limit + '</b>　已用 ' + pct + '%'
      + '<br><span style="opacity:.85">回覆訊息不計 · 每月 1 號歸零 · 更新於 ' + esc(q.at || '') + '</span></div>';
  }
  // 本月 LINE 額度快滿/已滿時,今天第一次開 App 跳一次提醒——localStorage 記「今天跳過了」,不用每次 render 都跳。
  // 只在 board.lineQuota 讀得到(type==='limited')且用量 ≥90% 時跳;讀不到或方案無上限就不跳。
  function checkLineQuotaWarn() {
    var q = board.lineQuota;
    if (!q || q.type !== 'limited' || !q.limit) return;
    var pct = Math.round(q.used / q.limit * 100);
    if (pct < 90) return;
    try {
      if (localStorage.getItem('lqWarnedOn') === board.today) return;
      localStorage.setItem('lqWarnedOn', board.today);
    } catch (e) {}
    var full = pct >= 100;
    var msg = full
      ? '本月 LINE 推播額度已用完(' + q.used + ' / ' + q.limit + '),接下來認領、交接、完成這些動作的通知可能收不到,建議直接開 App 看最新狀態。'
      : '本月 LINE 推播額度快用完(' + q.used + ' / ' + q.limit + '、已用 ' + pct + '%),之後可能有些通知收不到,建議常回來開 App 看最新狀態。';
    openModal('<div class="lede">⚠ 額度提醒</div><h3>本月 LINE 推播' + (full ? '已用完' : '快用完') + '</h3>'
      + '<div class="fld-hint">' + esc(msg) + '</div>'
      + '<div class="sheet-acts"><button class="btn primary" data-close>知道了</button></div>');
  }
  function wireSettings() {
    var inp = document.getElementById('setSoon');
    if (!inp) return;
    modalRoot.querySelectorAll('[data-step]').forEach(function (b) {
      b.onclick = function () {
        inp.value = Math.max(1, Math.min(30, (parseInt(inp.value, 10) || 5) + (+b.dataset.step)));
      };
    });
    document.getElementById('setGo').onclick = function () {
      var n = Math.max(1, Math.min(30, parseInt(inp.value, 10) || 5));
      go('savePref', { soonDays: n }, '已更新 —— 即將到期提前 ' + n + ' 個工作天提醒');
    };
    modalRoot.querySelectorAll('[data-exp]').forEach(function (b) {
      b.onclick = function () { doExport(b.dataset.exp); };
    });
  }
  // 名字鈕面板:有通知 → 通知清單 + 全部已讀 + 分隔線 + 個人設定;沒通知 → 只有個人設定
  function meMenu() {
    var ns = board.notifs || [];
    var h = '<div class="me-sheet" id="meBd"><div class="me-sheet-in">';
    h += '<div class="me-sheet-hd"><b>' + (ns.length ? '通知 · ' + ns.length : '個人設定') + '</b>'
      + '<button class="done-sheet-x" type="button" data-doneclose aria-label="關閉">✕</button></div>';
    if (ns.length) {
      h += '<div class="notif-list">' + ns.map(function (n) {
        return '<button class="notif' + (n.link ? ' tap' : '') + '" data-nid="' + esc(n.id) + '" data-nlink="' + esc(n.link || '') + '">'
          + '<span class="notif-t">' + notifIco(n.kind) + ' ' + esc(n.text) + '</span>'
          + '<span class="notif-m">' + esc(n.who) + ' · ' + esc(ltRel(n.t)) + (n.link ? '<span class="notif-go">›</span>' : '') + '</span>'
          + '</button>';
      }).join('') + '</div>';
      h += '<button class="btn ghost" id="notifAll">全部標為已讀</button>';
      h += '<div class="me-hr"></div><div class="me-set-lb">個人設定</div>';
    }
    h += settingsBody();
    h += '</div></div>';
    modalRoot.innerHTML = h;
    document.getElementById('meBd').addEventListener('click', function (e) { if (e.target.id === 'meBd') closeModal(); });
    wireSettings();
    var all = document.getElementById('notifAll');
    if (all) all.onclick = function () { closeModal(); go('notifSeen', { ids: 'all' }, ''); };
  }
  function navFromNotif(link) {
    if (!link) return;
    var ix = link.indexOf(':'); if (ix < 0) return;
    var kind = link.slice(0, ix), val = link.slice(ix + 1);
    if (kind === 'task') { editModal(val); return; }
    stopSessPoll(); stopLtPoll();
    boardFocus = null; boardDay = null; calDay = null;
    scr = 'board'; openAudit = null; openLong = null; openLongList = false;
    openCourseList = false; openCourseKey = null; openCoursePersonId = null;
    [].forEach.call(document.querySelectorAll('.tab'), function (x) { x.setAttribute('aria-selected', String(x.dataset.scr === 'board')); });
    if (kind === 'audit') openAudit = val;
    else if (kind === 'lt') { openLongList = true; openLong = val; }
    render();
  }

  function openModal(html) {
    modalRoot.innerHTML = '<div class="backdrop" id="bd"><div class="sheet">' + html + '</div></div>';
    document.getElementById('bd').addEventListener('click', function (e) { if (e.target.id === 'bd') closeModal(); });
  }
  function closeModal() { modalRoot.innerHTML = ''; }
  function T(rowId) { return board.tasks.filter(function (t) { return t.rowId === rowId; })[0]; }
  function v(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function ck(id) { var e = document.getElementById(id); return e ? e.checked : false; }

  function doneModal(rowId) {
    var t = T(rowId);
    var chips = board.people.filter(function (p) { return p.id !== t.owner; }).map(function (p) {
      return '<button type="button" data-help="' + p.id + '" aria-pressed="false"><span class="av-sm">' + esc(p.short) + '</span>' + esc(p.name) + '</button>';
    }).join('');
    openModal('<div class="lede">完成</div><h3>' + esc(t.name) + '</h3>' +
      '<div class="fld"><span>有人一起或幫忙嗎? 選填</span><div class="hchips" id="helpChips">' + chips + '</div></div>' +
      '<div class="fld"><span>完成備註 選填</span><textarea id="dnNote"></textarea></div>' +
      '<div class="sheet-acts"><button class="btn primary" id="dnGo">確定完成</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    var picked = {};
    document.getElementById('helpChips').onclick = function (e) {
      var b = e.target.closest('[data-help]'); if (!b) return;
      var id = b.dataset.help; picked[id] = !picked[id]; b.setAttribute('aria-pressed', String(!!picked[id]));
    };
    document.getElementById('dnGo').onclick = function () {
      go('complete', { rowId: rowId, doneNote: v('dnNote'),
        helpers: Object.keys(picked).filter(function (k) { return picked[k]; }) }, '已完成');
    };
  }

  function handoffModal(rowId) {
    var t = T(rowId);
    var rows = '<div class="pick-self"><span class="av-sm">' + esc(pShort(ME())) + '</span>你自己(不含這件)' + loadBadge(ME(), t.due, rowId) + '</div>';
    board.people.forEach(function (p) {
      if (p.id === ME()) return;
      rows += '<button class="pick-row" data-to="' + p.id + '" aria-pressed="false"><span class="av-sm">' + esc(p.short) + '</span>' + esc(p.name) + loadBadge(p.id, t.due, rowId) + '</button>';
    });
    rows += '<button class="pick-row pool" data-to="__pool__" aria-pressed="false"><span class="av-sm">?</span>不指定 —— 完成本階段,下一棒待認領</button>';
    openModal('<div class="lede">交接 —— 推進到下一棒</div><h3>' + esc(t.name) + '</h3>' +
      '<div class="pick" id="hoPick">' + rows + '</div>' +
      '<div class="pick-note">數字 = 那個人到期日前後一週還沒做完的件數(不含這件)</div>' +
      '<div class="fld"><span>交接附註 選填</span><textarea id="hoNote"></textarea></div>' +
      '<div class="sheet-acts"><button class="btn primary" id="hoGo" disabled>送出交接</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    var to = null;
    document.getElementById('hoPick').onclick = function (e) {
      var b = e.target.closest('[data-to]'); if (!b) return;
      to = b.dataset.to;
      [].forEach.call(document.querySelectorAll('#hoPick [data-to]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.getElementById('hoGo').disabled = false;
    };
    document.getElementById('hoGo').onclick = function () { go('handoff', { rowId: rowId, to: to, note: v('hoNote') }, '已交接'); };
  }

  var RA_OUT = ['出差在外,處理不便', '需要本人未持有的權限', '休假中,不便處理', '手邊工作較滿,建議轉給其他同仁'];
  var RA_SELF = ['原負責人臨時有要務,由本人接續', '本人具備所需權限,因此接手執行', '時程較緊,先由本人接續推進', '僅餘收尾,由本人接續完成'];
  function reassignModal(rowId) {
    var t = T(rowId), mineTask = t.owner === ME();
    var rows = '';
    if (mineTask) rows += '<div class="pick-self"><span class="av-sm">' + esc(pShort(ME())) + '</span>你自己(不含這件)' + loadBadge(ME(), t.due, rowId) + '</div>';
    if (!mineTask) rows += '<button class="pick-row" data-to="' + ME() + '" aria-pressed="true"><span class="av-sm">' + esc(pShort(ME())) + '</span>' + esc(pName(ME())) + '(本人)—— 由我接手完成' + loadBadge(ME(), t.due, rowId) + '</button>';
    board.people.forEach(function (p) {
      if (p.id === ME()) return;
      rows += '<button class="pick-row" data-to="' + p.id + '" aria-pressed="false"><span class="av-sm">' + esc(p.short) + '</span>' + esc(p.name) + loadBadge(p.id, t.due, rowId) + '</button>';
    });
    rows += '<button class="pick-row pool" data-to="__pool__" aria-pressed="false"><span class="av-sm">?</span>不指定 —— 放回待認領池</button>';
    openModal('<div class="lede" id="raLede"></div><h3>' + esc(t.name) + '</h3>' +
      '<div class="pick" id="raPick">' + rows + '</div>' +
      '<div class="pick-note">數字 = 那個人到期日前後一週還沒做完的件數(不含這件)</div>' +
      '<div class="fld"><span id="raNoteLb"></span><div class="hchips" id="raQuick"></div>' +
      '<textarea id="raNote" placeholder="可點上方選項帶入,或自行填寫"></textarea></div>' +
      '<div class="sheet-fx" id="raFx"></div>' +
      '<div class="sheet-acts"><button class="btn primary" id="raGo"></button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    var to = mineTask ? null : ME();
    function refresh() {
      var self = to === ME();
      document.getElementById('raLede').textContent = self ? '接手 —— 由本人接續完成' : '改派 —— 由較合適的同仁承接';
      document.getElementById('raNoteLb').textContent = (self ? '接手事由' : '改派事由') + '(必填)';
      document.getElementById('raGo').textContent = self ? '確認接手' : '送出改派';
      document.getElementById('raFx').innerHTML = self
        ? '接手同樣<b>請填事由</b> —— 供日後查閱時了解更換原因。'
        : '改派<b>不推進階段</b> —— 同一列更換負責人、列ID 不變。事由會一併通知承接者。';
      document.getElementById('raQuick').innerHTML = (self ? RA_SELF : RA_OUT).map(function (s) {
        return '<button type="button" data-q="' + esc(s) + '">' + esc(s) + '</button>';
      }).join('');
    }
    refresh();
    document.getElementById('raPick').onclick = function (e) {
      var b = e.target.closest('[data-to]'); if (!b) return;
      to = b.dataset.to;
      [].forEach.call(document.querySelectorAll('#raPick [data-to]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      refresh();
    };
    document.getElementById('raQuick').onclick = function (e) {
      var b = e.target.closest('[data-q]'); if (!b) return;
      var ta = document.getElementById('raNote');
      ta.value = ta.value ? ta.value + ';' + b.dataset.q : b.dataset.q;
    };
    document.getElementById('raGo').onclick = function () {
      if (!to) { toast('請先選人'); return; }
      if (!v('raNote')) { toast('請填事由'); return; }
      go('reassign', { rowId: rowId, to: to, note: v('raNote') },
        to === ME() ? '已接手' : to === '__pool__' ? '已改派回待認領' : '已改派給 ' + pName(to));
    };
  }

  function waitModal(rowId) {
    var t = T(rowId);
    openModal('<div class="lede">等外部回覆</div><h3>' + esc(t.name) + '</h3>' +
      '<div class="fld"><span>在等誰(必填)</span><input id="wWho" placeholder="例:曉月分院資訊室"></div>' +
      '<div class="fld-row"><div class="fld"><span>對方應回覆日</span><input id="wReply" type="date"></div>' +
      '<div class="fld"><span>內部硬截止</span><input id="wHard" type="date"></div></div>' +
      '<div class="fld"><span>備註 選填</span><textarea id="wNote"></textarea></div>' +
      '<div class="sheet-fx">過了「應回覆日」→ 每天 09:10 點名 + 倒數硬截止;過了硬截止 → 轉紅。</div>' +
      '<div class="sheet-acts"><button class="btn primary" id="wGo">開始追</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    document.getElementById('wGo').onclick = function () {
      if (!v('wWho')) { toast('請填在等誰'); return; }
      go('startWait', { rowId: rowId, waitWho: v('wWho'), waitReplyBy: v('wReply'), waitHardBy: v('wHard'), waitNote: v('wNote') }, '開始追蹤');
    };
  }

  // ═══ 共用「負責人」小元件 ═══
  //   ownerPickInit(容器id, {mode:'pool'|'me'|<pid>|'team', team:[pid]}) → 之後 ownerPickVal(容器id) 拿 {assignSelf|owner|coOwners}
  var _opS = {};
  function ownerPickFromTask(t) {
    if (isTeam(t)) return { mode: 'team', team: coOf(t) };
    if (t.owner === ME()) return { mode: 'me' };
    if (t.owner) return { mode: t.owner };
    return { mode: 'pool' };
  }
  function ownerPickInit(id, init) {
    _opS[id] = { mode: (init && init.mode) || 'pool', team: (init && init.team ? init.team.slice() : []) };
    ownerPickDraw(id);
  }
  function ownerPickVal(id) {
    var s = _opS[id]; if (!s) return { owner: '' };
    if (s.mode === 'team') return { coOwners: s.team.slice() };
    if (s.mode === 'me') return { assignSelf: true };
    if (s.mode === 'pool') return { owner: '' };
    return { owner: s.mode };
  }
  function ownerPickDraw(id) {
    var s = _opS[id], el = document.getElementById(id); if (!el) return;
    var teamOn = s.mode === 'team';
    var r = '<button type="button" class="op-row' + (s.mode === 'pool' ? ' on' : '') + '" data-opt="pool"><span class="op-av">?</span>待認領池（先不指定）</button>';
    r += '<button type="button" class="op-row' + (s.mode === 'me' ? ' on' : '') + '" data-opt="me"><span class="op-av">' + esc(pShort(ME())) + '</span>我來負責</button>';
    board.people.forEach(function (p) {
      if (p.id === ME()) return;
      r += '<button type="button" class="op-row' + (s.mode === p.id ? ' on' : '') + '" data-opt="' + p.id + '"><span class="op-av">' + esc(p.short) + '</span>' + esc(p.name) + '</button>';
    });
    r += '<button type="button" class="op-row' + (teamOn ? ' on' : '') + '" data-opt="team"><span class="op-av">' + ICO_USERS + '</span>團隊共同執行</button>';
    if (teamOn) {
      r += '<div class="op-chips">' + board.people.map(function (p) {
        var on = s.team.indexOf(p.id) >= 0;
        return '<button type="button" class="op-chip' + (on ? ' on' : '') + '" data-chip="' + p.id + '">' + (on ? '☑' : '☐') + ' ' + esc(p.name) + '</button>';
      }).join('') + '</div>';
    }
    var out = teamOn
      ? (s.team.length >= 2 ? '團隊 —— ' + s.team.map(pName).join('、') + ' 一起扛，負責欄顯示「團隊」'
        : '⚠ 至少勾 2 人（只勾 1 人 = 那個人自己負責）')
      : s.mode === 'pool' ? '進待認領池 —— 誰有空誰認領'
      : s.mode === 'me' ? pName(ME()) + ' 負責'
      : pName(s.mode) + ' 負責';
    el.innerHTML = '<div class="op">' + r + '<div class="op-out">' + esc(out) + '</div></div>';
    el.querySelector('.op').onclick = function (e) {
      var o = e.target.closest('[data-opt]'), c = e.target.closest('[data-chip]');
      if (o) { s.mode = o.dataset.opt; ownerPickDraw(id); }
      else if (c) {
        var pi = s.team.indexOf(c.dataset.chip);
        pi >= 0 ? s.team.splice(pi, 1) : s.team.push(c.dataset.chip);
        s.mode = 'team'; ownerPickDraw(id);
      }
    };
  }

  // ═══ 找人一起認領(待認領 → 共同執行)。rowIds 可一筆或多筆(勾選批次)═══
  function teamClaimModal(rowId) { teamClaimSheet([rowId]); }
  function teamClaimSheet(rowIds) {
    rowIds = (rowIds || []).filter(function (r) {
      var x = T(r); return x && !x.owner && x.status === 'open' && !(x.coOwners && x.coOwners.length) && !x.longTrack;
    });
    if (!rowIds.length) { toast('沒有可一起認的項目'); return; }
    var picked = {};
    var chips = board.people.filter(function (p) { return p.id !== ME(); }).map(function (p) {
      return '<button type="button" data-tc="' + p.id + '" aria-pressed="false"><span class="av-sm">' + esc(p.short) + '</span>' + esc(p.name) + '</button>';
    }).join('');
    var many = rowIds.length > 1;
    var head = many ? '這 ' + rowIds.length + ' 件一起' : esc(T(rowIds[0]).name);
    openModal('<div class="lede">找人一起認領</div><h3>' + head + '</h3>' +
      (many ? '<div class="fld-hint">' + rowIds.map(function (r) { return '・' + esc(T(r).name); }).join('<br>') + '</div>' : '') +
      '<div class="fld"><span>找誰一起（你自己會自動算進去）</span><div class="hchips" id="tcChips">' + chips + '</div></div>' +
      '<div class="sheet-fx">共同執行 = 平起平坐一起扛。負責欄顯示「團隊」，名單內任何人都能按完成，早報放「👥 共同執行」區。</div>' +
      '<div class="sheet-acts"><button class="btn primary" id="tcGo">一起認領</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    document.getElementById('tcChips').onclick = function (e) {
      var b = e.target.closest('[data-tc]'); if (!b) return;
      var pid = b.dataset.tc; picked[pid] = !picked[pid]; b.setAttribute('aria-pressed', String(!!picked[pid]));
    };
    document.getElementById('tcGo').onclick = function () {
      var team = Object.keys(picked).filter(function (k) { return picked[k]; });
      if (!team.length) { toast('至少選一個人一起'); return; }
      go('claimTeam', { rowIds: rowIds, team: team }, many ? '已一起認領 ' + rowIds.length + ' 件' : '已一起認領');
    };
  }

  var TASK_KIND_OPTS = ['信件', '文件', '公文', '報帳', '表單', '其他行政'];
  function editModal(rowId) {
    var t = T(rowId);
    var lt = !!t.longTrack;
    var siteList = board.sites.slice();
    if (t.site && siteList.indexOf(t.site) < 0) siteList.unshift(t.site);
    var eSiteOpts = siteList.map(function (s) { return '<option' + (t.site === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
    var kindList = TASK_KIND_OPTS.slice();
    if (t.kind && kindList.indexOf(t.kind) < 0) kindList.unshift(t.kind);
    var eKindOpts = kindList.map(function (k) { return '<option' + (t.kind === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('');
    openModal('<div class="lede">編輯任務</div><h3>' + esc(t.name) + '</h3>' +
      '<div class="fld"><span>任務名</span><input id="eName" value="' + esc(t.name) + '"></div>' +
      '<div class="fld-row"><div class="fld"><span>站點</span><select id="eSite">' + eSiteOpts + '</select></div>' +
      '<div class="fld"><span>小節</span><input id="eGroup" value="' + esc(t.groupName || '') + '"></div></div>' +
      '<div class="fld"><span>類型</span><select id="eKind">' + eKindOpts + '</select></div>' +
      '<label class="chkline" style="font-size:13px;color:var(--ink-soft);align-items:flex-start;line-height:1.5">' +
        '<input type="checkbox" id="eLT"' + (lt ? ' checked' : '') + '> 📌 長期追蹤任務 —— 用「認工 + 我今天動過了」推進,不進到期日統計</label>' +
      '<div id="eLTbox"' + (lt ? '' : ' hidden') + '>' +
        '<div class="fld-row"><div class="fld"><span>檔期起 選填</span><input id="eLTFrom" type="date" value="' + esc(t.ltFrom || '') + '"></div>' +
        '<div class="fld"><span>檔期迄 選填</span><input id="eLTTo" type="date" value="' + esc(lt ? (t.due || '') : '') + '"></div></div>' +
        '<div class="fld"><span>常用類型 逗號分隔</span><input id="eLTTags" value="' + esc(t.ltTags || '') + '" placeholder="校對, 送印, 報帳"></div></div>' +
      '<div class="fld" id="eDueFld"' + (lt ? ' hidden' : '') + '><span>目標結束日</span><input id="eDue" type="date" value="' + esc(lt ? '' : (t.due || '')) + '"></div>' +
      '<div class="fld" id="eOwnerFld"' + (lt ? ' hidden' : '') + '><span>負責人</span><div id="eOwner"></div></div>' +
      '<div class="fld"><span>文件位置 選填 · OneDrive 資料夾網址</span><input id="eFolder" value="' + esc(t.folder || '') + '" placeholder="https://..."></div>' +
      '<div class="fld"><span>附註</span><textarea id="eNote">' + esc(t.note2 || '') + '</textarea></div>' +
      '<div class="sheet-acts"><button class="btn primary" id="eGo">儲存</button>' +
      '<button class="btn ghost" id="eDel">刪除這列</button></div>');
    ownerPickInit('eOwner', ownerPickFromTask(t));
    document.getElementById('eLT').onchange = function () {
      document.getElementById('eLTbox').hidden = !this.checked;
      document.getElementById('eDueFld').hidden = this.checked;
      document.getElementById('eOwnerFld').hidden = this.checked;
    };
    document.getElementById('eGo').onclick = function () {
      var on = ck('eLT');
      var p = { rowId: rowId, name: v('eName'), site: v('eSite'), groupName: v('eGroup'), kind: v('eKind'), folder: v('eFolder'), note2: v('eNote'), longTrack: on };
      if (!on) p.assign = ownerPickVal('eOwner');
      if (on) {
        p.ltFrom = v('eLTFrom');
        p.due = v('eLTTo');
        p.ltTags = (v('eLTTags') || '').split(/[,，、]/).map(function (x) { return x.trim(); }).filter(Boolean);
      } else {
        p.due = v('eDue');
      }
      go('editTask', p, '已儲存');
    };
    document.getElementById('eDel').onclick = function () {
      if (confirm('確定刪除「' + t.name + '」?')) go('deleteTask', { rowId: rowId }, '已刪除');
    };
  }

  function addTaskModal() {
    var siteOpts = board.sites.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    openModal('<div class="lede">新增任務</div><h3>臨時想到的一件事</h3>' +
      '<div class="fld"><span>任務名</span><input id="atName"></div>' +
      '<div class="fld-row"><div class="fld"><span>站點</span><select id="atSite">' + siteOpts + '</select></div>' +
      '<div class="fld"><span>小節</span><input id="atGroup"></div></div>' +
      '<div class="fld"><span>類型</span><select id="atKind"><option>信件</option><option>文件</option><option>公文</option><option>報帳</option><option>表單</option><option>其他行政</option></select></div>' +
      '<label class="chkline" style="font-size:13px;color:var(--ink-soft)"><input type="checkbox" id="atLT"> 📌 這是長期追蹤任務</label>' +
      '<div id="atLTbox" hidden>' +
        '<div class="fld-row"><div class="fld"><span>檔期起 選填</span><input id="atLTFrom" type="date"></div>' +
        '<div class="fld"><span>檔期迄 選填</span><input id="atLTTo" type="date"></div></div>' +
        '<div class="fld"><span>常用類型 逗號分隔</span><input id="atLTTags" placeholder="校對, 送印, 報帳"></div></div>' +
      '<div class="fld" id="atDueFld"><span>目標結束日</span><input id="atDue" type="date"></div>' +
      '<div class="fld"><span>文件位置 選填 · OneDrive 資料夾網址</span><input id="atFolder" placeholder="https://..."></div>' +
      '<div class="fld"><span>附註 選填</span><textarea id="atNote"></textarea></div>' +
      '<div class="fld" id="atOwnerFld"><span>負責人</span><div id="atOwner"></div></div>' +
      '<div class="sheet-acts"><button class="btn primary" id="atGo">建立</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    ownerPickInit('atOwner', { mode: 'pool' });
    document.getElementById('atLT').onchange = function () {
      var on = this.checked;
      document.getElementById('atLTbox').hidden = !on;
      document.getElementById('atDueFld').hidden = on;
      document.getElementById('atOwnerFld').hidden = on;
    };
    document.getElementById('atGo').onclick = function () {
      if (!v('atName')) { toast('請填任務名'); return; }
      var lt = ck('atLT');
      var p = { name: v('atName'), site: v('atSite'), groupName: v('atGroup'), kind: v('atKind'), folder: v('atFolder'), note2: v('atNote'), longTrack: lt };
      if (lt) {
        p.ltFrom = v('atLTFrom'); p.due = v('atLTTo');
        p.ltTags = (v('atLTTags') || '').split(/[,，、]/).map(function (x) { return x.trim(); }).filter(Boolean);
      } else {
        p.due = v('atDue');
        var oa = ownerPickVal('atOwner');
        p.assignSelf = !!oa.assignSelf; p.owner = oa.owner || ''; p.coOwners = oa.coOwners || null;
      }
      go('addTask', p, '已建立');
    };
  }

  // ═══ App 內編輯範本 ═══
  var TPL_KINDS = ['公文', '信件', '文件', '報帳', '表單', '其他行政', 'OneDrive'];
  var tplCur = null, tplWork = null, tplOpenSec = {}, tplOpenItem = {};

  function tplMeta(k) { return (board.templateMeta || []).filter(function (m) { return m.key === k; })[0]; }
  function tplAnchors(k) { var m = tplMeta(k); return (m && m.anchors) || [{ code: 'F', label: '主錨點' }]; }
  function tplOffLabel(k, it) {
    var an = (tplAnchors(k).filter(function (a) { return a.code === it.a; })[0] || {}).label || it.a;
    var s = it.o < 0 ? '−' : (it.o > 0 ? '+' : '±');
    return an + ' ' + s + Math.abs(it.o) + ' 天';
  }
  function tplSections(k) {
    var order = [], seen = {};
    tplWork[k].forEach(function (it) { if (!seen[it.g]) { seen[it.g] = 1; order.push(it.g); } });
    return order.map(function (g) {
      return { g: g, items: tplWork[k].map(function (it, i) { return { it: it, i: i }; }).filter(function (x) { return x.it.g === g; }) };
    });
  }

  // 範本項目是 lazy-load 的(不在 board 裡)—— 第一次開編輯範本才去要,要到了就快取在 board.templateItems,
  // 同一次 session 之後再開不用重要。
  function openTplEdit() {
    if (board.templateItems) { tplEditModal(); return; }
    if (busy) return;
    busy = true; render();
    api.getTemplateItems().then(function (res) {
      board.templateItems = (res && res.items) || [];
      busy = false; render();
      tplEditModal();
    }).catch(function (err) { busy = false; render(); toast('⚠ 範本載入失敗:' + (err.message || err)); });
  }
  function tplEditModal() {
    tplWork = {};
    (board.templateMeta || []).forEach(function (m) {
      tplWork[m.key] = (board.templateItems || []).filter(function (r) { return r.tplKey === m.key; })
        .sort(function (a, b) { return a.seq - b.seq; })
        .map(function (r) { return { n: r.name, k: r.kind || '其他行政', g: r.group || '未分類', a: r.anchor || 'F', o: r.off || 0, self: !!r.presetOwner, note: r.flow || '' }; });
    });
    tplCur = (board.templateMeta[0] || {}).key;
    tplOpenSec = {}; tplOpenItem = {};
    openModal('<div class="lede">編輯範本</div>'
      + '<div class="tpl-warn">改範本<b>不影響已產生的任務</b> —— 現有場次照舊,只套用到之後再產生的。</div>'
      + '<div class="tpl-pick" id="tplPick"></div>'
      + '<div class="tpl-metatools"><button type="button" id="tplNewMeta">＋ 新增範本</button>'
      + '<button type="button" id="tplEditMeta">⚙ 這個範本的設定</button></div>'
      + '<div class="tpl-tools"><button type="button" id="tplExpand">全部展開</button><button type="button" id="tplCollapse">全部收起</button></div>'
      + '<div id="tplBody"></div>'
      + '<div class="tpl-addsec"><button type="button" id="tplAddSec">＋ 加一個小節</button></div>'
      + '<div class="sheet-acts"><button class="btn primary" id="tplSave">儲存範本</button>'
      + '<button class="btn ghost" data-close>關閉</button></div>');
    document.getElementById('tplPick').onclick = function (e) {
      var b = e.target.closest('[data-tk]'); if (!b) return;
      tplCur = b.dataset.tk; tplRender();
    };
    document.getElementById('tplNewMeta').onclick = function () { tplMetaForm(null); };
    document.getElementById('tplEditMeta').onclick = function () { tplMetaForm(tplCur); };
    document.getElementById('tplExpand').onclick = function () { tplSections(tplCur).forEach(function (s) { tplOpenSec[tplCur + '|' + s.g] = true; }); tplRender(); };
    document.getElementById('tplCollapse').onclick = function () { Object.keys(tplOpenSec).forEach(function (kk) { if (kk.indexOf(tplCur + '|') === 0) tplOpenSec[kk] = false; }); tplRender(); };
    document.getElementById('tplAddSec').onclick = function () {
      var name = '新小節 ' + (tplSections(tplCur).length + 1);
      tplWork[tplCur].push({ n: '', k: '其他行政', g: name, a: tplAnchors(tplCur)[0].code, o: 0, self: false, note: '' });
      tplOpenSec[tplCur + '|' + name] = true; tplRender();
    };
    document.getElementById('tplSave').onclick = function () {
      var items = tplWork[tplCur].filter(function (x) { return x.n.trim(); }).map(function (x) {
        return { name: x.n.trim(), kind: x.k, group: x.g.trim() || '未分類', anchor: x.a, off: x.o, presetOwner: x.self, flow: x.note };
      });
      if (!items.length) { toast('範本至少要留一項'); return; }
      go('saveTemplate', { tplKey: tplCur, items: items }, '已儲存 —— ' + (tplMeta(tplCur) || {}).name + ' 範本');
    };
    tplRender();
  }

  // 範本「設定」(名稱/錨點規則/人數/站點,不是內容)—— board.templates 才有全部欄位,
  // board.templateMeta 只給挑選器用的簡化版(key/name/anchors)。
  function tplFullMeta(k) { return (board.templates || []).filter(function (m) { return m.key === k; })[0] || null; }
  var TPL_BUILTIN = { audit: 1, guide: 1, annual: 1 };
  // 一個欄位:標籤 + 輸入框 + 選填的說明(說明預設收合,標籤旁有「﹖」可以單獨展開)
  function tmFld(label, inputHtml, help) {
    return '<div class="fld"><span>' + label + (help ? ' <button type="button" class="tm-q" aria-label="說明">' + ICO_HELP + '</button>' : '') + '</span>'
      + inputHtml + (help ? '<div class="sheet-fx tm-help" hidden>' + help + '</div>' : '') + '</div>';
  }
  function tplMetaForm(key) {
    var m = key ? tplFullMeta(key) : null;
    var isNew = !m;
    var span = (m && m.span) || [-60, 60];
    openModal('<div class="lede">' + (isNew ? '新增範本' : '範本設定 · ' + esc(m.name)) + '</div>'
      + '<div class="tpl-warn">📖 <b>範本是什麼?</b>一套會重複用的任務清單,套用時系統自動產生一整批任務。'
      + '每個範本都要有一個「基準日」(下面稱<b>錨點</b>)—— 套範本時你填一個實際日期(例如某天的實地稽核日),'
      + '其他每項任務的日期都是用「基準日 ± 幾天」自動算出來的,不用逐項手動排。'
      + (isNew ? '建好之後回到上一頁,用「＋ 加一個小節」開始填內容(哪些任務、間隔幾天)。' : '') + '</div>'
      + '<button type="button" class="btn ghost" id="tmHelpToggle" style="margin-bottom:2px">💡 全部展開說明</button>'
      + tmFld('範本名稱', '<input id="tmName" value="' + (m ? esc(m.name) : '') + '" placeholder="例如：委員異動處理">')
      + (isNew
          ? tmFld('範本代碼 選填', '<input id="tmKey" placeholder="留空由系統自動產生">',
              '系統內部用的英文識別碼,你和同事都看不到、平常用不到。不知道要填什麼就留空,系統會自動產生一個;真的要自己取的話只能英文開頭的英數字,建立後不能改。')
          : '<input id="tmKey" type="hidden" value="' + esc(key) + '">')
      + tmFld('業務類別標籤 選填', '<input id="tmBiz" value="' + (m ? esc(m.bizType || '') : '') + '" placeholder="留空就用範本名稱">',
          '用來幫任務分類/篩選的標籤,例如「醫院稽核」「計畫相關」。')
      + tmFld('主要的基準日叫什麼?', '<input id="tmAncLb" value="' + (m ? esc(m.anchorLabel || '') : '') + '" placeholder="例如 實地稽核日">',
          '套範本時你會先填一個實際日期(比如某天的稽核日),其他任務的日期都靠這天往前或往後推算出來。')
      + tmFld('這天通常固定星期幾? 選填', '<input id="tmAncWd" value="' + (m ? esc(m.anchorWeekday || '') : '') + '" placeholder="例如 三(週三)" maxlength="1">',
          '如果有固定慣例(例如稽核都排週三),填了排時程時系統會提醒你;沒有固定慣例就留空。')
      + '<label class="chkline"><input type="checkbox" id="tmHasSecond"' + (m && m.hasSecond ? ' checked' : '') + '> 除了主要基準日,這個範本還需要另外抓一個日期嗎?'
      + '(例如稽核範本除了「實地稽核日」,還會另外抓「技術檢測日」;用不到就不用勾)</label>'
      + '<div id="tmSecondFld">'
      + tmFld('第二個基準日叫什麼?', '<input id="tmSecLb" value="' + (m ? esc(m.secondLabel || '') : '') + '" placeholder="例如 技術檢測日">')
      + tmFld('代號(給系統內部用,一個英文字母就好)', '<input id="tmSecCode" value="' + (m ? esc(m.secondCode || 'T') : 'T') + '" maxlength="1">',
          '跟主要基準日的代號 F 不要重複,習慣用 T 或 S 之類好記的字母。')
      + tmFld('這天通常固定星期幾? 選填', '<input id="tmSecWd" value="' + (m ? esc(m.secondWeekday || '') : '') + '" placeholder="例如 五(週五)" maxlength="1">')
      + tmFld('大概落在主要基準日的前後幾天?', '<input class="num" id="tmSecOff" value="' + (m ? m.secondOff : -18) + '" inputmode="numeric">',
          '填負數是提早、正數是延後,例如 −18 代表提早 18 天。這只是系統自動建議的值,套範本當下還是可以手動改成實際確定的日期。')
      + '</div>'
      + '<label class="chkline"><input type="checkbox" id="tmHeadcount"' + (m && m.needsHeadcount ? ' checked' : '') + '> 套這個範本時,要不要先填「這場有幾位委員/工作人員/觀察員」?'
      + '(如果範本裡有任務要「依人數算份數」,例如要印幾份文件,就勾這個)</label>'
      + tmFld('這個範本固定用在同一個地方嗎? 選填', '<input id="tmSite" value="' + (m ? esc(m.fixedSite || '') : '') + '" placeholder="例如 中心(不是某家醫院就填這個)">',
          '填了,套範本時就不用每次選站點;如果每次用在不同醫院/單位,留空就好,套範本時再選。')
      + '<div class="fld-hint" style="margin-bottom:-3px">任務大概分布在基準日前後幾天?'
      + ' <button type="button" class="tm-q" aria-label="說明" data-help="tmSpanHelp">' + ICO_HELP + '</button></div>'
      + '<div class="fld-row"><div class="fld"><span>開始(基準日前幾天)</span><input class="num" id="tmSpanF" value="' + span[0] + '" inputmode="numeric"></div>'
      + '<div class="fld"><span>結束(基準日後幾天)</span><input class="num" id="tmSpanT" value="' + span[1] + '" inputmode="numeric"></div></div>'
      + '<div class="sheet-fx tm-help" id="tmSpanHelp" hidden>只是給總覽/日曆抓顯示範圍用的,不用算得很精準,抓個大概(例如前 70 天到後 30 天)就好。</div>'
      + '<div class="sheet-acts"><button class="btn primary" id="tmSave">' + (isNew ? '建立範本' : '儲存設定') + '</button>'
      + (!isNew && !TPL_BUILTIN[key] ? '<button class="btn ghost" id="tmDel">刪除這個範本</button>' : '')
      + '<button class="btn ghost" data-close>取消</button></div>');
    function syncSecond() { document.getElementById('tmSecondFld').hidden = !ck('tmHasSecond'); }
    document.getElementById('tmHasSecond').onchange = syncSecond;
    syncSecond();
    document.getElementById('tmHelpToggle').onclick = function () {
      var open = this.dataset.open !== '1';
      this.dataset.open = open ? '1' : '';
      this.textContent = open ? '收起全部說明' : '💡 全部展開說明';
      [].forEach.call(document.querySelectorAll('#modalRoot .tm-help'), function (e) { e.hidden = !open; });
    };
    document.getElementById('tmSave').onclick = function () {
      var payload = {
        key: isNew ? v('tmKey') : key, isNew: isNew,
        name: v('tmName'), bizType: v('tmBiz'),
        anchorLabel: v('tmAncLb'), anchorWeekday: v('tmAncWd'),
        hasSecond: ck('tmHasSecond'), secondLabel: v('tmSecLb'), secondCode: v('tmSecCode') || 'T',
        secondWeekday: v('tmSecWd'), secondOff: v('tmSecOff'),
        needsHeadcount: ck('tmHeadcount'), fixedSite: v('tmSite'),
        spanFrom: v('tmSpanF'), spanTo: v('tmSpanT')
      };
      if (!payload.name.trim()) { toast('請填範本名稱'); return; }
      if (isNew && payload.key && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(payload.key)) { toast('範本代碼只能英文字母開頭的英數字,或乾脆留空給系統自動產生'); return; }
      if (payload.hasSecond && !payload.secondLabel.trim()) { toast('有第二錨點就要填它叫什麼'); return; }
      tplMetaSubmit(payload, isNew);
    };
    if (document.getElementById('tmDel')) document.getElementById('tmDel').onclick = function () {
      var b = document.getElementById('tmDel');
      if (b.dataset.armed) { tplMetaDelete(key); return; }
      b.dataset.armed = '1'; b.textContent = '再按一次 → 確定刪除';
      setTimeout(function () { if (b) { b.dataset.armed = ''; b.textContent = '刪除這個範本'; } }, 4000);
    };
  }
  function tplMetaSubmit(payload, isNew) {
    if (busy) return;
    busy = true; render();
    api.submit('saveTemplateMeta', payload).then(function (b) {
      board = b; busy = false; sel = {};
      toast(isNew ? '已新增範本「' + payload.name + '」' : '已更新範本設定');
      tplCur = payload.key;
      tplEditModal();
    }).catch(function (err) { busy = false; render(); toast('⚠ ' + (err.message || err)); });
  }
  function tplMetaDelete(key) {
    if (busy) return;
    busy = true; render();
    api.submit('deleteTemplateMeta', { key: key }).then(function (b) {
      board = b; busy = false; sel = {};
      toast('已刪除範本');
      tplCur = (board.templateMeta[0] || {}).key;
      tplEditModal();
    }).catch(function (err) { busy = false; render(); toast('⚠ ' + (err.message || err)); });
  }

  function tplRender() {
    document.getElementById('tplPick').innerHTML = (board.templateMeta || []).map(function (m) {
      return '<button type="button" data-tk="' + m.key + '" aria-selected="' + (m.key === tplCur) + '">' + esc(m.name)
        + ' <span class="mono">' + tplWork[m.key].length + '</span></button>';
    }).join('');
    var secs = tplSections(tplCur), body = document.getElementById('tplBody');
    if (!secs.length) { body.innerHTML = '<div class="sect-empty" style="padding:14px 2px">這個範本還沒有項目 —— 用下面「＋ 加一個小節」開始</div>'; return; }
    body.innerHTML = secs.map(function (s, si) {
      var isOpen = !!tplOpenSec[tplCur + '|' + s.g];
      var h = '<div class="tpl-sec"><div class="tpl-sec-hd" data-sec="' + esc(s.g) + '" aria-expanded="' + isOpen + '">'
        + '<span class="cv">▶</span><span class="sname">' + esc(s.g) + '</span>'
        + '<span class="scnt">' + s.items.length + ' 項</span>'
        + '<span class="tpl-mv"><button type="button" class="tmv" data-secmv="-1" data-sg="' + esc(s.g) + '"' + (si === 0 ? ' disabled' : '') + '>↑</button>'
        + '<button type="button" class="tmv" data-secmv="1" data-sg="' + esc(s.g) + '"' + (si === secs.length - 1 ? ' disabled' : '') + '>↓</button></span></div>';
      if (isOpen) {
        h += '<div class="tpl-sec-body">' + s.items.map(function (x, xi) { return tplItemHtml(x.it, x.i, xi, s.items.length); }).join('')
          + '<div class="tpl-addit"><button type="button" data-addit="' + s.items[s.items.length - 1].i + '" data-addg="' + esc(s.g) + '">＋ 在「' + esc(s.g) + '」加一項</button></div></div>';
      }
      return h + '</div>';
    }).join('');
    tplWireBody();
  }

  function tplItemHtml(it, gi, xi, cnt) {
    var open = !!tplOpenItem[tplCur + '|' + gi];
    var ancOpts = tplAnchors(tplCur).map(function (a) { return '<option value="' + a.code + '"' + (a.code === it.a ? ' selected' : '') + '>' + esc(a.code + ' · ' + a.label) + '</option>'; }).join('');
    var kindOpts = TPL_KINDS.map(function (kk) { return '<option' + (kk === it.k ? ' selected' : '') + '>' + kk + '</option>'; }).join('');
    var h = '<div class="tpl-it' + (open ? ' open' : '') + '" data-gi="' + gi + '">'
      + '<div class="tpl-it-row"><span class="it-cv">▶</span>'
      + '<input class="tpl-nm" value="' + esc(it.n) + '" data-f="n" placeholder="任務名">'
      + '<button type="button" class="tpl-gear" data-toggle aria-label="編輯欄位">' + ICO_GEAR + '</button>'
      + '<span class="tpl-it-btns">'
      + '<button type="button" class="tib" data-mv="-1"' + (xi === 0 ? ' disabled' : '') + '>↑</button>'
      + '<button type="button" class="tib" data-mv="1"' + (xi === cnt - 1 ? ' disabled' : '') + '>↓</button>'
      + '<button type="button" class="tib del" data-del>✕</button></span></div>'
      + '<div class="tpl-sum"><span class="st kind">' + esc(it.k) + '</span>'
      + '<span class="st anc">' + esc(tplOffLabel(tplCur, it)) + '</span>'
      + '<span class="st self' + (it.self ? ' mine' : '') + '">' + (it.self ? '預設自己負責' : '待認領') + '</span></div>'
      + (it.note ? '<div class="tpl-note">📝 ' + esc(it.note) + '</div>' : '')
      + '<div class="tpl-fields">'
      + '<div class="tpl-ff2"><label>類型<select data-f="k">' + kindOpts + '</select></label>'
      + '<label>負責<select data-f="self"><option value="0"' + (!it.self ? ' selected' : '') + '>待認領</option><option value="1"' + (it.self ? ' selected' : '') + '>預設自己</option></select></label></div>'
      + '<label class="tpl-ff">小節<input data-f="g" value="' + esc(it.g) + '"></label>'
      + '<label class="tpl-ff">錨點<select data-f="a">' + ancOpts + '</select></label>'
      + '<label class="tpl-ff">天數<input class="num" data-f="o" value="' + it.o + '" inputmode="numeric"><span class="tpl-calc" data-calc>= ' + esc(tplOffLabel(tplCur, it)) + '</span></label>'
      + '<textarea class="tpl-noteedit" rows="1" data-f="note" placeholder="附註 / 流程說明 選填">' + esc(it.note) + '</textarea>'
      + '</div></div>';
    return h;
  }

  function tplWireBody() {
    var body = document.getElementById('tplBody');
    body.querySelectorAll('.tpl-sec-hd').forEach(function (hd) {
      hd.onclick = function (e) {
        if (e.target.closest('[data-secmv]')) return;
        var kk = tplCur + '|' + hd.dataset.sec; tplOpenSec[kk] = !tplOpenSec[kk]; tplRender();
      };
    });
    body.querySelectorAll('[data-secmv]').forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); tplMoveSection(b.dataset.sg, +b.dataset.secmv); };
    });
    body.querySelectorAll('.tpl-it').forEach(function (el) {
      var gi = +el.dataset.gi;
      el.querySelector('[data-toggle]').onclick = function () { tplOpenItem[tplCur + '|' + gi] = !tplOpenItem[tplCur + '|' + gi]; tplRender(); };
      el.querySelectorAll('[data-f]').forEach(function (inp) {
        inp.oninput = inp.onchange = function () {
          var f = inp.dataset.f, val = inp.value;
          if (f === 'o') val = parseInt(val, 10) || 0;
          if (f === 'self') val = (val === '1');
          tplWork[tplCur][gi][f] = val;
          if (f === 'a' || f === 'o') { var c = el.querySelector('[data-calc]'); if (c) c.textContent = '= ' + tplOffLabel(tplCur, tplWork[tplCur][gi]); }
        };
      });
      var up = el.querySelector('[data-mv="-1"]'), dn = el.querySelector('[data-mv="1"]');
      if (up) up.onclick = function () { tplMoveItem(gi, -1); };
      if (dn) dn.onclick = function () { tplMoveItem(gi, 1); };
      el.querySelector('[data-del]').onclick = function () {
        var b = el.querySelector('[data-del]');
        if (!el._armed) { el._armed = true; b.textContent = '確定'; setTimeout(function () { if (el) { el._armed = false; var x = el.querySelector('[data-del]'); if (x) x.textContent = '✕'; } }, 2500); return; }
        tplWork[tplCur].splice(gi, 1); tplRender();
      };
    });
    body.querySelectorAll('[data-addit]').forEach(function (b) {
      b.onclick = function () {
        var at = +b.dataset.addit + 1;
        tplWork[tplCur].splice(at, 0, { n: '', k: '其他行政', g: b.dataset.addg, a: tplAnchors(tplCur)[0].code, o: 0, self: false, note: '' });
        tplOpenItem[tplCur + '|' + at] = true; tplRender();
        setTimeout(function () { var e2 = document.querySelector('#tplBody .tpl-it[data-gi="' + at + '"] .tpl-nm'); if (e2) e2.focus(); }, 30);
      };
    });
  }
  function tplMoveItem(gi, dir) {
    var a = tplWork[tplCur], me2 = a[gi], j = gi + dir;
    while (j >= 0 && j < a.length && a[j].g !== me2.g) j += dir;
    if (j < 0 || j >= a.length || a[j].g !== me2.g) return;
    a[gi] = a[j]; a[j] = me2;
    var k1 = tplCur + '|' + gi, k2 = tplCur + '|' + j, t = tplOpenItem[k1]; tplOpenItem[k1] = tplOpenItem[k2]; tplOpenItem[k2] = t;
    tplRender();
  }
  function tplMoveSection(g, dir) {
    var secs = tplSections(tplCur);
    var idx = -1; secs.forEach(function (s, i) { if (s.g === g) idx = i; });
    var jdx = idx + dir; if (jdx < 0 || jdx >= secs.length) return;
    var blockA = secs[idx].items.map(function (x) { return x.it; });
    var blockB = secs[jdx].items.map(function (x) { return x.it; });
    var lo = Math.min(secs[idx].items[0].i, secs[jdx].items[0].i);
    var hi = Math.max(secs[idx].items[secs[idx].items.length - 1].i, secs[jdx].items[secs[jdx].items.length - 1].i);
    var nb = (dir === 1) ? blockB.concat(blockA) : blockA.concat(blockB);
    var arr = tplWork[tplCur];
    tplWork[tplCur] = arr.slice(0, lo).concat(nb, arr.slice(hi + 1));
    tplOpenItem = {}; tplRender();
  }

  function batchTaskModal() {
    var siteOpts = board.sites.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    var ppl = board.people.filter(function (p) { return !board.me || p.id !== board.me.id; })
      .map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
    var pend = [];
    openModal('<div class="lede">批次新增任務</div><h3>一筆一筆快速加 · 最後一次送出</h3>'
      + '<div class="batch-basket" id="bkBasket"></div>'
      + '<div class="fld"><span>任務名</span><input id="bkName" placeholder="例:整理委員回覆意見"></div>'
      + '<div class="fld-row"><div class="fld"><span>站點</span><select id="bkSite">' + siteOpts + '</select></div>'
      + '<div class="fld"><span>小節 選填</span><input id="bkGroup"></div></div>'
      + '<div class="fld"><span>類型</span><select id="bkKind"><option>信件</option><option>文件</option><option>公文</option><option>報帳</option><option>表單</option><option>其他行政</option></select></div>'
      + '<div class="fld-row"><div class="fld"><span>目標結束日 選填</span><input id="bkDue" type="date"></div>'
      + '<div class="fld"><span>負責</span><select id="bkOwner"><option value="">待認領</option><option value="__me__">我來負責</option>' + ppl + '</select></div></div>'
      + '<div class="fld"><span>文件位置 選填 · OneDrive 資料夾網址</span><input id="bkFolder" placeholder="https://..."></div>'
      + '<div class="fld"><span>附註 選填</span><textarea id="bkNote" rows="2"></textarea></div>'
      + '<div class="fld-hint">站點 / 小節 / 類型 / 到期 / 負責 加下一筆時會留著;任務名、文件位置、附註每筆分開填。整批只發一則通知。</div>'
      + '<button class="btn" id="bkAdd" style="width:100%">＋ 再加一筆</button>'
      + '<div class="sheet-acts"><button class="btn primary" id="bkDone" disabled>完成</button>'
      + '<button class="btn ghost" data-close>取消</button></div>');
    function cur() { return { name: v('bkName'), site: v('bkSite'), group: v('bkGroup'), kind: v('bkKind'), due: v('bkDue'), owner: v('bkOwner'), folder: v('bkFolder'), note2: v('bkNote') }; }
    function draw() {
      var bk = document.getElementById('bkBasket');
      if (!pend.length) bk.innerHTML = '<span class="bk-empty">還沒加任何一筆 —— 填好下面按「＋ 再加一筆」</span>';
      else bk.innerHTML = '<span class="bk-t">這批 ' + pend.length + ' 筆</span>' + pend.map(function (r, i) {
        return '<span class="bk-chip"><span class="bk-n">' + esc(r.name) + '</span><span class="bk-m">' + esc(r.site) + '·' + esc(r.kind) + '</span><button data-bkdel="' + i + '" aria-label="移除">✕</button></span>';
      }).join('');
      var n = pend.length + (v('bkName') ? 1 : 0);
      var d = document.getElementById('bkDone');
      d.textContent = n ? '完成 · 建立 ' + n + ' 筆' : '完成';
      d.disabled = !n;
    }
    document.getElementById('bkName').oninput = draw;
    document.getElementById('bkBasket').onclick = function (e) {
      var x = e.target.closest('[data-bkdel]'); if (x) { pend.splice(+x.dataset.bkdel, 1); draw(); }
    };
    document.getElementById('bkAdd').onclick = function () {
      var c = cur();
      if (!c.name) { toast('請填任務名'); document.getElementById('bkName').focus(); return; }
      pend.push(c);
      document.getElementById('bkFolder').value = ''; document.getElementById('bkNote').value = '';
      var ni = document.getElementById('bkName'); ni.value = ''; ni.focus();
      draw();
    };
    document.getElementById('bkDone').onclick = function () {
      var all = pend.slice();
      var c = cur(); if (c.name) all.push(c);
      if (!all.length) return;
      var rows = all.map(function (r) {
        var o = { name: r.name, site: r.site, groupName: r.group, kind: r.kind, due: r.due, folder: r.folder, note2: r.note2 };
        if (r.owner === '__me__') o.assignSelf = true;
        else if (r.owner) o.owner = r.owner;
        return o;
      });
      go('addTasksBatch', { rows: rows }, '已建立 ' + rows.length + ' 筆');
    };
    draw();
  }

  function auditModal() {
    var metaOpts = board.templates.map(function (m) { return '<option value="' + m.key + '">' + esc(m.name) + '</option>'; }).join('');
    var siteOpts = board.sites.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    var ownerOpts = '<option value="">不指定</option>' + board.people.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
    openModal('<div class="lede">新增場次 · 套範本</div><h3>先建立,日期可之後再排</h3>' +
      '<div class="fld"><span>範本</span><select id="auTpl">' + metaOpts + '</select></div>' +
      '<div class="fld" id="auSiteFld"><span>站點</span><input id="auSite" list="auSites" placeholder="醫院 / 單位名稱(可打字或選)"><datalist id="auSites">' + siteOpts + '</datalist></div>' +
      '<div class="fld"><span>公文類預設負責人</span><select id="auOwner">' + ownerOpts + '</select></div>' +
      '<div class="fld-row"><div class="fld"><span id="auFLb">主錨點日</span><input id="auF" type="date"></div>' +
      '<div class="fld" id="auTFld"><span id="auTLb">次錨點日</span><input id="auT" type="date"></div></div>' +
      '<div class="sheet-fx" id="auHint"></div>' +
      '<div class="sheet-fx conflict" id="auConflict"></div>' +
      '<div class="sheet-acts"><button class="btn primary" id="auGo">建立場次</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    function m() { return board.templates.filter(function (x) { return x.key === v('auTpl'); })[0]; }
    function sync() {
      var mm = m(), F = v('auF');
      document.getElementById('auSiteFld').hidden = !!mm.fixedSite;
      document.getElementById('auTFld').hidden = !mm.hasSecond;
      document.getElementById('auFLb').textContent = mm.anchorLabel + (mm.anchorWeekday ? '(原則週' + mm.anchorWeekday + ')' : '');
      if (mm.hasSecond) document.getElementById('auTLb').textContent = mm.secondLabel + '(留白用建議)';
      var hint = mm.fixedSite ? '站點固定「' + mm.fixedSite + '」。' : '';
      hint += F ? (mm.anchorLabel + ' ' + F + (mm.hasSecond ? ' · 建議' + mm.secondLabel + ' ' + suggestSecond(F, mm) : ''))
                : '不填日期也可以先建立,之後在總覽點進場次按「排入時程」。';
      document.getElementById('auHint').textContent = hint;
      document.getElementById('auConflict').textContent =
        [conflictLine(F), mm.hasSecond ? conflictLine(v('auT')) : ''].filter(Boolean).join('\n');
    }
    document.getElementById('auTpl').onchange = sync;
    document.getElementById('auF').onchange = sync;
    document.getElementById('auT').onchange = sync;
    sync();
    document.getElementById('auGo').onclick = function () {
      var mm = m();
      if (!mm.fixedSite && !v('auSite')) { toast('請選站點'); return; }
      go('newAudit', { tplKey: mm.key, site: v('auSite'), presetOwner: v('auOwner'), F: v('auF'), T: v('auT') }, '已建立場次');
    };
  }

  function scheduleModal(auditId) {
    var s = auditStat(auditId);
    var rows = board.tasks.filter(function (t) { return t.auditId === auditId; });
    var key = rows[0] && rows[0].tplKey;
    var m = board.templates.filter(function (x) { return x.key === key; })[0] || board.templates[0];
    openModal('<div class="lede">排入時程 / 改期</div><h3>' + esc(s.site || auditId) + '(' + s.total + ' 列)</h3>' +
      '<div class="fld"><span>' + esc(m.anchorLabel) + (m.anchorWeekday ? '(原則週' + m.anchorWeekday + ')' : '') + '</span><input id="schF" type="date"></div>' +
      (m.hasSecond ? '<div class="fld"><span>' + esc(m.secondLabel) + '(留白 App 用建議日)</span><input id="schT" type="date"></div>' : '') +
      '<div class="sheet-fx" id="schHint">填主錨點日 → 所有未完成的列日期一次重算。留白 = 清空日期。</div>' +
      '<div class="sheet-fx conflict" id="schConflict"></div>' +
      '<div class="sheet-acts"><button class="btn primary" id="schGo">套用</button>' +
      '<button class="btn ghost" data-close>取消</button></div>');
    var upd = function () {
      var F = v('schF');
      document.getElementById('schHint').textContent = F
        ? (m.anchorLabel + ' ' + F + ' 週' + WD[pd(F).getDay()] + (m.hasSecond ? ' · 次錨點 ' + (v('schT') || suggestSecond(F, m) + '(建議)') : ''))
        : '留白 = 把這組的日期全部清空';
      document.getElementById('schConflict').textContent =
        [conflictLine(F), m.hasSecond ? conflictLine(v('schT')) : ''].filter(Boolean).join('\n');
    };
    document.getElementById('schF').oninput = upd;
    if (m.hasSecond) document.getElementById('schT').oninput = upd;
    document.getElementById('schGo').onclick = function () {
      go('scheduleAudit', { auditId: auditId, F: v('schF'), T: m.hasSecond ? v('schT') : '' }, v('schF') ? '已排入時程' : '已清空日期');
    };
  }

  // ═══ 事件 ═══
  document.getElementById('createBtn').onclick = function (e) {
    e.stopPropagation();
    var m = document.getElementById('createMenu');
    m.hidden = !m.hidden;
    document.getElementById('createBtn').setAttribute('aria-expanded', String(!m.hidden));
  };
  document.addEventListener('click', function () {
    document.getElementById('createMenu').hidden = true;
    document.getElementById('createBtn').setAttribute('aria-expanded', 'false');
  });
  document.getElementById('createMenu').onclick = function (e) {
    var b = e.target.closest('[data-create]'); if (!b) return;
    if (b.dataset.create === 'task') addTaskModal();
    else if (b.dataset.create === 'batch') batchTaskModal();
    else if (b.dataset.create === 'tpledit') openTplEdit();
    else auditModal();
  };

  document.getElementById('tabs').onclick = function (e) {
    var b = e.target.closest('.tab'); if (!b) return;
    stopSessPoll(); stopLtPoll();
    scr = b.dataset.scr; openAudit = null; openLong = null; openLongList = false; ltTagSel = null; ltFreshSnap = null; ltNoticeOpen = false; ltShowUpd = false; ltCloseArm = null; boardFocus = null; boardDay = null; calDay = null;
    openCourseList = false; openCourseKey = null; openCoursePersonId = null;
    [].forEach.call(document.querySelectorAll('.tab'), function (x) { x.setAttribute('aria-selected', String(x === b)); });
    if (scr === 'todo') api.submit('markSeen', {}).then(function (bd) { board = bd; render(); }).catch(function () {});
    render();
  };

  screen.onchange = function (e) {
    if (e.target.closest('[data-calmo]')) { calMonth = e.target.value; calDay = null; render(); return; }
    if (e.target.closest('[data-calrange]')) { calListDays = +e.target.value; render(); return; }
    var ct = e.target.closest('[data-cktick]');
    if (ct) {
      var pr = ct.dataset.cktick.split('¦'), t = taskById(pr[0]);
      if (t && t.checklist) {
        t.checklist = t.checklist.map(function (it) {
          if (it.id !== pr[1]) return it;
          var d = !it.done;
          return { id: it.id, t: it.t, qty: it.qty || null, done: d,
            by: d ? board.me.name : '', at: d ? nowLocalStamp() : '' };
        });
        ckPush(pr[0]); render();
      }
      return;
    }
    var gs = e.target.closest('[data-gselect]');
    if (gs) {
      gs.dataset.gids.split(',').forEach(function (id) { sel[id] = gs.checked; });
      render(); return;
    }
    var c = e.target.closest('[data-sel]'); if (!c) return;
    sel[c.dataset.sel] = c.checked; render();
  };
  screen.onclick = function (e) {
    // 群組層「全選本節/本站」勾選框巢狀包在可收合按鈕裡 —— 點下去不該連帶觸發收合,
    // 交給下面的 screen.onchange 處理勾選就好,這裡直接放行
    if (e.target.closest('.gcol-sel')) return;
    // ── 子項清單 ──
    var cko = e.target.closest('[data-ckopen]');
    if (cko) { openCk[cko.dataset.ckopen] = !openCk[cko.dataset.ckopen]; render(); return; }
    var ckn = e.target.closest('[data-cknew]');
    if (ckn) { openCk[ckn.dataset.cknew] = true; render(); return; }
    var ckd = e.target.closest('[data-ckdel]');
    if (ckd) {
      var qd = ckd.dataset.ckdel.split('¦'), td = taskById(qd[0]);
      if (td) {
        td.checklist = (td.checklist || []).filter(function (it) { return it.id !== qd[1]; });
        if (!td.checklist.length) td.checklist = null;
        ckPush(qd[0]); render();
      }
      return;
    }
    var cka = e.target.closest('[data-ckadd]');
    if (cka) {
      var rid = cka.dataset.ckadd, inp = document.getElementById('ckin-' + rid);
      var rows = (inp && inp.value || '').split('\n').map(function (s) { return s.trim(); }).filter(String);
      if (rows.length) {
        var ta = taskById(rid);
        ta.checklist = (ta.checklist || []).concat(rows.map(function (s) {
          return { id: ckId(), t: s, qty: null, done: false, by: '', at: '' };
        }));
        ckPush(rid); render();
      }
      return;
    }
    var ckc = e.target.closest('[data-ckclear]');
    if (ckc) {
      var tc = taskById(ckc.dataset.ckclear);
      if (tc) {
        tc.checklist = (tc.checklist || []).filter(function (it) { return !it.done; });
        if (!tc.checklist.length) tc.checklist = null;
        ckPush(ckc.dataset.ckclear); render();
      }
      return;
    }
    var ckdoc = e.target.closest('[data-ckdocs]');
    if (ckdoc) { docsModal(ckdoc.dataset.ckdocs); return; }
    // ── 日曆 ──
    var cview = e.target.closest('[data-calview]');
    if (cview) { calView = cview.dataset.calview; calDay = null; render(); return; }
    var cppl = e.target.closest('[data-calppl]');
    if (cppl) {
      var pv = cppl.dataset.calppl;
      if (!pv) calPeople = [];
      else { var pi = calPeople.indexOf(pv); pi >= 0 ? calPeople.splice(pi, 1) : calPeople.push(pv); }
      render(); return;
    }
    var cshift = e.target.closest('[data-calshift]');
    if (cshift) { calMonth = calShift(calMonth || board.today.slice(0, 7), +cshift.dataset.calshift); calDay = null; render(); return; }
    if (e.target.closest('[data-caltoday]')) { calMonth = null; calDay = calView === 'month' ? board.today : null; render(); return; }
    if (e.target.closest('[data-calrefresh]')) { go('calRefresh', {}, '已重新抓 Google 行事曆'); return; }
    var calc = e.target.closest('[data-calday]');
    if (calc) { calDay = (calDay === calc.dataset.calday) ? null : calc.dataset.calday; render(); return; }
    var calo = e.target.closest('[data-calopen]');
    if (calo) { editModal(calo.dataset.calopen); return; }
    if (e.target.closest('[data-ltentry]')) { openLongList = true; render(); return; }
    var lto = e.target.closest('[data-ltopen]');
    if (lto) { openLong = lto.dataset.ltopen; ltFreshSnap = null; ltCloseArm = null; ltNoticeOpen = false; ltShowUpd = false; render(); return; }
    if (e.target.closest('[data-lllater]')) { ltLaterOpen = !ltLaterOpen; render(); return; }
    if (e.target.closest('[data-ltdone]')) { ltDoneOpen = !ltDoneOpen; render(); return; }
    // ── 長期追蹤:注意事項 / 衍生任務 / 結案 ──
    if (e.target.closest('[data-ltnoticeexpand]')) { ltNoticeOpen = true; renderLongDetail(); return; }
    if (e.target.closest('[data-ltnoticecollapse]')) { ltNoticeOpen = false; renderLongDetail(); return; }
    var lna = e.target.closest('[data-ltnoticeadd]');
    if (lna) {
      var lnTxt = (document.getElementById('ltNcText') || {}).value || '';
      var lnDate = (document.getElementById('ltNcDate') || {}).value || '';
      if (!lnTxt.trim()) { toast('請填注意內容'); return; }
      go('ltNoticeAdd', { id: lna.dataset.ltnoticeadd, text: lnTxt.trim(), remindOn: lnDate }, '加了一條注意');
      return;
    }
    var lnd = e.target.closest('[data-ltnoticedel]');
    if (lnd) { var pr = lnd.dataset.ltnoticedel.split('¦'); go('ltNoticeDel', { id: pr[0], noticeId: pr[1] }, '已刪除'); return; }
    var lsp = e.target.closest('[data-ltspin]');
    if (lsp) { ltSpinModal(lsp.dataset.ltspin); return; }
    var lch = e.target.closest('[data-ltchild]');
    if (lch) { editModal(lch.dataset.ltchild); return; }
    var lre = e.target.closest('[data-ltreopen]');
    if (lre) { go('ltReopen', { id: lre.dataset.ltreopen }, '已重新開啟'); return; }
    var lcl = e.target.closest('[data-ltclose]');
    if (lcl) {
      var lid = lcl.dataset.ltclose;
      if (ltCloseArm === lid) {
        var gist = (document.getElementById('ltCloseGist') || {}).value || '';
        ltCloseArm = null;
        go('ltClose', { id: lid, text: gist.trim() }, '已結案');
      } else {
        ltCloseArm = lid; renderLongDetail();
        setTimeout(function () { if (ltCloseArm === lid) { ltCloseArm = null; if (openLong === lid) renderLongDetail(); } }, 8000);
      }
      return;
    }
    var ac = e.target.closest('[data-audit]');
    var gall = e.target.closest('[data-gall]');
    var gcolBtn = e.target.closest('[data-gcol]');
    var mo = e.target.closest('[data-modal]');
    var a = e.target.closest('[data-act]');
    var hz = e.target.closest('[data-horizon]');
    var fo = e.target.closest('[data-focus]');
    var jd = e.target.closest('[data-jamday]');
    if (hz) { horizon = +hz.dataset.horizon; render(); return; }
    if (e.target.closest('[data-focusclear]')) { boardFocus = null; render(); return; }
    if (fo) { boardFocus = boardFocus === fo.dataset.focus ? null : fo.dataset.focus; boardDay = null; render(); return; }
    if (e.target.closest('[data-jamtoggle]')) { jamOpen = !jamOpen; render(); return; }
    if (jd) { boardDay = jd.dataset.jamday || null; boardFocus = null; render(); return; }
    if (gcolBtn) { openGroups[gcolBtn.dataset.gcol] = !openGroups[gcolBtn.dataset.gcol]; render(); return; }
    if (gall) {
      var wantOpen = gall.dataset.gall === 'open', keys;
      if (gall.dataset.gkeys) { keys = gall.dataset.gkeys.split(','); }
      else {
        keys = {};
        board.tasks.filter(function (t) { return t.auditId === openAudit; })
          .forEach(function (t) { keys[openAudit + '¦' + (t.groupName || '單件任務')] = true; });
        keys = Object.keys(keys);
      }
      keys.forEach(function (k) { openGroups[k] = wantOpen; });
      render(); return;
    }
    if (a && a.dataset.act === 'schedule') { scheduleModal(a.dataset.audit); return; }
    if (ac && !mo) { openAudit = ac.dataset.audit; openGroups = {}; render(); return; }
    if (mo) {
      var f = { done: doneModal, handoff: handoffModal, reassign: reassignModal, wait: waitModal, edit: editModal, teamclaim: teamClaimModal }[mo.dataset.modal];
      if (f) f(mo.dataset.row);
      return;
    }
    if (!a) return;
    var row = a.dataset.row, act = a.dataset.act;
    if (act === 'reopen') go('reopen', { rowId: row }, '已退回');
    else if (act === 'endWait') go('endWait', { rowId: row }, '已結束等待');
    else if (act === 'claimQ') go('claimQueued', { rowIds: [row] }, '已認領 · 15 分鐘內彙整通知一次');
    else if (act === 'claimSel') go('claim', { rowIds: Object.keys(sel).filter(function (k) { return sel[k]; }) }, '已認領');
    else if (act === 'claimSelTeam') teamClaimSheet(Object.keys(sel).filter(function (k) { return sel[k]; }));
    else if (act === 'clearSel') { sel = {}; render(); }
    else if (act === 'backBoard') { openAudit = null; render(); }
  };
  document.getElementById('doneFab').onclick = function (e) {
    if (e.target.closest('[data-donefab]')) { doneOpen = !doneOpen; renderTodo(); return; }
    if (e.target.id === 'doneSheetBd' || e.target.closest('[data-doneclose]')) { doneOpen = false; renderTodo(); return; }
    var ro = e.target.closest('[data-act="reopen"]');
    if (ro) { doneOpen = false; go('reopen', { rowId: ro.dataset.row }, '已退回'); }
  };
  modalRoot.onclick = function (e) {
    if (e.target.closest('[data-close]') || e.target.closest('[data-doneclose]')) { closeModal(); return; }
    var tq = e.target.closest('.tm-q');
    if (tq) {
      var tqHelp = tq.dataset.help ? document.getElementById(tq.dataset.help)
        : (tq.closest('.fld') && tq.closest('.fld').querySelector('.tm-help'));
      if (tqHelp) tqHelp.hidden = !tqHelp.hidden;
      return;
    }
    var nf = e.target.closest('[data-nid]');
    if (nf) {
      var lk = nf.dataset.nlink;
      api.submit('notifSeen', { ids: [nf.dataset.nid] })
        .then(function (b) { board = b; if (!modalRoot.firstChild) render(); }).catch(function () {});
      closeModal();
      navFromNotif(lk);
    }
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && doneOpen) { doneOpen = false; renderTodo(); } });

  var toastEl = document.getElementById('toast'), toastT;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2800);
  }

  // 手機鍵盤彈出時,底部分頁列(總覽/我的待辦/日曆/名冊)會被壓到鍵盤正上方、
  // 卡在畫面中間很奇怪(使用者截圖回報)。跟大部分 App 一樣:有輸入框在打字時先把它藏起來,
  // 打完離開欄位再恢復,modal 裡的輸入框不用管(modal 蓋滿全螢幕,底部列本來就看不到)。
  function syncTabsForKeyboard() {
    var act = document.activeElement;
    var typing = !!(act && (act.tagName === 'INPUT' || act.tagName === 'TEXTAREA'));
    var tabsEl = document.getElementById('tabs');
    if (tabsEl) tabsEl.style.display = typing ? 'none' : '';
  }
  document.addEventListener('focusin', syncTabsForKeyboard);
  document.addEventListener('focusout', function () { setTimeout(syncTabsForKeyboard, 0); });

  // 回到前景時,若正在看某場次,馬上刷一次(不用等下一個 15 秒 tick)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (scr === 'roster' && rosterView === 'sessions' && openSession && !sessEdit) sessPollTick();
    if (scr === 'board' && openLong) ltPollTick();
  });

  // ═══ 啟動 ═══
  api.getBoard().then(function (b) { board = b; boardLoadedAt = Date.now(); render(); checkLineQuotaWarn(); })
    .catch(function (err) {
      // 自動重試都失敗才會到這 —— 給一顆重新載入鈕,不用手動下拉重整
      screen.innerHTML = '<div class="err">連不上伺服器（' + esc(String(err && (err.message || err) || '連線問題')) + '）'
        + '<div style="margin-top:10px"><button class="btn primary" id="reloadBtn">重新載入</button></div></div>';
      var rb = document.getElementById('reloadBtn');
      if (rb) rb.onclick = function () { location.reload(); };
    });
})();
