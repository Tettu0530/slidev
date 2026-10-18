// The deck browser served at `/` in folder mode (PreMerd: white, ink, 1px rules, "+" marks, Geist)

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)

export function folderPage({ folder }: { folder: string }) {
  return /* html */ `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(folder)} — Slidev</title>
<style>
  @font-face { font-family: "Geist"; src: url("/__folder/fonts/geist.woff2") format("woff2"); font-weight: 100 900; }
  @font-face { font-family: "Geist Mono"; src: url("/__folder/fonts/geist-mono.woff2") format("woff2"); }
  :root {
    --pm-bg: #ffffff; --pm-fg: #171717; --pm-fg-hover: #383838; --pm-muted: #666666; --pm-faint: #737373;
    --pm-line: #eaeaea; --pm-mark: #a3a3a3; --pm-border: #d4d4d4; --pm-fill: #fafafa; --pm-error: #b42318;
    --sans: "Geist", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif;
    --mono: "Geist Mono", ui-monospace, monospace;
    --w: 1080px; --pad: 24px;
  }
  * { box-sizing: border-box; }
  html, body { background: var(--pm-bg); }
  body { margin: 0; color: var(--pm-fg); font-family: var(--sans); font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
  ::selection { background: var(--pm-fg); color: var(--pm-bg); }
  code, .mono { font-family: var(--mono); font-size: 12px; }
  button, input { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--pm-fg); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }

  .page { position: relative; max-width: var(--w); margin: 0 auto; min-height: 100vh; border-left: 1px solid var(--pm-line); border-right: 1px solid var(--pm-line); }
  .crumb { height: 56px; display: flex; align-items: center; padding: 0 var(--pad); color: var(--pm-faint); }
  .rule { position: relative; }
  .rule::before { content: ""; position: absolute; left: calc(50% - 50vw); width: 100vw; top: 0; border-top: 1px solid var(--pm-line); }
  .rule::after {
    content: ""; position: absolute; top: -9px; left: -9px; right: -9px; height: 18px; pointer-events: none;
    background:
      linear-gradient(var(--pm-mark), var(--pm-mark)) 0 50% / 18px 1px no-repeat,
      linear-gradient(var(--pm-mark), var(--pm-mark)) 9px 0 / 1px 18px no-repeat,
      linear-gradient(var(--pm-mark), var(--pm-mark)) 100% 50% / 18px 1px no-repeat,
      linear-gradient(var(--pm-mark), var(--pm-mark)) calc(100% - 9px) 0 / 1px 18px no-repeat;
  }
  header.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 40px var(--pad) 28px; }
  h1 { margin: 0; font-size: 40px; line-height: 1.1; letter-spacing: -0.03em; font-feature-settings: "palt"; }
  .count { color: var(--pm-muted); white-space: nowrap; }

  .deck { display: grid; grid-template-columns: 208px minmax(0, 1fr) auto; gap: 24px; align-items: center; padding: 20px var(--pad); }
  .thumb { width: 208px; aspect-ratio: 16 / 9; border: 1px solid var(--pm-line); background: var(--pm-fill); display: grid; place-items: center; overflow: hidden; color: var(--pm-muted); text-decoration: none; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .title { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.35; letter-spacing: -0.01em; font-feature-settings: "palt"; }
  .id { color: var(--pm-muted); }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; color: var(--pm-muted); font-size: 12px; }
  .meta b { color: var(--pm-fg); font-weight: 600; }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; background: var(--pm-fg); }
  .dot.hollow { background: none; border: 1px solid var(--pm-muted); }
  .status { margin-top: 8px; min-height: 18px; color: var(--pm-faint); font-family: var(--mono); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status:empty { display: none; }
  .status.error { color: var(--pm-error); }

  .actions { display: grid; grid-template-columns: repeat(2, 132px); gap: 8px; justify-content: end; }
  .btn {
    height: 34px; padding: 0 14px; border: 1px solid var(--pm-border); border-radius: 6px; background: var(--pm-bg); color: var(--pm-fg);
    cursor: pointer; white-space: nowrap; font-size: 13px; text-decoration: none;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: border-color .15s, background-color .15s;
  }
  .btn:hover { border-color: var(--pm-fg); }
  .btn.primary { background: var(--pm-fg); border-color: var(--pm-fg); color: var(--pm-bg); }
  .btn.primary:hover { background: var(--pm-fg-hover); }
  .btn[disabled] { opacity: .45; cursor: default; pointer-events: none; }
  .wide { grid-column: span 2; }

  form.new { display: grid; grid-template-columns: 208px minmax(0, 1fr) auto; gap: 24px; align-items: end; padding: 24px var(--pad) 40px; }
  form.new h2 { margin: 0; font-size: 15px; }
  form.new p { margin: 4px 0 0; color: var(--pm-muted); font-size: 12px; }
  .fields { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; }
  label { display: grid; gap: 4px; font-size: 12px; color: var(--pm-muted); }
  input { height: 34px; padding: 0 10px; border: 1px solid var(--pm-border); border-radius: 6px; background: var(--pm-bg); font-size: 13px; }
  input.mono { font-family: var(--mono); }
  input:focus { border-color: var(--pm-fg); outline: none; }
  .form-error { grid-column: 2 / -1; margin: 0; color: var(--pm-error); font-size: 12px; }
  .form-error:empty { display: none; }
  .empty { padding: 40px var(--pad); color: var(--pm-muted); }

  @media (max-width: 760px) {
    :root { --pad: 16px; }
    .page { border: none; }
    .deck, form.new { grid-template-columns: 1fr; gap: 14px; }
    .thumb { width: 100%; }
    .actions { justify-content: start; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
    .fields { grid-template-columns: 1fr; }
    .form-error { grid-column: auto; }
    h1 { font-size: 30px; }
    .rule::after { display: none; }
  }
</style>
</head>
<body>
<main class="page">
  <div class="crumb mono">${escapeHtml(folder)}/</div>
  <header class="head rule">
    <h1>プレゼンテーション</h1>
    <span class="count" id="count"></span>
  </header>
  <section id="list" aria-live="polite"></section>
  <form class="new rule" id="new" autocomplete="off">
    <div>
      <h2>新しいデッキ</h2>
      <p>雛形から作成</p>
    </div>
    <div class="fields">
      <label>id（フォルダ名）<input id="new-id" class="mono" name="id" required pattern="[A-Za-z0-9][\\w.\\-]*" placeholder="2026-11-progress"></label>
      <label>タイトル<input id="new-title" name="title" placeholder="進捗報告"></label>
    </div>
    <button class="btn primary" type="submit">作成</button>
    <p class="form-error" id="form-error"></p>
  </form>
</main>
<script>
const $ = (s, el = document) => el.querySelector(s)
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fmtTime = ms => new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtSize = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB'
let decks = []
const errors = new Map()
let thumbVersion = Date.now()

async function api(path, opts = {}) {
  const r = await fetch('/__folder/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, ...opts })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error || r.statusText)
  return body
}

function statusLine(d) {
  if (errors.has(d.id)) return { text: errors.get(d.id), error: true }
  if (d.job?.state === 'running') return { text: '書き出し中… ' + d.job.last }
  if (d.job?.state === 'failed') return { text: '書き出しに失敗しました: ' + d.job.last, error: true }
  if (d.job?.state === 'done' && Date.now() - d.job.finished < 15000) return { text: '書き出しました' }
  if (d.running) return { text: '起動中: ' + location.origin + d.url }
  return { text: '' }
}

function render() {
  $('#count').textContent = decks.length + ' 件'
  if (!decks.length) {
    $('#list').innerHTML = '<div class="empty rule">デッキがありません。下の欄から作成できます。</div>'
    return
  }
  $('#list').innerHTML = decks.map(d => {
    const st = statusLine(d)
    const exporting = d.job?.state === 'running'
    const pdf = d.pdf
      ? '<span><span class="dot' + (d.pdf.stale ? ' hollow' : '') + '"></span>PDF ' + (d.pdf.stale ? '<b>更新が必要</b>' : '最新') + ' · ' + fmtSize(d.pdf.size) + '</span>'
      : '<span><span class="dot hollow"></span>PDF なし</span>'
    const id = esc(d.id)
    return '<article class="deck rule" data-id="' + id + '">'
      + '<a class="thumb" href="' + esc(d.url) + '" target="_blank" rel="noopener" aria-label="' + esc(d.title) + ' を開く">'
      + (d.thumb ? '<img src="/__folder/api/decks/' + id + '/thumb?v=' + thumbVersion + '" alt="">' : '<code>no preview</code>') + '</a>'
      + '<div><p class="title">' + esc(d.title) + '</p><code class="id">' + id + '/slides.md</code>'
      + '<div class="meta"><span><b>' + d.slides + '</b> 枚</span><span>更新 ' + fmtTime(d.updated) + '</span>' + pdf + '</div>'
      + '<div class="status' + (st.error ? ' error' : '') + '">' + esc(st.text) + '</div></div>'
      + '<div class="actions">'
      + '<a class="btn primary" href="' + esc(d.url) + '" target="_blank" rel="noopener">開く</a>'
      + '<a class="btn" href="' + esc(d.url) + 'presenter/" target="_blank" rel="noopener">発表者画面</a>'
      + '<button class="btn" data-act="export"' + (exporting ? ' disabled' : '') + '>' + (exporting ? '書き出し中…' : 'PDF 書き出し') + '</button>'
      + (d.pdf ? '<a class="btn" href="/__folder/api/decks/' + id + '/pdf" target="_blank" rel="noopener">PDF を見る</a>' : '<button class="btn" disabled>PDF を見る</button>')
      + (d.running ? '<button class="btn wide" data-act="stop">停止</button>' : '')
      + '</div></article>'
  }).join('')
}

async function refresh() {
  const prev = new Map(decks.map(d => [d.id, d.job?.state]))
  try { decks = await (await fetch('/__folder/api/decks')).json() } catch {}
  if (decks.some(d => d.job?.state === 'done' && prev.get(d.id) === 'running')) thumbVersion = Date.now()
  render()
  clearTimeout(refresh.t)
  refresh.t = setTimeout(refresh, decks.some(d => d.job?.state === 'running') ? 1200 : 4000)
}

$('#list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]')
  if (!btn) return
  const id = btn.closest('[data-id]').dataset.id
  errors.delete(id)
  try { await api('decks/' + encodeURIComponent(id) + '/' + btn.dataset.act) } catch (err) { errors.set(id, err.message) }
  refresh()
})

$('#new').addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = new FormData(e.target)
  $('#form-error').textContent = ''
  try {
    await api('decks', { body: JSON.stringify({ id: f.get('id'), title: f.get('title') }) })
    e.target.reset()
    refresh()
  } catch (err) {
    $('#form-error').textContent = err.message
  }
})

refresh()
</script>
</body>
</html>`
}
