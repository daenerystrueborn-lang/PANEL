# Web Terminal

A browser-based terminal emulator built with Next.js. **No AI, no API key needed.** Runs entirely in the browser with a built-in virtual filesystem.

## Features

- 30+ shell commands (ls, cd, cat, mkdir, rm, grep, git, node, python3...)
- Persistent virtual filesystem during the session
- Tab completion for filenames
- Command history (↑/↓)
- Ctrl+C and Ctrl+L shortcuts
- Zero external dependencies at runtime

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/web-terminal
cd web-terminal
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

```bash
# Option 1 — Dashboard
# Push to GitHub → vercel.com → New Project → Import repo → Deploy
# No environment variables needed!

# Option 2 — CLI
npm i -g vercel
vercel --prod
```

## Commands

| Command | Description |
|---------|-------------|
| `ls [-la]` | List files |
| `cd [path]` | Change directory |
| `cat [file]` | Print file contents |
| `mkdir`, `rmdir` | Create/remove directories |
| `rm [-rf]` | Remove files |
| `cp`, `mv` | Copy/move files |
| `touch` | Create empty file |
| `grep [pattern] [file]` | Search in files |
| `find [dir]` | Find files |
| `echo`, `printf` | Print text |
| `head`, `tail`, `wc` | File utilities |
| `ps`, `top`, `df`, `free` | System info |
| `git status/log/branch` | Git simulation |
| `node`, `npm`, `python3` | Dev tools |
| `clear` / Ctrl+L | Clear screen |
| `help` | Show all commands |
