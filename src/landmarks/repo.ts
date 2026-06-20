import type { DatabaseSync } from 'node:sqlite';
export type LandmarkRow = { id:number; keyword:string; aliases:string; directions:string; priority:number };
export function listLandmarks(db: DatabaseSync): LandmarkRow[] {
  return db.prepare('select * from landmarks order by priority desc').all() as any;
}
export function insertLandmark(db: DatabaseSync, l: Omit<LandmarkRow,'id'>): number {
  return Number(db.prepare(
    'insert into landmarks (keyword,aliases,directions,priority) values (?,?,?,?)'
  ).run(l.keyword, l.aliases, l.directions, l.priority).lastInsertRowid);
}
