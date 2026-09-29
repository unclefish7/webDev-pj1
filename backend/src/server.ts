import express, { type ErrorRequestHandler } from 'express';
import { pool } from './db.js';
import { api } from './routes.js';
import { ApiError } from './validation.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error);
    response.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/api', api);

app.use((_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } });
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) { response.status(error.status).json({ error: { code: error.code, message: error.message, fields: error.fields } }); return; }
  if (error.code === 'ER_DUP_ENTRY') { response.status(409).json({ error: { code: 'DUPLICATE_PURL', message: '此 PURL 已存在，请更换组件坐标或版本', fields: { purl: 'PURL 必须唯一' } } }); return; }
  if (error.type === 'entity.parse.failed') { response.status(400).json({ error: { code: 'INVALID_JSON', message: '请求体不是有效 JSON' } }); return; }
  if (error.type === 'entity.too.large') { response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体超过 256KB' } }); return; }
  console.error(error);
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器处理失败，请稍后重试' } });
};
app.use(errorHandler);

const server = app.listen(Number(process.env.API_PORT || 3000), '127.0.0.1', () => {
  console.log(`API ready at http://127.0.0.1:${process.env.API_PORT || 3000}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(async () => { await pool.end(); process.exit(0); });
  });
}
