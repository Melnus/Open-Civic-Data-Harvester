import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';

const TARGET_SCHEMA = [
  { key: "FY_year", keywords: ["年度"] },
  { key: "population", keywords: ["住民基本台帳人口", "人口"] },
  { key: "total_revenue", keywords: ["歳入総額", "歳入合計", "歳入総計", "歳入決算総額"] },
  { key: "total_expenditure", keywords: ["歳出総額", "歳出合計", "歳出総計", "歳出決算総額"] },
  { key: "local_tax", keywords: ["地方税", "普通税", "都道府県税"] },
  { key: "consumption_tax_share", keywords: ["地方消費税"] },
];

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const HABIT_DIR = path.join(ROOT_DIR, 'habits');

function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).trim().replace(/,/g, '');
  if (str === '-' || str === '－' || str === '') return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

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
    return bits.padEnd(SCAN_COLS, "0");
  });
  while (binaryRows.length < SCAN_ROWS) binaryRows.push("0".repeat(SCAN_COLS));
  return createHash('md5').update(binaryRows.join("\n")).digest('hex').slice(0, 8);
}

function autoExtract(matrix: any[][], keywords: string[]): any {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; r++) {
      const cellText = String(matrix[r][c] || "").replace(/\s+/g, '');
      if (keywords.some(k => cellText.includes(k))) {
        // キーワードが見つかったら、右側10セル分を探す
        for (let nextC = c + 1; nextC < Math.min(c + 10, matrix[r].length); nextC++) {
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
      const fileData: any = { metadata: { source: file, timestamp: new Date().toISOString() }, sheets: {} };

      // 【改良点】全シートをループする
      for (const sheetName of workbook.SheetNames) {
        // 「目次」「index」「注意事項」などの名前のシートは飛ばす（ヒューリスティック）
        if (sheetName.match(/(目次|index|注意|原本|Menu)/i)) continue;

        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
        if (matrix.length < 5) continue; // データが少なすぎるシートは無視

        const habitId = createFingerprint(matrix);
        const extracted: any = {};
        let hasData = false;

        for (const item of TARGET_SCHEMA) {
          const val = autoExtract(matrix, item.keywords);
          if (val !== null) {
            extracted[item.key] = val;
            hasData = true; 
          }
        }

        // 何かしらデータが抜けたシートだけを保存
        if (hasData) {
          fileData.sheets[sheetName] = {
            habitId,
            physics: extracted,
            preview: matrix.slice(0, 15) // 最初の15行だけ確認用に残す
          };

          // 癖のサンプルを保存
          const habitPath = path.join(HABIT_DIR, habitId);
          await fs.ensureDir(habitPath);
          if (!(await fs.pathExists(path.join(habitPath, 'sample.json')))) {
            await fs.writeJson(path.join(habitPath, 'sample.json'), matrix.slice(0, 50), { spaces: 2 });
          }
        }
      }

      const fileName = path.parse(file).name;
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), fileData, { spaces: 2 });
      console.log(`  ✅ Done: ${Object.keys(fileData.sheets).length} sheets extracted.`);

    } catch (e: any) {
      console.error(`  ❌ Error: ${file} - ${e.message}`);
    }
  }

  await fs.writeJson(path.join(DATA_DIR, 'index.json'), { updated: new Date().toISOString() }, { spaces: 2 });
}

main().catch(console.error);
