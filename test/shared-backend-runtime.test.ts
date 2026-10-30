import { describe, expect, it, vi } from 'vitest'
const resolve = vi.hoisted(() => vi.fn())
vi.mock('../src/runtime/shared-backend.js', () => ({ resolveSharedBackend: resolve }))
vi.mock('vscode', () => ({
  EventEmitter: class { fire(): void {} event = () => ({ dispose() {} }); dispose(): void {} },
  workspace: { workspaceFolders: [{ uri: { fsPath: '/repo' } }] },
  l10n: { t: (s: string) => s },
}))
import { HarnessHostRuntime } from '../src/runtime/web-runtime.js'

function runtime() {
  const bundled = { resolve: vi.fn(() => { throw Error('must not launch bundled runtime') }) }
  const configuration = { get: () => ({ sharedBackendConnectionFile: '/private/connection.json' }) }
  const instance = new HarnessHostRuntime({} as never, configuration as never, bundled as never, { appendLine: vi.fn() } as never)
  return { instance, bundled }
}
describe('attached runtime lifecycle', () => {
  it('does not resurrect an attachment after stop while discovery is pending', async () => {
    let finish!: (value: { url: string; pid: number }) => void
    resolve.mockReturnValue(new Promise((done) => { finish = done }))
    const { instance } = runtime()
    const refresh = instance.refreshAttachment()
    const rejected = expect(refresh).rejects.toThrow()
    await instance.stop()
    finish({ url: 'http://127.0.0.1:41001/?token=test', pid: 11 })
    await rejected
    expect(instance.state.phase).toBe('idle')
  })
  it('attaches and can disconnect/reconnect without resolving or owning a child runtime', async () => {
    resolve.mockResolvedValue({ url: 'http://127.0.0.1:41001/?token=test', pid: 11 })
    const { instance, bundled } = runtime()
    expect(await instance.start()).toContain(':41001/')
    expect(instance.attached).toBe(true)
    expect(instance.sharedHistory).toBe(true)
    await instance.stop()
    expect(instance.state.phase).toBe('idle')
    await instance.restart()
    expect(bundled.resolve).not.toHaveBeenCalled()
    await instance.stop()
  })
  it('refuses a missing owner without falling back to a second backend', async () => {
    resolve.mockRejectedValue(Error('No running desktop backend'))
    const { instance, bundled } = runtime()
    await expect(instance.start()).rejects.toThrow('No running desktop')
    expect(instance.state.phase).toBe('error')
    expect(bundled.resolve).not.toHaveBeenCalled()
    await instance.stop()
  })
})
