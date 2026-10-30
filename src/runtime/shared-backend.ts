import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { open, readdir, readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { NodeGatewayClient } from '../gateway/node-gateway-client.js'

const run = promisify(execFile)
export interface SharedBackend { readonly url: string; readonly pid: number }
export interface SharedBackendDescriptor { readonly version: 1; readonly workspace: string; readonly preferredPid?: number }

/** The descriptor contains no launch token. Authentication is read from the owner's private logs at connect time. */
export async function readSharedBackendDescriptor(file: string, workspace: string): Promise<SharedBackendDescriptor> {
  if (!path.isAbsolute(file)) throw new Error('Shared backend descriptor must be an absolute path.')
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > 65536 || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
      throw new Error('Shared backend descriptor must be a private, same-user file (0600).')
    }
    const value: unknown = JSON.parse(await handle.readFile('utf8'))
    if (value === null || typeof value !== 'object') throw new Error('Invalid shared backend descriptor.')
    const descriptor = value as Partial<SharedBackendDescriptor>
    if (descriptor.version !== 1 || typeof descriptor.workspace !== 'string' || !path.isAbsolute(descriptor.workspace)) {
      throw new Error('Invalid shared backend descriptor workspace.')
    }
    const actualWorkspace = await realpath(workspace).catch(() => '')
    const boundWorkspace = await realpath(descriptor.workspace).catch(() => '')
    if (actualWorkspace === '' || actualWorkspace !== boundWorkspace) throw new Error('Shared backend workspace does not match this window.')
    if (descriptor.preferredPid !== undefined && (!Number.isSafeInteger(descriptor.preferredPid) || descriptor.preferredPid <= 0)) {
      throw new Error('Invalid shared backend owner PID.')
    }
    return descriptor as SharedBackendDescriptor
  } finally { await handle.close() }
}

/** A newer boot invalidates all earlier URLs, including when the newer boot has not announced readiness. */
export function parseDesktopBoot(log: string, workspace: string): { url: string } | undefined {
  let matches = false
  let result: { url: string } | undefined
  for (const line of log.split(/\r?\n/u)) {
    const start = /\[host\].*\(cwd=(.*), model=/u.exec(line)
    if (start !== null) {
      matches = path.normalize(start[1] ?? '') === path.normalize(workspace)
      result = undefined
    }
    if (!matches) continue
    const announce = /dsh gateway:\s+(http:\/\/127\.0\.0\.1:(\d+)\/\?token=[A-Za-z0-9_-]+)/u.exec(line)
    if (announce?.[1] !== undefined && Number(announce[2]) > 0 && Number(announce[2]) <= 65535) result = { url: announce[1] }
  }
  return result
}

export function selectSharedBackend(candidates: readonly SharedBackend[], preferredPid?: number): SharedBackend {
  const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()]
  const preferred = unique.find((candidate) => candidate.pid === preferredPid)
  if (preferred !== undefined) return preferred
  if (unique.length === 1) return unique[0]!
  if (unique.length === 0) throw new Error('No running desktop DeepSeek 0.6.0 backend for this workspace. Open its desktop workbench, then reconnect.')
  throw new Error('Multiple desktop DeepSeek backends match this workspace. Pin the intended owner in the private connection descriptor.')
}

/** A recycled port is not proof of identity: discard historical launch tokens before choosing an owner. */
export async function selectAuthenticatedBackend(
  candidates: readonly SharedBackend[],
  preferredPid?: number,
  probe: (candidate: SharedBackend) => Promise<void> = (candidate) => new NodeGatewayClient(candidate.url, 5000).probe(),
): Promise<SharedBackend> {
  const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()]
  const eligible: SharedBackend[] = []
  for (const candidate of unique) {
    try { await probe(candidate); eligible.push(candidate) } catch { /* Do not expose token-bearing errors. */ }
  }
  return selectSharedBackend(eligible, preferredPid)
}

/** Discovers an already-running same-user desktop runtime. Never spawns, signals or modifies a Gateway. macOS only. */
export async function resolveSharedBackend(file: string, workspace: string): Promise<SharedBackend> {
  if (process.platform !== 'darwin') throw new Error('Desktop backend attachment currently supports macOS only.')
  const descriptor = await readSharedBackendDescriptor(file, workspace)
  const { stdout: processes } = await run('/bin/ps', ['-axo', 'pid=,uid=,command='], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 })
  const pids: number[] = []
  const desktopPrefix = path.join(homedir(), '.vscode', 'extensions', 'skymecode.deepseek-harness-for-vscode-0.6.0-')
  for (const line of processes.split('\n')) {
    const row = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line)
    if (row === null || Number(row[2]) !== process.getuid?.()) continue
    const command = row[3] ?? ''
    if (command.startsWith(desktopPrefix) && command.includes('/node_modules/@deepseek-ai/dsh/lib/bin.js web ')) pids.push(Number(row[1]))
  }
  const listeners = new Map<string, number>()
  for (const pid of pids) {
    try {
      const { stdout } = await run('/usr/sbin/lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-Fn'], { timeout: 5000 })
      for (const match of stdout.matchAll(/^n127\.0\.0\.1:(\d+)$/gmu)) listeners.set(match[1]!, pid)
    } catch { /* Exited owners are not eligible. */ }
  }
  const logsRoot = path.join(homedir(), 'Library', 'Application Support', 'Code', 'logs')
  const runs = (await readdir(logsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^\d{8}T\d{6}$/u.test(entry.name)).map((entry) => entry.name).sort().reverse()
  const candidates: SharedBackend[] = []
  for (const runName of runs) {
    const runRoot = path.join(logsRoot, runName)
    const windows = (await readdir(runRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^window\d+$/u.test(entry.name))
    for (const window of windows) {
      const logFile = path.join(runRoot, window.name, 'exthost', 'skymecode.deepseek-harness-for-vscode', 'DeepSeek Harness.log')
      try {
        const info = await stat(logFile)
        if (info.uid !== process.getuid?.() || info.size > 16 * 1024 * 1024) continue
        const boot = parseDesktopBoot(await readFile(logFile, 'utf8'), descriptor.workspace)
        if (boot === undefined) continue
        const pid = listeners.get(new URL(boot.url).port)
        if (pid !== undefined) candidates.push({ ...boot, pid })
      } catch { /* Windows without DeepSeek or rotated logs are expected. */ }
    }
  }
  return selectAuthenticatedBackend(candidates, descriptor.preferredPid)
}
