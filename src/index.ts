import * as XLSX from 'xlsx';
import * as fs from 'fs-extra';
import * as path from 'path';

// --- 設定：抽出ターゲット定義 ---
const CONFIG: any = {
  // 1. 決算カード（1シート1自治体、自由配置）
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
  // 2. 人口移動（1シート全自治体リスト）
  migration: {
    type: "list",
    row_key: "prefecture", // 都道府県名をキーに行を探す
    columns: [
      { key: "in_migration", keywords: ["転入者数", "転入"] },
      { key: "out_migration", keywords: ["転出者数", "転出"] },
      { key: "social_increase", keywords: ["社会増減", "増減数"] }
    ]
  },
  // 3. 人口動態（1シート全自治体リスト、複数年度あり）
  population: {
    type: "list",
    row_key: "city", // 市区町村名をキーに行を探す
    columns: [
      { key: "total_population", keywords: ["人口", "計", "総数"] }, // 優先度高
      { key: "births", keywords: ["出生"] },
      { key: "deaths", keywords: ["死亡"] }
    ]
  }
};

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

// 数値パース（記号除去）
function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').trim();
  if (['-', '－', '＊', '*', '...', '―', '△'].includes(str)) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// 和暦→西暦変換（簡易版）
function getYearFromText(text: string): number | null {
  const m = text.match(/(令和|R)(\d+)年?/);
  if (m) return 2018 + parseInt(m[2]);
  const m2 = text.match(/(20\d{2})/);
  if (m2) return parseInt(m2[1]);
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
    
    // ファイル名から年度とモードを判定
    const fileYearMatch = fileName.match(/FY(\d{4})/);
    const targetFiscalYear = fileYearMatch ? parseInt(fileYearMatch[1]) : 2025; // デフォルト
    
    let mode = "settlement";
    if (file.includes("migration")) mode = "migration";
    if (file.includes("population")) mode = "population";
    const config = CONFIG[mode];

    const results: any[] = [];

    for (const sheetName of workbook.SheetNames) {
      if (sheetName.match(/(目次|index|注意|原本|Menu|表紙)/i)) continue;
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
      if (matrix.length < 5) continue;

      // --- A. 決算カードモード（1シート1自治体） ---
      if (config.type === "single") {
        const entry: any = { fiscal_year: targetFiscalYear, prefecture: sheetName, source: file };
        config.keys.forEach((k: any) => {
          // 全セル走査
          outer: for (const row of matrix) {
            for (let c = 0; c < row.length; c++) {
              if (config.keys.some((chk: any) => String(row[c]).includes(chk.keywords[0]))) {
                // キーワード発見。該当項目の場合のみ抽出
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

      } 
      // --- B. リストモード（一覧表） ---
      else if (config.type === "list") {
        // 1. ヘッダー行を探して、列インデックス(column index)を特定する
        const colMap: any = {};
        let headerRowIndex = -1;

        // 上から20行くらいをスキャンしてヘッダーを探す
        for (let r = 0; r < Math.min(20, matrix.length); r++) {
          const rowText = matrix[r].join(" ");
          
          // 年度指定がある場合、その年度の列かどうかチェック（人口動態用）
          let isTargetYearColumn = true;
          if (mode === "population") {
            const yearInRow = getYearFromText(rowText);
            // 行に年度が含まれていて、かつターゲット年度と違うなら、その行は無視（あるいはその列は対象外）
             // 簡易的に「ヘッダー行にターゲット年度が含まれるか、または年度が書いてない（共通項目）」場合を優先
          }

          config.columns.forEach((col: any) => {
            if (colMap[col.key] !== undefined) return; // 既に発見済みならスキップ
            
            // 行内の各セルをチェック
            matrix[r].forEach((cell, cIdx) => {
               const cellStr = String(cell).replace(/\s/g, '');
               if (col.keywords.some((kw: string) => cellStr.includes(kw))) {
                 // ヘッダーの上に「令和7年」のような親ヘッダーがあるか確認
                 if (mode === "population") {
                   // 直上の行（r-1, r-2...）に年度指定があるか？
                   // 今回は簡易化：同じ列かその周辺に年度があればチェック
                   // ※複雑すぎるので、まずは「キーワード一致」で列を拾う
                 }
                 colMap[col.key] = cIdx;
                 headerRowIndex = r;
               }
            });
          });
        }

        if (Object.keys(colMap).length === 0) continue; // ヘッダーが見つからなければスキップ

        // 2. データ行を走査
        for (let r = headerRowIndex + 1; r < matrix.length; r++) {
          const row = matrix[r];
          // B列〜E列あたりにある「都道府県名」や「市町村名」を探す
          const nameCandidates = [row[0], row[1], row[2], row[3]].map(v => String(v || "").trim());
          
          let areaName = "";
          let isTargetRow = false;

          // 都道府県リストにあるか？
          const prefMatch = nameCandidates.find(n => PREFECTURES.includes(n) || PREFECTURES.includes(n.replace(/\s/g, '')));
          
          if (prefMatch) {
            areaName = prefMatch;
            isTargetRow = true;
          } else if (config.row_key === "city") {
            // 市区町村モードの場合、"市""区""町""村"で終わるものを探す（"合計"などは除外）
            const cityMatch = nameCandidates.find(n => n.match(/(市|区|町|村)$/) && !n.includes("合計") && !n.includes("再掲"));
            if (cityMatch) {
              areaName = cityMatch;
              isTargetRow = true;
            }
          }

          if (isTargetRow && areaName) {
            const entry: any = { 
              fiscal_year: targetFiscalYear, 
              area: areaName,
              source: file 
            };
            
            // 都道府県データなら prefecture フィールドも埋める
            if (PREFECTURES.includes(areaName)) {
              entry.prefecture = areaName;
            }

            let hasData = false;
            config.columns.forEach((col: any) => {
              const idx = colMap[col.key];
              if (idx !== undefined) {
                const val = parseNumber(row[idx]);
                // null でない、かつ極端に小さい値（0や1）でない場合のみ採用
                entry[col.key] = val;
                if (val !== null) hasData = true;
              }
            });

            if (hasData) results.push(entry);
          }
        }
      }
    }

    // 重複除外（同じ自治体が複数行でてきたら最初のものを優先）
    const uniqueMap = new Map();
    results.forEach(r => {
      const key = r.area || r.prefecture;
      if (!uniqueMap.has(key)) uniqueMap.set(key, r);
    });
    const finalData = Array.from(uniqueMap.values());

    await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), finalData, { spaces: 2 });
    console.log(`  ✅ Extracted ${finalData.length} records.`);
  }
}

main().catch(console.error);
