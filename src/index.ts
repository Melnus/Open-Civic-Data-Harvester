import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';

// --- 設定：抽出ターゲット定義 ---
const CONFIG: any = {
  // 1. 決算カード（1シート1自治体）
  settlement: {
    type: "single",
    keys: [
      { key: "population", keywords: ["住民基本台帳人口", "人口"] },
      { key: "total_revenue", keywords: ["歳入総額", "歳入決算総額", "歳入合計"] },
      { key: "total_expenditure", keywords: ["歳出総額", "歳出決算総額", "歳出合計"] },
      { key: "local_tax", keywords: ["地方税", "普通税", "都道府県税"] },
      { key: "consumption_tax_share", keywords: ["地方消費税"] },
      { key: "real_balance", keywords: ["実質収支"] }
    ]
  },
  // 2. 人口移動（リスト形式：4ベクトル分離）
  migration: {
    type: "list",
    row_key: "prefecture",
    columns: [
      // 【国内移動】日本国内でのパイの奪い合い
      { key: "domestic_in", keywords: ["転入", "国内", "(A)"] },
      { key: "domestic_out", keywords: ["転出", "国内", "(B)"] },
      // 【国外移動】系外からの純粋なエネルギー流出入
      { key: "international_in", keywords: ["国外", "転入", "(C)"] },
      { key: "international_out", keywords: ["国外", "転出", "(D)"] },
      // 【総和】
      { key: "social_increase", keywords: ["社会増減", "(E)"] }
    ]
  },
  // 3. 人口動態（リスト形式）
  population: {
    type: "list",
    row_key: "city",
    columns: [
      { key: "total_population", keywords: ["人口", "計", "総数"] },
      { key: "births", keywords: ["出生"] },
      { key: "deaths", keywords: ["死亡"] }
    ]
  }
};

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').trim();
  if (['-', '－', '＊', '*', '...', '―', '△'].includes(str)) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// 和暦→西暦変換
function getYearFromText(text: string): number | null {
  const m = text.match(/(令和|R)(\d+)年?/);
  if (m) return 2018 + parseInt(m[2]);
  return null;
}

async function main() {
  await fs.ensureDir(DATA_DIR);
  const files = await fs.readdir(XLSX_DIR);

  for (const file of files) {
    if (file.startsWith('.') || !file.match(/\.(xlsx|xls)$/i)) continue;
    console.log(`\n🚜 Processing: ${file}`);
    
    const workbook = XLSX.readFile(path.join(XLSX_DIR, file));
    const fileName = path.parse(file).name;
    const fileYearMatch = fileName.match(/FY(\d{4})/);
    const fiscalYear = fileYearMatch ? parseInt(fileYearMatch[1]) : 2025;
    
    let mode = "settlement";
    if (file.includes("migration")) mode = "migration";
    if (file.includes("population")) mode = "population";
    const config = CONFIG[mode];

    const results: any[] = [];

    for (const sheetName of workbook.SheetNames) {
      if (sheetName.match(/(目次|index|注意|原本|Menu|表紙|概況|付表)/i)) continue;
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
      if (matrix.length < 5) continue;

      if (config.type === "single") {
        // --- 決算カードモード ---
        const entry: any = { fiscal_year: fiscalYear, prefecture: sheetName, source: file };
        config.keys.forEach((k: any) => {
          outer: for (const row of matrix) {
            for (let c = 0; c < row.length; c++) {
              if (config.keys.some((chk: any) => String(row[c]).includes(chk.keywords[0]))) {
                if (String(row[c]).includes(k.keywords[0])) {
                  // キーワードが見つかったセルの右側を探索
                  for (let nc = c + 1; nc < Math.min(c + 50, row.length); nc++) {
                    const val = parseNumber(row[nc]);
                    if (val !== null) { 
                      // 【修正箇所】人口(population)の場合、10,000未満の数値は
                      // 都道府県コードや団体コードの誤検知とみなしてスキップする
                      if (k.key === "population" && val < 10000) {
                        continue;
                      }
                      
                      entry[k.key] = val; 
                      break outer; 
                    }
                  }
                }
              }
            }
          }
        });
        results.push(entry);

      } else {
        // --- リストモード（移動・動態） ---
        const colMap: any = {};
        let headerRowIndex = -1;

        // 1. ヘッダー解析
        for (let r = 0; r < Math.min(20, matrix.length); r++) {
          const rowStr = matrix[r].join(" ");
          
          config.columns.forEach((col: any) => {
            if (colMap[col.key] !== undefined) return;
            matrix[r].forEach((cell, cIdx) => {
               // C列(index=2)からデータが始まるため、index < 2 (A,B列) だけスキップ
               if (cIdx < 2) return; 

               const cellStr = String(cell).replace(/\s/g, '');
               
               if (col.keywords.some((kw: string) => cellStr.includes(kw))) {
                 colMap[col.key] = cIdx;
                 headerRowIndex = r;
               }
            });
          });
        }

        if (Object.keys(colMap).length === 0) continue;

        // 2. データ抽出
        for (let r = headerRowIndex + 1; r < matrix.length; r++) {
          const row = matrix[r];
          const nameCandidates = [row[0], row[1], row[2]].map(v => String(v || "").trim());
          
          let areaName = "";
          const prefMatch = nameCandidates.find(n => PREFECTURES.includes(n) || PREFECTURES.includes(n.replace(/\s/g, '')));
          
          if (prefMatch) {
            areaName = prefMatch;
          } else if (config.row_key === "city") {
            const cityMatch = nameCandidates.find(n => n.match(/(市|区|町|村)$/) && !n.match(/^(合計|再掲|全国|県計|総数)$/));
            if (cityMatch) areaName = cityMatch;
          }

          if (areaName) {
            const entry: any = { fiscal_year: fiscalYear, area: areaName, source: file };
            if (PREFECTURES.includes(areaName)) entry.prefecture = areaName;

            let hasData = false;
            config.columns.forEach((col: any) => {
              const idx = colMap[col.key];
              if (idx !== undefined) {
                const val = parseNumber(row[idx]);
                entry[col.key] = val;
                if (val !== null) hasData = true;
              }
            });
            if (hasData) results.push(entry);
          }
        }
      }
    }

    // 重複除外
    const uniqueMap = new Map();
    results.forEach(r => {
      const key = `${r.fiscal_year}-${r.area || r.prefecture}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, r);
    });
    const finalData = Array.from(uniqueMap.values());

    await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), finalData, { spaces: 2 });
    console.log(`  ✅ Extracted ${finalData.length} records.`);
  }
}

main().catch(console.error);
