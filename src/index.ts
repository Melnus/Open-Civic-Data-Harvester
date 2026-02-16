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
  // 2. 人口移動（リスト形式）
  migration: {
    type: "list",
    row_key: "prefecture",
    columns: [
      { key: "in_migration", keywords: ["転入者数", "転入"] },
      { key: "out_migration", keywords: ["転出者数", "転出"] },
      { key: "social_increase", keywords: ["社会増減", "増減数"] }
    ]
  },
  // 3. 人口動態（リスト形式）
  population: {
    type: "list",
    row_key: "city",
    columns: [
      // 優先順位: 男・女よりも「計」「総数」を優先して拾いたい
      { key: "total_population", keywords: ["人口", "計", "総数"] },
      { key: "births", keywords: ["出生"] },
      { key: "deaths", keywords: ["死亡"] }
    ]
  }
};

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');

// 都道府県マスター
const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').trim();
  if (['-', '－', '＊', '*', '...', '―', '△'].includes(str)) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
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
                  for (let nc = c + 1; nc < Math.min(c + 50, row.length); nc++) {
                    const val = parseNumber(row[nc]);
                    if (val !== null) { entry[k.key] = val; break outer; }
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
          config.columns.forEach((col: any) => {
            if (colMap[col.key] !== undefined) return;
            matrix[r].forEach((cell, cIdx) => {
               // 【修正点】左端の3列（コードや県名）は、数値データの列として認識させない
               if (cIdx < 3) return; 

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
          const nameCandidates = [row[0], row[1], row[2], row[3]].map(v => String(v || "").trim());
          
          let areaName = "";
          const prefMatch = nameCandidates.find(n => PREFECTURES.includes(n) || PREFECTURES.includes(n.replace(/\s/g, '')));
          
          if (prefMatch) {
            areaName = prefMatch;
          } else if (config.row_key === "city") {
            const cityMatch = nameCandidates.find(n => n.match(/(市|区|町|村)$/) && !n.match(/^(合計|再掲|全国)$/));
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
                // 団体コード(10000番台)などを人口と誤認しないよう、桁数や文脈でガードするのは難しいので
                // 上記の cIdx < 3 ガードで対応済み
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
