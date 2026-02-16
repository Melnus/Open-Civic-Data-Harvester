import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';

// --- 物理パラメータ抽出定義 ---
const CONFIG = {
  settlement: {
    keys: [
      { key: "population", keywords: ["住民基本台帳人口", "人口"] },
      { key: "total_revenue", keywords: ["歳入総額", "歳入決算総額"] },
      { key: "total_expenditure", keywords: ["歳出総額", "歳出決算総額"] },
      { key: "local_tax", keywords: ["地方税", "普通税", "都道府県税", "道府県税"] },
      { key: "consumption_tax_share", keywords: ["地方消費税"] },
      { key: "real_balance", keywords: ["実質収支"] }
    ]
  },
  migration: {
    keys: [
      { key: "in_migration", keywords: ["転入者数", "(A)"] },
      { key: "out_migration", keywords: ["転出者数", "(B)"] },
      { key: "social_increase", keywords: ["社会増減数", "(E)"] }
    ]
  },
  population: {
    keys: [
      { key: "total_population", keywords: ["住民基本台帳人口", "人口", "計"] },
      { key: "births", keywords: ["出生数"] },
      { key: "deaths", keywords: ["死亡数"] }
    ]
  }
};

const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === 'number') return value;
  const str = String(value).trim().replace(/,/g, '');
  if (['', '-', '－', '＊', '*', '...', '―'].includes(str)) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

async function main() {
  const XLSX_DIR = path.join(process.cwd(), 'xlsx');
  const DATA_DIR = path.join(process.cwd(), 'data');
  await fs.ensureDir(DATA_DIR);
  const files = await fs.readdir(XLSX_DIR);

  for (const file of files) {
    if (file.startsWith('.') || !file.match(/\.(xlsx|xls)$/i)) continue;

    console.log(`🚜 Processing: ${file}`);
    const workbook = XLSX.readFile(path.join(XLSX_DIR, file));
    const fileName = path.parse(file).name;
    const fiscalYear = (fileName.match(/FY(\d{4})/) || [])[1] || "unknown";

    let mode: "settlement" | "migration" | "population" = "settlement";
    if (file.includes("migration")) mode = "migration";
    if (file.includes("population")) mode = "population";

    const finalResults: any[] = [];

    for (const sheetName of workbook.SheetNames) {
      if (sheetName.match(/(目次|index|注意|原本|Menu|表紙|概況|付表)/i)) continue;
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
      if (matrix.length < 5) continue;

      if (mode === "settlement") {
        // 【決算モード】1シート1自治体
        const entry: any = { fiscal_year: fiscalYear, prefecture: sheetName };
        CONFIG.settlement.keys.forEach(conf => {
          outer: for (const row of matrix) {
            for (let c = 0; c < row.length; c++) {
              if (String(row[c]).includes(conf.keywords[0])) {
                for (let nc = c + 1; nc < c + 50; nc++) {
                  const val = parseNumber(row[nc]);
                  if (val !== null) { entry[conf.key] = val; break outer; }
                }
              }
            }
          }
        });
        finalResults.push(entry);
      } else {
        // 【リストモード】1シート多自治体（移動・動態）
        const schema = CONFIG[mode];
        const colMap: any = {};

        // 1. カラム位置の特定（最初の20行をスキャン）
        matrix.slice(0, 20).forEach(row => {
          row.forEach((cell, idx) => {
            const txt = String(cell).replace(/\s+/g, '');
            schema.keys.forEach(s => {
              if (s.keywords.some(k => txt === k || txt.includes(k))) colMap[s.key] = idx;
            });
          });
        });

        // 2. データの抽出（都道府県または市区町村名を探す）
        matrix.forEach(row => {
          const areaName = String(row[1] || row[2] || "").trim(); // B列かC列の名前
          if (!areaName || areaName === "合計" || areaName === "全国") return;

          // 都道府県または市区町村っぽい名前なら抽出
          const isPref = PREFECTURES.includes(areaName);
          const isMuni = areaName.match(/(市|町|村|区)$/);

          if (isPref || isMuni) {
            const entry: any = { fiscal_year: fiscalYear, prefecture: isPref ? areaName : "mixed", area: areaName };
            let hasVal = false;
            schema.keys.forEach(s => {
              const val = parseNumber(row[colMap[s.key]]);
              if (val !== null) { entry[s.key] = val; hasVal = true; }
            });
            if (hasVal) finalResults.push(entry);
          }
        });
      }
    }

    // 重複除去（同じエリアが複数回出ないようにする）
    const seen = new Set();
    const uniqueResults = finalResults.filter(r => {
      const id = `${r.fiscal_year}-${r.area || r.prefecture}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), uniqueResults, { spaces: 2 });
    console.log(`  ✅ Saved ${uniqueResults.length} records.`);
  }
}

main().catch(console.error);
