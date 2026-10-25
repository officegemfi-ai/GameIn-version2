// Test harness: a fresh copy of the database for every test, people who act through the API roles exactly as the
// Supabase API would (row-level security on, the user's id in the JWT claims), and the money audit.
//
//   DATABASE_URL  a Postgres server to use (default postgres://postgres:postgres@localhost:5432/postgres). The harness
//                 creates its own databases on it and drops them afterwards.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

pg.types.setTypeParser(20, (v) => Number(v));       // bigint (cents) as numbers: every amount here is far below 2^53

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const SHIM = path.join(HERE, 'supabase-shim.sql');
const SEED = path.join(ROOT, 'supabase/seed.sql');
export const ADMIN_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';

const urlFor = (name) => {
  const u = new URL(ADMIN_URL);
  u.pathname = '/' + name;
  return u.toString();
};

function sourceFiles(withSeed) {
  const migrations = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort().map((f) => path.join(MIGRATIONS, f));
  return [SHIM, ...migrations, ...(withSeed ? [SEED] : [])];
}

// a SQL file's error with the file name and line, not just a character offset
function located(file, sql, e) {
  if (e.position) {
    const line = sql.slice(0, Number(e.position)).split('\n').length;
    e.message = `${path.relative(ROOT, file)}:${line}: ${e.message}`;
  } else {
    e.message = `${path.relative(ROOT, file)}: ${e.message}${e.where ? ' (' + e.where + ')' : ''}`;
  }
  return e;
}

export async function runFile(client, file) {
  const sql = fs.readFileSync(file, 'utf8');
  try {
    await client.query(sql);
  } catch (e) {
    throw located(file, sql, e);
  }
}

// templates are rebuilt only when a migration, the shim or the seed changes
async function ensureTemplate(name, withSeed) {
  const files = sourceFiles(withSeed);
  const hash = crypto.createHash('sha256');
  for (const f of files) hash.update(fs.readFileSync(f));
  const tag = hash.digest('hex').slice(0, 20);
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query('select pg_advisory_lock(7342001)');
    const { rows } = await admin.query(
      "select shobj_description(oid, 'pg_database') as tag from pg_database where datname = $1", [name]);
    if (rows.length && rows[0].tag === tag) return;
    if (rows.length) {
      await admin.query(`alter database ${name} is_template false`);
      await admin.query(`drop database ${name} with (force)`);
    }
    await admin.query(`create database ${name}`);
    const c = new pg.Client({ connectionString: urlFor(name) });
    await c.connect();
    try {
      for (const f of files) await runFile(c, f);
    } finally {
      await c.end();
    }
    await admin.query(`comment on database ${name} is '${tag}'`);
    await admin.query(`alter database ${name} is_template true`);
  } catch (e) {
    await admin.query(`drop database if exists ${name} with (force)`).catch(() => {});
    throw e;
  } finally {
    await admin.query('select pg_advisory_unlock(7342001)').catch(() => {});
    await admin.end();
  }
}

let counter = 0;

