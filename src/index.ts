import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';

// ==========================================
// 1. 抽出設定（物理量の定義）
// ==========================================
const TARGET_SCHEMA = [
  { key: "FY_year", keywords: ["年度"] },
  { key: "population", keywords: ["住民基本台帳人口", "人口"] },
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

// ==========================================
// 2. ユーティリティ関数
// ==========================================

// 数値パース（カンマ、ハイフン、空白を除去して数値化）
function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).trim().replace(/,/g, '');
  if (str === '-' || str === '－' || str === '' || str === '＊') return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// 指紋（レイアウトのパターン）を生成
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

// キーワードの右側にある数値を探索して抽出
function autoExtract(matrix: any[][], keywords: string[]): number | null {
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || "").replace(/\s+/g, '');
      if (keywords.some(k => cellText.includes(k))) {
        // キーワード発見後、右側10列以内に数値があるか探す
        for (let nextC = c + 1; nextC < Math.min(c + 10, row.length); nextC++) {
          const val = parseNumber(row[nextC]);
          if (val !== null) return val;
        }
      }
    }
  }
  return null;
}

// ==========================================
// 3. メイン処理
// ==========================================
async function main() {
  await fs.ensureDir(XLSX_DIR);
  await fs.ensureDir(DATA_DIR);
  await fs.ensureDir(HABIT_DIR);

  const files = await fs.readdir(XLSX_DIR);
  const catalog: any = {};

  console.log(`🚀 Harvester Started: Found ${files.length} files.`);

  for (const file of files) {
    if (file.startsWith('.') || !file.match(/\.(xlsx|xls|csv)$/i)) continue;

    console.log(`🚜 Processing: ${file}`);
    const inputPath = path.join(XLSX_DIR, file);
    const fileName = path.parse(file).name;

    try {
      const workbook = XLSX.readFile(inputPath);
      const fileOutput: any = { 
        metadata: { source: file, timestamp: new Date().toISOString() }, 
        sheets: {} 
      };

      for (const sheetName of workbook.SheetNames) {
        // メタシート（目次など）はスキップ
        if (sheetName.match(/(目次|index|注意|原本|Menu|表紙)/i)) continue;

        const sheet = workbook.Sheets[sheetName];
        const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
        if (!rawMatrix || rawMatrix.length < 5) continue;

        // 行末の空セルを削除して圧縮
        const compressed = rawMatrix.map((r: any) => {
          const row = Array.isArray(r) ? [...r] : [];
          while (row.length > 0 && (row[row.length - 1] === "" || row[row.length - 1] === null || row[row.length - 1] === undefined)) {
            row.pop();
          }
          return row;
        }).filter(r => r.length > 0);

        if (compressed.length === 0) continue;

        // 指紋生成
        const habitId = createFingerprint(compressed);

        // 物理量の抽出
        const physics: any = {};
        let hasPhysicsData = false;
        for (const item of TARGET_SCHEMA) {
          const val = autoExtract(compressed, item.keywords);
          if (val !== null) {
            physics[item.key] = val;
            hasPhysicsData = true;
          }
        }

        // 癖（Habit）のサンプル保存
        const specificHabitDir = path.join(HABIT_DIR, habitId);
        await fs.ensureDir(specificHabitDir);
        if (!(await fs.pathExists(path.join(specificHabitDir, 'sample.json')))) {
          await fs.writeJson(path.join(specificHabitDir, 'sample.json'), compressed.slice(0, 50), { spaces: 2 });
        }

        // シートごとのデータを格納
        fileOutput.sheets[sheetName] = {
          habitId,
          physics: hasPhysicsData ? physics : "no_matching_data",
          preview: compressed.slice(0, 15) // 解析用に冒頭だけ残す
        };

        // カタログ用データ
        if (!catalog[fileName]) catalog[fileName] = { habitIds: [] };
        if (!catalog[fileName].habitIds.includes(habitId)) {
          catalog[fileName].habitIds.push(habitId);
        }
      }

      // ファイル単位で保存（full版とlite版）
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), fileOutput, { spaces: 2 });
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.lite.json`), fileOutput, { spaces: 0 });

      console.log(`  ✅ Success: ${file} (${Object.keys(fileOutput.sheets).length} data sheets)`);

    } catch (e: any) {
      console.error(`  ❌ Error in ${file}:`, e.message);
    }
  }

  // インデックスとカタログの最終出力
  await fs.writeJson(path.join(HABIT_DIR, 'catalog.json'), catalog, { spaces: 2 });
  await fs.writeJson(path.join(DATA_DIR, 'index.json'), { 
    updated: new Date().toISOString(), 
    totalFiles: Object.keys(catalog).length 
  }, { spaces: 2 });
  
  console.log(`🏁 All processes completed.`);
}

main().catch(err => {
  console.error('💥 Fatal Error:', err);
  process.exit(1);
});
