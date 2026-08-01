import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const helperPath = path.join(repositoryRoot, 'scripts', 'lib', 'service-recovery.sh');
const temporaryDirectories = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
    ));
});

async function runScenario(commandExitStatus) {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'ttp-service-recovery-'));
    temporaryDirectories.push(temporaryDirectory);

    const serviceLog = path.join(temporaryDirectory, 'systemctl.log');
    const fakeSystemctl = path.join(temporaryDirectory, 'systemctl');
    const fakeCommand = path.join(temporaryDirectory, 'migration-command');

    await writeFile(fakeSystemctl, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "$SERVICE_LOG"\n`);
    await writeFile(fakeCommand, `#!/usr/bin/env bash\nexit ${commandExitStatus}\n`);
    await chmod(fakeSystemctl, 0o755);
    await chmod(fakeCommand, 0o755);

    const result = spawnSync(
        'bash',
        [
            '-c',
            'source "$1" && run_with_service_recovery ttp-worker ttp-api -- "$2"',
            '--',
            helperPath,
            fakeCommand,
        ],
        {
            cwd: repositoryRoot,
            env: {
                ...process.env,
                SERVICE_LOG: serviceLog,
                SYSTEMCTL_BIN: fakeSystemctl,
            },
            encoding: 'utf8',
        },
    );

    const systemctlCalls = await readFile(serviceLog, 'utf8').catch(() => '');
    return {
        status: result.status,
        stderr: result.stderr,
        systemctlCalls: systemctlCalls.trim().split('\n').filter(Boolean),
    };
}

test('restarts the existing services when the migration command fails', async () => {
    const result = await runScenario(42);

    assert.equal(result.status, 42, result.stderr);
    assert.deepEqual(result.systemctlCalls, [
        'stop ttp-worker ttp-api',
        'restart ttp-worker ttp-api',
    ]);
});

test('leaves services stopped for release activation when the migration succeeds', async () => {
    const result = await runScenario(0);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.systemctlCalls, [
        'stop ttp-worker ttp-api',
    ]);
});
