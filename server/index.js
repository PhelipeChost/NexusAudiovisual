import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { initDb, startBackupSchedule } from './src/db.js'
import apiRouter from './src/api.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3002
const BASE_PATH = process.env.BASE_PATH || ''

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// API routes (support both /api and /audiovisual/api)
app.use(`${BASE_PATH}/api`, apiRouter)
app.use('/api', apiRouter)

// Serve static frontend build in production
const distPath = join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(`${BASE_PATH}`, express.static(distPath))
  // SPA fallback: serve index.html for all non-API, non-file routes
  app.get(`${BASE_PATH}/*`, (req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

async function start() {
  await initDb()
  startBackupSchedule()
  app.listen(PORT, () => {
    console.log(`Audiovisual Nexus API running on port ${PORT}`)
    if (BASE_PATH) console.log(`Base path: ${BASE_PATH}`)
  })
}

start().catch(console.error)
