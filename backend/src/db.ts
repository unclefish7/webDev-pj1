import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  database: process.env.DB_NAME || 'webdev',
  user: process.env.DB_USER || 'webdev',
  password: process.env.DB_PASSWORD,
  connectionLimit: 5,
  dateStrings: true,
  timezone: 'Z',
  connectTimeout: 5000,
  charset: 'utf8mb4'
});
