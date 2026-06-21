import type { DatabaseSync } from 'node:sqlite';
import { insertLandmark } from './repo.js';
const CURATED = [
  { keyword:'Metro Pillar 25', aliases:'pillar 25,metro pillar 25,pillar number 25,khamba 25,pillar twenty five',
    directions:'Aryan Enterprises bilkul Metro Pillar number 25 ke saamne hai. Bosch aur Havells ka board laga hai, saamne nariyal wala khada hota hai.',
    priority:100 },
  { keyword:'Kishwarna Eye Hospital', aliases:'kishwarna,eye hospital,aankh wala hospital,charitable hospital',
    directions:'Kishwarna Charitable Eye Hospital ke bilkul baaju mein Aryan Enterprises hai - Bosch aur Havells board wali dukaan, nariyal wale ke saamne.',
    priority:80 },
  { keyword:'Nariyal wala', aliases:'nariyal wala,coconut,nariyal pani,nariyal',
    directions:'Jis nariyal wale ke saamne aap khade hain, bilkul uske saamne Aryan Enterprises hai - Bosch aur Havells board.',
    priority:70 },
  { keyword:'Canara Bank', aliases:'canara bank,canara,bank,pillar 24',
    directions:'Canara Bank se Faridabad ki taraf paanch dukaan aage chaliye. Aryan Enterprises - Bosch aur Havells board, saamne nariyal wala.',
    priority:60 },
  { keyword:'Badarpur Flyover / Mathura Road', aliases:'flyover,badarpur flyover,mathura road,highway',
    directions:'Mathura Road par Bankey Lal Market, Metro Pillar 25 ke saamne, Canara Bank se Faridabad ki taraf 5 dukaan aage.',
    priority:40 },
  { keyword:'Badarpur Border', aliases:'bk,badarpur border,border,badarpur metro,mohan estate,bup',
    directions:'Badarpur Border se Mathura Road pakad ke Faridabad ki taraf seedha chaliye. Metro Pillar number 25 aur Canara Bank ki taraf aao.',
    priority:50 },
];
export function seedLandmarks(db: DatabaseSync) {
  const exists = db.prepare('select 1 from landmarks limit 1').get();
  if (exists) return;
  for (const l of CURATED) insertLandmark(db, l);
}