// a fresh database: the schema only, or with the demo seed
export async function freshDb({ seed = false } = {}) {
  const template = seed ? 'gamein_tpl_seed' : 'gamein_tpl';
  await ensureTemplate(template, seed);
  const name = `gamein_t${process.pid}_${++counter}_${crypto.randomBytes(3).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`create database ${name} template ${template}`);
  } finally {
    await admin.end();
  }
  const db = new TestDb(name);
  await db.init();
  return db;
}

// a value as a query parameter: objects and arrays of objects go as JSON (jsonb), other arrays as Postgres arrays
const param = (v) => {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.some((x) => x !== null && typeof x === 'object') ? JSON.stringify(v) : v;
  if (typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
  return v;
};

const ROLES = new Set(['anon', 'authenticated', 'service_role']);

class TestDb {
  constructor(name) {
    this.name = name;
    this.url = urlFor(name);
    this.actors = [];
  }

  async init() {
    this.admin = new pg.Client({ connectionString: this.url });
    await this.admin.connect();
  }

  // as the database owner (postgres): setup, time travel, checks
  async q(sql, params = []) {
    return (await this.admin.query(sql, params)).rows;
  }

  async one(sql, params = []) {
    const rows = await this.q(sql, params);
    return rows[0];
  }

  // a signed-in person (Supabase Auth makes the profile through the sign-up trigger)
  async user(name, email) {
    const id = crypto.randomUUID();
    await this.q(
      `insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', $2, $3, now(), now())`,
      [id, email || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${id.slice(0, 6)}@test.gamein`, JSON.stringify({ name })]);
    return this.actor({ role: 'authenticated', userId: id, name });
  }

  // an existing user, by email (the seed's accounts)
  async userByEmail(email) {
    const row = await this.one('select id from auth.users where email = $1', [email]);
    if (!row) throw new Error('no user ' + email);
    return this.actor({ role: 'authenticated', userId: row.id, name: email });
  }

  service() {
    return this.actor({ role: 'service_role', userId: null, name: 'service' });
  }

  anon() {
    return this.actor({ role: 'anon', userId: null, name: 'anon' });
  }

  actor(opts) {
    const a = new Actor(this, opts);
    this.actors.push(a);
    return a;
  }

  async audit() {
    return (await this.q('select v from private.audit_money() as v')).map((r) => r.v);
  }

  async close() {
    for (const a of this.actors) await a.end();
    await this.admin.end();
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    try {
      await admin.query(`drop database if exists ${this.name} with (force)`);
    } finally {
      await admin.end();
    }
  }
}

// someone using the API: each call is one transaction under their role and JWT claims, like a PostgREST request
class Actor {
  constructor(db, { role, userId, name }) {
    if (!ROLES.has(role)) throw new Error('unknown role ' + role);
    this.db = db;
    this.role = role;
    this.id = userId;
    this.name = name;
    this.clients = [];
  }

  claims() {
    return JSON.stringify(this.id ? { sub: this.id, role: this.role } : { role: this.role });
  }

  async connect() {
    const c = new pg.Client({ connectionString: this.db.url });
    await c.connect();
    this.clients.push(c);
    return c;
  }

  async client() {
    if (!this.main) this.main = await this.connect();
    return this.main;
  }

  async enter(c) {
    await c.query('begin');
    await c.query(`set local role ${this.role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [this.claims()]);
  }

  async query(sql, params = []) {
    const c = await this.client();
    await this.enter(c);
    try {
      const r = await c.query(sql, params.map(param));
      await c.query('commit');
      return r.rows;
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    }
  }

  // supabase.rpc(fn, args)
  async rpc(fn, args = {}) {
    const keys = Object.keys(args);
    const rows = await this.query(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as result`,
      keys.map((k) => args[k]));
    return rows[0].result;
  }

  // a call held open: the transaction is left uncommitted until commit() or rollback(), on its own connection, so a
  // test can line two moves up exactly (one holds its locks while the other waits)
  async hold() {
    const c = await this.connect();
    await this.enter(c);
    const self = this;
    return {
      pid: c.processID,
      async rpc(fn, args = {}) {
        const keys = Object.keys(args);
        const r = await c.query(
          `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as result`,
          keys.map((k) => param(args[k])));
        return r.rows[0].result;
      },
      async commit() { await c.query('commit'); await self.release(c); },
      async rollback() { await c.query('rollback'); await self.release(c); },
    };
  }

  // a separate connection for one call, for many calls at once
  async rpcOwn(fn, args = {}) {
    const c = await this.connect();
    try {
      await this.enter(c);
      const keys = Object.keys(args);
      try {
        const r = await c.query(
          `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as result`,
          keys.map((k) => param(args[k])));
        await c.query('commit');
        return r.rows[0].result;
      } catch (e) {
        await c.query('rollback').catch(() => {});
        throw e;
      }
    } finally {
      await this.release(c);
    }
  }

  async release(c) {
    this.clients = this.clients.filter((x) => x !== c);
    await c.end().catch(() => {});
  }

  async end() {
    for (const c of this.clients) await c.end().catch(() => {});
    this.clients = [];
    this.main = null;
  }
}

// wait until a backend is blocked on a lock (so a race is really a race)
export async function waitForLock(db, pid, ms = 5000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const r = await db.one('select wait_event_type from pg_stat_activity where pid = $1', [pid]);
    if (r && r.wait_event_type === 'Lock') return;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error('backend ' + pid + ' never waited on a lock');
}

// two moves at the same instant, lined up exactly: the first runs and holds its locks (uncommitted), the second starts
// and is seen waiting on a lock, then the first commits and the second finishes against what the first saved.
// Returns the first's result and the second's { ok } or { err }
export async function race(db, [actorA, fnA, argsA], [actorB, fnB, argsB]) {
  const a = await actorA.hold();
  const b = await actorB.hold();
  let first;
  try {
    first = await a.rpc(fnA, argsA);
  } catch (e) {
    await a.rollback();
    await b.rollback();
    throw e;
  }
  const second = b.rpc(fnB, argsB).then((ok) => ({ ok }), (err) => ({ err: { rule: err.hint || null, code: err.code, message: err.message } }));
  await waitForLock(db, b.pid);
  await a.commit();
  const r = await second;
  if (r.err) await b.rollback();
  else await b.commit();
  return { first, second: r };
}

// the error a refused move gives: which rule (the hint), the SQLSTATE and the message
export async function refusal(promise) {
  try {
    await promise;
  } catch (e) {
    return { rule: e.hint || null, code: e.code, message: e.message };
  }
  throw new Error('expected the database to refuse this');
}
