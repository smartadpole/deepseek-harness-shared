import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseDesktopBoot, readSharedBackendDescriptor, selectSharedBackend, selectAuthenticatedBackend } from '../src/runtime/shared-backend.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true }))) })
const boot = (cwd: string, port: number, token = 'test-token') => `[host] Starting bundled Harness Gateway (cwd=${cwd}, model=deepseek-v4-flash, reasoning=high, preset=standard)\ndsh gateway: http://127.0.0.1:${port}/?token=${token}\n`

describe('shared desktop backend binding', () => {
  it('rejects stale launch tokens after the owner restarts on a recycled port', async () => {
    const stale = { url: 'http://127.0.0.1:41001/?token=old', pid: 20 }
    const fresh = { url: 'http://127.0.0.1:41001/?token=new', pid: 20 }
    const probe = async (candidate: typeof fresh) => { if (candidate === stale) throw Error('unauthorized') }
    expect(await selectAuthenticatedBackend([stale, fresh], 10, probe)).toEqual(fresh)
  })
  it('selects only the latest boot of the exact workspace and never accepts a stale earlier URL', () => {
    expect(parseDesktopBoot(boot('/repo', 41001), '/repo')?.url).toContain(':41001/')
    expect(parseDesktopBoot(boot('/repo-other', 41001), '/repo')).toBeUndefined()
    expect(parseDesktopBoot(boot('/repo', 41001) + boot('/other', 41002), '/repo')).toBeUndefined()
    expect(parseDesktopBoot(boot('/repo', 41001) + '[host] Starting bundled Harness Gateway (cwd=/repo, model=x)\n', '/repo')).toBeUndefined()
  })
  it('requires a same-user private descriptor matching the open workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'attach-descriptor-')); roots.push(root)
    const file = join(root, 'connection.json')
    await writeFile(file, JSON.stringify({ version: 1, workspace: root, preferredPid: 42 }), { mode: 0o600 })
    expect((await readSharedBackendDescriptor(file, root)).preferredPid).toBe(42)
    await expect(readSharedBackendDescriptor(file, '/other')).rejects.toThrow(/workspace/i)
    await chmod(file, 0o644)
    await expect(readSharedBackendDescriptor(file, root)).rejects.toThrow(/private|0600/i)
  })
  it('fails closed for dead, ambiguous or unrecognized owners rather than starting another backend', () => {
    const candidates = [{ url: 'http://127.0.0.1:41001/?token=a', pid: 10 }, { url: 'http://127.0.0.1:41002/?token=b', pid: 20 }]
    expect(selectSharedBackend(candidates, 20).pid).toBe(20)
    expect(() => selectSharedBackend(candidates)).toThrow(/multiple/i)
    expect(() => selectSharedBackend([])).toThrow(/desktop/i)
    expect(selectSharedBackend([candidates[0]!], 99).pid).toBe(10)
  })
})
