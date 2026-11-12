import ms from 'ms'

export const name = 'dsh-example-hello'
export const inject = ['tools']

export async function apply(ctx) {
  ctx.tools.register({
    name: 'hello',
    description: '示例工具：返回问候，并格式化传入的毫秒数。',
    parameters: {
      delay: { type: 'number', description: '毫秒数，默认 1000' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args) {
      const delay = Number(args?.delay) || 1000
      return `hello from example plugin (${ms(delay)})`
    },
    timeoutMs: 10_000,
  })
}
