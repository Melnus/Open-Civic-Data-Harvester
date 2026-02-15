import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';

// --- 設定：抽出したい「物理量」とキーワードの定義 ---
const TARGET_SCHEMA = [
  { key: "FY_year", keywords: ["年度"] },
  { key: "population", keywords: ["住民基本台帳人口", "人口"] },
  { key: "total_revenue", keywords: ["歳入総額", "歳入合計", "歳入総計"] },
  { key: "total_expenditure", keywords: ["歳出総額", "歳出合計", "歳出総計"] },
  { key: "local_tax", keywords: ["地方税", "普通税"] },
  { key: "consumption_tax_share", keywords: ["地方消費税"] },
];

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const HABIT_DIR = path.join(ROOT_DIR, 'habits');

// 数値パース用（カンマやハイフンを処理）
function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).trim().replace(/,/g, '');
  if (str === '-' || str === '－' || str === '') return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// 指紋（レイアウトの癖）を生成する関数
function createFingerprint(matrix: any[][]): string {
  const SCAN_ROWS = 20;
  const SCAN_COLS = 20;
  const binaryRows = matrix.slice(0, SCAN_ROWS).map(row => {
    let bits = "";
    for (let c = 0; c < SCAN_COLS; c++) {
      const cell = row[c];
      const hasValue = cell !== undefined && cell !== null && String(cell).trim() !== "" && String(cell).trim() !== "-";
      bits += hasValue ? "1" : "0";
    }
    return bits;
  });
  while (binaryRows.length < SCAN_ROWS) binaryRows.push("0".repeat(SCAN_COLS));
  return createHash('md5').update(binaryRows.join("\n")).digest('hex').slice(0, 8);
}

// キーワードの右側にある数値を自動で探す関数
function autoExtract(matrix: any[][], keywords: string[]): any {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      const cellText = String(matrix[r][c] || "").replace(/\s+/g, '');
      if (keywords.some(k => cellText.includes(k))) {
        // キーワードが見つかったら、同じ行の右側を探索
        for (let nextC = c + 1; nextC < matrix[r].length; nextC++) {
          const val = parseNumber(matrix[r][nextC]);
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
  const catalog: any = {};

  for (const file of files) {
    if (file.startsWith('.') || !file.match(/\.(xlsx|xls|csv)$/i)) continue;

    try {
      console.log(`🚜 Harvesting: ${file}`);
      const workbook = XLSX.readFile(path.join(XLSX_DIR, file));
      const firstSheet = workbook.SheetNames[0];
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: "" }) as any[][];

      // 1. 指紋の検出
      const habitId = createFingerprint(matrix);

      // 2. 物理量の自動抽出
      const extracted: any = {};
      for (const item of TARGET_SCHEMA) {
        extracted[item.key] = autoExtract(matrix, item.keywords);
      }

      // 3. データの保存
      const fileName = path.parse(file).name;
      const output = {
        metadata: { source: file, habitId, timestamp: new Date().toISOString() },
        physics: extracted, // 抽出された物理量
        raw_lite: matrix.slice(0, 50) // 構造確認用に冒頭50行だけ残す
      };

      await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), output, { spaces: 2 });

      // 4. ハブ（癖）のサンプル保存
      const habitPath = path.join(HABIT_DIR, habitId);
      await fs.ensureDir(habitPath);
      if (!(await fs.pathExists(path.join(habitPath, 'sample.json')))) {
        await fs.writeJson(path.join(habitPath, 'sample.json'), matrix.slice(0, 40), { spaces: 2 });
      }

      catalog[file] = { habitId, physicsSummary: extracted };
      console.log(`  ✅ Done: Habit [${habitId}]`);

    } catch (e: any) {
      console.error(`  ❌ Error: ${file} - ${e.message}`);
    }
  }

  await fs.writeJson(path.join(DATA_DIR, 'index.json'), { updated: new Date().toISOString(), catalog }, { spaces: 2 });
}

main().catch(console.error);
