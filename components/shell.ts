export type FSNode =
  | { type: 'file'; content: string }
  | { type: 'dir'; children: Record<string, FSNode> }

export type FS = { type: 'dir'; children: Record<string, FSNode> }

export interface ShellState {
  fs: FS
  cwd: string
  env: Record<string, string>
  history: string[]
}

// ─── Filesystem helpers ───────────────────────────────────────────────────────

export const createFS = (): FS => ({
  type: 'dir',
  children: {
    home: {
      type: 'dir',
      children: {
        user: {
          type: 'dir',
          children: {
            Desktop: { type: 'dir', children: {} },
            Downloads: { type: 'dir', children: {} },
            Documents: {
              type: 'dir',
              children: {
                'notes.txt': { type: 'file', content: 'Remember to drink water.\nStay curious.\n' },
                'todo.txt':  { type: 'file', content: '[ ] Build something cool\n[x] Deploy to Vercel\n' },
              },
            },
            Projects: {
              type: 'dir',
              children: {
                'web-terminal': {
                  type: 'dir',
                  children: {
                    'README.md':    { type: 'file', content: '# web-terminal\nA browser-based terminal emulator.\n' },
                    'package.json': { type: 'file', content: '{\n  "name": "web-terminal",\n  "version": "1.0.0"\n}\n' },
                  },
                },
              },
            },
            '.bashrc':  { type: 'file', content: '# .bashrc\nexport PATH="$HOME/.local/bin:$PATH"\nalias ll="ls -la"\n' },
            '.profile': { type: 'file', content: '# .profile\n# User profile settings\n' },
          },
        },
      },
    },
    etc: {
      type: 'dir',
      children: {
        hostname:     { type: 'file', content: 'webterm\n' },
        'os-release': { type: 'file', content: 'NAME="WebTermOS"\nVERSION="1.0"\nID=webterm\n' },
      },
    },
    tmp: { type: 'dir', children: {} },
    var: { type: 'dir', children: {} },
  },
})

function normalizePath(p: string): string {
  const stack: string[] = []
  for (const part of p.split('/').filter(Boolean)) {
    if (part === '..') stack.pop()
    else if (part !== '.') stack.push(part)
  }
  return '/' + stack.join('/')
}

function resolvePath(_fs: FS, cwd: string, target: string): string {
  return target.startsWith('/') ? normalizePath(target) : normalizePath(cwd + '/' + target)
}

function getNode(fs: FS, path: string): FSNode | null {
  if (path === '/') return fs
  let node: FSNode = fs
  for (const part of path.split('/').filter(Boolean)) {
    if (node.type !== 'dir') return null
    const child: FSNode | undefined = node.children[part]
    if (!child) return null
    node = child
  }
  return node
}

function setNode(fs: FS, path: string, node: FSNode): boolean {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return false
  let cur: FSNode = fs
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur.type !== 'dir') return false
    const child: FSNode | undefined = cur.children[parts[i]]
    if (!child) return false
    cur = child
  }
  if (cur.type !== 'dir') return false
  cur.children[parts[parts.length - 1]] = node
  return true
}

function deleteNode(fs: FS, path: string): boolean {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return false
  let cur: FSNode = fs
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur.type !== 'dir') return false
    const child: FSNode | undefined = cur.children[parts[i]]
    if (!child) return false
    cur = child
  }
  if (cur.type !== 'dir') return false
  const name = parts[parts.length - 1]
  if (!(name in cur.children)) return false
  delete cur.children[name]
  return true
}

function dirName(p: string): string {
  const parts = p.split('/').filter(Boolean)
  parts.pop()
  return '/' + parts.join('/')
}

// Top-level helper — NOT inside a switch block (strict mode forbids that)
function walkFS(node: FSNode, path: string, results: string[]): void {
  results.push(path)
  if (node.type === 'dir') {
    for (const [name, child] of Object.entries(node.children)) {
      walkFS(child, path + '/' + name, results)
    }
  }
}

