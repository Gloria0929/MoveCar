import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);
db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

/** 查询多行 */
export function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

/** 查询单行 */
export function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

/** 执行写入，返回 { changes, lastInsertRowid } */
export function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

/** 事务包装 */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  }
}

export const now = () => Date.now();

// ---------- 轻量迁移：老库补列 + 回填多设备 token ----------
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

ensureColumn('vehicles', 'recovery_key_hash', 'TEXT');
ensureColumn('vehicles', 'recovery_rotated_at', 'INTEGER');

// 把历史上单个 owner_token_hash 变成第一条设备凭证（幂等）
db.prepare(
  `INSERT INTO vehicle_tokens (vehicle_id, token_hash, label, via, created_at)
   SELECT v.id, v.owner_token_hash, '原设备', 'migrated', v.created_at
     FROM vehicles v
    WHERE v.owner_token_hash IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM vehicle_tokens t WHERE t.token_hash = v.owner_token_hash)`,
).run();

/** 清理过期的频控窗口，避免表无限增长 */
export function pruneRateLimits(olderThanSeconds = 7 * 86400) {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanSeconds;
  run('DELETE FROM rate_limits WHERE window_start < ?', [cutoff]);
}

/** 清除过期隐私号会话中的访客号码（最小化留存） */
/** 清理长期未绑定的空白车贴，避免批量生成占用码池 */
export function purgeStaleDraftVehicles(olderThanMs = 7 * 86400 * 1000) {
  run(
    `DELETE FROM vehicles
     WHERE status = 'draft' AND owner_token_hash IS NULL AND created_at < ?`,
    [Date.now() - olderThanMs],
  );
}

/** 把超时未响应的挪车请求置为 expired */
export function expireStaleRequests() {
  run(
    `UPDATE move_requests SET status = 'expired'
     WHERE status IN ('notified','viewed') AND expire_at < ?`,
    [Date.now()],
  );
}
