import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';

// ■ 設定: フォルダの場所
const XLSX_DIR = path.join(__dirname, '../xlsx'); // Excel置き場
const DATA_DIR = path.join(__dirname, '../data'); // JSON出力先

// ■ 設定: 自動で取りに行きたいURLリスト
// ※ここにURLを足せば勝手にダウンロードしてxlsxフォルダに入れます
const TARGET_URLS = [
  // 総務省: 令和4年度 決算カード (都道府県)
  // 例: https://www.soumu.go.jp/main_content/000999084.xlsx
  {
    name: 'soumu_r4_prefectures', 
    url: 'https://www.soumu.go.jp/main_content/000925769.xls' 
  },
  // 必要な分だけここに追記...
];

async function main() {
  // 1. フォルダがなければ作る
  await fs.ensureDir(XLSX_DIR);
  await fs.ensureDir(DATA_DIR);

  console.log('=== Phase 1: Downloading Files ===');
  
  // 2. URLリストにあるファイルをダウンロードして xlsx フォルダに保存
  for (const target of TARGET_URLS) {
    try {
      // 拡張子をURLから判定 (xlsx か xls か)
      const ext = path.extname(target.url) || '.xlsx';
      const savePath = path.join(XLSX_DIR, `${target.name}${ext}`);

      // 既にファイルがあればスキップ（上書きしたい場合はここを調整）
      if (await fs.pathExists(savePath)) {
        console.log(`⏭️  Skipped (Exists): ${target.name}`);
        continue;
      }

      console.log(`⬇️  Downloading: ${target.name}...`);
      const response = await axios.get(target.url, { responseType: 'arraybuffer' });
      await fs.writeFile(savePath, response.data);
      console.log(`✅ Saved to: ${savePath}`);
      
    } catch (error) {
      console.error(`❌ Download Error (${target.name}):`, error.message);
    }
  }

  console.log('\n=== Phase 2: Converting xlsx to JSON ===');

  // 3. xlsx フォルダの中身を全部読んで変換する
  // (自動DLしたものも、手動で置いたものも、全部処理します)
  const files = await fs.readdir(XLSX_DIR);

  for (const file of files) {
    // Excelファイル以外は無視
    if (!file.match(/\.(xlsx|xls|csv)$/)) continue;

    const inputPath = path.join(XLSX_DIR, file);
    const fileNameWithoutExt = path.parse(file).name;
    const outputPath = path.join(DATA_DIR, `${fileNameWithoutExt}.json`);

    try {
      console.log(`⚙️  Converting: ${file}`);
      
      // Excelを読み込む
      const workbook = XLSX.readFile(inputPath);
      
      // 全シートをループしてデータ化
      const result: any = {};
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        // シートの中身をJSON配列にする
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: null }); // 空セルはnull
        // シート名が "Sheet1" とかなら省略、複数あればシート名で分ける
        if (workbook.SheetNames.length === 1) {
          Object.assign(result, json); // 配列そのものにするなら result = json
        } else {
          result[sheetName] = json;
        }
      });

      // JSON保存
      await fs.writeJson(outputPath, result, { spaces: 2 });
      console.log(`✨ Generated: ${outputPath}`);

    } catch (error) {
      console.error(`❌ Convert Error (${file}):`, error.message);
    }
  }

  // 4. API用の目次ファイル作成
  const jsonFiles = (await fs.readdir(DATA_DIR)).filter(f => f.endsWith('.json'));
  await fs.writeJson(path.join(DATA_DIR, 'index.json'), {
    updated_at: new Date().toISOString(),
    files: jsonFiles
  }, { spaces: 2 });
  
  console.log('\n🎉 All Done!');
}

main();
