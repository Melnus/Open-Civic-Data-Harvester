import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');

async function main() {
  await fs.ensureDir(XLSX_DIR);
  await fs.ensureDir(DATA_DIR);

  const files = await fs.readdir(XLSX_DIR);

  for (const file of files) {
    if (!file.match(/\.(xlsx|xls|csv)$/i)) continue;

    try {
      console.log(`Processing: ${file}`);
      const workbook = XLSX.readFile(path.join(XLSX_DIR, file));
      
      // 全シートを格納するオブジェクト
      const allSheetsData: any = {};
      // 構造確認用のLite版（各シートの数行だけを抽出）
      const liteData: any = {};

      workbook.SheetNames.forEach(sheetName => {
        // 各シートを行列形式で取得
        const rawMatrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];

        // データの圧縮（空要素の削除）
        const compressedMatrix = rawMatrix
          .map(row => {
            while (row.length > 0 && (row[row.length - 1] === "" || row[row.length - 1] === null)) {
              row.pop();
            }
            return row;
          })
          .filter(row => row.length > 0);

        if (compressedMatrix.length > 0) {
          allSheetsData[sheetName] = compressedMatrix;
          liteData[sheetName] = compressedMatrix.slice(0, 15); // 構造確認用に各シート15行だけ抽出
        }
      });

      const fileName = path.parse(file).name;

      // フル版（API用）
      await fs.writeFile(path.join(DATA_DIR, `${fileName}.json`), JSON.stringify(allSheetsData));
      
      // Lite版（LLM分析用：各シートの冒頭だけ入っているので構造がすぐわかる）
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.lite.json`), liteData, { spaces: 2 });

      console.log(`✅ Success: ${file} (${workbook.SheetNames.length} sheets)`);
    } catch (e: any) {
      console.error(`❌ Error: ${file}`, e.message);
    }
  }

  // index.jsonの更新
  const jsonFiles = (await fs.readdir(DATA_DIR)).filter(f => f.endsWith('.json') && f !== 'index.json');
  await fs.writeJson(path.join(DATA_DIR, 'index.json'), { updated: new Date().toISOString(), files: jsonFiles });
}

main().catch(console.error);
