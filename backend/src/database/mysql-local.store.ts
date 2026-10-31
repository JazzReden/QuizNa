import { UserProfile } from '../common/types';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ConfigService } from '@nestjs/config';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { createPool, Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export const LOCAL_TABLES = {
  subjects: 'subject_rooms', subjectMembers: 'subject_members', subjectQuizzes: 'subject_quizzes', paperSheets: 'paper_sheets', profiles: 'profiles', quizzes: 'quizzes', questions: 'questions', quizVersions: 'quiz_versions',
  classes: 'class_sections', roster: 'section_students', sections: 'quiz_sections', attempts: 'quiz_attempts', answers: 'attempt_answers', incidents: 'quiz_incidents',
} as const;
export type LocalCollection = keyof typeof LOCAL_TABLES;
const JSON_FIELDS = new Set(['layout','options','correct_answer','snapshot_data','question_order','answer','details']);
const BOOLEAN_FIELDS = new Set(['require_access_code','leaderboard_enabled','randomize_questions','randomize_options','release_scores_immediately','release_answers_immediately','is_graded','is_manually_graded']);
const RESPONSE_FIELDS = new Set(['questions','student_profile','quiz','active_student','section_name']);

/** Development-only MariaDB repository. Every business transaction holds one
 * database mutex row, which keeps the demo service algorithms safe across API
 * processes. Transactions are deliberately serialized for small local datasets.
 * This adapter has no Supabase Auth/RLS/Realtime emulation.
 */
export class MysqlLocalStore {
  private readonly pool: Pool;
  private readonly context = new AsyncLocalStorage<PoolConnection>();
  constructor(config: ConfigService) {
    this.pool = createPool({
      host: config.get<string>('MYSQL_HOST') || '127.0.0.1',
      port: Number(config.get<string>('MYSQL_PORT') || 3306),
      socketPath: config.get<string>('MYSQL_SOCKET') || undefined,
      user: config.get<string>('MYSQL_USER') || 'quizna_local',
      password: config.get<string>('MYSQL_PASSWORD') || '',
      database: config.get<string>('MYSQL_DATABASE') || 'quizna_local',
      connectionLimit: 4, waitForConnections: true, queueLimit: 100,
      connectTimeout: 5000, decimalNumbers: true, charset: 'utf8mb4', jsonStrings: true,
      multipleStatements: false,
    });
  }
  get inTransaction() { return !!this.context.getStore(); }
  private get connection() { return this.context.getStore() || this.pool; }
  async initialize(seed: () => Promise<void>) {
    await this.transaction(async () => {
      const [rows] = await this.connection.execute<RowDataPacket[]>('SELECT schema_version,seeded FROM quizna_local_metadata WHERE id=1');
      await this.connection.execute('SELECT section_id,paper_sheet_id FROM quiz_attempts LIMIT 0');
      await this.connection.execute('SELECT exam_format FROM quizzes LIMIT 0');
      await this.connection.execute('SELECT id FROM paper_sheets LIMIT 0');
      await this.connection.execute('SELECT class_section_id FROM quiz_sections LIMIT 0');
      await this.connection.execute('SELECT id FROM class_sections LIMIT 0');
      await this.connection.execute('SELECT id FROM section_students LIMIT 0');
      await this.connection.execute('SELECT user_id FROM local_auth_credentials LIMIT 0');
      await this.connection.execute('SELECT access_hash FROM local_auth_sessions LIMIT 0');
      if (!rows[0] || rows[0].schema_version !== 1) throw new Error('Unsupported local schema');
      if (!rows[0].seeded) {
        await seed();
        await this.connection.execute('UPDATE quizna_local_metadata SET seeded=TRUE WHERE id=1');
      }
    });
  }
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.inTransaction) return work();
    const connection = await this.pool.getConnection().catch(() => { throw new ServiceUnavailableException('XAMPP database unavailable. Start MySQL in XAMPP and retry.'); });
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM quizna_local_metadata WHERE id=1 FOR UPDATE');
      const result = await this.context.run(connection, work);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => {});
      // Preserve business validation errors; infrastructure errors never fall back to memory.
      if (typeof error?.getStatus === 'function') throw error;
      throw new ServiceUnavailableException('Local database operation failed. Check the XAMPP connection and schema.');
    } finally { connection.release(); }
  }
  private decode<T>(row: RowDataPacket): T {
    const result = { ...row };
    delete result.active_student;
    for (const key of Object.keys(result)) {
      if (JSON_FIELDS.has(key) && typeof result[key] === 'string') result[key] = JSON.parse(result[key]);
      if (BOOLEAN_FIELDS.has(key)) result[key] = Boolean(result[key]);
      if (result[key] === null && !JSON_FIELDS.has(key)) delete result[key];
    }
    return result as T;
  }
  async get<T>(collection: LocalCollection, key: string): Promise<T | null> {
    const table = LOCAL_TABLES[collection];
    let where = 'id=?'; let params: (string | number)[] = [key];
    if (collection === 'answers') { where = 'attempt_id=? AND question_id=?'; params = key.split('_'); }
    if (collection === 'quizVersions') { const [quizId,version] = key.split('_'); where = 'quiz_id=? AND version_number=?'; params = [quizId,Number(version)]; }
    const [rows] = await this.connection.execute<RowDataPacket[]>(`SELECT * FROM \`${table}\` WHERE ${where}`,params);
    return rows[0] ? this.decode<T>(rows[0]) : null;
  }
  async all<T>(collection: LocalCollection): Promise<T[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(`SELECT * FROM \`${LOCAL_TABLES[collection]}\``);
    return rows.map(row => this.decode<T>(row));
  }
  async find<T>(collection: LocalCollection, filters: Record<string,string>): Promise<T[]> {
    const fields=Object.keys(filters);
    if(!fields.length || fields.some(field=>!/^[a-z_]+$/.test(field))) throw new Error('Invalid database filter');
    const [rows]=await this.connection.execute<RowDataPacket[]>(`SELECT * FROM \`${LOCAL_TABLES[collection]}\` WHERE ${fields.map(field=>`\`${field}\`=?`).join(' AND ')}`,fields.map(field=>filters[field]));
    return rows.map(row=>this.decode<T>(row));
  }
  async put<T extends object>(collection: LocalCollection, row: T) {
    const fields = Object.keys(row).filter(key => !RESPONSE_FIELDS.has(key));
    if (fields.some(key => !/^[a-z_]+$/.test(key))) throw new Error('Unsupported record field');
    const values = fields.map(key => JSON_FIELDS.has(key) && row[key] !== undefined ? JSON.stringify(row[key]) : row[key] ?? null);
    const columns = fields.map(key => `\`${key}\``);
    const updates = columns.filter(key => key !== '`id`').map(key => `${key}=VALUES(${key})`);
    if (collection === 'sections' || collection === 'classes') {
      try { await this.connection.execute(`INSERT INTO \`${LOCAL_TABLES[collection]}\` (${columns.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,values); }
      catch (error) { if (error?.code === 'ER_DUP_ENTRY') throw new ConflictException('A section with this name already exists'); throw error; }
      return;
    }
    await this.connection.execute(`INSERT INTO \`${LOCAL_TABLES[collection]}\` (${columns.join(',')}) VALUES (${fields.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${updates.join(',')}`,values);
  }
  async remove(collection: LocalCollection, id: string): Promise<boolean> {
    const [result] = await this.connection.execute<ResultSetHeader>(`DELETE FROM \`${LOCAL_TABLES[collection]}\` WHERE id=?`,[id]);
    return result.affectedRows > 0;
  }
  async authEmailExists(email: string): Promise<boolean> {
    const [rows]=await this.connection.execute<RowDataPacket[]>('SELECT id FROM profiles WHERE email=?',[email]);
    return rows.length>0;
  }
  async saveAuthCredential(userId: string, passwordHash: string) {
    await this.connection.execute('INSERT INTO local_auth_credentials(user_id,password_hash) VALUES(?,?)',[userId,passwordHash]);
  }
  async authCredential(email: string): Promise<{ profile: UserProfile; passwordHash: string } | null> {
    const [rows]=await this.connection.execute<RowDataPacket[]>('SELECT p.*,c.password_hash FROM profiles p JOIN local_auth_credentials c ON c.user_id=p.id WHERE p.email=?',[email]);
    if(!rows[0]) return null;
    const {password_hash,...profile}=rows[0];
    return {profile:profile as UserProfile,passwordHash:password_hash};
  }
  async saveAuthSession(session: LocalAuthSession) {
    await this.connection.execute('DELETE FROM local_auth_sessions WHERE refresh_expires_at<=?',[new Date().toISOString()]);
    await this.connection.execute('INSERT INTO local_auth_sessions(access_hash,refresh_hash,user_id,access_expires_at,refresh_expires_at,created_at) VALUES(?,?,?,?,?,?)',
      [session.access_hash,session.refresh_hash,session.user_id,session.access_expires_at,session.refresh_expires_at,session.created_at]);
  }
  async authSession(kind: 'access' | 'refresh', hash: string): Promise<LocalAuthSession | null> {
    const column=kind==='access'?'access_hash':'refresh_hash';
    const [rows]=await this.connection.execute<RowDataPacket[]>(`SELECT * FROM local_auth_sessions WHERE ${column}=?`,[hash]);
    return rows[0] as LocalAuthSession || null;
  }
  async deleteAuthSession(accessHash: string) {
    await this.connection.execute('DELETE FROM local_auth_sessions WHERE access_hash=?',[accessHash]);
  }
  async revokeAuthSessions(accessHash: string, refreshHash: string) {
    await this.connection.execute('DELETE FROM local_auth_sessions WHERE access_hash=? OR refresh_hash=?',[accessHash,refreshHash]);
  }
  async close() { await this.pool.end(); }
}

export interface LocalAuthSession {
  access_hash: string; refresh_hash: string; user_id: string;
  access_expires_at: string; refresh_expires_at: string; created_at: string;
}