function parseTokens(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) { tokens.push(current); current = '' }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

// ─── Shell factory ────────────────────────────────────────────────────────────

export function createShell(): ShellState {
  return {
    fs: createFS(),
    cwd: '/home/user',
    env: {
      HOME:  '/home/user',
      USER:  'user',
      SHELL: '/bin/bash',
      TERM:  'xterm-256color',
      PATH:  '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      LANG:  'en_US.UTF-8',
    },
    history: [],
  }
}

// ─── Command runner ───────────────────────────────────────────────────────────

export function runCommand(state: ShellState, raw: string): { output: string; clear?: boolean } {
  const trimmed = raw.trim()
  if (!trimmed) return { output: '' }

  if (trimmed.includes(' && ')) {
    let out = ''
    for (const part of trimmed.split(' && ')) {
      const res = runCommand(state, part.trim())
      if (res.output) out += (out ? '\n' : '') + res.output
    }
    return { output: out }
  }

  const expanded = trimmed.replace(/\$(\w+)/g, (_, k: string) => state.env[k] ?? '')
  const tokens = parseTokens(expanded)
  if (tokens.length === 0) return { output: '' }

  const [cmd, ...args] = tokens

  switch (cmd) {
    case 'clear':    return { output: '', clear: true }
    case 'pwd':      return { output: state.cwd }
    case 'whoami':   return { output: state.env.USER }
    case 'hostname': return { output: 'webterm' }
    case 'date':     return { output: new Date().toString() }
    case 'uptime':   return { output: 'up 42 days, 7:13,  1 user,  load average: 0.08, 0.12, 0.10' }

    case 'uname': {
      if (args.includes('-a')) return { output: 'Linux webterm 5.15.0 #1 SMP x86_64 GNU/Linux' }
      if (args.includes('-r')) return { output: '5.15.0' }
      return { output: 'Linux' }
    }

    case 'echo':   return { output: args.join(' ').replace(/^['"]|['"]$/g, '') }
    case 'printf': return { output: args.slice(1).join(' ') }

    case 'env': {
      return { output: Object.entries(state.env).map(([k, v]) => `${k}=${v}`).join('\n') }
    }

    case 'export': {
      for (const arg of args) {
        const eq = arg.indexOf('=')
        if (eq > 0) state.env[arg.slice(0, eq)] = arg.slice(eq + 1)
      }
      return { output: '' }
    }

    case 'cd': {
      const target = args[0] ?? state.env.HOME
      const resolved = resolvePath(state.fs, state.cwd, target)
      const node = getNode(state.fs, resolved)
      if (!node) return { output: `bash: cd: ${target}: No such file or directory` }
      if (node.type !== 'dir') return { output: `bash: cd: ${target}: Not a directory` }
      state.cwd = resolved
      return { output: '' }
    }

    case 'ls': {
      const flags = args.filter(a => a.startsWith('-')).join('')
      const paths = args.filter(a => !a.startsWith('-'))
      const target = paths[0] ?? state.cwd
      const resolved = resolvePath(state.fs, state.cwd, target)
      const node = getNode(state.fs, resolved)
      if (!node) return { output: `ls: cannot access '${target}': No such file or directory` }
      if (node.type === 'file') return { output: target }
      let entries = Object.entries(node.children)
      if (!flags.includes('a')) entries = entries.filter(([n]) => !n.startsWith('.'))
      if (flags.includes('l')) {
        const lines = entries.map(([name, n]) => {
          const isDir = n.type === 'dir'
          const perm = isDir ? 'drwxr-xr-x' : '-rw-r--r--'
          const size = isDir ? '4096' : String((n as { type: 'file'; content: string }).content.length).padStart(6)
          return `${perm}  1 user user ${size} Apr 20 10:32 ${name}${isDir ? '/' : ''}`
        })
        return { output: lines.join('\n') }
      }
      return { output: entries.map(([n, nd]) => nd.type === 'dir' ? n + '/' : n).join('  ') }
    }

    case 'cat': {
      if (args.length === 0) return { output: '' }
      const out: string[] = []
      for (const arg of args) {
        const node = getNode(state.fs, resolvePath(state.fs, state.cwd, arg))
        if (!node) { out.push(`cat: ${arg}: No such file or directory`); continue }
        if (node.type === 'dir') { out.push(`cat: ${arg}: Is a directory`); continue }
        out.push(node.content.replace(/\n$/, ''))
      }
      return { output: out.join('\n') }
    }

    case 'head': {
      const nIdx = args.indexOf('-n')
      const n = nIdx >= 0 ? parseInt(args[nIdx + 1]) || 10 : 10
      const file = args.find(a => !a.startsWith('-') && a !== String(n))
      if (!file) return { output: '' }
      const node = getNode(state.fs, resolvePath(state.fs, state.cwd, file))
      if (!node || node.type !== 'file') return { output: `head: ${file}: No such file or directory` }
      return { output: node.content.split('\n').slice(0, n).join('\n') }
    }

    case 'tail': {
      const nIdx = args.indexOf('-n')
      const n = nIdx >= 0 ? parseInt(args[nIdx + 1]) || 10 : 10
      const file = args.find(a => !a.startsWith('-') && a !== String(n))
      if (!file) return { output: '' }
      const node = getNode(state.fs, resolvePath(state.fs, state.cwd, file))
      if (!node || node.type !== 'file') return { output: `tail: ${file}: No such file or directory` }
      return { output: node.content.split('\n').slice(-n).join('\n') }
    }

    case 'wc': {
      const file = args.find(a => !a.startsWith('-'))
      if (!file) return { output: '' }
      const node = getNode(state.fs, resolvePath(state.fs, state.cwd, file))
      if (!node || node.type !== 'file') return { output: `wc: ${file}: No such file or directory` }
      const lines = node.content.split('\n').length
      const words = node.content.split(/\s+/).filter(Boolean).length
      return { output: ` ${lines} ${words} ${node.content.length} ${file}` }
    }

    case 'touch': {
      if (args.length === 0) return { output: 'touch: missing file operand' }
      for (const arg of args) {
        const p = resolvePath(state.fs, state.cwd, arg)
        if (!getNode(state.fs, p)) setNode(state.fs, p, { type: 'file', content: '' })
      }
      return { output: '' }
    }

    case 'mkdir': {
      const p = args.find(a => !a.startsWith('-'))
      if (!p) return { output: 'mkdir: missing operand' }
      const resolved = resolvePath(state.fs, state.cwd, p)
      if (getNode(state.fs, resolved)) return { output: `mkdir: cannot create directory '${p}': File exists` }
      const parent = getNode(state.fs, dirName(resolved))
      if (!parent || parent.type !== 'dir') return { output: `mkdir: cannot create directory '${p}': No such file or directory` }
      setNode(state.fs, resolved, { type: 'dir', children: {} })
      return { output: '' }
    }

    case 'rmdir': {
      const p = args[0]
      if (!p) return { output: 'rmdir: missing operand' }
      const resolved = resolvePath(state.fs, state.cwd, p)
      const node = getNode(state.fs, resolved)
      if (!node) return { output: `rmdir: failed to remove '${p}': No such file or directory` }
      if (node.type !== 'dir') return { output: `rmdir: failed to remove '${p}': Not a directory` }
      if (Object.keys(node.children).length > 0) return { output: `rmdir: failed to remove '${p}': Directory not empty` }
      deleteNode(state.fs, resolved)
      return { output: '' }
    }

    case 'rm': {
      const flags = args.filter(a => a.startsWith('-')).join('')
      for (const t of args.filter(a => !a.startsWith('-'))) {
        const resolved = resolvePath(state.fs, state.cwd, t)
        const node = getNode(state.fs, resolved)
        if (!node) {
          if (!flags.includes('f')) return { output: `rm: cannot remove '${t}': No such file or directory` }
          continue
        }
        if (node.type === 'dir' && !flags.includes('r')) return { output: `rm: cannot remove '${t}': Is a directory` }
        deleteNode(state.fs, resolved)
      }
      return { output: '' }
    }

    case 'cp': {
      if (args.length < 2) return { output: 'cp: missing destination file operand' }
      const srcNode = getNode(state.fs, resolvePath(state.fs, state.cwd, args[0]))
      if (!srcNode) return { output: `cp: cannot stat '${args[0]}': No such file or directory` }
      setNode(state.fs, resolvePath(state.fs, state.cwd, args[1]), JSON.parse(JSON.stringify(srcNode)) as FSNode)
      return { output: '' }
    }

    case 'mv': {
      if (args.length < 2) return { output: 'mv: missing destination file operand' }
      const srcPath = resolvePath(state.fs, state.cwd, args[0])
      const srcNode = getNode(state.fs, srcPath)
      if (!srcNode) return { output: `mv: cannot stat '${args[0]}': No such file or directory` }
      setNode(state.fs, resolvePath(state.fs, state.cwd, args[1]), srcNode)
      deleteNode(state.fs, srcPath)
      return { output: '' }
    }

    case 'find': {
      const dir = args.find(a => !a.startsWith('-')) ?? state.cwd
      const resolved = resolvePath(state.fs, state.cwd, dir)
      const results: string[] = []
      const root = getNode(state.fs, resolved)
      if (root) walkFS(root, dir === '.' ? '.' : resolved, results)
      return { output: results.join('\n') }
    }

    case 'grep': {
      if (args.length < 2) return { output: 'grep: usage: grep PATTERN FILE' }
      const flags = args.filter(a => a.startsWith('-')).join('')
      const nonFlags = args.filter(a => !a.startsWith('-'))
      const [pattern, ...files] = nonFlags
      const results: string[] = []
      for (const f of files) {
        const node = getNode(state.fs, resolvePath(state.fs, state.cwd, f))
        if (!node || node.type !== 'file') { results.push(`grep: ${f}: No such file or directory`); continue }
        const re = new RegExp(pattern, flags.includes('i') ? 'i' : '')
        node.content.split('\n').forEach((line, i) => {
          if (re.test(line)) {
            results.push(`${files.length > 1 ? f + ':' : ''}${flags.includes('n') ? (i + 1) + ':' : ''}${line}`)
          }
        })
      }
      return { output: results.join('\n') }
    }

    case 'which': {
      const bins: Record<string, string> = {
        bash: '/bin/bash', ls: '/bin/ls', cat: '/bin/cat', echo: '/bin/echo',
        pwd: '/bin/pwd', cd: '/usr/bin/cd', mkdir: '/bin/mkdir', rm: '/bin/rm',
        cp: '/bin/cp', mv: '/bin/mv', grep: '/bin/grep', find: '/usr/bin/find',
        touch: '/usr/bin/touch', node: '/usr/local/bin/node', npm: '/usr/local/bin/npm',
        git: '/usr/bin/git', python3: '/usr/bin/python3',
      }
      return { output: args.map(a => bins[a] ?? `${a} not found`).join('\n') }
    }

    case 'man': {
      const pages: Record<string, string> = {
        ls:    'ls - list directory contents\nUsage: ls [-la] [path]',
        cd:    'cd - change directory\nUsage: cd [path]',
        cat:   'cat - concatenate and print files\nUsage: cat [file...]',
        grep:  'grep - search for a pattern\nUsage: grep [-in] PATTERN FILE',
        echo:  'echo - display a line of text\nUsage: echo [text]',
        rm:    'rm - remove files\nUsage: rm [-rf] file...',
        mkdir: 'mkdir - make directories\nUsage: mkdir dir...',
      }
      return { output: pages[args[0]] ?? `No manual entry for ${args[0]}` }
    }

    case 'history': {
      return { output: state.history.map((c, i) => `  ${String(i + 1).padStart(3)}  ${c}`).join('\n') }
    }

    case 'alias':    return { output: "alias ll='ls -la'\nalias la='ls -a'\nalias ..='cd ..'" }
    case 'ps':       return { output: '  PID TTY          TIME CMD\n    1 pts/0    00:00:00 bash\n   42 pts/0    00:00:00 ps' }
    case 'df':       return { output: 'Filesystem      Size  Used Avail Use% Mounted on\ntmpfs           100M  1.2M   99M   2% /\n/dev/sda1        20G  4.5G   15G  24% /home' }
    case 'free':     return { output: '              total        used        free\nMem:        8085464     3241024     4844440\nSwap:       2097148           0     2097148' }

    case 'top': {
      return { output: `top - ${new Date().toTimeString().slice(0, 8)} up 42 days\nTasks: 1 total, 1 running\n%Cpu(s): 2.1 us, 0.5 sy\nMiB Mem: 7890.0 total, 4200.0 free\n\n  PID USER  %CPU %MEM COMMAND\n    1 user   0.0  0.1 bash` }
    }

    case 'du': return { output: `4\t${args.find(a => !a.startsWith('-')) ?? '.'}` }

    case 'ping': {
      if (!args[0]) return { output: 'ping: missing host operand' }
      const h = args[0]
      return { output: `PING ${h}: 56 data bytes\n64 bytes from ${h}: icmp_seq=0 ttl=57 time=12.4 ms\n64 bytes from ${h}: icmp_seq=1 ttl=57 time=11.8 ms\n--- ${h} ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss` }
    }

    case 'curl': {
      return { output: `curl: (6) Could not resolve host: ${args.find(a => !a.startsWith('-')) ?? '(none)'}` }
    }

    case 'git': {
      const sub = args[0]
      if (sub === 'status') return { output: "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean" }
      if (sub === 'log')    return { output: 'commit a1b2c3d (HEAD -> main)\nAuthor: user <user@webterm>\nDate:   Mon Apr 21 10:00:00 2025\n\n    Initial commit' }
      if (sub === 'branch') return { output: '* main' }
      if (sub === 'init')   return { output: `Initialized empty Git repository in ${state.cwd}/.git/` }
      return { output: `git: '${sub}' is a valid command. See 'git help'.` }
    }

    case 'node': {
      if (args[0] === '--version' || args[0] === '-v') return { output: 'v20.11.0' }
      return { output: 'Welcome to Node.js v20.11.0.\nType ".exit" to exit the REPL.' }
    }

    case 'npm': {
      if (args[0] === '--version' || args[0] === '-v') return { output: '10.2.4' }
      if (args[0] === 'install' || args[0] === 'i')   return { output: '\nadded 0 packages in 0.5s' }
      return { output: `npm: unknown command '${args[0]}'` }
    }

    case 'python3': {
      if (args[0] === '--version' || args[0] === '-V') return { output: 'Python 3.11.6' }
      return { output: 'Python 3.11.6 (main)\nType "help" for more information.' }
    }

    case 'help': {
      return {
        output: [
          'Available commands:',
          '',
          '  Navigation    cd, ls, pwd, find',
          '  Files         cat, touch, mkdir, rm, rmdir, cp, mv, head, tail, wc, grep',
          '  System        whoami, hostname, uname, date, uptime, ps, top, df, du, free',
          '  Environment   echo, printf, env, export, alias',
          '  Network       ping, curl',
          '  Dev           git, node, npm, python3, which, man',
          '  Shell         history, clear, help',
          '',
          '  Keyboard      Ctrl+C  cancel  |  Ctrl+L  clear  |  ↑↓  history  |  Tab  complete',
        ].join('\n'),
      }
    }

    default:
      return { output: `bash: ${cmd}: command not found` }
  }
}
