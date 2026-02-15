import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';

// ■ 設定: フォルダの場所 (process.cwd() を使うことで実行環境に依存しないように変更)
const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx'); // Excel置き場
const DATA_DIR = path.join(ROOT_DIR, 'data'); // JSON出力先

// ■ 設定: 自動ダウンロードURL（必要なければ [] 空にしてください）
const TARGET_URLS = [
  {
    name: 'FY2022-local_finance_prefectures', 
    url: 'https://www.soumu.go.jp/main_content/000925769.xls' 
  }
];

async function main() {
  console.log('🚀 Starting Harvester...');

  // 1. フォルダ準備
  await fs.ensureDir(XLSX_DIR);
  await fs.ensureDir(DATA_DIR);

  // 2. 自動ダウンロードフェーズ
  console.log('\n--- Phase 1: Downloading ---');
  for (const target of TARGET_URLS) {
    try {
      const ext = path.extname(target.url) || '.xlsx';
      const savePath = path.join(XLSX_DIR, `${target.name}${ext}`);

      if (await fs.pathExists(savePath)) {
        console.log(`⏭️  Already exists: ${target.name}`);
      } else {
        console.log(`⬇️  Downloading: ${target.name}...`);
        const response = await axios.get(target.url, { responseType: 'arraybuffer', timeout: 30000 });
        await fs.writeFile(savePath, response.data);
        console.log(`✅ Saved: ${target.name}${ext}`);
      }
    } catch (error: any) {
      console.error(`❌ Download Failed (${target.name}):`, error.message);
    }
  }

  // 3. 変換フェーズ
  console.log('\n--- Phase 2: Converting ---');
  const files = await fs.readdir(XLSX_DIR);
  console.log(`Found ${files.length} files in xlsx/ folder.`);

  for (const file of files) {
    // 拡張子チェック (iをつけて大文字小文字を区別しないように修正)
    if (!file.match(/\.(xlsx|xls|csv|ods)$/i)) {
      console.log(`⏩ Skipping non-excel file: ${file}`);
      continue;
    }

    const inputPath = path.join(XLSX_DIR, file);
    const fileNameWithoutExt = path.parse(file).name;
    const outputPath = path.join(DATA_DIR, `${fileNameWithoutExt}.json`);

    try {
      console.log(`⚙️  Processing: ${file}`);
      const workbook = XLSX.readFile(inputPath);
      const result: any = {};

      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        // セル内の改行や空白を考慮し、空セルはnullを入れる
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });
        
        if (workbook.SheetNames.length === 1) {
          result.data = json; // シートが1枚なら直下に配列を置く
        } else {
          result[sheetName] = json; // 複数あればシート名で分ける
        }
      });

      await fs.writeJson(outputPath, result, { spaces: 2 });
      console.log(`✨ Generated: ${fileNameWithoutExt}.json`);

    } catch (error: any) {
      console.error(`❌ Convert Error (${file}):`, error.message);
    }
  }

  // 4. インデックス作成
  console.log('\n--- Phase 3: Indexing ---');
  const jsonFiles = (await fs.readdir(DATA_DIR)).filter(f => f.toLowerCase().endsWith('.json') && f !== 'index.json');
  await fs.writeJson(path.join(DATA_DIR, 'index.json'), {
    updated_at: new Date().toISOString(),
    total_files: jsonFiles.length,
    files: jsonFiles
  }, { spaces: 2 });
  
  console.log('🎉 Harvest Complete!');
}

main().catch(err => {
  console.error('💥 Critical Error:', err);
  process.exit(1);
});
