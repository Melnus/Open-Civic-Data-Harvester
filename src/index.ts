import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';

const CONFIG: any = {
  settlement: {
    type: "single",
    keys: [
      { key: "population", keywords: ["住民基本台帳人口", "人口"] },
      { key: "total_revenue", keywords: ["歳入総額", "歳入決算総額"] },
      { key: "total_expenditure", keywords: ["歳出総額", "歳出決算総額"] },
      { key: "local_tax", keywords: ["地方税", "普通税"] },
      { key: "consumption_tax_share", keywords: ["地方消費税"] },
      { key: "real_balance", keywords: ["実質収支"] }
    ]
  },
  migration: {
    type: "list",
    row_key: "prefecture",
    columns: [
      { key: "in_migration", keywords: ["転入者数(国内)", "(A)"] },
      { key: "out_migration", keywords: ["転出者数(国内)", "(B)"] },
      { key: "social_increase", keywords: ["社会増減数", "(E)"] }
    ]
  },
  population: {
    type: "list",
    row_key: "city",
    columns: [
      { key: "total_population", keywords: ["人口計", "人口　計", "総数"] },
      { key: "births", keywords: ["出生数", "出生"] },
      { key: "deaths", keywords: ["死亡数", "死亡"] }
    ]
  }
};

const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').replace(/\s+/g, '').trim();
  if (['-', '－', '＊', '*', '...', '―', '△', ''].includes(str)) return null;
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
    const targetFiscalYear = (fileName.match(/FY(\d{4})/) || [])[1] || "2025";
    
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
        const entry: any = { fiscal_year: targetFiscalYear, prefecture: sheetName, source: file };
        config.keys.forEach((k: any) => {
          outer: for (const row of matrix) {
            for (let c = 0; c < row.length; c++) {
              const cellTxt = String(row[c]).replace(/\s+/g, '');
              if (k.keywords.some((kw: string) => cellTxt.includes(kw))) {
                for (let nc = c + 1; nc < Math.min(c + 50, row.length); nc++) {
                  const val = parseNumber(row[nc]);
                  if (val !== null) { entry[k.key] = val; break outer; }
                }
              }
            }
          }
        });
        results.push(entry);
      } else {
        const colMap: any = {};
        // 1. ヘッダーから列番号を特定（最初に見つかった列を優先）
        for (let r = 0; r < Math.min(25, matrix.length); r++) {
          const row = matrix[r];
          row.forEach((cell, cIdx) => {
            if (cIdx < 2) return; // A, B列は名前用なので数値列としては無視
            const txt = String(cell).replace(/\s+/g, '');
            config.columns.forEach((col: any) => {
              if (colMap[col.key] === undefined) { // 未発見の場合のみ登録（国外トラップ回避）
                if (col.keywords.some((kw: string) => txt === kw || (txt.includes(kw) && !txt.includes("国外")))) {
                  colMap[col.key] = cIdx;
                }
              }
            });
          });
        }

        // 2. データ行の走査
        matrix.forEach(row => {
          const nameCandidates = [row[0], row[1], row[2], row[3]].map(v => String(v || "").trim());
          const prefMatch = nameCandidates.find(n => PREFECTURES.includes(n));
          
          let areaName = "";
          if (prefMatch) {
            areaName = prefMatch;
          } else if (config.row_key === "city") {
            const cityMatch = nameCandidates.find(n => n.match(/(市|区|町|村)$/) && !n.match(/^(合計|再掲|全国|県内|県外)$/));
            if (cityMatch) areaName = cityMatch;
          }

          if (areaName) {
            const entry: any = { fiscal_year: targetFiscalYear, area: areaName, source: file };
            if (PREFECTURES.includes(areaName)) entry.prefecture = areaName;

            let hasValidData = false;
            config.columns.forEach((col: any) => {
              const val = parseNumber(row[colMap[col.key]]);
              entry[col.key] = val;
              if (val !== null) hasValidData = true;
            });
            if (hasValidData) results.push(entry);
          }
        });
      }
    }

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
