import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture } from '../utils';
import { LEXICON } from '../data/lexicon';
import { SettlementData } from '../types';

export function extractSettlement(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): SettlementData[] {
  const results: SettlementData[] = [];

  // 安定版のロジックに、辞書(LEXICON)のキーワードを適用する設定
  const CONFIG = [
    { key: "population", keywords: LEXICON.settlement.population },
    { key: "total_revenue", keywords: LEXICON.settlement.revenue },
    { key: "total_expenditure", keywords: LEXICON.settlement.expenditure },
    { key: "local_tax", keywords: LEXICON.settlement.local_tax },
    { key: "local_consumption_tax", keywords: LEXICON.settlement.local_consumption_tax },
    { key: "real_balance", keywords: LEXICON.settlement.real_balance }
  ];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本|Menu|表紙|概況|付表)/i)) continue;
    
    // シート全体をJSON行列として取得
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const cleanPref = normalizePrefecture(sheetName);
    
    // データオブジェクト初期化
    const entry: any = { 
      fiscal_year: fiscalYear, 
      prefecture: cleanPref, 
      source: sourceFile 
    };
    
    let foundAny = false;

    // --- 安定版の豪快ロジック（そのまま採用） ---
    CONFIG.forEach((configItem) => {
      // 既に値が取れていればスキップ（重複防止）
      if (entry[configItem.key] !== undefined) return;

      outer_loop: for (const row of matrix) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c]);
          
          // キーワードを含むセルを探す (辞書の全キーワードでチェック)
          if (configItem.keywords.some(kw => cellStr.includes(kw))) {
            
            // 見つけたら右側50セル以内をスキャンして数値を探す
            for (let nc = c + 1; nc < Math.min(c + 50, row.length); nc++) {
              const val = parseNumber(row[nc]);
              if (val !== null) { 
                // ガード処理：人口なのに1万人未満などの誤検出を防ぐ
                if (configItem.key === "population" && val < 1000) continue;
                
                entry[configItem.key] = val;
                foundAny = true;
                break outer_loop; // 見つかったら次の項目の検索へ
              }
            }
          }
        }
      }
    });

    // 何か一つでもデータが取れていれば保存
    if (foundAny) {
      results.push(entry as SettlementData);
    }
  }

  return results;
}
