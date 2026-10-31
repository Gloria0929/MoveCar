/**
 * 本地开发：同时启动后端（--watch）与 Vite（HMR）。
 * 生产构建请用 npm run build。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const children = [];
let exiting = false;

function run(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => {
    if (exiting) return;
    console.log(`\n[${name}] 已退出（code ${code}），正在停止其余进程`);
    shutdown();
  });
  children.push(child);
  return child;
}

function shutdown() {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('启动开发环境...');
run('server', process.execPath, ['--watch', 'server/src/index.js'], root);
run('web', process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], path.join(root, 'web'));
