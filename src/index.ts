import axios from 'axios';
import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';

// データの保存先
const DATA_DIR = path.join(__dirname, '../data');

// 例: ターゲットとする行政データのURL (適宜書き換えてください)
const TARGETS = [
  {
    name: 'sample_stats',
    type: 'xlsx',
    url: 'https://www.stat.go.jp/data/nihon/zuhyou/n2402000.xlsx' // 例: 総務省統計局
  }
];

async function main() {
  // データフォルダを初期化
  await fs.ensureDir(DATA_DIR);

  for (const target of TARGETS) {
    console.log(`📡 Fetching: ${target.name} (${target.url})`);
    
    try {
      // 1. データをダウンロード
      const response = await axios.get(target.url, { responseType: 'arraybuffer' });
      const data = response.data;
      let jsonData: any = null;

      // 2. 形式に合わせて変換
      if (target.type === 'xlsx') {
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0]; // 1枚目のシートを読む
        jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } 
      // CSVやPDFの場合のロジックもここに追加可能
      
      // 3. JSONとして保存
      if (jsonData) {
        const outputPath = path.join(DATA_DIR, `${target.name}.json`);
        await fs.writeJson(outputPath, jsonData, { spaces: 2 });
        console.log(`✅ Saved: ${outputPath}`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${target.name}:`, error);
    }
  }

  // 4. メタデータ作成 (APIの目次)
  const indexData = {
    updated_at: new Date().toISOString(),
    files: TARGETS.map(t => `${t.name}.json`)
  };
  await fs.writeJson(path.join(DATA_DIR, 'index.json'), indexData, { spaces: 2 });
}

main();
