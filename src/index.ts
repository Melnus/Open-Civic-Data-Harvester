// src/index.ts
import * as fs from 'fs-extra';
import * as path from 'path';
import * as XLSX from 'xlsx';

// 各モードの抽出ロジックをインポート
import { extractSettlement } from './modes/settlement';
import { extractMigration } from './modes/migration';
import { extractPopulation } from './modes/population';

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');

async function main() {
  await fs.ensureDir(DATA_DIR);
  // xlsxフォルダがなければ作成しておく（初回エラー防止）
  await fs.ensureDir(XLSX_DIR); 
  
  const files = await fs.readdir(XLSX_DIR);

  for (const file of files) {
    if (file.startsWith('.') || !file.match(/\.(xlsx|xls)$/i)) continue;
    console.log(`\n🚜 Processing: ${file}`);
    
    const workbook = XLSX.readFile(path.join(XLSX_DIR, file));
    const fileName = path.parse(file).name;
    // ファイル名から年度判定 (FY2025など)
    const fileYearMatch = fileName.match(/FY(\d{4})/);
    const fiscalYear = fileYearMatch ? parseInt(fileYearMatch[1]) : 2025;

    let results: any[] = [];

    // --- モード振り分け ---
    // ここに新しいモードを追記していけばOK
    if (file.includes("migration")) {
      results = extractMigration(workbook, fiscalYear, file);
    } else if (file.includes("population")) {
      results = extractPopulation(workbook, fiscalYear, file);
    } else {
      // デフォルトは決算カードモード
      results = extractSettlement(workbook, fiscalYear, file);
    }

    // 重複除外 (共通処理)
    const uniqueMap = new Map();
    results.forEach(r => {
      // 一意制約キー：年度-地域名
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
