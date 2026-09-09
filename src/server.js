import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import plannerRoutes from './routes/planner.routes.js';
import tripsRoutes from './routes/trips.routes.js';

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'wayfare-ai-planner-backend' });
});

app.use('/api', tripsRoutes);
app.use('/api', plannerRoutes);

// Central error handler. Every route below calls next(err) on failure so
// error shape is consistent for the frontend.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.publicMessage || 'Something went wrong while planning this trip.',
  });
});

app.listen(config.port, () => {
  console.log(`Wayfare AI Planner backend listening on port ${config.port}`);
});
