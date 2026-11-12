import { greet } from 'dsh-example-core'

export const name = 'dsh-example-mono'
export const inject = ['tools']

export async function apply(ctx) {
  ctx.tools.register({
    name: 'mono_hello',
    description: '示例工具：调用共享包返回问候。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute() {
      return greet('world')
    },
    timeoutMs: 10_000,
  })
}
