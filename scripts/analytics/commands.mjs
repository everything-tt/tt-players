import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

function printable(command, args) {
  return [command, ...args].map((value) => JSON.stringify(value)).join(' ');
}

export function run(command, args, { env = process.env, input, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    env,
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `Command failed (${result.status}): ${printable(command, args)}\n${result.stderr || result.stdout}`.trim(),
    );
  }
  return result;
}

export async function runToFile(command, args, outputPath, { env = process.env } = {}) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = createWriteStream(outputPath, { mode: 0o600 });
  let stderr = '';
  let rows = 0;

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (stderr.length > 1024 * 1024) stderr = stderr.slice(-1024 * 1024);
  });
  child.stdout.on('data', (chunk) => {
    for (const byte of chunk) if (byte === 10) rows += 1;
  });
  child.stdout.pipe(output);

  const outputClosed = once(output, 'close');
  const [status] = await once(child, 'close');
  await outputClosed;
  if (status !== 0) {
    throw new Error(`Command failed (${status}): ${printable(command, args)}\n${stderr}`.trim());
  }
  return { rows };
}
