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
  let beginDepth = 0;

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
    } else if (!inSingle && !inDouble && !inBacktick) {
      // Suivi simple du bloc BEGIN...END pour ne pas découper les triggers au mauvais endroit.
      if (matchWordAt(cleaned, i, 'BEGIN')) {
        beginDepth += 1;
      } else if (matchWordAt(cleaned, i, 'END') && !matchWordAt(cleaned, i, 'END IF')) {
        beginDepth = Math.max(0, beginDepth - 1);
      }
    }

    if (ch === ';' && !inSingle && !inDouble && !inBacktick && beginDepth === 0) {
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

function isWordBoundary(source: string, before: number, after: number): boolean {
  const isBoundary = (index: number) => {
    const ch = source[index];
    if (ch === undefined) return true;
    return !/[A-Za-z0-9_]/.test(ch);
  };
  return isBoundary(before) && isBoundary(after);
}

function matchWordAt(source: string, index: number, word: string): boolean {
  const upper = source.toUpperCase();
  const target = word.toUpperCase();
  if (!upper.startsWith(target, index)) return false;
  return isWordBoundary(source, index - 1, index + target.length);
}

async function main() {
  // Préférence : utiliser DATABASE_URL (même format que Prisma) si présent,
  // sinon retomber sur les variables MYSQL_*
  const dbUrl = process.env.DATABASE_URL;
  let host = process.env.MYSQL_HOST;
  let port = process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : undefined;
  let user = process.env.MYSQL_USER;
  let password = process.env.MYSQL_PASSWORD;

  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      host = parsed.hostname || host;
      port = parsed.port ? Number(parsed.port) : port;
      user = parsed.username || user;
      password = parsed.password || password;
    } catch (err) {
      console.warn('DATABASE_URL invalide, fallback aux variables MYSQL_*', err);
    }
  }

  const connection = await mysql.createConnection({
    host: host ?? '127.0.0.1',
    port: port ?? 3306,
    user: user ?? 'root',
    password: password ?? '',
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
