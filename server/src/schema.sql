-- 让一让 · 扫码挪车 数据库结构（无账号模型：一张车贴 = 一个车辆档案）
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS vehicles (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT    NOT NULL UNIQUE,          -- 车贴码
  plate_no         TEXT    NOT NULL DEFAULT '',
  brand            TEXT    NOT NULL DEFAULT '',
  model            TEXT    NOT NULL DEFAULT '',
  color            TEXT    NOT NULL DEFAULT '',
  owner_name       TEXT    NOT NULL DEFAULT '',      -- 车主称呼，展示用
  owner_phone_enc  TEXT,                             -- 车主手机号（加密）
  owner_phone_mask TEXT    NOT NULL DEFAULT '',      -- 138****0000
  owner_token_hash TEXT,                             -- 本机管理凭证哈希
  manage_pin_hash  TEXT,                             -- 6 位管理口令哈希（跨设备）
  status           TEXT    NOT NULL DEFAULT 'draft', -- draft | active | disabled
  allow_call       INTEGER NOT NULL DEFAULT 1,
  allow_sms        INTEGER NOT NULL DEFAULT 1,
  allow_voice      INTEGER NOT NULL DEFAULT 1,   -- 语音外呼已下线，字段保留兼容旧数据
  daily_limit      INTEGER NOT NULL DEFAULT 5,
  quiet_start      TEXT    NOT NULL DEFAULT '23:00',
  quiet_end        TEXT    NOT NULL DEFAULT '07:00',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  activated_at     INTEGER,
  deleted_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_vehicles_code ON vehicles(code);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status, created_at DESC);
-- 车牌只是展示信息，不再唯一；重复车牌允许多张车贴
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate_no);

-- 一张车贴可以有多个有效凭证（手机、平板、家人）
CREATE TABLE IF NOT EXISTS vehicle_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id   INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  token_hash   TEXT    NOT NULL UNIQUE,
  label        TEXT    NOT NULL DEFAULT '',
  via          TEXT    NOT NULL,                 -- create | invite | recovery | migrated | demo | sms
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_vt_vehicle ON vehicle_tokens(vehicle_id, revoked_at);

-- 旧设备授权新设备用的一次性口令
CREATE TABLE IF NOT EXISTS device_invites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  invite_hash TEXT    NOT NULL UNIQUE,
  created_by  INTEGER NOT NULL,                  -- vehicle_tokens.id
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_di_vehicle ON device_invites(vehicle_id, expires_at);

CREATE TABLE IF NOT EXISTS move_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id     TEXT    NOT NULL UNIQUE,
  vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  method        TEXT    NOT NULL,
  message       TEXT    NOT NULL DEFAULT '',
  location_text TEXT    NOT NULL DEFAULT '',
  lat           REAL,
  lng           REAL,
  visitor_hash  TEXT    NOT NULL DEFAULT '',
  visitor_ip    TEXT    NOT NULL DEFAULT '',
  user_agent    TEXT    NOT NULL DEFAULT '',
  idem_key      TEXT    NOT NULL DEFAULT '',
  status        TEXT    NOT NULL DEFAULT 'notified',
  reply         TEXT    NOT NULL DEFAULT '',
  replied_at    INTEGER,
  expire_at     INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_req_vehicle ON move_requests(vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_req_public ON move_requests(public_id);
CREATE INDEX IF NOT EXISTS idx_req_idem ON move_requests(vehicle_id, visitor_hash, idem_key);

CREATE TABLE IF NOT EXISTS notifications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id      INTEGER NOT NULL,
  request_id      INTEGER,
  channel         TEXT    NOT NULL,
  title           TEXT    NOT NULL DEFAULT '',
  body            TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'queued',
  provider        TEXT,
  provider_msg_id TEXT,
  error           TEXT,
  read_at         INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_vehicle ON notifications(vehicle_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT    NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE TABLE IF NOT EXISTS reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   INTEGER NOT NULL,
  vehicle_id   INTEGER NOT NULL,
  reason       TEXT    NOT NULL DEFAULT '',
  visitor_hash TEXT    NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT    NOT NULL,
  actor_type TEXT    NOT NULL DEFAULT 'system',
  actor_id   TEXT,
  target     TEXT,
  meta       TEXT,
  ip         TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
