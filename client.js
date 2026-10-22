/**
 * 昔涟（PHILIA093）· Client 插件
 *
 * 与退役的一页永恒面板同构（自注册 lazy factory）：
 *  1. 设置里加「昔涟 · 一页永恒」：四问锚点、条目/配额、思源镜像、夜梦、备份状态；
 *  2. 立即同步思源 / 立即备份 / 立即整理 三个按钮；
 *  3. 思源与定时的常用配置直接在这里改（保存到 元/settings.json，重启生效）。
 *
 * 不 import 任何 @deepseek-ai/dsh-client-*；React 从浏览器模块表 require。
 */
window.__ModuleLoader__.load({
  id: 'dsh-cyrene-philia093-0',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const API = '/dsh-cyrene-philia093-0'

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

    const card = {
      border: '1px solid var(--dsw-alias-border, #ddd)',
      borderRadius: 10,
      padding: '12px 14px',
      marginBottom: 12,
      background: 'var(--dsw-alias-surface, transparent)',
    }
    const muted = { opacity: 0.65, fontSize: 12 }
    const row = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }
    const btn = {
      padding: '4px 10px',
      borderRadius: 6,
      border: '1px solid var(--dsw-alias-border, #ccc)',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
    }
    const pre = {
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      margin: 0,
      fontFamily: 'inherit',
      fontSize: 13,
      lineHeight: 1.6,
    }
    const label = { display: 'block', fontSize: 12, opacity: 0.75, marginBottom: 2 }
    const input = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '4px 8px',
      borderRadius: 6,
      border: '1px solid var(--dsw-alias-border, #ccc)',
      background: 'transparent',
      color: 'inherit',
      fontSize: 13,
    }
    const field = { minWidth: 180, flex: '1 1 180px', marginBottom: 8 }

    function FormField({ name, caption, value, onChange, type = 'text' }) {
      const isBool = type === 'boolean'
      return h(
        'label',
        { style: field },
        h('span', { style: label }, caption),
        isBool
          ? h('input', { type: 'checkbox', checked: value === true, onChange: (event) => onChange(event.target.checked) })
          : h('input', {
            style: input,
            type,
            value: value ?? '',
            onChange: (event) => onChange(event.target.value),
          })
      )
    }

    function Panel() {
      const [state, setState] = React.useState({ loading: true, error: '', data: null })
      const [busy, setBusy] = React.useState('')
      const [notice, setNotice] = React.useState('')
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
        setNotice('')
        try {
          const result = await postAction(action)
          setNotice(result.message ?? '完成')
          await refresh()
        } catch (error) {
          setNotice(`失败：${error instanceof Error ? error.message : String(error)}`)
        } finally {
          setBusy('')
        }
      }

      const save = async () => {
        setBusy('save')
        setNotice('')
        try {
          const result = await postAction('save-config', { config: form })
          setNotice(result.message ?? '已保存')
        } catch (error) {
          setNotice(`失败：${error instanceof Error ? error.message : String(error)}`)
        } finally {
          setBusy('')
        }
      }

      const patch = (section, key, value) => {
        setForm((current) => ({ ...current, [section]: { ...current?.[section], [key]: value } }))
      }

      if (state.loading) return h('div', { style: card }, '昔涟 · 一页永恒：读取中…')
      if (state.error !== '') {
        return h(
          'div',
          { style: card },
          h('div', null, '昔涟 · 一页永恒：读取失败'),
          h('div', { style: muted }, state.error),
          h('button', { style: btn, onClick: refresh }, '重试')
        )
      }
      const d = state.data ?? {}
      const anchors = d.anchors ?? {}
      const quota = d.quota ?? {}
      const mirror = d.mirror ?? {}
      const dream = d.dream ?? {}
      const backup = d.backup ?? {}
      const current = form ?? d.config ?? {}
      return h(
        'div',
        null,
        h(
          'div',
          { style: card },
          h('div', { style: { fontWeight: 600, marginBottom: 8 } }, '昔涟 · 一页永恒'),
          h('pre', { style: pre },
            `我是谁：${anchors.self || '（空）'}\n你是谁：${anchors.user || '（空）'}\n` +
            `我从哪里来：${anchors.origin || '（空）'}\n我要到哪里去：${anchors.goal || '（空）'}`),
          h('div', { style: { ...muted, marginTop: 6 } }, `根目录：${d.root ?? '—'}${d.settingsOverride ? '（元/settings.json 已覆盖行配置）' : ''}`)
        ),
        h(
          'div',
          { style: card },
          h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '状态'),
          h('div', { style: pre },
            `条目 ${d.entries?.total ?? 0}（活跃 ${d.entries?.active ?? 0}｜归档 ${d.entries?.archived ?? 0}｜待定 ${d.entries?.pending ?? 0}）\n` +
            `配额 ${(quota.usedMB ?? 0).toFixed(2)} / ${quota.limitMB ?? 0} MB（余页 ${(quota.freeUsedMB ?? 0).toFixed(2)} / ${quota.freeLimitMB ?? 0} MB）\n` +
            `思源镜像 ${mirror.enabled ? '已开启' : '关闭'}｜${mirror.notebook ?? '—'}｜${mirror.baseURL ?? '—'}｜上次 ${mirror.lastSync || '尚未同步'}${mirror.lastError ? `｜上次失败：${mirror.lastError}` : ''}\n` +
            `夜梦 ${dream.time ?? '—'} ${dream.timeZone ?? ''}｜今日已整理 ${dream.dreamedToday === true}｜任务 ${dream.schedules ?? 0}\n` +
            `备份 每 ${backup.intervalMinutes ?? 30} 分钟｜${backup.snapshotHour ?? 3} 点快照｜保留 ${backup.keep ?? 7} 份`)
        ),
        h(
          'div',
          { style: card },
          h('div', { style: { fontWeight: 600, marginBottom: 8 } }, '操作'),
          h(
            'div',
            { style: row },
            h('button', { style: btn, disabled: busy !== '', onClick: () => void run('sync') }, busy === 'sync' ? '同步中…' : '立即同步思源'),
            h('button', { style: btn, disabled: busy !== '', onClick: () => void run('backup') }, busy === 'backup' ? '备份中…' : '立即备份'),
            h('button', { style: btn, disabled: busy !== '', onClick: () => void run('dream') }, busy === 'dream' ? '启动中…' : '立即整理'),
            h('button', { style: btn, onClick: refresh }, '刷新')
          ),
          notice === '' ? null : h('div', { style: { ...muted, marginTop: 8 } }, notice)
        ),
        h(
          'div',
          { style: card },
          h('div', { style: { fontWeight: 600, marginBottom: 8 } }, '设置（保存到 元/settings.json，重启后生效）'),
          h('div', { style: row },
            h(FormField, { caption: '思源镜像', value: current.siyuan?.enabled, type: 'boolean', onChange: (v) => patch('siyuan', 'enabled', v) }),
            h(FormField, { caption: '地址', value: current.siyuan?.baseURL, onChange: (v) => patch('siyuan', 'baseURL', v) }),
            h(FormField, { caption: '笔记本', value: current.siyuan?.notebook, onChange: (v) => patch('siyuan', 'notebook', v) }),
            h(FormField, { caption: 'Token 环境变量名', value: current.siyuan?.tokenEnv, onChange: (v) => patch('siyuan', 'tokenEnv', v) })
          ),
          h('div', { style: row },
            h(FormField, { caption: '维护间隔（分钟）', value: current.backup?.intervalMinutes, type: 'number', onChange: (v) => patch('backup', 'intervalMinutes', Number(v)) }),
            h(FormField, { caption: '每日快照时点（0-23）', value: current.backup?.snapshotHour, type: 'number', onChange: (v) => patch('backup', 'snapshotHour', Number(v)) }),
            h(FormField, { caption: '保留份数', value: current.backup?.keep, type: 'number', onChange: (v) => patch('backup', 'keep', Number(v)) }),
            h(FormField, { caption: '夜梦时间', value: current.dream?.time, onChange: (v) => patch('dream', 'time', v) })
          ),
          h(
            'div',
            { style: row },
            h('button', { style: btn, disabled: busy !== '', onClick: () => void save() }, busy === 'save' ? '保存中…' : '保存设置'),
            h('div', { style: muted }, 'Token 本身只从环境变量读（默认 SIYUAN_API_TOKEN），不写进配置文件。')
          ),
          notice === '' ? null : h('div', { style: { ...muted, marginTop: 8 } }, notice)
        )
      )
    }

    /** 会话头小徽标：只在昔涟预设的会话里出现。 */
    const chipStyle = {
      padding: '2px 8px',
      borderRadius: 999,
      border: '1px solid var(--dsw-alias-border, #ccc)',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      fontSize: 12,
      opacity: 0.85,
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
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'dsh-cyrene-philia093-0', order: 90, label: '昔涟 · 一页永恒' }, Panel)
        )
        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-cyrene-philia093-0', order: 15, label: '昔涟 · 一页永恒' }, HeaderChip)
        )
      },
    }
  },
})
