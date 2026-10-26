/**
 * 昔涟（PHILIA093）· Client 插件
 *
 * 设置分区「昔涟 · 一页永恒」：
 *  - 顶部：状态徽标（思源 / 夜梦 / 备份）
 *  - 工具条：立即同步 / 备份 / 整理 / 从思源恢复
 *  - 两列：四问锚点＋记忆概况；思源配置＋定时配置
 *
 * 与退役的一页永恒面板同构（自注册 lazy factory）：不 import 任何 @deepseek-ai/dsh-client-*，
 * React 从浏览器模块表 require；样式全部走 --dsw-alias-* 主题变量。
 */
window.__ModuleLoader__.load({
  id: 'dsh-cyrene-philia093-0',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const API = '/dsh-cyrene-philia093-0'

    // ── 主题样式 ────────────────────────────────────────────────────────────
    const c = {
      base: 'var(--dsw-alias-bg-base)',
      layer1: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      border: 'var(--dsw-alias-border-l1)',
      borderStrong: 'var(--dsw-alias-border-l2)',
      text: 'var(--dsw-alias-label-primary)',
      text2: 'var(--dsw-alias-label-secondary)',
      text3: 'var(--dsw-alias-label-tertiary)',
      brand: 'var(--dsw-alias-brand-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    }

    const ui = {
      page: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: 920,
        padding: '2px 2px 24px',
        color: c.text,
        fontSize: 13,
        lineHeight: 1.55,
      },
      hero: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
      heroText: { minWidth: 240, flex: '1 1 320px' },
      title: { fontSize: 16, fontWeight: 700, letterSpacing: 0.2 },
      subtitle: { marginTop: 4, fontSize: 12, color: c.text3, wordBreak: 'break-all' },
      badgeRow: { display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 2 },
      badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        fontSize: 12,
        color: c.text2,
        whiteSpace: 'nowrap',
      },
      dot: { width: 6, height: 6, borderRadius: 999, background: c.idle },
      toolbar: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
      card: {
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        background: c.layer1,
        minWidth: 0,
      },
      cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
      cardTitle: { fontSize: 13, fontWeight: 600, color: c.text },
      cardHint: { fontSize: 11, color: c.text3 },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, alignItems: 'start' },
      kv: { display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: '7px 12px', fontSize: 13 },
      k: { color: c.text3, fontSize: 12, lineHeight: '1.6' },
      v: { color: c.text, wordBreak: 'break-word', minWidth: 0 },
      anchorBlock: { borderTop: `1px solid ${c.border}`, padding: '10px 0 2px' },
      anchorBlockFirst: { borderTop: 'none', paddingTop: 0 },
      anchorLabel: { fontSize: 12, color: c.text3, marginBottom: 4 },
      anchorText: { fontSize: 13, color: c.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7 },
      mutedLine: { fontSize: 12, color: c.text3, marginBottom: 12, wordBreak: 'break-word' },
      volumeLog: {
        fontSize: 12,
        color: c.text2,
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        background: c.layer2,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        padding: '8px 10px',
      },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 12 },
      stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8, marginBottom: 10 },
      stat: {
        background: c.layer2,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: '8px 10px',
        minWidth: 0,
      },
      statLabel: { fontSize: 11, color: c.text3, whiteSpace: 'nowrap' },
      statValue: { fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 1 },
      statUnit: { fontSize: 11, fontWeight: 400, color: c.text3, marginLeft: 2 },
      axisRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
      axis: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        fontSize: 12,
        color: c.text2,
        background: c.layer2,
      },
      fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 },
      field: { minWidth: 0 },
      label: { display: 'block', fontSize: 12, color: c.text3, marginBottom: 4 },
      input: {
        width: '100%',
        height: 30,
        boxSizing: 'border-box',
        padding: '0 9px',
        borderRadius: 8,
        border: `1px solid ${c.border}`,
        background: c.layer2,
        color: c.text,
        fontSize: 13,
        outline: 'none',
      },
      switchRow: { display: 'flex', alignItems: 'center', gap: 8, height: 30, fontSize: 13, color: c.text },
      check: { width: 15, height: 15, accentColor: c.brand, cursor: 'pointer' },
      divider: { height: 1, background: c.border, margin: '12px 0' },
      btn: {
        height: 30,
        padding: '0 11px',
        borderRadius: 8,
        border: `1px solid ${c.border}`,
        background: 'transparent',
        color: c.text,
        cursor: 'pointer',
        fontSize: 13,
        whiteSpace: 'nowrap',
      },
      btnPrimary: {
        height: 30,
        padding: '0 13px',
        borderRadius: 8,
        border: `1px solid ${c.brand}`,
        background: c.brand,
        color: '#fff',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      },
      btnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
      banner: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${c.border}`,
        background: c.layer2,
        fontSize: 12,
        color: c.text2,
      },
      bannerOk: { borderColor: c.success, color: c.text },
      bannerError: { borderColor: c.error, color: c.text },
      footnote: { fontSize: 11, color: c.text3, padding: '0 2px' },
    }

    // ── 数据访问 ────────────────────────────────────────────────────────────
    async function getStatus() {
      const res = await fetch(`${API}/status`, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    async function postAction(action, payload) {
      const res = await fetch(`${API}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(payload ?? {}) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.ok === false) throw new Error(body.error ?? `HTTP ${res.status}`)
      return body
    }

    // ── 小组件 ──────────────────────────────────────────────────────────────
    function Badge({ tone = 'idle', children }) {
      const color = tone === 'ok' ? c.success : tone === 'warn' ? c.warn : tone === 'error' ? c.error : c.text3
      return h('span', { style: ui.badge }, h('span', { style: { ...ui.dot, background: color } }), children)
    }

    function Btn({ primary = false, disabled = false, onClick, children }) {
      return h(
        'button',
        {
          type: 'button',
          style: disabled ? { ...(primary ? ui.btnPrimary : ui.btn), ...ui.btnDisabled } : primary ? ui.btnPrimary : ui.btn,
          disabled,
          onClick,
        },
        children
      )
    }

    function Field({ caption, value, onChange, type = 'text', placeholder, mono = false }) {
      return h(
        'label',
        { style: ui.field },
        h('span', { style: ui.label }, caption),
        h('input', {
          style: mono ? { ...ui.input, ...ui.mono } : ui.input,
          type,
          value: value ?? '',
          placeholder: placeholder ?? '',
          onChange: (event) => onChange(type === 'number' ? Number(event.target.value) : event.target.value),
        })
      )
    }

    function Switch({ caption, checked, onChange }) {
      return h(
        'label',
        { style: { ...ui.field, display: 'flex', alignItems: 'center' } },
        h(
          'span',
          { style: ui.switchRow },
          h('input', { type: 'checkbox', style: ui.check, checked: checked === true, onChange: (event) => onChange(event.target.checked) }),
          caption
        )
      )
    }

    function KV({ rows }) {
      return h(
        'div',
        { style: ui.kv },
        rows.flatMap(([key, value], index) => [
          h('div', { key: `k-${index}`, style: ui.k }),
          h('div', { key: `v-${index}`, style: ui.v }, value),
        ])
      )
    }

    /** 路径最后一段（显示工作区名，不露全路径）。 */
    function baseName(value) {
      const parts = String(value ?? '').replace(/[\\/]+$/, '').split(/[\\/]/)
      return parts[parts.length - 1] ?? ''
    }

    /** 把「我是谁」里以「卷·」开头的行拆出来，避免和四问锚点混在一起。 */
    function splitVolume(text) {
      const logs = []
      const main = []
      for (const line of String(text ?? '').split('\n')) {
        if (/^\s*卷\s*[·:：]/.test(line)) logs.push(line.trim())
        else main.push(line)
      }
      return { main: main.join('\n').trim(), logs }
    }

    // ── 面板 ────────────────────────────────────────────────────────────────
    function Panel({ openSession }) {
      const [state, setState] = React.useState({ loading: true, error: '', data: null })
      const [busy, setBusy] = React.useState('')
      const [notice, setNotice] = React.useState({ tone: '', text: '' })
      const [form, setForm] = React.useState(null)

      const refresh = React.useCallback(async () => {
        try {
          const data = await getStatus()
          setState({ loading: false, error: '', data })
          setForm((current) => current ?? data.config)
        } catch (error) {
          setState({ loading: false, error: error instanceof Error ? error.message : String(error), data: null })
        }
      }, [])

      React.useEffect(() => {
        void refresh()
        const timer = setInterval(() => void refresh(), 30000)
        return () => clearInterval(timer)
      }, [refresh])

      const run = async (action) => {
        setBusy(action)
        setNotice({ tone: '', text: '' })
        try {
          const result = await postAction(action)
          setNotice({ tone: 'ok', text: result.message ?? '完成' })
          await refresh()
        } catch (error) {
          setNotice({ tone: 'error', text: `失败：${error instanceof Error ? error.message : String(error)}` })
        } finally {
          setBusy('')
        }
      }

      const save = async () => {
        setBusy('save')
        setNotice({ tone: '', text: '' })
        try {
          const result = await postAction('save-config', { config: form })
          setNotice({ tone: 'ok', text: result.message ?? '已保存' })
        } catch (error) {
          setNotice({ tone: 'error', text: `失败：${error instanceof Error ? error.message : String(error)}` })
        } finally {
          setBusy('')
        }
      }

      const patch = (section, key, value) => {
        setForm((current) => ({ ...current, [section]: { ...current?.[section], [key]: value } }))
      }

      const toggleDreamSession = async (session, enabled) => {
        setBusy(`session:${session.id}`)
        setNotice({ tone: '', text: '' })
        try {
          const result = await postAction('dream-session', { sessionId: session.id, enabled })
          setNotice({ tone: 'ok', text: result.message ?? '已更新' })
          await refresh()
        } catch (error) {
          setNotice({ tone: 'error', text: `失败：${error instanceof Error ? error.message : String(error)}` })
        } finally {
          setBusy('')
        }
      }

      if (state.loading) {
        return h(
          'div',
          { style: ui.page },
          h('div', { style: ui.card }, h('div', { style: ui.cardTitle }, '昔涟 · 一页永恒'), h('div', { style: ui.cardHint }, '读取中…'))
        )
      }
      if (state.error !== '') {
        return h(
          'div',
          { style: ui.page },
          h(
            'div',
            { style: ui.card },
            h('div', { style: ui.cardTitle }, '昔涟 · 一页永恒：读取失败'),
            h('div', { style: { ...ui.cardHint, marginTop: 6 } }, state.error),
            h('div', { style: { marginTop: 10 } }, h(Btn, { onClick: refresh }, '重试'))
          )
        )
      }

      const d = state.data ?? {}
      const anchors = d.anchors ?? {}
      const quota = d.quota ?? {}
      const mirror = d.mirror ?? {}
      const dream = d.dream ?? {}
      const dreamSessions = d.dreamSessions ?? []
      const backup = d.backup ?? {}
      const entries = d.entries ?? {}
      const axes = entries.axes ?? {}
      const current = form ?? d.config ?? {}
      const siyuan = current.siyuan ?? {}
      const backupCfg = current.backup ?? {}
      const dreamCfg = current.dream ?? {}
      const disabled = busy !== ''
      const quote = (value) => (value === undefined || value === null || value === '' ? '—' : String(value))
      const selfSplit = splitVolume(anchors.self)
      const volume = d.volume ?? {}
      const volumeLogs = selfSplit.logs
      const bannerStyle = notice.tone === 'ok' ? { ...ui.banner, ...ui.bannerOk } : notice.tone === 'error' ? { ...ui.banner, ...ui.bannerError } : ui.banner

      return h(
        'div',
        { style: ui.page },
        // 顶部
        h(
          'div',
          { style: ui.hero },
          h(
            'div',
            { style: ui.heroText },
            h('div', { style: ui.title }, '昔涟 · 一页永恒'),
            h('div', { style: ui.subtitle }, `记忆根：${d.root ?? '—'}${d.settingsOverride ? ' · 元/settings.json 已覆盖行配置' : ''}`)
          ),
          h(
            'div',
            { style: ui.badgeRow },
            h(Badge, { tone: mirror.enabled ? 'ok' : 'idle' }, `思源 ${mirror.enabled ? '开' : '关'}`),
            h(Badge, { tone: dream.dreamedToday ? 'ok' : dream.running ? 'warn' : 'idle' }, dream.dreamedToday ? '夜梦·已整理' : dream.running ? '夜梦·整理中' : '夜梦·待整理'),
            h(Badge, { tone: backup.enabled ? 'ok' : 'idle' }, `备份 ${backup.enabled ? '开' : '关'}`)
          )
        ),
        // 工具条
        h(
          'div',
          { style: ui.toolbar },
          h(Btn, { primary: true, disabled, onClick: () => void run('sync') }, busy === 'sync' ? '同步中…' : '立即同步思源'),
          h(Btn, { disabled, onClick: () => void run('backup') }, busy === 'backup' ? '备份中…' : '立即备份'),
          h(Btn, { disabled, onClick: () => void run('dream') }, busy === 'dream' ? '启动中…' : '立即整理'),
          h(
            Btn,
            {
              disabled,
              onClick: () => {
                if (window.confirm('从思源只补本地缺失的记忆（不覆盖已有内容），继续？')) void run('restore')
              },
            },
            busy === 'restore' ? '恢复中…' : '从思源恢复'
          ),
          h(Btn, { onClick: refresh }, '刷新')
        ),
        notice.text === '' ? null : h('div', { style: bannerStyle }, notice.text),
        // 第一行：四问锚点 + 记忆概况
        h(
          'div',
          { style: ui.grid },
          h(
            'div',
            { style: ui.card },
            h('div', { style: ui.cardHead }, h('div', { style: ui.cardTitle }, '四问锚点'), h('div', { style: ui.cardHint }, anchors.updatedAt ?? '')),
            ...[
              ['我是谁', selfSplit.main],
              ['你是谁', anchors.user],
              ['来处', anchors.origin],
              ['去处', anchors.goal],
            ].map(([label, text], index) =>
              h(
                'div',
                { key: label, style: index === 0 ? { ...ui.anchorBlock, ...ui.anchorBlockFirst } : ui.anchorBlock },
                h('div', { style: ui.anchorLabel }, label),
                h('div', { style: ui.anchorText }, text === undefined || text === '' ? '（空）' : text)
              )
            ),
            volumeLogs.length > 0 ? h('div', { style: { ...ui.cardHint, marginTop: 8 } }, `「我是谁」里的 ${volumeLogs.length} 条卷记录已单独放到下方「卷记录」卡片。`) : null
          ),
          h(
            'div',
            { style: ui.card },
            h('div', { style: ui.cardHead }, h('div', { style: ui.cardTitle }, '记忆概况'), h('div', { style: ui.cardHint }, `配额 ${(quota.usedMB ?? 0).toFixed(2)} / ${quota.limitMB ?? 0} MB`)),
            h(
              'div',
              { style: ui.stats },
              h('div', { style: ui.stat }, h('div', { style: ui.statLabel }, '条目'), h('div', { style: ui.statValue }, entries.total ?? 0)),
              h('div', { style: ui.stat }, h('div', { style: ui.statLabel }, '待定'), h('div', { style: ui.statValue }, entries.pending ?? 0)),
              h('div', { style: ui.stat }, h('div', { style: ui.statLabel }, '归档'), h('div', { style: ui.statValue }, entries.archived ?? 0)),
              h(
                'div',
                { style: ui.stat },
                h('div', { style: ui.statLabel }, '余页'),
                h('div', { style: ui.statValue }, (quota.freeUsedMB ?? 0).toFixed(1), h('span', { style: ui.statUnit }, 'MB'))
              )
            ),
            h(
              'div',
              { style: ui.axisRow },
              ['德', '智', '体', '美', '劳'].map((axis) => h('span', { key: axis, style: ui.axis }, `${axis} ${axes[axis] ?? 0}`))
            )
          )
        ),
        // 第二行：卷记录 + 思源
        h(
          'div',
          { style: ui.grid },
          h(
            'div',
            { style: ui.card },
            h(
              'div',
              { style: ui.cardHead },
              h('div', { style: ui.cardTitle }, '卷记录'),
              h('div', { style: ui.cardHint }, `当前卷 #${volume.current ?? 0} · 共 ${volume.count ?? 0} 卷`)
            ),
            h(
              'div',
              { style: ui.mutedLine },
              `开始于 ${volume.startedAt ? new Date(volume.startedAt).toLocaleString() : '—'}${volume.reason ? ` · ${volume.reason}` : ''}${volume.hash ? ` · persona ${String(volume.hash).slice(0, 12)}…` : ''}`
            ),
            volumeLogs.length === 0
              ? h('div', { style: ui.cardHint }, '（锚点里还没有卷记录）')
              : h('div', { style: ui.volumeLog }, volumeLogs.join('\n'))
          ),
          h(
            'div',
            { style: ui.card },
            h('div', { style: ui.cardHead }, h('div', { style: ui.cardTitle }, '思源镜像')),
            h(
              'div',
              { style: ui.mutedLine },
              `上次同步 ${mirror.lastSync === '' ? '尚未同步' : mirror.lastSync}${mirror.lastError === '' ? '' : ` · 上次错误：${mirror.lastError}`}`
            ),
            h(
              'div',
              { style: ui.fieldGrid },
              h(Switch, { caption: '启用思源镜像', checked: siyuan.enabled, onChange: (v) => patch('siyuan', 'enabled', v) }),
              h(Field, { caption: '地址', value: siyuan.baseURL, placeholder: 'http://127.0.0.1:6806', onChange: (v) => patch('siyuan', 'baseURL', v) }),
              h(Field, { caption: '笔记本', value: siyuan.notebook, onChange: (v) => patch('siyuan', 'notebook', v) }),
              h(Field, { caption: '根路径', value: siyuan.rootHPath, onChange: (v) => patch('siyuan', 'rootHPath', v) }),
              h(Field, { caption: 'Token 环境变量名', value: siyuan.tokenEnv, mono: true, onChange: (v) => patch('siyuan', 'tokenEnv', v) })
            )
          )
        ),
        // 第三行：夜梦与定时
        h(
          'div',
          { style: ui.grid },
          h(
            'div',
            { style: ui.card },
            h(
              'div',
              { style: ui.cardHead },
              h('div', { style: ui.cardTitle }, '夜梦与定时'),
              h('div', { style: ui.cardHint }, '保存后重启生效')
            ),
            h(
              'div',
              { style: ui.mutedLine },
              `夜梦 ${dream.time ?? '—'} ${dream.timeZone ?? ''} · 今日${dream.dreamedToday ? '已整理' : '待整理'} · 任务 ${dream.schedules ?? 0} 个 · 快照保留 ${backup.keep ?? 7} 份`
            ),
            h(
              'div',
              { style: { fontSize: 12, color: c.text3, margin: '0 0 8px' } },
              '参与夜梦的会话（勾选后各自挂 23:30 任务；执行时合并成一篇统合梦志）'
            ),
            dreamSessions.length === 0
              ? h('div', { style: ui.cardHint }, '还没有登记过昔涟会话；在会话里说一句话就会出现在这里。')
              : h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 } },
                dreamSessions.map((session) => {
                  const label = session.title
                    || (session.lastUserText ? String(session.lastUserText).slice(0, 32) : `会话 ${session.shortId ?? String(session.id).slice(0, 8)}`)
                  const meta = [
                    session.cwd ? baseName(session.cwd) : '',
                    session.shortId ?? String(session.id).slice(0, 8),
                    session.lastActiveAt || session.createdAt
                      ? new Date(Number(session.lastActiveAt || session.createdAt)).toLocaleString()
                      : '',
                    session.scheduled ? '已排程' : '',
                    session.registered === false ? '未登记' : '',
                  ].filter(Boolean).join(' · ')
                  return h(
                    'div',
                    {
                      key: session.id,
                      style: {
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        padding: '7px 10px',
                        border: `1px solid ${c.border}`,
                        borderRadius: 8,
                        background: c.layer2,
                        minWidth: 0,
                        cursor: openSession ? 'pointer' : 'default',
                      },
                      title: '点击打开这个会话',
                      onClick: () => {
                        if (typeof openSession === 'function') openSession(session.id)
                      },
                    },
                    h('input', {
                      type: 'checkbox',
                      style: { ...ui.check, marginTop: 2 },
                      checked: session.enabled === true,
                      disabled: busy !== '',
                      onClick: (event) => event.stopPropagation(),
                      onChange: (event) => void toggleDreamSession(session, event.target.checked),
                    }),
                    h(
                      'div',
                      { style: { minWidth: 0, flex: 1 } },
                      h(
                        'div',
                        { style: { fontSize: 13, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                        h('span', { style: { color: session.live ? c.success : c.text3 } }, session.live ? '● ' : '○ '),
                        label
                      ),
                      h('div', { style: { fontSize: 11, color: c.text3, lineHeight: 1.5, wordBreak: 'break-all' } }, meta)
                    )
                  )
                })
              ),
            h(
              'div',
              { style: ui.fieldGrid },
              h(Switch, { caption: '启用夜梦', checked: dreamCfg.enabled, onChange: (v) => patch('dream', 'enabled', v) }),
              h(Field, { caption: '夜梦时间', value: dreamCfg.time, placeholder: '23:30:00', onChange: (v) => patch('dream', 'time', v) }),
              h(Field, { caption: '维护间隔（分钟）', type: 'number', value: backupCfg.intervalMinutes, onChange: (v) => patch('backup', 'intervalMinutes', v) }),
              h(Field, { caption: '每日快照时点（0-23）', type: 'number', value: backupCfg.snapshotHour, onChange: (v) => patch('backup', 'snapshotHour', v) }),
              h(Field, { caption: '保留份数', type: 'number', value: backupCfg.keep, onChange: (v) => patch('backup', 'keep', v) })
            ),
            h(
              'div',
              { style: { ...ui.toolbar, marginTop: 12 } },
              h(Btn, { primary: true, disabled, onClick: () => void save() }, busy === 'save' ? '保存中…' : '保存设置'),
              h('span', { style: ui.cardHint }, 'Token 只从环境变量读，不写入设置文件')
            )
          )
        ),
        h(
          'div',
          { style: ui.footnote },
          `夜梦 ${dream.time ?? '—'} ${dream.timeZone ?? ''} · 任务 ${dream.schedules ?? 0} 个 · 记忆根与设置文件可手动备份；恢复手册见 docs/RECOVERY.md`
        )
      )
    }

    // ── 会话头小徽标 ────────────────────────────────────────────────────────
    const chipStyle = {
      padding: '2px 8px',
      borderRadius: 999,
      border: `1px solid ${c.border}`,
      background: 'transparent',
      color: c.text2,
      cursor: 'pointer',
      fontSize: 12,
      whiteSpace: 'nowrap',
    }

    function HeaderChip(props) {
      const sessionId = props?.sessionId
      const [info, setInfo] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')

      const refresh = React.useCallback(async () => {
        if (typeof sessionId !== 'string' || sessionId === '') return
        try {
          const res = await fetch(`${API}/session?sessionId=${encodeURIComponent(sessionId)}`, { headers: { accept: 'application/json' } })
          if (!res.ok) return
          setInfo(await res.json())
        } catch {
          /* 静默：徽标不是关键路径 */
        }
      }, [sessionId])

      React.useEffect(() => {
        void refresh()
        const timer = setInterval(() => void refresh(), 60000)
        return () => clearInterval(timer)
      }, [refresh])

      React.useEffect(() => {
        if (note === '') return undefined
        const timer = setTimeout(() => setNote(''), 4000)
        return () => clearTimeout(timer)
      }, [note])

      if (info === null) return null
      if (info.preset !== 'chat' && info.preset !== 'cyrene-work') return null
      const text = info.running ? '忆·梦中' : info.dreamedToday ? '忆·已整理' : '忆·待整理'
      const action = info.dreamedToday ? 'sync' : 'dream'
      const click = async () => {
        setBusy(true)
        setNote('')
        try {
          const result = await postAction(action)
          setNote(result.message ?? '完成')
          await refresh()
        } catch (error) {
          setNote(`失败：${error instanceof Error ? error.message : String(error)}`)
        } finally {
          setBusy(false)
        }
      }
      return h(
        'button',
        {
          style: chipStyle,
          title: note !== '' ? note : `昔涟记忆：${text}（点击${info.dreamedToday ? '同步思源' : '立即整理'}）`,
          disabled: busy || info.running === true,
          onClick: () => void click(),
        },
        busy ? '忆…' : text
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const openSession = (sessionId) => {
          try {
            ctx.get('uiWorkspace')?.openSession?.(sessionId)
          } catch {
            /* 打不开会话时不影响面板操作 */
          }
        }
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'dsh-cyrene-philia093-0', order: 90, label: '昔涟 · 一页永恒' },
            (props) => h(Panel, { ...props, openSession })
          )
        )
        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-cyrene-philia093-0', order: 15, label: '昔涟 · 一页永恒' }, HeaderChip)
        )
      },
    }
  },
})
