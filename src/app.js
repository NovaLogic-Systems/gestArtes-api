require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const apiRateLimiter = require('./middlewares/rateLimit.middleware');
const errorHandler = require('./middlewares/error.middleware');
const { setupSwagger } = require('./config/swagger');
const logger = require('./utils/logger');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(apiRateLimiter);

// Routes
app.use('/auth', authRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

setupSwagger(app);

app.use((err, req, res, next) => {
  errorHandler(err, req, res, next);
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => {
    logger.info(`API running on http://localhost:${port}`);
  });
}

module.exports = app;
