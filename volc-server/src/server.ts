import { getEnv } from './env'
import { createRequestHandler } from './handlers'

const env = getEnv()
const handleRequest = createRequestHandler(env)

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3002),
  fetch(req) {
    return handleRequest(req)
  },
})

console.log(`Volc server is running at http://localhost:${server.port}`)
