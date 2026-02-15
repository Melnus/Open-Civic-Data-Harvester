import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const TARGET_URLS = [
  {
    name: 'FY2022-local_finance_prefectures', 
    url: 'https://www.soumu.go.jp/main_content/000925769.xls' 
  }
];

async function main() {
  await fs.ensureDir(XLSX_DIR);
  await fs.ensureDir(DATA_DIR);

  console.log('Phase 1: Downloading target files...');
  for (const target of TARGET_URLS) {
    try {
      const ext = path.extname(target.url) || '.xlsx';
      const savePath = path.join(XLSX_DIR, `${target.name}${ext}`);
      if (!(await fs.pathExists(savePath))) {
        const res = await axios.get(target.url, { responseType: 'arraybuffer' });
        await fs.writeFile(savePath, res.data);
      }
    } catch (e) {
      console.error(`Download failed: ${target.name}`);
    }
  }

  console.log('Phase 2: Converting and compressing files...');
  const files = await fs.readdir(XLSX_DIR);

  for (const file of files) {
    if (!file.match(/\.(xlsx|xls|csv)$/i)) continue;

    const inputPath = path.join(XLSX_DIR, file);
    const fileName = path.parse(file).name;

    try {
      const workbook = XLSX.readFile(inputPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const compressedData = (rawData as any[]).map(row => {
        const newRow: any = {};
        for (const key in row) {
          let val = row[key];
          
          if (typeof val === 'string') {
            const num = parseFloat(val.replace(/,/g, ''));
            if (!isNaN(num)) val = num;
          }

          const cleanKey = key.replace(/\r?\n/g, "").trim();
          // トークン節約のため、空文字、ハイフン、0、nullの項目は除外する
          if (val !== "" && val !== "-" && val !== 0 && val !== null) {
            newRow[cleanKey] = val;
          }
        }
        return newRow;
      }).filter(row => Object.keys(row).length > 2);

      // フル版（API/システム用）：インデントを消してファイルサイズを最小化
      await fs.writeFile(
        path.join(DATA_DIR, `${fileName}.json`), 
        JSON.stringify(compressedData)
      );
      
      // Lite版（LLM分析用）：最初の10件だけを抽出し、見やすく整形
      await fs.writeJson(
        path.join(DATA_DIR, `${fileName}.lite.json`), 
        compressedData.slice(0, 10), 
        { spaces: 2 }
      );

      console.log(`Processed: ${file} (Items: ${compressedData.length})`);
    } catch (e: any) {
      console.error(`Error processing ${file}:`, e.message);
    }
  }

  const jsonFiles = (await fs.readdir(DATA_DIR)).filter(f => f.endsWith('.json') && f !== 'index.json');
  await fs.writeJson(path.join(DATA_DIR, 'index.json'), { 
    updated_at: new Date().toISOString(), 
    files: jsonFiles 
  });
}

main().catch(console.error);
