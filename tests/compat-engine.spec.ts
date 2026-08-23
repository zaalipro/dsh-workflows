import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('package-owned stock compatibility engine', () => {
  it('forwards per-agent provider and model overrides through the built worker', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      let captured
      const ctx = { logger: { warn() {} }, events: { dispatch() { return [] } }, subagents: {
        getProvider() { return {} }, async start(provider, request) { captured = { provider, agentOptions: request.agentOptions }; return { id: 'route', result: Promise.resolve({ output: [{ type: 'text', text: 'ok' }], stopReason: 'completed' }), async dispose() {} } }
      } }
      const engine = new Engine(ctx, { provider: 'spawn' })
      const run = engine.start({ script: "return await agent('route',{provider:'llmotions',model:'ox-alpha'})", meta: { name: 'route', description: 'route' }, parent: {} })
      const result = await run.result; await run.dispose(); process.stdout.write(JSON.stringify({ captured, result }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], { cwd: process.cwd(), timeout: 5_000 })
    expect(JSON.parse(stdout)).toMatchObject({
      captured: { provider: 'spawn', agentOptions: { provider: 'llmotions', model: 'ox-alpha' } },
      result: { stopReason: 'completed', value: 'ok' },
    })
  }, 10_000)

  it('preserves validation caller cancellation instead of returning a diagnostic', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      const ctx = { logger: { warn() {} }, events: { dispatch() { return [] } }, subagents: { getProvider() { return {} }, async start() { throw new Error('must not start') } } }
      const engine = new Engine(ctx, { validationTimeoutMs: 5000, disposeGraceMs: 50 })
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('caller stopped', 'AbortError')), 25)
      try { await engine.validate({ script: 'await new Promise(() => {})', meta: { name: 'abort', description: 'abort' }, parent: {}, signal: controller.signal }); process.stdout.write('unexpected') }
      catch (error) { process.stdout.write(JSON.stringify({ name: error.name, message: error.message })) }
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], { cwd: process.cwd(), timeout: 5_000 })
    expect(JSON.parse(stdout)).toEqual({ name: 'AbortError', message: 'caller stopped' })
  }, 10_000)

  it('carries queued panel reservations into replay spend and sequence counters', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      let starts = 0
      const events = []
      const ctx = {
        logger: { warn() {} }, events: { dispatch(_mode, [name, ...args]) { events.push([name, ...args]); return [] } },
        subagents: { getProvider() { return {} }, async start(_provider, request) {
          const number = ++starts
          return { id: 'queued-' + number, result: number === 1
            ? new Promise(resolve => request.signal.addEventListener('abort', () => resolve({ output: [], stopReason: 'aborted' }), { once: true }))
            : Promise.resolve({ output: [{ type: 'text', text: 'done-' + number }], stopReason: 'completed' }), async dispose() {} }
        } },
      }
      const engine = new Engine(ctx, { maxConcurrentAgents: 1, maxTotalAgents: 6, disposeGraceMs: 100 })
      const request = { script: "return await parallel([{prompt:'a'},{prompt:'b'},{prompt:'c'}])", meta: { name: 'queued', description: 'queued' }, parent: {}, maxTotalAgents: 6, deferStart: true }
      const first = engine.start(request); first.release()
      while (!events.some(item => item[0] === 'workflow/agent-start')) await new Promise(resolve => setTimeout(resolve, 5))
      first.cancel('pause'); await first.result; await first.dispose(); const checkpoint = first.checkpoint()
      const resumed = engine.start({ ...request, replay: { checkpoint } }); resumed.release(); const result = await resumed.result; await resumed.dispose()
      process.stdout.write(JSON.stringify({ starts, checkpoint, result, sequences: events.filter(item => item[0] === 'workflow/agent-start').map(item => item[2].seq) }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], { cwd: process.cwd(), timeout: 10_000, maxBuffer: 2 * 1024 * 1024 })
    const observed = JSON.parse(stdout)
    expect(observed.checkpoint).toMatchObject({ agentSpend: 3, agentSeq: 3 })
    expect(observed.result).toMatchObject({ stopReason: 'completed', agentsStarted: 6, value: ['done-2', 'done-3', 'done-4'] })
    expect(observed.sequences).toEqual([1, 4, 5, 6])
  }, 15_000)

  it('gives validation bounded scratch read/write semantics and enforces live quotas', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      const ctx = { logger: { warn() {} }, events: { dispatch() { return [] } }, subagents: { getProvider() { return {} }, async start() { throw new Error('must not start') } } }
      const engine = new Engine(ctx, { scratchMaxFileBytes: 3, scratchMaxTotalBytes: 4, scratchMaxFiles: 1 })
      const meta = { name: 'scratch-validate', description: 'scratch validate' }
      const good = await engine.validate({ script: "await write_scratch_file('a','abc');return await read_scratch_file('a')", meta, parent: {} })
      const tooLarge = await engine.validate({ script: "await write_scratch_file('a','abcd');return 1", meta, parent: {} })
      const tooMany = await engine.validate({ script: "await write_scratch_file('a','a');await write_scratch_file('b','b');return 1", meta, parent: {} })
      process.stdout.write(JSON.stringify({ good, tooLarge, tooMany }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: process.cwd(), timeout: 5_000, maxBuffer: 2 * 1024 * 1024,
    })
    const observed = JSON.parse(stdout)
    expect(observed.good).toMatchObject({ ok: true, status: 'completed', value: 'abc' })
    expect(observed.tooLarge).toMatchObject({ ok: false, status: 'error' })
    expect(observed.tooLarge.error).toContain('scratch file limit')
    expect(observed.tooMany).toMatchObject({ ok: false, status: 'error' })
    expect(observed.tooMany.error).toContain('scratch file-count limit')
  }, 10_000)

  it('bounds validate-only scripts that never settle and disposes their worker', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      const ctx = { logger: { warn() {} }, events: { dispatch() { return [] } }, subagents: { getProvider() { return {} }, async start() { throw new Error('must not start') } } }
      const engine = new Engine(ctx, { validationTimeoutMs: 50, disposeGraceMs: 50 })
      const started = Date.now()
      const result = await engine.validate({ script: 'await new Promise(() => {})', meta: { name: 'hang', description: 'hang' }, parent: {} })
      process.stdout.write(JSON.stringify({ result, elapsed: Date.now() - started }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: process.cwd(), timeout: 5_000, maxBuffer: 2 * 1024 * 1024,
    })
    const observed = JSON.parse(stdout)
    expect(observed.elapsed).toBeLessThan(2_000)
    expect(observed.result).toMatchObject({ ok: false, status: 'error', errorCode: 'CANCELLED' })
  }, 10_000)

  it('does not reuse an issued member sequence after cancelling before its journal commit', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      let starts = 0
      const events = []
      const ctx = {
        logger: { warn() {} },
        events: { dispatch(_mode, [name, ...args]) { events.push([name, ...args]); return [] } },
        subagents: {
          getProvider() { return {} },
          async start(_provider, request) {
            const number = ++starts
            return {
              id: 'issued-' + number,
              result: number === 1
                ? new Promise(resolve => request.signal.addEventListener('abort', () => resolve({ output: [], stopReason: 'aborted' }), { once: true }))
                : Promise.resolve({ output: [{ type: 'text', text: 'resumed' }], stopReason: 'completed' }),
              async dispose() {},
            }
          },
        },
      }
      const engine = new Engine(ctx, { maxTotalAgents: 8, disposeGraceMs: 100 })
      const request = { script: "return await agent('work')", meta: { name: 'issued-seq', description: 'issued seq' }, parent: {}, deferStart: true }
      const first = engine.start(request); first.release()
      while (!events.some(item => item[0] === 'workflow/agent-start')) await new Promise(resolve => setTimeout(resolve, 5))
      first.cancel('pause'); await first.result; await first.dispose(); const checkpoint = first.checkpoint()
      const resumed = engine.start({ ...request, replay: { checkpoint } }); resumed.release()
      const result = await resumed.result; await resumed.dispose()
      process.stdout.write(JSON.stringify({ checkpoint, result, sequences: events.filter(item => item[0] === 'workflow/agent-start').map(item => item[2].seq) }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: process.cwd(), timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    })
    const observed = JSON.parse(stdout)
    expect(observed.checkpoint).toMatchObject({ journal: [], agentSpend: 1, agentSeq: 1 })
    expect(observed.sequences).toEqual([1, 2])
    expect(observed.result).toMatchObject({ stopReason: 'completed', value: 'resumed', agentsStarted: 2 })
  }, 20_000)

  it('preserves commit order while replaying out-of-order parallel children without rerunning them', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      let starts = 0
      const events = []
      const ctx = {
        logger: { warn() {} },
        events: { dispatch(_mode, [name, ...args]) { events.push([name, ...args]); return [] } },
        subagents: {
          getProvider() { return {} },
          async start() {
            const number = ++starts
            return {
              id: 'parallel-' + number,
              result: new Promise(resolve => setTimeout(() => resolve({ output: [{ type: 'text', text: 'result-' + number }], stopReason: 'completed' }), number === 1 ? 60 : 0)),
              async dispose() {},
            }
          },
        },
      }
      const engine = new Engine(ctx, { maxConcurrentAgents: 4, maxTotalAgents: 8, disposeGraceMs: 100 })
      const request = {
        script: "const pair=await parallel([{prompt:'slow'},{prompt:'fast'}]);await await_user('user','continue');return pair",
        meta: { name: 'parallel-replay', description: 'parallel replay' }, parent: {}, deferStart: true,
      }
      const first = engine.start(request); first.release()
      while (!events.some(item => item[0] === 'workflow/gate')) await new Promise(resolve => setTimeout(resolve, 5))
      first.cancel('checkpoint'); await first.result; await first.dispose()
      const checkpoint = first.checkpoint()
      events.length = 0
      const resumed = engine.start({ ...request, replay: { checkpoint } }); resumed.release()
      while (!events.some(item => item[0] === 'workflow/gate')) await new Promise(resolve => setTimeout(resolve, 5))
      resumed.resume(); const result = await resumed.result; await resumed.dispose()
      process.stdout.write(JSON.stringify({ starts, checkpoint, result }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: process.cwd(), timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    })
    const observed = JSON.parse(stdout)
    expect(observed.starts).toBe(2)
    expect(observed.checkpoint.journal).toMatchObject([
      { ordinal: 1, callId: [1, 2, 1], result: 'result-2' },
      { ordinal: 2, callId: [1, 1, 1], result: 'result-1' },
    ])
    expect(observed.result).toMatchObject({ stopReason: 'completed', value: ['result-1', 'result-2'] })
  }, 20_000)

  it('runs the built worker with deferred start, hooks, checkpoint and replay', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      let starts = 0
      const scratch = Object.create(null)
      const events = []
      const ctx = {
        logger: { warn() {} },
        events: { dispatch(_mode, [name, ...args]) { events.push([name, ...args]); return [] } },
        subagents: {
          getProvider(name) { return name === 'spawn' ? {} : undefined },
          async start() {
            const number = ++starts
            return {
              id: 'child-' + number,
              result: Promise.resolve({ output: [{ type: 'text', text: 'answer-' + number }], stopReason: 'completed' }),
              async dispose() {},
            }
          },
        },
      }
      const engine = new Engine(ctx, { maxConcurrentAgents: 4, maxTotalAgents: 8, disposeGraceMs: 100 })
      const request = {
        script: "const before=budget();await write_scratch_file('note.txt','kept');const first=await agent('first');await await_user('user','continue');const second=await agent('second');return {before,after:budget(),note:await read_scratch_file('note.txt'),first,second}",
        meta: { name: 'compat-smoke', description: 'compat smoke' },
        parent: {}, maxTotalAgents: 8, deferStart: true,
        scratch: {
          async read(name) { return scratch[name] },
          async write(name, content) { scratch[name] = content },
        },
      }
      const first = engine.start(request)
      await new Promise(resolve => setTimeout(resolve, 75))
      const startsBeforeRelease = starts
      first.release()
      while (!events.some(item => item[0] === 'workflow/gate')) await new Promise(resolve => setTimeout(resolve, 5))
      first.cancel('checkpoint smoke')
      const firstResult = await first.result
      await first.dispose()
      const checkpoint = first.checkpoint()
      events.length = 0
      const resumed = engine.start({ ...request, replay: { checkpoint } })
      resumed.release()
      while (!events.some(item => item[0] === 'workflow/gate')) await new Promise(resolve => setTimeout(resolve, 5))
      resumed.resume()
      const result = await resumed.result
      await resumed.dispose()
      process.stdout.write(JSON.stringify({ startsBeforeRelease, firstResult, checkpoint, result, resumedCheckpoint: resumed.checkpoint(), starts }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: process.cwd(),
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    const observed = JSON.parse(stdout)
    expect(observed.startsBeforeRelease).toBe(0)
    expect(observed.firstResult.stopReason).toBe('cancelled')
    expect(observed.checkpoint.agentSpend).toBe(1)
    expect(observed.checkpoint.journal.map((entry: any) => entry.callId)).toEqual([[1], [2]])
    expect(observed.result).toMatchObject({
      stopReason: 'completed',
      agentsStarted: 2,
      value: {
        before: { total: 8, spent: 1, reserved: 0, remaining: 7 },
        after: { total: 8, spent: 2, reserved: 0, remaining: 6 },
        note: 'kept', first: 'answer-1', second: 'answer-2',
      },
    })
    expect(observed.starts).toBe(2)
    expect(observed.resumedCheckpoint.journal.map((entry: any) => entry.callId)).toEqual([
      [1], [2], [3], [4], [5],
    ])
  }, 20_000)

  it('strips nested array bounds only at the RC2 provider boundary and post-validates child results', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      const schemas = []
      const events = []
      const values = {
        lower: { minItems: 'property-value', findings: [{ tags: [] }] },
        upper: { minItems: 'property-value', findings: [{ tags: ['a'] }, { tags: [] }] },
        short: { minItems: 'property-value', findings: [] },
        long: { minItems: 'property-value', findings: [{ tags: [] }, { tags: [] }, { tags: [] }] },
        nested: { minItems: 'property-value', findings: [{ tags: ['a', 'b'] }] },
        ordinary: { minItems: 'property-value', findings: [{ tags: [2] }] },
      }
      const ctx = {
        logger: { warn() {} },
        events: { dispatch(_mode, [name, ...args]) { events.push([name, ...args]); return [] } },
        subagents: {
          getProvider() { return {} },
          async start(_provider, request) {
            schemas.push(request.outputSchema)
            const prompt = request.prompt[0].text
            return { id: 'bounds-' + prompt, result: Promise.resolve({ output: [], structured: values[prompt], stopReason: 'completed' }), async dispose() {} }
          },
        },
      }
      const engine = new Engine(ctx)
      const schema = {
        type: 'object',
        default: { minItems: 91, maxItems: 92 },
        properties: {
          minItems: { type: 'string' },
          findings: {
            type: 'array', minItems: 1, maxItems: 2,
            default: [{ minItems: 93, maxItems: 94 }],
            items: {
              type: 'object', properties: {
                tags: { type: 'array', minItems: 0, maxItems: 1, items: { type: 'string' } },
              }, required: ['tags'], additionalProperties: false,
            },
          },
        },
        required: ['minItems', 'findings'], additionalProperties: false,
      }
      const runs = []
      for (const prompt of Object.keys(values)) {
        const run = engine.start({
          script: 'return agent(' + JSON.stringify(prompt) + ', { schema: ' + JSON.stringify(schema) + ' })',
          meta: { name: 'bounds-' + prompt, description: 'bounds' }, parent: {},
        })
        const result = await run.result
        await run.dispose()
        runs.push({ prompt, result, checkpoint: run.checkpoint() })
      }
      process.stdout.write(JSON.stringify({ schemas, events, runs }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: process.cwd(), timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    })
    const observed = JSON.parse(stdout)
    expect(observed.schemas).toHaveLength(6)
    expect(observed.schemas[0]).toEqual({
      type: 'object',
      default: { minItems: 91, maxItems: 92 },
      properties: {
        minItems: { type: 'string' },
        findings: {
          type: 'array',
          default: [{ minItems: 93, maxItems: 94 }],
          items: {
            type: 'object',
            properties: { tags: { type: 'array', items: { type: 'string' } } },
            required: ['tags'], additionalProperties: false,
          },
        },
      },
      required: ['minItems', 'findings'], additionalProperties: false,
    })
    expect(observed.schemas.every((schema: unknown) => JSON.stringify(schema) === JSON.stringify(observed.schemas[0]))).toBe(true)
    expect(observed.runs.map((run: any) => [run.prompt, run.result.value])).toEqual([
      ['lower', { minItems: 'property-value', findings: [{ tags: [] }] }],
      ['upper', { minItems: 'property-value', findings: [{ tags: ['a'] }, { tags: [] }] }],
      ['short', null],
      ['long', null],
      ['nested', null],
      ['ordinary', null],
    ])
    expect(observed.runs.map((run: any) => run.checkpoint.journal[0].result)).toEqual([
      { minItems: 'property-value', findings: [{ tags: [] }] },
      { minItems: 'property-value', findings: [{ tags: ['a'] }, { tags: [] }] },
      null, null, null, null,
    ])
    expect(observed.events.filter((entry: any[]) => entry[0] === 'workflow/agent-end').map((entry: any[]) => entry[2].outcome))
      .toEqual(['completed', 'completed', 'failed', 'failed', 'failed', 'failed'])
  }, 20_000)

  it('rejects invalid or misplaced array bounds before starting any child', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      let starts = 0
      const ctx = {
        logger: { warn() {} }, events: { dispatch() { return [] } },
        subagents: { getProvider() { return {} }, async start() { starts += 1; throw new Error('must not start') } },
      }
      const engine = new Engine(ctx)
      const scripts = [
        "return agent('x',{schema:{type:'object',maxItems:1}})",
        "return agent('x',{schema:{type:'object',properties:{x:{type:'string',minItems:0}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{maxItems:1}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{type:'array',minItems:-0}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{type:'array',minItems:-1}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{type:'array',maxItems:1.5}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{type:'array',maxItems:'2'}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{type:'array',maxItems:Number.MAX_SAFE_INTEGER+1}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{type:'array',minItems:3,maxItems:2}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{oneOf:[{type:'array'},{type:'null'}],maxItems:2}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{type:'array',minItems:undefined}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{type:'array',minItems:NaN}}}})",
        "return agent('x',{schema:{type:'object',properties:{x:{type:'array',maxItems:Infinity}}}})",
        "return parallel([{prompt:'valid',schema:{type:'object'}},{prompt:'bad',schema:{type:'object',properties:{x:{type:'array',minItems:2,maxItems:1}}}}])",
      ]
      const results = []
      for (let index = 0; index < scripts.length; index += 1) {
        const run = engine.start({ script: scripts[index], meta: { name: 'bad-' + index, description: 'bad bounds' }, parent: {} })
        results.push(await run.result)
        await run.dispose()
      }
      process.stdout.write(JSON.stringify({ starts, results }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: process.cwd(), timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    })
    const observed = JSON.parse(stdout)
    expect(observed.starts).toBe(0)
    expect(observed.results).toHaveLength(14)
    expect(observed.results.every((result: any) => result.stopReason === 'error' && result.value === null)).toBe(true)
    expect(observed.results.slice(0, 10).every((result: any) => result.errorCode === 'UNSUPPORTED_SCHEMA')).toBe(true)
    expect(observed.results[3].error).toContain('minItems must be a non-negative safe integer')
    expect(observed.results[8].error).toContain('minItems must not exceed schema.properties.x.maxItems')
    expect(observed.results[9].error).toContain('maxItems is not supported beside oneOf')
    expect(observed.results[13].errorCode).toBe('UNSUPPORTED_SCHEMA')
  }, 20_000)

  it('uses authored bounds to disambiguate oneOf branches after stripping them for RC2', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      const outputs = new Map([
        ['empty', { value: [] }], ['one', { value: [1] }], ['two', { value: [1, 2] }],
        ['overlap', { value: [1] }], ['wrong-item', { value: ['not-an-integer', 'also-wrong'] }],
      ])
      const events = []
      const schemas = []
      const ctx = {
        logger: { warn() {} }, events: { dispatch(_mode, [name, ...args]) { events.push([name, ...args]); return [] } },
        subagents: { getProvider() { return {} }, async start(_provider, request) {
          schemas.push(request.outputSchema)
          const prompt = request.prompt[0].text
          return { id: 'union-' + prompt, result: Promise.resolve({ output: [], structured: outputs.get(prompt), stopReason: 'completed' }), async dispose() {} }
        } },
      }
      const engine = new Engine(ctx)
      const disjoint = { type:'object', properties:{ value:{ oneOf:[
        { type:'array', maxItems:1, items:{type:'integer'} },
        { type:'array', minItems:2, items:{type:'integer'} },
      ] } }, required:['value'] }
      const overlap = { type:'object', properties:{ value:{ oneOf:[
        { type:'array', maxItems:2, items:{type:'integer'} },
        { type:'array', minItems:1, items:{type:'integer'} },
      ] } }, required:['value'] }
      const results = []
      for (const prompt of outputs.keys()) {
        const schema = prompt === 'overlap' ? overlap : disjoint
        const run = engine.start({ script: 'return agent(' + JSON.stringify(prompt) + ',{schema:' + JSON.stringify(schema) + '})', meta:{name:'union-'+prompt,description:'union'}, parent:{} })
        results.push([prompt, await run.result])
        await run.dispose()
      }
      process.stdout.write(JSON.stringify({ schemas, events, results }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: process.cwd(), timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    })
    const observed = JSON.parse(stdout)
    expect(observed.schemas[0].properties.value.oneOf).toEqual([
      { type: 'array', items: { type: 'integer' } },
      { type: 'array', items: { type: 'integer' } },
    ])
    expect(observed.results.map(([prompt, result]: [string, any]) => [prompt, result.value])).toEqual([
      ['empty', { value: [] }],
      ['one', { value: [1] }],
      ['two', { value: [1, 2] }],
      ['overlap', null],
      ['wrong-item', null],
    ])
    expect(observed.events.filter((entry: any[]) => entry[0] === 'workflow/agent-end').map((entry: any[]) => entry[2].outcome))
      .toEqual(['completed', 'completed', 'completed', 'failed', 'failed'])
  }, 20_000)

  it('synthesizes bounded structured values during validate-only without launching children', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      let starts = 0
      const ctx = {
        logger: { warn() {} }, events: { dispatch() { return [] } },
        subagents: { getProvider() { return {} }, async start() { starts += 1; throw new Error('must not start') } },
      }
      const engine = new Engine(ctx, { maxItemsPerCall: 32 })
      const meta = { name: 'bounded-validation', description: 'bounded validation' }
      const exact = await engine.validate({ script: "return agent('x',{schema:{type:'object',properties:{items:{type:'array',minItems:2,maxItems:2,items:{type:'string'}}},required:['items']}})", meta, parent: {} })
      const empty = await engine.validate({ script: "return agent('x',{schema:{type:'object',properties:{items:{type:'array',maxItems:0,items:{type:'string'}}},required:['items']}})", meta, parent: {} })
      const union = await engine.validate({ script: "return agent('x',{schema:{type:'object',properties:{items:{oneOf:[{type:'array',maxItems:1,items:{type:'integer'}},{type:'array',minItems:2,maxItems:3,items:{type:'integer'}}]}},required:['items']}})", meta, parent: {} })
      const findings = await engine.validate({ script: "return agent('x',{schema:{type:'object',properties:{findings:{type:'array',minItems:1,maxItems:8,items:{type:'object',properties:{summary:{type:'string'},evidence:{type:'array',maxItems:3,items:{type:'string'}}},required:['summary','evidence'],additionalProperties:false}}},required:['findings'],additionalProperties:false}})", meta, parent: {} })
      process.stdout.write(JSON.stringify({ starts, exact, empty, union, findings }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: process.cwd(), timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
    })
    const observed = JSON.parse(stdout)
    expect(observed.starts).toBe(0)
    expect(observed.exact).toMatchObject({ ok: true, status: 'completed', value: { items: ['', ''] } })
    expect(observed.empty).toMatchObject({ ok: true, status: 'completed', value: { items: [] } })
    expect(observed.union).toMatchObject({ ok: true, status: 'completed', value: { items: [] } })
    expect(observed.findings).toMatchObject({
      ok: true,
      status: 'completed',
      value: { findings: [{ summary: '', evidence: [] }] },
    })
  }, 15_000)

  it('includes authored bounds in replay fingerprints rather than the stripped provider schema', async () => {
    const program = String.raw`
      import Engine from './lib/compat-engine/index.js'
      let starts = 0
      const ctx = {
        logger: { warn() {} }, events: { dispatch() { return [] } },
        subagents: { getProvider() { return {} }, async start() { starts += 1; return { id:'fingerprint', result:Promise.resolve({output:[],structured:{items:[]},stopReason:'completed'}), async dispose(){} } } },
      }
      const engine = new Engine(ctx)
      const body = max => "return agent('x',{schema:{type:'object',properties:{items:{type:'array',maxItems:" + max + ",items:{type:'string'}}},required:['items']}})"
      const first = engine.start({ script:body(1), meta:{name:'fingerprint',description:'fingerprint'}, parent:{} })
      await first.result; await first.dispose(); const checkpoint = first.checkpoint()
      const resumed = engine.start({ script:body(2), meta:{name:'fingerprint',description:'fingerprint'}, parent:{}, replay:{checkpoint} })
      const result = await resumed.result; await resumed.dispose()
      process.stdout.write(JSON.stringify({ starts, result }))
    `
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: process.cwd(), timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
    })
    const observed = JSON.parse(stdout)
    expect(observed.starts).toBe(1)
    expect(observed.result).toMatchObject({ stopReason: 'error', errorCode: 'JOURNAL_DIVERGENCE', value: null })
  }, 15_000)
})
