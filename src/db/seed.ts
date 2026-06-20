import type { DatabaseSync } from 'node:sqlite';
export function seedHome(db: DatabaseSync) {
  const exists = db.prepare("select 1 from locations where is_home=1").get();
  if (exists) return;
  db.prepare(`insert into locations (nickname,relationship,address,lat,lng,is_home,landmark_notes)
    values (?,?,?,?,?,1,?)`).run('Aryan Enterprises (HOME)','both',
    '446 Bankey Lal Market, opp Red Light, Badarpur, New Delhi 110044',
    28.5000777, 77.3018299,
    'Metro Pillar 25 ke saamne; Canara Bank se Faridabad 5 dukaan; nariyal wale ke saamne; Kishwarna Eye Hospital ke baaju; Bosch+Havells board');
}
