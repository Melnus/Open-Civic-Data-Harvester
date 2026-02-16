import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';

// ==========================================
// 1. 抽出項目の定義（物理パラメータ・アンカー）
// ==========================================
const TARGET_SCHEMA = [
  { key: "population", keywords: ["住民基本台帳人口", "人口", "27年国調"] },
  { key: "total_revenue", keywords: ["歳入総額", "歳入決算総額", "歳入合計", "歳入総計"] },
  { key: "total_expenditure", keywords: ["歳出総額", "歳出決算総額", "歳出合計", "歳出総計"] },
  { key: "local_tax", keywords: ["地方税", "普通税", "都道府県税", "道府県税"] },
  { key: "consumption_tax_share", keywords: ["地方消費税"] },
  { key: "real_balance", keywords: ["実質収支"] },
];

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const HABIT_DIR = path.join(ROOT_DIR, 'habits');

// 数値パース（クソエクセル特有の記号を掃除）
function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).trim().replace(/,/g, '');
  // ハイフンやアスタリスク（秘匿）は数値なしとして扱う
  if (str === '-' || str === '－' || str === '' || str === '＊' || str === '*') return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// 指紋（レイアウト構造のハッシュ）を生成
function createFingerprint(matrix: any[][]): string {
  const binaryRows = matrix.slice(0, 20).map(row => {
    let bits = "";
    for (let c = 0; c < 20; c++) {
      const cell = row[c];
      const hasValue = cell !== undefined && cell !== null && String(cell).trim() !== "" && String(cell).trim() !== "-";
      bits += hasValue ? "1" : "0";
    }
    return bits;
  });
  while (binaryRows.length < 20) binaryRows.push("0".repeat(20));
  return createHash('md5').update(binaryRows.join("\n")).digest('hex').slice(0, 8);
}

// キーワードの右側にある数値を「広範囲」に探索
function autoExtract(matrix: any[][], keywords: string[]): number | null {
  for (const row of matrix) {
    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || "").replace(/\s+/g, ''); // 空白を消して比較
      if (keywords.some(k => cellText.includes(k))) {
        // クソエクセルは列が非常に多いため、右側100セル分を探索する
        for (let nextC = c + 1; nextC < Math.min(c + 100, row.length); nextC++) {
          const val = parseNumber(row[nextC]);
          if (val !== null) return val;
        }
      }
    }
  }
  return null;
}

async function main() {
  await fs.ensureDir(XLSX_DIR);
  await fs.ensureDir(DATA_DIR);
  await fs.ensureDir(HABIT_DIR);

  const files = await fs.readdir(XLSX_DIR);
  console.log(`🚜 Deep Harvesting: Found ${files.length} files.`);

  for (const file of files) {
    if (file.startsWith('.') || !file.match(/\.(xlsx|xls|csv)$/i)) continue;

    console.log(`🚜 Processing: ${file}`);
    const inputPath = path.join(XLSX_DIR, file);
    const fileName = path.parse(file).name;
    
    // ファイル名から年度を取得 (FY2015 -> 2015)
    const yearMatch = fileName.match(/FY(\d{4})/);
    const fiscalYear = yearMatch ? parseInt(yearMatch[1]) : null;

    try {
      const workbook = XLSX.readFile(inputPath);
      const fileResults: any[] = [];

      for (const sheetName of workbook.SheetNames) {
        // 目次や注意書きシートを除外
        if (sheetName.match(/(目次|index|注意|原本|Menu|表紙|概況|付表)/i)) continue;

        const rawMatrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
        if (rawMatrix.length < 10) continue;

        const habitId = createFingerprint(rawMatrix);
        
        // 物理量の抽出
        const physics: any = {};
        for (const item of TARGET_SCHEMA) {
          physics[item.key] = autoExtract(rawMatrix, item.keywords);
        }

        // 自治体名がシート名になっている前提
        fileResults.push({
          fiscal_year: fiscalYear,
          prefecture: sheetName,
          habit_id: habitId,
          ...physics,
          source_file: file
        });

        // 癖（Habit）のサンプル保存（未登録の指紋のみ）
        const habitPath = path.join(HABIT_DIR, habitId);
        if (!(await fs.pathExists(habitPath))) {
          await fs.ensureDir(habitPath);
          await fs.writeJson(path.join(habitPath, 'sample.json'), rawMatrix.slice(0, 60), { spaces: 2 });
        }
      }

      // 出力保存
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), fileResults, { spaces: 2 });
      console.log(`  ✅ Success: ${fileResults.length} prefectures harvested.`);

    } catch (e: any) {
      console.error(`  ❌ Error in ${file}:`, e.message);
    }
  }
  
  console.log(`🏁 All processes completed.`);
}

main().catch(console.error);
