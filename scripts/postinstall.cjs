const { spawnSync } = require('node:child_process');

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npm', ['run', 'prisma:generate', '--workspace', '@tradeit/server']);

if (process.env.NODE_ENV !== 'production') {
  run('npm', ['run', 'build', '--workspace', '@tradeit/shared']);
} else {
  console.log('Skipping @tradeit/shared build during production install.');
}
