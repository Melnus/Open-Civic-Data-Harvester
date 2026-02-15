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
      const workbook = XLSX.readFile(path.join(XLSX_DIR, file));
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // header: 1 で「行列（配列の配列）」として抽出
      const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

      // 完全に空の行を削除し、各行の末尾の空要素を削って圧縮
      const compressedMatrix = rawMatrix
        .map(row => {
          // 行の末尾にある空要素を削除
          while (row.length > 0 && (row[row.length - 1] === "" || row[row.length - 1] === null)) {
            row.pop();
          }
          return row;
        })
        .filter(row => row.length > 0); // 空行を削除

      const fileName = path.parse(file).name;

      // フル版：インデントなしで保存
      await fs.writeFile(path.join(DATA_DIR, `${fileName}.json`), JSON.stringify(compressedMatrix));
      
      // Lite版：構造確認用に最初の50行だけを見やすく保存
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.lite.json`), compressedMatrix.slice(0, 50), { spaces: 2 });

      console.log(`Converted: ${file} (Rows: ${compressedMatrix.length})`);
    } catch (e: any) {
      console.error(`Error: ${file}`, e.message);
    }
  }
}

main().catch(console.error);
