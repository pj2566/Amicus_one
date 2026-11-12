const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  validate: { xForwardedForHeader: false }
});
app.use(limiter);

const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const adminRoutes = require('./routes/admin');
const categoryRoutes = require('./routes/categories');
const legalSectionsRoutes = require('./routes/legalSections');

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/legal-sections', legalSectionsRoutes);
app.use('/api/lawgpt', require('./routes/lawgpt'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/translate', require('./routes/translate'));
app.use('/api/firm', require('./routes/firm'));
app.use('/api/draft-review', require('./routes/draftreview'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Legal AI Server is running' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});