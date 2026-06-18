const c = {
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  dim:    '\x1b[2m',
  reset:  '\x1b[0m',
};

function ts() {
  return `${c.dim}${new Date().toLocaleTimeString('pl-PL')}${c.reset}`;
}

export const logger = {
  info:    (msg: string) => console.log(`${ts()} ${c.cyan}[INFO]${c.reset}  ${msg}`),
  ok:      (msg: string) => console.log(`${ts()} ${c.green}[OK]${c.reset}    ${msg}`),
  warn:    (msg: string) => console.warn(`${ts()} ${c.yellow}[WARN]${c.reset}  ${msg}`),
  error:   (msg: string) => console.error(`${ts()} ${c.red}[ERROR]${c.reset} ${msg}`),
  section: (msg: string) => console.log(`\n${c.cyan}${'─'.repeat(50)}${c.reset}\n  ${msg}\n${c.cyan}${'─'.repeat(50)}${c.reset}`),
};
