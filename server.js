const express = require('express')
const { WebSocketServer } = require('ws')
const pty = require('node-pty')
const http = require('http')
const path = require('path')
const os = require('os')

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

// Optional: serve the Next.js build (for production)
// app.use(express.static(path.join(__dirname, '.next')))

wss.on('connection', (ws, req) => {
  console.log('New terminal connection from', req.socket.remoteAddress)

  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'

  // Spawn a real shell
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: process.env,
  })

  // Shell output → browser
  ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }))
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }))
      ws.close()
    }
  })

  // Browser → shell
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message)

      if (msg.type === 'input') {
        ptyProcess.write(msg.data)
      } else if (msg.type === 'resize') {
        ptyProcess.resize(msg.cols, msg.rows)
      }
    } catch {
      // fallback: treat raw message as input
      ptyProcess.write(message.toString())
    }
  })

  ws.on('close', () => {
    console.log('Terminal connection closed')
    try { ptyProcess.kill() } catch {}
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
    try { ptyProcess.kill() } catch {}
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`\n🖥️  Terminal backend running on ws://localhost:${PORT}`)
  console.log(`   Start your Next.js frontend with: npm run dev\n`)
})
