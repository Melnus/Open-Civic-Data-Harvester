import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';

// --- 抽出項目の定義（物理パラメータ） ---
const TARGET_SCHEMA = [
  { key: "population", keywords: ["住民基本台帳人口", "人口"] },
  { key: "total_revenue", keywords: ["歳入総額", "歳入合計", "歳入決算総額"] },
  { key: "total_expenditure", keywords: ["歳出総額", "歳出合計", "歳出決算総額"] },
  { key: "local_tax", keywords: ["地方税", "普通税", "都道府県税", "道府県税"] },
  { key: "consumption_tax_share", keywords: ["地方消費税"] },
  { key: "real_balance", keywords: ["実質収支"] },
];

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const HABIT_DIR = path.join(ROOT_DIR, 'habits');

function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).trim().replace(/,/g, '');
  if (str === '-' || str === '－' || str === '' || str === '＊') return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function createFingerprint(matrix: any[][]): string {
  const binaryRows = matrix.slice(0, 20).map(row => {
    let bits = "";
    for (let c = 0; c < 20; c++) {
      const hasValue = row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== "" && String(row[c]).trim() !== "-";
      bits += hasValue ? "1" : "0";
    }
    return bits;
  });
  while (binaryRows.length < 20) binaryRows.push("0".repeat(20));
  return createHash('md5').update(binaryRows.join("\n")).digest('hex').slice(0, 8);
}

function autoExtract(matrix: any[][], keywords: string[]): number | null {
  for (const row of matrix) {
    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || "").replace(/\s+/g, '');
      if (keywords.some(k => cellText.includes(k))) {
        for (let nextC = c + 1; nextC < Math.min(c + 10, row.length); nextC++) {
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
  console.log(`🚜 Flattening Harvest: Found ${files.length} files.`);

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
      const fileResults: any[] = []; // このファイル内の全自治体のリスト

      for (const sheetName of workbook.SheetNames) {
        if (sheetName.match(/(目次|index|注意|原本|Menu|表紙)/i)) continue;

        const rawMatrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
        if (rawMatrix.length < 5) continue;

        const habitId = createFingerprint(rawMatrix);
        
        // 物理量の抽出
        const physics: any = {};
        for (const item of TARGET_SCHEMA) {
          physics[item.key] = autoExtract(rawMatrix, item.keywords);
        }

        // --- データの平坦化 ---
        fileResults.push({
          fiscal_year: fiscalYear,
          prefecture: sheetName,
          habit_id: habitId,
          ...physics,
          source_file: file
        });

        // 癖（Habit）のサンプル保存
        const specificHabitDir = path.join(HABIT_DIR, habitId);
        await fs.ensureDir(specificHabitDir);
        if (!(await fs.pathExists(path.join(specificHabitDir, 'sample.json')))) {
          await fs.writeJson(path.join(specificHabitDir, 'sample.json'), rawMatrix.slice(0, 50), { spaces: 2 });
        }
      }

      // ファイル単位でフラットな配列として保存
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), fileResults, { spaces: 2 });
      console.log(`  ✅ Created flat list with ${fileResults.length} prefectures.`);

    } catch (e: any) {
      console.error(`  ❌ Error in ${file}:`, e.message);
    }
  }
}

main().catch(console.error);
