import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { NodeGatewayClient } from '../src/gateway/node-gateway-client.js'
import type { SessionPromptRequest } from '../src/gateway/domain-api.js'
import { bootSmokeRuntime } from './helpers/runtime-smoke.js'

it.runIf(process.env.DSH_RUNTIME_SMOKE === '1')('two clients see live output, reconnect and continue through one owner without duplicate model requests', async () => {
  let requests = 0
  const server = createServer((request, response) => {
    request.resume(); requests++
    const ordinal = requests
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    const delta = (value: object) => response.write(`data: ${JSON.stringify({ id: `shared-${ordinal}`, object: 'chat.completion.chunk', created: 1, model: 'deepseek-v4-flash', choices: [{ index: 0, delta: value, finish_reason: null }] })}\n\n`)
    delta({ role: 'assistant', reasoning_content: 'Shared backend thinking.' })
    const timer = setTimeout(() => {
      delta({ content: `Shared response ${ordinal}.` })
      response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } })}\n\n`)
      response.end('data: [DONE]\n\n')
    }, 120)
    response.once('close', () => clearTimeout(timer))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  let runtime: Awaited<ReturnType<typeof bootSmokeRuntime>> | undefined
  const aborts: AbortController[] = []
  const readers: Promise<void>[] = []
  const until = async (check: () => boolean) => {
    const limit = Date.now() + 12000
    while (!check()) { if (Date.now() > limit) throw Error('Live observation timed out'); await new Promise((r) => setTimeout(r, 20)) }
  }
  try {
    runtime = await bootSmokeRuntime(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, { prepare: async () => '\n- id: session-title-llm\n  disabled: true\n' })
    const first = runtime.client
    const second = new NodeGatewayClient(runtime.url)
    const created = await first.sessionCreate({ cwd: runtime.home, agentPreset: 'minimal' })
    const address = { kind: 'session' as const, sessionId: created.sessionId }
    function observe(client: NodeGatewayClient) {
      const abort = new AbortController(); aborts.push(abort)
      const state = { snapshots: 0, ends: 0, deltas: 0, snapshotRecords: 0 }
      const task = (async () => {
        for await (const frame of client.sessionFollow({ address, maxMessages: 20 }, abort.signal)) {
          if (frame.type === 'snapshot') { state.snapshots++; state.snapshotRecords = frame.records.length }
          else if (frame.type === 'assistant-stream') state.deltas++
          else if (frame.event.type === 'turn/end') state.ends++
        }
      })()
      readers.push(task)
      return { state, abort, task }
    }
    const a = observe(first); const b = observe(second)
    await until(() => a.state.snapshots === 1 && b.state.snapshots === 1)
    await second.sessionPrompt({ requestId: randomUUID() as SessionPromptRequest['requestId'], sessionId: created.sessionId, mode: 'queue', content: [{ type: 'text', text: 'First safe test turn.' }] })
    await until(() => a.state.ends === 1 && b.state.ends === 1)
    expect(a.state.deltas).toBeGreaterThan(0); expect(b.state.deltas).toBeGreaterThan(0)
    expect(requests).toBe(1)
    b.abort.abort(); await b.task
    await first.probe()
    const reconnected = observe(new NodeGatewayClient(runtime.url))
    await until(() => reconnected.state.snapshots === 1)
    expect(reconnected.state.snapshotRecords).toBeGreaterThan(0)
    await first.sessionPrompt({ requestId: randomUUID() as SessionPromptRequest['requestId'], sessionId: created.sessionId, mode: 'queue', content: [{ type: 'text', text: 'Second safe test turn.' }] })
    await until(() => a.state.ends === 2 && reconnected.state.ends === 1)
    expect(requests).toBe(2)
    expect(reconnected.state.deltas).toBeGreaterThan(0)
  } finally {
    for (const abort of aborts) abort.abort()
    await Promise.allSettled(readers)
    await runtime?.close()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}, 60000)
