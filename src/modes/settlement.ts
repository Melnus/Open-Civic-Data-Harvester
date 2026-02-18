import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture } from '../utils';
import { LEXICON } from '../data/lexicon';
import { SettlementData } from '../types';

export function extractSettlement(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): SettlementData[] {
  const results: SettlementData[] = [];

  const CONFIG = [
    { key: "population", keywords: LEXICON.settlement.population },
    { key: "area", keywords: LEXICON.settlement.area },
    { key: "total_revenue", keywords: LEXICON.settlement.revenue },
    { key: "total_expenditure", keywords: LEXICON.settlement.expenditure },
    { key: "real_balance", keywords: LEXICON.settlement.real_balance },
    { key: "single_year_balance", keywords: LEXICON.settlement.single_year_balance },
    { key: "financial_capability_index", keywords: LEXICON.settlement.financial_capability_index },
    { key: "real_debt_service_ratio", keywords: LEXICON.settlement.real_debt_service_ratio },
    { key: "future_burden_ratio", keywords: LEXICON.settlement.future_burden_ratio },
    { key: "current_account_ratio", keywords: LEXICON.settlement.current_account_ratio },
    { key: "local_tax", keywords: LEXICON.settlement.local_tax },
    { key: "local_allocation_tax", keywords: LEXICON.settlement.local_allocation_tax },
    { key: "local_consumption_tax", keywords: LEXICON.settlement.local_consumption_tax },
    { key: "personnel_expenses", keywords: LEXICON.settlement.personnel_expenses },
    { key: "assistance_expenses", keywords: LEXICON.settlement.assistance_expenses },
    { key: "public_debt_expenses", keywords: LEXICON.settlement.public_debt_expenses },
    { key: "ordinary_construction_expenses", keywords: LEXICON.settlement.ordinary_construction_expenses }
  ];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本|Menu|表紙|概況|付表)/i)) continue;
    
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const cleanPref = normalizePrefecture(sheetName);
    const entry: any = { fiscal_year: fiscalYear, prefecture: cleanPref, source: sourceFile };
    let foundAny = false;

    CONFIG.forEach((configItem) => {
      if (entry[configItem.key] !== undefined) return;

      outer_loop: for (const row of matrix) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c]).replace(/\s/g, ''); // 空白を詰めて判定
          
          if (configItem.keywords.some(kw => cellStr.includes(kw))) {
            
            // --- ★ここが重要：金額と比率の混同防止ガード ---
            const isRatioLabel = cellStr.includes("比率") || cellStr.includes("％") || cellStr.includes("(%)");
            const wantsRatio = configItem.key.includes("ratio") || configItem.key.includes("index");

            // 金額が欲しいのに「比率」ラベルを見つけた場合はスキップ
            if (!wantsRatio && isRatioLabel) continue;
            // 比率が欲しいのに「比率」と書いていないラベル（ただの公債費など）はスキップ
            if (wantsRatio && !isRatioLabel) continue;
            // ----------------------------------------------

            for (let nc = c + 1; nc < Math.min(c + 50, row.length); nc++) {
              const val = parseNumber(row[nc]);
              if (val !== null) { 
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
