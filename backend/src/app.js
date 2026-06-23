const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const env = require('./config/env');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { ensureUploadDir, serveUploads } = require('./config/storage');

const app = express();

if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (env.nodeEnv === 'production') {
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { success: false, error: { message: 'Too many requests' } },
  }));
}

app.use('/uploads', serveUploads);

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Rare Veterinary Care LIMS API',
      version: '1.0.0',
      description: 'Cloud-based Veterinary Laboratory Information Management System API',
      contact: { name: 'Rare Veterinary Care', email: env.lab.email },
    },
    servers: [{ url: `http://localhost:${env.port}/api`, description: 'Development' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Authentication' },
      { name: 'Customers' },
      { name: 'Animals' },
      { name: 'Samples' },
      { name: 'Tests' },
      { name: 'Results' },
      { name: 'Reports' },
      { name: 'Billing' },
      { name: 'Inventory' },
      { name: 'Quality' },
      { name: 'Dashboard' },
      { name: 'Users' },
      { name: 'Audit' },
      { name: 'Notifications' },
      { name: 'Devices' },
      { name: 'Settings' },
    ],
  },
  apis: ['./src/routes/*.js'],
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Rare Vet LIMS API Docs',
}));

app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

app.use('/api', routes);

const staffDistPath = path.join(__dirname, '../../frontend/dist');
const portalDistPath = path.join(__dirname, '../../frontend-portal/dist');
const portalDistReady = fs.existsSync(path.join(portalDistPath, 'index.html'));
const staffDistReady = fs.existsSync(path.join(staffDistPath, 'index.html'));

const portalHostSet = new Set(env.portalHosts.map((h) => h.toLowerCase()));
const isPortalRequest = (req) => portalDistReady && portalHostSet.has((req.hostname || '').toLowerCase());

const serveSpa = (distPath) => {
  const staticMw = express.static(distPath, { index: false, maxAge: '1d' });
  return (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    staticMw(req, res, (err) => {
      if (err) return next(err);
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.sendFile(path.join(distPath, 'index.html'), (sendErr) => {
        if (sendErr) next(sendErr);
      });
    });
  };
};

if (env.serveFrontend && staffDistReady) {
  app.use((req, res, next) => {
    if (isPortalRequest(req)) return next();
    return serveSpa(staffDistPath)(req, res, next);
  });
}

if (portalDistReady) {
  app.use((req, res, next) => {
    if (!isPortalRequest(req)) return next();
    return serveSpa(portalDistPath)(req, res, next);
  });
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
