require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

// Import routes
const authRoutes = require('./routes/auth')
const classRoutes = require('./routes/classes')
const assignmentRoutes = require('./routes/assignments')
const noteRoutes = require('./routes/notes')
const videoRoutes = require('./routes/videos')
const paymentRoutes = require('./routes/payments')
const userRoutes = require('./routes/users')
const paperRoutes = require('./routes/papers')
const notificationRoutes = require('./routes/notifications')
const statsRoutes = require('./routes/stats')
const adminRoutes = require('./routes/admin')

const app = express()

// Health check endpoint for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' })
})

// CORS - Must be before other middleware
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004', 'http://localhost:3005'],
    credentials: true,
  })
)

// Security middleware - Configure helmet to allow cross-origin resources
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
})
app.use('/api/auth', limiter)

// Body parsers
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Serve static files (uploaded files) with CORS headers
app.use('/uploads', express.static('uploads', {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Cross-Origin-Resource-Policy', 'cross-origin')
  }
}))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/classes', classRoutes)
app.use('/api/assignments', assignmentRoutes)
app.use('/api/notes', noteRoutes)
app.use('/api/videos', videoRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/users', userRoutes)
app.use('/api/papers', paperRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/admin', adminRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Tuition Sir API is running' })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

const preferredPort = Number(process.env.PORT) || 5000
const ports = [preferredPort]

if (!ports.includes(5001)) {
  ports.push(5001)
}

const servers = []

ports.forEach((port) => {
  const server = app.listen(port)

  server.on('listening', () => {
    console.log(`🚀 Server running on port ${port}`)
    console.log(`📚 Environment: ${process.env.NODE_ENV}`)
  })

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${port} is already in use, skipping it`)
      return
    }

    console.error(`Failed to start server on port ${port}`, error)
    process.exitCode = 1
  })

  servers.push(server)
})

module.exports = app
