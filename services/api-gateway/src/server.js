import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { interactionsRouter } from './routes/interactions.js';
import { guildsRouter } from './routes/guilds.js';
import { commandConfigsRouter } from './routes/commandConfigs.js';
import { requireAuth } from './middleware/requireAuth.js';

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Generate one with: openssl rand -base64 32');
}

// Restrict CORS to the configured frontend origin in production; allow all
// in development when FRONTEND_ORIGIN isn't set, so local dev just works.
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || true,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'api-gateway' }));

// Login is the only unauthenticated dashboard route.
app.use('/auth', authRouter);

// Everything else requires a valid JWT from /auth/login.
app.use('/interactions', requireAuth, interactionsRouter);
app.use('/guilds', requireAuth, guildsRouter);
app.use('/command-configs', requireAuth, commandConfigsRouter);

app.listen(PORT, () => {
  console.log(`[api-gateway] listening on port ${PORT}`);
});
