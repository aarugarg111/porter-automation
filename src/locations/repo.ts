import type { DatabaseSync } from 'node:sqlite';
export interface LocationInput { nickname:string; relationship:string; contact_person?:string;
  phone?:string; address?:string; lat?:number; lng?:number; default_direction?:string;
  default_vehicle?:string; default_payer?:string; landmark_notes?:string; }
export function createLocation(db: DatabaseSync, i: LocationInput) {
  return db.prepare(`insert into locations
    (nickname,relationship,contact_person,phone,address,lat,lng,default_direction,default_vehicle,default_payer,landmark_notes)
    values (@nickname,@relationship,@contact_person,@phone,@address,@lat,@lng,@default_direction,@default_vehicle,@default_payer,@landmark_notes)`)
    .run({ contact_person:null,phone:null,address:null,lat:null,lng:null,default_direction:null,
      default_vehicle:null,default_payer:'ME',landmark_notes:null, ...i }).lastInsertRowid;
}
export function listLocations(db: DatabaseSync): any[] { return db.prepare('select * from locations').all(); }
export function getLocation(db: DatabaseSync, id:number): any { return db.prepare('select * from locations where id=?').get(id); }
export function importCsv(db: DatabaseSync, csv: string): number {
  const [head, ...rows] = csv.trim().split(/\r?\n/);
  const cols = head.split(',');
  let n=0;
  for (const line of rows) { if (!line.trim()) continue;
    const vals = line.split(','); const rec:any = {};
    cols.forEach((c,idx)=> rec[c.trim()] = vals[idx]?.trim() || undefined);
    createLocation(db, { nickname: rec.nickname, relationship: rec.relationship || 'both',
      contact_person: rec.contact_person, phone: rec.phone, address: rec.full_address,
      default_payer: rec.default_payer, landmark_notes: rec.notes }); n++; }
  return n;
}
