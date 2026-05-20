import express from 'express'
import cors from 'cors'
import { initDb } from './src/db.js'
import apiRouter from './src/api.js'

const app = express()
const PORT = process.env.PORT || 3002

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use('/api', apiRouter)

async function start() {
  await initDb()
  app.listen(PORT, () => {
    console.log(`Audiovisual Nexus API running on port ${PORT}`)
  })
}

start().catch(console.error)
