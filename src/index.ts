import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';

// --- モードごとの抽出定義 ---
const SCHEMAS: any = {
  settlement: [ // 決算カード用
    { key: "population", keywords: ["住民基本台帳人口", "人口"] },
    { key: "total_revenue", keywords: ["歳入総額", "歳入決算総額"] },
    { key: "total_expenditure", keywords: ["歳出総額", "歳出決算総額"] },
    { key: "local_tax", keywords: ["地方税", "普通税", "都道府県税", "道府県税"] },
    { key: "consumption_tax_share", keywords: ["地方消費税"] },
    { key: "real_balance", keywords: ["実質収支"] }
  ],
  migration: [ // 人口移動報告用
    { key: "in_migration", keywords: ["転入者数"] },
    { key: "out_migration", keywords: ["転出者数"] },
    { key: "social_increase", keywords: ["社会増減数", "増減数"] }
  ],
  population: [ // 人口動態用
    { key: "total_population", keywords: ["人口", "合計"] },
    { key: "births", keywords: ["出生数"] },
    { key: "deaths", keywords: ["死亡数"] }
  ]
};

const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).trim().replace(/,/g, '');
  if (['', '-', '－', '＊', '*', '...'].includes(str)) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// 決算カードのような「自由探索」
function extractFromSheet(matrix: any[][], keywords: string[]): number | null {
  for (const row of matrix) {
    for (let c = 0; c < row.length; c++) {
      const text = String(row[c] || "").replace(/\s+/g, '');
      if (keywords.some(k => text.includes(k))) {
        for (let nextC = c + 1; nextC < Math.min(c + 50, row.length); nextC++) {
          const val = parseNumber(row[nextC]);
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
  const files = await fs.readdir(XLSX_DIR);

  for (const file of files) {
    if (file.startsWith('.') || !file.match(/\.(xlsx|xls)$/i)) continue;

    console.log(`🚜 Harvesting: ${file}`);
    const workbook = XLSX.readFile(path.join(XLSX_DIR, file));
    const fileName = path.parse(file).name;
    const yearMatch = fileName.match(/FY(\d{4})/);
    const fiscalYear = yearMatch ? parseInt(yearMatch[1]) : null;

    // ファイル名からモード決定
    let mode = "settlement";
    if (file.includes("migration")) mode = "migration";
    if (file.includes("population")) mode = "population";

    const results: any[] = [];

    for (const sheetName of workbook.SheetNames) {
      if (sheetName.match(/(目次|index|注意|Menu|表紙|原本)/i)) continue;
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];

      if (mode === "settlement") {
        // 決算カード: 1シート = 1都道府県
        const data: any = { fiscal_year: fiscalYear, prefecture: sheetName, source: file };
        for (const schema of SCHEMAS.settlement) {
          data[schema.key] = extractFromSheet(matrix, schema.keywords);
        }
        results.push(data);
      } else {
        // リスト形式（移動・動態）: 1シートの中に全県が並んでいる
        const schemaEntries = SCHEMAS[mode];
        // 1. 各項目の「列インデックス」を特定する
        const colMap: any = {};
        for (const row of matrix.slice(0, 15)) {
          row.forEach((cell, idx) => {
            const text = String(cell || "").replace(/\s+/g, '');
            schemaEntries.forEach((s: any) => {
              if (s.keywords.some((k: any) => text.includes(k))) colMap[s.key] = idx;
            });
          });
        }

        // 2. 行を走査して都道府県を探す
        for (const row of matrix) {
          const firstCellText = String(row[1] || row[2] || "").trim(); // B列かC列に県名があることが多い
          const pref = PREFECTURES.find(p => firstCellText === p || firstCellText === p.replace(/[都|道|府|県]$/, ''));
          
          if (pref) {
            const data: any = { fiscal_year: fiscalYear, prefecture: pref, source: file };
            schemaEntries.forEach((s: any) => {
              const colIdx = colMap[s.key];
              data[s.key] = colIdx !== undefined ? parseNumber(row[colIdx]) : null;
            });
            // 数値が一つでも取れていれば追加
            if (Object.values(data).some(v => typeof v === 'number')) results.push(data);
          }
        }
      }
    }

    await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), results, { spaces: 2 });
    console.log(`  ✅ Finished ${fileName}: ${results.length} records.`);
  }
}

main().catch(console.error);
