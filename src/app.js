// Import modules
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')

// Import Redis client
require('./config/redis');

const app = express()

// Middlewares
app.use(express.json())
app.use(cors())
app.use(helmet())
app.use(compression())

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

module.exports = app