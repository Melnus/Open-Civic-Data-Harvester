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
  // 2. 人口移動（PDFの (A)～(F) の記号を絶対視する）
  migration: {
    type: "list",
    row_key: "prefecture",
    columns: [
      { key: "domestic_in", keywords: ["(A)"] },        // 転入者数（国内）
      { key: "domestic_out", keywords: ["(B)"] },       // 転出者数（国内）
      { key: "international_in", keywords: ["(C)"] },   // 国外からの転入
      { key: "international_out", keywords: ["(D)"] },  // 国外への転出
      { key: "unknown_pre", keywords: ["(E)"] },        // 移動前の住所地不詳
      { key: "removed", keywords: ["(F)"] },            // 職権消除等
      { key: "social_increase", keywords: ["社会増減", "社会増加"] } // (A)-(B)+(C)-(D)+(E)-(F)
    ]
  },
  // 3. 人口動態
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
const HABIT_DIR = path.join(ROOT_DIR, 'habits');

const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

// 数値パース
function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').trim();
  // ▲などのマイナス表記にも対応（行政データ特有）
  if (str.includes("▲")) return -1 * parseFloat(str.replace("▲", ""));
  if (['-', '－', '＊', '*', '...', '―'].includes(str)) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// 指紋生成（レイアウト保存用）
function createFingerprint(matrix: any[][]): string {
  const binaryRows = matrix.slice(0, 20).map(row => {
    let bits = "";
    for (let c = 0; c < 20; c++) {
      const hasValue = row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== "";
      bits += hasValue ? "1" : "0";
    }
    return bits;
  });
  return require('crypto').createHash('md5').update(binaryRows.join("\n")).digest('hex').slice(0, 8);
}

async function main() {
  await fs.ensureDir(DATA_DIR);
  await fs.ensureDir(HABIT_DIR);
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

      // 決算カードモード
      if (config.type === "single") {
        const entry: any = { fiscal_year: fiscalYear, prefecture: sheetName, source: file };
        config.keys.forEach((k: any) => {
          outer: for (const row of matrix) {
            for (let c = 0; c < row.length; c++) {
              if (config.keys.some((chk: any) => String(row[c]).includes(chk.keywords[0]))) {
                if (String(row[c]).includes(k.keywords[0])) {
                  for (let nc = c + 1; nc < Math.min(c + 50, row.length); nc++) {
                    const val = parseNumber(row[nc]);
                    if (val !== null) { 
                      if (k.key.includes("population") && val < 10000) continue; // 人口誤爆防止
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
      } 
      // リストモード（移動・動態）
      else {
        const colMap: any = {};
        let headerRowIndex = -1;

        // 1. ヘッダー解析: (A) (B) (C) を絶対的な目印にする
        for (let r = 0; r < Math.min(30, matrix.length); r++) {
          config.columns.forEach((col: any) => {
            if (colMap[col.key] !== undefined) return;
            matrix[r].forEach((cell, cIdx) => {
               if (cIdx < 2) return; // 左端は無視
               const cellStr = String(cell).replace(/\s/g, ''); // 空白除去して比較
               
               // 完全一致またはカッコ付きを含むか
               if (col.keywords.some((kw: string) => cellStr === kw || cellStr.includes(kw))) {
                 colMap[col.key] = cIdx;
                 headerRowIndex = r;
                 // ログ出し（デバッグ用）
                 // console.log(`  Found ${col.key} at row ${r}, col ${cIdx} by keyword "${cellStr}"`);
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
                if (val !== null) {
                    // 人口誤爆防止（1万人未満は怪しいが、村ならありえるので、桁数チェックは都道府県のみにする手もある）
                    if (col.key.includes("population") && val < 100) return;
                    entry[col.key] = val;
                    hasData = true;
                }
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
