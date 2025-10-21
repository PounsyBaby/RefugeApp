import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import 'dotenv/config';

type SplitOptions = {
  commentPrefix?: string;
};

function splitStatements(sql: string, options: SplitOptions = {}): string[] {
  const commentPrefix = options.commentPrefix ?? '--';
  const lines = sql
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith(commentPrefix));

  const cleaned = lines.join('\n');
  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const prev = cleaned[i - 1];

    if (ch === '\'' && !inDouble && !inBacktick) {
      const escaped = prev === '\\';
      if (!escaped) inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && !inBacktick) {
      const escaped = prev === '\\';
      if (!escaped) inDouble = !inDouble;
    } else if (ch === '`' && !inSingle && !inDouble) {
      const escaped = prev === '\\';
      if (!escaped) inBacktick = !inBacktick;
    }

    if (ch === ';' && !inSingle && !inDouble && !inBacktick) {
      const stmt = `${current}${ch}`.trim();
      if (stmt) statements.push(stmt);
      current = '';
    } else {
      current += ch;
    }
  }

  const tail = current.trim();
  if (tail) statements.push(tail);

  return statements;
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    multipleStatements: false
  });

  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  const statements = splitStatements(sql);

  console.log(`ℹ️  Exécution du schéma (${statements.length} statements)`);

  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    console.log(`→ ${preview}${preview.length === 80 ? '…' : ''}`);
    await connection.query(stmt);
  }

  console.log('✅ Base refuge recréée');
  await connection.end();
}

main().catch((err) => {
  console.error('❌ Erreur setup DB', err);
  process.exit(1);
});
