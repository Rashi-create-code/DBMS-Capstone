require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { connect } = require('./db');
const { requireAuth, requireRole } = require('./middleware/auth');
const errors = require('./errors');

const app = express();
app.set('trust proxy', 1);                       // needed behind Render/Railway so rate limiting sees the real visitor IP
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/public', require('./routes/public'));                                    // no login needed
app.use('/api/admin',  requireAuth, requireRole('ADMIN'),    require('./routes/adminProperty'));
app.use('/api/admin',  requireAuth, requireRole('ADMIN'),    require('./routes/adminHr'));
app.use('/api/admin',  requireAuth, requireRole('ADMIN'),    require('./routes/adminOps'));
app.use('/api/me',     requireAuth, requireRole('EMPLOYEE'), require('./routes/me'));  // own records only
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built React app (npm run build in /frontend) from the same server
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use(errors);

const port = process.env.PORT || 5000;
if (require.main === module) {
  connect().then(() => app.listen(port, () => console.log(`SmartStay API running on http://localhost:${port}`)))
    .catch((e) => { console.error('Could not connect to MongoDB:', e.message); process.exit(1); });
}
module.exports = app;
