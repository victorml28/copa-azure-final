require('dotenv').config({ path: __dirname + '/../.env' });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Rotas
const authRoutes = require('./routes/auth');
const matchesRoutes = require('./routes/matches');
const stadiumsRoutes = require('./routes/stadiums');
const teamsRoutes = require('./routes/teams');
const ticketsRoutes = require('./routes/tickets');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

const app = express();

// Information disclosure: remover header X-Powered-By
app.disable('x-powered-by');

// Confiar no proxy (iisnode/Azure App Service) para enxergar o IP real do
// cliente em X-Forwarded-For — necessário para rate limiting funcionar
// corretamente atrás do iisnode.
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3001;

// Em VM/Web App: escuta em todas as interfaces. Em iisnode o PORT
// é um named pipe e a HOST é ignorada — então isso é seguro.
const HOST = process.env.HOST || '0.0.0.0';

// Lista de origens permitidas para CORS.
// Quando o frontend usa o reverse proxy do IIS (/api -> backend), CORS
// nem é exercitado. CORS só importa em dev (Vite em :8080) ou se alguém
// chamar o backend diretamente (não recomendado em produção).
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:8080')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Middlewares
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: (origin, cb) => {
    // origin === undefined em chamadas server-to-server / proxy reverso
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`CORS bloqueado para origem ${origin}`));
  },
  credentials: true
}));
app.use(express.json());

// Rate limiting (TD-6)
// Aplica DEPOIS de helmet/cors/express.json para preservar preflight CORS,
// mas ANTES das rotas para que o limiter governe o acesso.
//
// Atrás do Azure App Service (múltiplos proxies: edge + LB interno),
// trust proxy=1 pode ler hop intermediário em vez do IP real do cliente.
// keyGenerator pega SEMPRE o primeiro IP de X-Forwarded-For, que é o cliente.
const clientIpKey = (req) => {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const first = (Array.isArray(xff) ? xff[0] : xff.split(',')[0]).trim();
    if (first) return first;
  }
  return req.ip;
};

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  // Só conta tentativas que falharam — usuário válido pode logar várias vezes
  skipSuccessfulRequests: true,
});

// /api/auth/login tem limiter mais estrito; demais endpoints usam o geral
app.use('/api/auth/login', loginLimiter);
app.use('/api', generalLimiter);

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/stadiums', stadiumsRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Health check com teste de banco de dados
app.get('/api/health/db', async (req, res) => {
  const { getConnection } = require('./config/database');
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT TOP 1 id, name FROM teams');
    res.json({
      status: 'ok',
      database: 'connected',
      sample: result.recordset[0] || 'no data',
      config: {
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        user: process.env.DB_USER
      }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
      code: err.code,
      originalError: err.originalError ? err.originalError.message : null
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Em iisnode (VM/Web App Windows) PORT é um pipe nomeado e listen(host)
// é ignorado. Em ambientes "puros" (Linux App Service, container, dev),
// HOST=0.0.0.0 garante que aceitamos conexões de outras VMs do VNet.
app.listen(PORT, HOST, () => {
  console.log(`Backend FIFA 2026 escutando em ${HOST}:${PORT}`);
  console.log(`CORS allowedOrigins = ${allowedOrigins.join(', ')}`);
});
