import { getEnv } from './env'
import { createRequestHandler } from './handlers'
import { serverLogger } from './logger'

const env = getEnv()
const handleRequest = createRequestHandler(env)

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3002),
  fetch(req) {
    return handleRequest(req)
  },
})

serverLogger.info(`Volc server is running`, { url: `http://localhost:${server.port}` })
