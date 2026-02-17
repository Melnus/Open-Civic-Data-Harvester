// src/index.ts
import * as fs from 'fs-extra';
import * as path from 'path';
import * as XLSX from 'xlsx';

// 各モードの抽出ロジック
import { extractSettlement } from './modes/settlement';
import { extractMigration } from './modes/migration';
import { extractPopulation } from './modes/population';

// ★追加: 辞書をインポート
import { LEXICON } from './data/lexicon';

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DOCS_DIR = path.join(ROOT_DIR, 'docs'); // ★追加

async function main() {
  await fs.ensureDir(DATA_DIR);
  await fs.ensureDir(XLSX_DIR);
  await fs.ensureDir(DOCS_DIR); // ★追加

  // ▼▼▼ 追加: 辞書をWebポータル用にJSON化して出力 ▼▼▼
  const lexiconPath = path.join(DOCS_DIR, 'lexicon.json');
  await fs.writeJson(lexiconPath, LEXICON, { spaces: 2 });
  console.log(`📚 Synced Lexicon to Web Portal: ${lexiconPath}`);
  // ▲▲▲ 追加ここまで ▲▲▲
  
  const files = await fs.readdir(XLSX_DIR);

  for (const file of files) {
    if (file.startsWith('.') || !file.match(/\.(xlsx|xls)$/i)) continue;
    console.log(`\n🚜 Processing: ${file}`);
    
    const workbook = XLSX.readFile(path.join(XLSX_DIR, file));
    const fileName = path.parse(file).name;
    const fileYearMatch = fileName.match(/FY(\d{4})/);
    const fiscalYear = fileYearMatch ? parseInt(fileYearMatch[1]) : 2025;

    let results: any[] = [];

    // モード振り分け
    if (file.includes("migration")) {
      results = extractMigration(workbook, fiscalYear, file);
    } else if (file.includes("population")) {
      results = extractPopulation(workbook, fiscalYear, file);
    } else {
      results = extractSettlement(workbook, fiscalYear, file);
    }

    // 重複除外
    const uniqueMap = new Map();
    results.forEach(r => {
      const key = `${r.fiscal_year}-${r.area || r.prefecture}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, r);
    });
    const finalData = Array.from(uniqueMap.values());

    if (finalData.length > 0) {
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), finalData, { spaces: 2 });
      console.log(`  ✅ Extracted ${finalData.length} records.`);
    } else {
      console.log(`  ⚠️ No data extracted.`);
    }
  }
}

main().catch(console.error);
