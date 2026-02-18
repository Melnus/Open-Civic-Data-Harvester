import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture } from '../utils';
import { LEXICON } from '../data/lexicon';
import { SettlementData } from '../types';

export function extractSettlement(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): SettlementData[] {
  const results: SettlementData[] = [];

  // 設定：maxCol を指定すると、その列番号より右側は無視します（誤検知防止）
  const CONFIG = [
    // --- 【左側】 決算規模・主要費目 (左端にあるので maxCol: 10 で制限) ---
    { key: "total_revenue", keywords: LEXICON.settlement.revenue, maxCol: 10 },
    { key: "total_expenditure", keywords: LEXICON.settlement.expenditure, maxCol: 10 },
    { key: "local_tax", keywords: LEXICON.settlement.local_tax, maxCol: 10 },
    { key: "local_allocation_tax", keywords: LEXICON.settlement.local_allocation_tax, maxCol: 10 },
    { key: "personnel_expenses", keywords: LEXICON.settlement.personnel_expenses, maxCol: 10 },
    { key: "assistance_expenses", keywords: LEXICON.settlement.assistance_expenses, maxCol: 10 },
    { key: "public_debt_expenses", keywords: LEXICON.settlement.public_debt_expenses, maxCol: 10 },
    { key: "ordinary_construction_expenses", keywords: LEXICON.settlement.ordinary_construction_expenses, maxCol: 10 }, // ★ここが重要

    // --- 【中央・右側】 指標・基金・内訳 (右側にあるので制限なし or minCol設定も可だが一旦なし) ---
    { key: "population", keywords: LEXICON.settlement.population },
    { key: "area", keywords: LEXICON.settlement.area },
    { key: "real_balance", keywords: LEXICON.settlement.real_balance },
    { key: "single_year_balance", keywords: LEXICON.settlement.single_year_balance },
    { key: "financial_capability_index", keywords: LEXICON.settlement.financial_capability_index },
    { key: "real_debt_service_ratio", keywords: LEXICON.settlement.real_debt_service_ratio },
    { key: "future_burden_ratio", keywords: LEXICON.settlement.future_burden_ratio },
    { key: "current_account_ratio", keywords: LEXICON.settlement.current_account_ratio },
    { key: "local_consumption_tax", keywords: LEXICON.settlement.local_consumption_tax }
  ];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本|Menu|表紙|概況|付表)/i)) continue;
    
    // ヘッダーなしで生データを取得
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const cleanPref = normalizePrefecture(sheetName);
    const entry: any = { 
      fiscal_year: fiscalYear, 
      prefecture: cleanPref, 
      source: sourceFile 
    };
    
    let foundAny = false;

    CONFIG.forEach((configItem) => {
      // 既に値が取れていればスキップ
      if (entry[configItem.key] !== undefined) return;

      outer_loop: for (const row of matrix) {
        // 列スキャン：maxCol設定がある場合はそこで打ち切る
        const maxC = configItem.maxCol ? Math.min(row.length, configItem.maxCol) : row.length;

        for (let c = 0; c < maxC; c++) {
          const cellStr = String(row[c]).replace(/\s/g, ''); // 空白除去
          
          if (configItem.keywords.some(kw => cellStr.includes(kw))) {
            
            // --- ガード処理：金額と比率の混同防止 ---
            const isRatioLabel = cellStr.includes("比率") || cellStr.includes("％") || cellStr.includes("(%)");
            const wantsRatio = configItem.key.includes("ratio") || configItem.key.includes("index");

            // 金額が欲しいのに「比率」ラベルを見つけた場合はスキップ
            if (!wantsRatio && isRatioLabel) continue;
            // 比率が欲しいのに「比率」と書いていないラベル（ただの公債費など）はスキップ
            if (wantsRatio && !isRatioLabel) continue;
            // -------------------------------------

            // キーワード発見！右側50セル以内を探索
            for (let nc = c + 1; nc < Math.min(c + 50, row.length); nc++) {
              const val = parseNumber(row[nc]);
              if (val !== null) { 
                // 人口データ誤検出防止
                if (configItem.key === "population" && val < 1000) continue;
                
                entry[configItem.key] = val;
                foundAny = true;
                break outer_loop;
              }
            }
          }
        }
      }
    });

    if (foundAny) results.push(entry as SettlementData);
  }
  return results;
}
