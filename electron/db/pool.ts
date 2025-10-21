import mysql from 'mysql2/promise'
import 'dotenv/config'

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DB ?? 'refuge',
  connectionLimit: 10,
  namedPlaceholders: true
})

export default pool
