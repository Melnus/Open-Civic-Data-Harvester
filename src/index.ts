import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const HABIT_DIR = path.join(ROOT_DIR, 'habits');

async function main() {
  await fs.ensureDir(XLSX_DIR);
  await fs.ensureDir(DATA_DIR);
  await fs.ensureDir(HABIT_DIR);

  const files = await fs.readdir(XLSX_DIR);
  const catalog: any = {};

  console.log(`🚀 Harvesting: Found ${files.length} files.`);

  for (const file of files) {
    if (!file.match(/\.(xlsx|xls|csv)$/i)) continue;

    console.log(`🚜 Processing: ${file}`);
    const inputPath = path.join(XLSX_DIR, file);
    const fileName = path.parse(file).name;

    try {
      const workbook = XLSX.readFile(inputPath);
      const allSheets: any = {};
      const liteData: any = {};

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        // 行列形式で取得。defval: "" を指定して undefined を回避
        const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
        if (!rawMatrix || rawMatrix.length === 0) continue;

        // 行の末尾の空要素を削り、有効な行だけを残す
        const compressed = rawMatrix.map((r: any) => {
          if (!Array.isArray(r)) return []; // 配列でない場合は空配列を返す（エラー対策）
          const row = [...r];
          while (row.length > 0 && (row[row.length - 1] === "" || row[row.length - 1] === null || row[row.length - 1] === undefined)) {
            row.pop();
          }
          return row;
        }).filter(r => r.length > 0);

        if (compressed.length === 0) continue;

        // 【指紋生成】
        // 最初の20行の「値がある場所(1)」「ない場所(0)」をパターン化
        const fingerprintBase = compressed.slice(0, 20).map(row => 
          row.map(cell => (cell === "" || cell === null ? "0" : "1")).join("")
        ).join("\n");
        
        const habitHash = createHash('md5').update(fingerprintBase).digest('hex').slice(0, 8);

        // 癖（Habit）の保存
        const specificHabitDir = path.join(HABIT_DIR, habitHash);
        await fs.ensureDir(specificHabitDir);
        if (!(await fs.pathExists(path.join(specificHabitDir, 'sample.json')))) {
          await fs.writeJson(path.join(specificHabitDir, 'sample.json'), compressed.slice(0, 30), { spaces: 2 });
        }

        allSheets[sheetName] = compressed;
        liteData[sheetName] = compressed.slice(0, 15);
        
        // カタログに記録
        if (!catalog[fileName]) catalog[fileName] = { habits: [] };
        catalog[fileName].habits.push({ sheet: sheetName, habitId: habitHash });
      }

      // 最終的なデータ保存
      await fs.writeFile(path.join(DATA_DIR, `${fileName}.json`), JSON.stringify(allSheets));
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.lite.json`), liteData, { spaces: 0 });

      console.log(`✅ Success: ${file}`);

    } catch (e: any) {
      console.error(`❌ Error in ${file}:`, e.message);
    }
  }

  await fs.writeJson(path.join(HABIT_DIR, 'catalog.json'), catalog, { spaces: 2 });
}

main().catch(err => {
  console.error('💥 Fatal Error:', err);
  process.exit(1);
});
