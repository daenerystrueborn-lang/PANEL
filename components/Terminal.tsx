'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createShell, runCommand, ShellState } from './shell'
import styles from './Terminal.module.css'

interface Line {
  type: 'prompt' | 'output' | 'error' | 'banner'
  text: string
  cmd?: string
}

const BANNER = `
 ██╗    ██╗███████╗██████╗ ████████╗███████╗██████╗ ███╗   ███╗
 ██║    ██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
 ██║ █╗ ██║█████╗  ██████╔╝   ██║   █████╗  ██████╔╝██╔████╔██║
 ██║███╗██║██╔══╝  ██╔══██╗   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║
 ╚███╔███╔╝███████╗██████╔╝   ██║   ███████╗██║  ██║██║ ╚═╝ ██║
  ╚══╝╚══╝ ╚══════╝╚═════╝    ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝

 web terminal  •  type 'help' to get started  •  no AI, no key needed
 ─────────────────────────────────────────────────────────────────────
`.trim()

export default function Terminal() {
  const [lines, setLines] = useState<Line[]>([{ type: 'banner', text: BANNER }])
  const [input, setInput] = useState('')
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const shellRef = useRef<ShellState>(createShell())
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])
  useEffect(() => { inputRef.current?.focus() }, [])

  const getCwd = () => {
    const cwd = shellRef.current.cwd
    const home = shellRef.current.env.HOME
    return cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd
  }

  const [cwd, setCwd] = useState('~')

  const execute = useCallback((raw: string) => {
    const trimmed = raw.trim()
    const shell = shellRef.current

    // Record in shell history
    if (trimmed) {
      shell.history.push(trimmed)
      setCmdHistory(h => [trimmed, ...h])
    }
    setHistoryIndex(-1)

    const result = trimmed ? runCommand(shell, trimmed) : { output: '' }
    setCwd(getCwd())

    if (result.clear) {
      setLines([])
      return
    }

    setLines(l => {
      const next: Line[] = [...l, { type: 'prompt', text: trimmed, cmd: trimmed }]
      if (result.output) {
        const isError = result.output.startsWith('bash:') || result.output.includes(': No such') || result.output.includes('not found')
        next.push({ type: isError ? 'error' : 'output', text: result.output })
      }
      return next
    })
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const cmd = input
      setInput('')
      execute(cmd)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(historyIndex + 1, cmdHistory.length - 1)
      setHistoryIndex(next)
      setInput(cmdHistory[next] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(historyIndex - 1, -1)
      setHistoryIndex(next)
      setInput(next === -1 ? '' : cmdHistory[next])
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setLines([])
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      setLines(l => [...l, { type: 'prompt', text: input + '^C' }])
      setInput('')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // Basic tab completion
      const parts = input.split(' ')
      const last = parts[parts.length - 1]
      if (last) {
        // Try to complete filenames
        const shell = shellRef.current
        const dir = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : ''
        const prefix = last.includes('/') ? last.slice(last.lastIndexOf('/') + 1) : last
        const resolvedDir = dir
          ? (last.startsWith('/') ? dir : shell.cwd + '/' + dir)
          : shell.cwd
        const normalized = resolvedDir.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
        const node = normalized === '/' ? shell.fs : (() => {
          const p = normalized.split('/').filter(Boolean)
          let n: any = shell.fs
          for (const seg of p) { if (n?.type === 'dir') n = n.children[seg]; else return null }
          return n
        })()
        if (node?.type === 'dir') {
          const matches = Object.keys(node.children).filter(k => k.startsWith(prefix))
          if (matches.length === 1) {
            parts[parts.length - 1] = dir + matches[0]
            setInput(parts.join(' '))
          }
        }
      }
    }
  }

  const promptUser = shellRef.current.env.USER

  return (
    <div className={styles.container} onClick={() => inputRef.current?.focus()}>
      <div className={styles.titlebar}>
        <div className={styles.dots}>
          <span className={`${styles.dot} ${styles.red}`} />
          <span className={`${styles.dot} ${styles.yellow}`} />
          <span className={`${styles.dot} ${styles.green}`} />
        </div>
        <span className={styles.titleText}>{promptUser}@webterm: {cwd}</span>
        <div style={{ width: 60 }} />
      </div>

      <div className={styles.screen}>
        {lines.map((line, i) => (
          <div key={i}>
            {line.type === 'banner' && <pre className={styles.banner}>{line.text}</pre>}
            {line.type === 'prompt' && (
              <div className={styles.promptLine}>
                <span className={styles.pUser}>{promptUser}</span>
                <span className={styles.pAt}>@</span>
                <span className={styles.pHost}>webterm</span>
                <span className={styles.pColon}>:</span>
                <span className={styles.pDir}>{cwd}</span>
                <span className={styles.pDollar}>$</span>
                <span className={styles.pCmd}>{line.text}</span>
              </div>
            )}
            {line.type === 'output' && <pre className={styles.output}>{line.text}</pre>}
            {line.type === 'error' && <pre className={styles.errOut}>{line.text}</pre>}
          </div>
        ))}

        <div className={styles.inputRow}>
          <span className={styles.pUser}>{promptUser}</span>
          <span className={styles.pAt}>@</span>
          <span className={styles.pHost}>webterm</span>
          <span className={styles.pColon}>:</span>
          <span className={styles.pDir}>{cwd}</span>
          <span className={styles.pDollar}>$</span>
          <input
            ref={inputRef}
            className={styles.inputField}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
