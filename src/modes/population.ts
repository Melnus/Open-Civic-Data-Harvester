import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture, PREFECTURES } from '../utils';
import { LEXICON } from '../data/lexicon';
import { PopulationData } from '../types';

export function extractPopulation(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): PopulationData[] {
  const results: PopulationData[] = [];

  // ファイル拡張子が .xls (古いExcel) かどうかを判定
  const isLegacyXls = sourceFile.toLowerCase().endsWith('.xls');

  for (const sheetName of workbook.SheetNames) {
    // 目次や注意書きシートはスキップ
    // ※ "人口動態" というシート名を除外しないように修正 (データシートである可能性があるため)
    if (sheetName.match(/(目次|index|注意|原本|表紙|概況|付表)/i)) continue;

    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    // --- 1. ヘッダー解析 ---
    const colMap: { [key: string]: number } = {};
    
    // ヘッダー探索範囲（最初の25行）
    for (let r = 0; r < Math.min(25, matrix.length); r++) {
      const row = matrix[r];
      for (let c = 0; c < row.length; c++) {
        
        // 【重要】古い.xls形式の場合、A列(0)とB列(1)はコードや名称用とみなし、
        // 数値データ列としてのヘッダー探索から強制的に除外する
        // (A列の団体コードを人口と誤認するのを防ぐ)
        if (isLegacyXls && c <= 1) continue;

        const cellStr = String(row[c]).replace(/\s/g, '');

        // 文字数が長すぎる場合（20文字以上）は「表のタイトル」とみなして無視する
        if (cellStr.length > 20) continue;

        // 出生者数の列特定
        if (LEXICON.population.births.some(kw => cellStr === kw || cellStr.includes(kw))) {
             colMap['births'] = c;
        }
        // 死亡者数の列特定
        if (LEXICON.population.deaths.some(kw => cellStr === kw || cellStr.includes(kw))) {
             colMap['deaths'] = c;
        }

        // 人口「計」の特定ロジック
        // "住民票記載数" なども人口の親ヘッダーとして許容する
        const isPopulationHeader = LEXICON.population.total_population_label.some(kw => cellStr.includes(kw)) 
                                   || cellStr.includes("住民票") || cellStr.includes("記載数");

        if (isPopulationHeader) {
          // その列の直下数行以内に「計」や「総数」があるか探す
          // .xlsなどでは結合セルの関係で2〜4行下に「計」が来ることがあるため範囲を広げる
          for (let rowOffset = 1; rowOffset <= 4; rowOffset++) {
            const subCell = String(matrix[r + rowOffset]?.[c] || "").replace(/\s/g, '');
            if (LEXICON.population.total_population_sub_label.some(skw => subCell === skw || subCell.includes(skw))) {
              colMap['total_population'] = c;
              break;
            }
          }
          // サブヘッダーが見つからなくても、その列自体が「人口」単独ヘッダーの可能性があるため
          // まだ見つかってなければ仮登録しておく
          if (colMap['total_population'] === undefined) {
             colMap['total_population'] = c;
          }
        }
      }
    }

    // 必須データ（総人口）が見つからない場合はそのシートをスキップ
    if (colMap['total_population'] === undefined) continue;

    // --- 2. データ抽出 ---
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      // A〜D列あたりにある都道府県・市区町村名を探す
      const colB = String(row[1] || "").trim();
      const colC = String(row[2] || "").trim();

      // 都道府県名の特定 (B列かC列にあると想定)
      const prefMatch = PREFECTURES.find(p => colB.includes(p) || colC.includes(p));
      if (!prefMatch) continue;

      const pref = normalizePrefecture(prefMatch);
      
      // 市町村名の特定
      let city = "";
      // 都道府県名が入っていない方の列、もしくはD列(index 3)以降を市町村名候補とする
      // xlsファイルでは結合セルの影響で列がズレることがあるため複数列をチェック
      const candidateCells = [row[2], row[3], row[4]].map(v => String(v||"").replace(/\s/g, ''));
      
      for (const cand of candidateCells) {
        // "市" "区" "町" "村" で終わり、かつ "計" や "人口" を含まないものを探す
        if (cand && cand !== pref && (cand.endsWith("市") || cand.endsWith("区") || cand.endsWith("町") || cand.endsWith("村"))) {
            if (!cand.match(/(合計|再掲|部計|計|人口)/)) {
                city = cand;
                break;
            }
        }
      }

      // 「合計」行や「再掲」行などはスキップ
      if (colC.includes("合計") || city.includes("合計")) continue;

      // エリア名作成 (市区町村が見つからなければ都道府県名のみ＝県計として扱う)
      const areaName = city ? `${pref}${city}` : pref;

      // 数値取得
      const valPopulation = parseNumber(row[colMap['total_population']]);
      const valBirths = colMap['births'] !== undefined ? parseNumber(row[colMap['births']]) : null;
      const valDeaths = colMap['deaths'] !== undefined ? parseNumber(row[colMap['deaths']]) : null;

      // 人口がNULLまたは極端に少ない（誤検出、またはデータなし）でなければ採用
      if (valPopulation !== null && valPopulation > 0) {
        results.push({
          fiscal_year: fiscalYear,
          prefecture: pref,
          area: areaName,
          source: sourceFile,
          total_population: valPopulation,
          births: valBirths,
          deaths: valDeaths
        });
      }
    }
  }

  return results;
}
