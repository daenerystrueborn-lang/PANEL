'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './Terminal.module.css'

const BANNER = `
 ██╗    ██╗███████╗██████╗ ████████╗███████╗██████╗ ███╗   ███╗
 ██║    ██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
 ██║ █╗ ██║█████╗  ██████╔╝   ██║   █████╗  ██████╔╝██╔████╔██║
 ██║███╗██║██╔══╝  ██╔══██╗   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║
 ╚███╔███╔╝███████╗██████╔╝   ██║   ███████╗██║  ██║██║ ╚═╝ ██║
  ╚══╝╚══╝ ╚══════╝╚═════╝    ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝

 real terminal  •  connected to your machine via WebSocket
 ─────────────────────────────────────────────────────────────────────
`.trim()

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'

function AnsiText({ text }: { text: string }) {
  const parts: { text: string; style: React.CSSProperties }[] = []
  const ansiRegex = /\x1b\[([0-9;]*)m/g
  let lastIndex = 0
  let currentStyle: React.CSSProperties = {}

  const colorMap: Record<number, string> = {
    30: '#2e2e2e', 31: '#ff5f56', 32: '#27c93f', 33: '#ffbd2e',
    34: '#4d9de0', 35: '#c678dd', 36: '#56b6c2', 37: '#abb2bf',
    90: '#666',   91: '#ff6b6b', 92: '#98c379', 93: '#e5c07b',
    94: '#61afef', 95: '#c678dd', 96: '#56b6c2', 97: '#ffffff',
  }

  let match
  while ((match = ansiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), style: { ...currentStyle } })
    }
    const codes = match[1].split(';').map(Number)
    for (const code of codes) {
      if (code === 0) currentStyle = {}
      else if (code === 1) currentStyle = { ...currentStyle, fontWeight: 'bold' }
      else if (code === 2) currentStyle = { ...currentStyle, opacity: 0.6 }
      else if (code === 3) currentStyle = { ...currentStyle, fontStyle: 'italic' }
      else if (code === 4) currentStyle = { ...currentStyle, textDecoration: 'underline' }
      else if (colorMap[code]) currentStyle = { ...currentStyle, color: colorMap[code] }
      else if (code >= 40 && code <= 47) {
        const bg = colorMap[code - 10]
        if (bg) currentStyle = { ...currentStyle, backgroundColor: bg }
      }
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), style: { ...currentStyle } })
  }
  if (parts.length === 0) parts.push({ text, style: {} })

  return (
    <>
      {parts.map((p, i) => (
        <span key={i} style={p.style}>{p.text}</span>
      ))}
    </>
  )
}

export default function Terminal() {
  const [output, setOutput] = useState<string>(BANNER + '\n\n')
  const [input, setInput] = useState('')
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(true)

  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [output])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setConnecting(true)
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setConnecting(false)
      ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'output') {
          const clean = msg.data.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          setOutput(prev => prev + clean)
        } else if (msg.type === 'exit') {
          setOutput(prev => prev + '\n[Process exited]\n')
          setConnected(false)
        }
      } catch {
        setOutput(prev => prev + e.data)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      setConnecting(false)
      setOutput(prev => prev + '\n\x1b[31m[Disconnected from server]\x1b[0m\n')
    }

    ws.onerror = () => {
      setConnecting(false)
      setOutput(prev => prev + '\n\x1b[31m[Could not connect to terminal server]\x1b[0m\n\x1b[33m→ Run: node server.js\x1b[0m\n\n')
    }

    return () => ws.close()
  }, [])

  const sendInput = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: text }))
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const cmd = input
      if (cmd.trim()) setCmdHistory(h => [cmd, ...h])
      setHistoryIndex(-1)
      setInput('')
      sendInput(cmd + '\n')
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
    } else if (e.ctrlKey) {
      e.preventDefault()
      const ctrlMap: Record<string, string> = {
        c: '\x03', d: '\x04', z: '\x1a',
        a: '\x01', e: '\x05', k: '\x0b',
        u: '\x15', w: '\x17', r: '\x12',
        l: '\x0c',
      }
      const char = ctrlMap[e.key.toLowerCase()]
      if (char) {
        if (e.key.toLowerCase() === 'l') setOutput('')
        sendInput(char)
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      sendInput('\t')
    }
  }

  const lines = output.split('\n')

  return (
    <div className={styles.container} onClick={() => inputRef.current?.focus()}>
      <div className={styles.titlebar}>
        <div className={styles.dots}>
          <span className={`${styles.dot} ${styles.red}`} />
          <span className={`${styles.dot} ${styles.yellow}`} />
          <span className={`${styles.dot} ${styles.green}`} />
        </div>
        <span className={styles.titleText}>
          {connecting ? '⟳ connecting...' : connected ? '● real terminal' : '○ disconnected — run: node server.js'}
        </span>
        <div style={{ width: 60 }} />
      </div>

      <div className={styles.screen}>
        <pre className={styles.output}>
          {lines.map((line, i) => (
            <div key={i}>
              <AnsiText text={line} />
              {i < lines.length - 1 && '\n'}
            </div>
          ))}
        </pre>

        <div className={styles.inputRow}>
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
            placeholder={connected ? '' : 'not connected...'}
            disabled={!connected}
          />
        </div>

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
