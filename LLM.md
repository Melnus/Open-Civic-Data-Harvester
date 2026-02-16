# Open-Civic-Data-Harvester (Reality Harvester) Context for LLM

このファイルはプロジェクトの全容、ソースコード、仕様をLLMに共有するためのコンテキストファイルです。

## 🚜 プロジェクト概要
日本の行政データ（Excel）を収集し、機械可読なJSON形式に変換するためのデータパイプライン。
現在は手動でExcelを配置し、スクリプトで変換を行っています。

- **入力**: `xlsx/` フォルダ内のExcelファイル
- **出力**: `data/` フォルダ内のJSONファイル
- **命名規則**: `FYxxxx-category.xlsx` (例: `FY2025-migration_prefecture.xlsx`)

## 📁 ディレクトリ構造
```
.
├── xlsx/                   # 【入力】行政Excelファイルを置く場所
├── data/                   # 【出力】変換されたJSONが出力される場所
├── src/
│   ├── index.ts            # エントリーポイント (ファイル読み込み・振り分け)
│   ├── types.ts            # 型定義 (Settlement, Migration, Population)
│   ├── utils.ts            # ユーティリティ (数値パース, 県名正規化)
│   ├── data/
│   │   └── lexicon.ts      # Excelヘッダーのマッピング辞書
│   └── modes/
│       ├── settlement.ts   # 決算カード変換ロジック
│       ├── migration.ts    # 人口移動報告変換ロジック
│       └── population.ts   # 人口動態変換ロジック
└── package.json
```

---

## 📜 Source Code

### 1. Types (`src/types.ts`)
```typescript
export interface SettlementData {
  fiscal_year: number;
  prefecture: string;
  source: string;
  population: number | null;
  total_revenue: number | null;       // 歳入合計
  total_expenditure: number | null;   // 歳出合計
  real_balance: number | null;        // 実質収支
  local_tax: number | null;           // 地方税
  local_consumption_tax: number | null; // 地方消費税
}

export interface MigrationData {
  fiscal_year: number;
  prefecture: string;
  area: string;
  source: string;
  domestic_in: number | null;      // (A) 国内転入
  domestic_out: number | null;     // (B) 国内転出
  international_in: number | null; // (C) 国外転入
  international_out: number | null;// (D) 国外転出
  social_increase: number | null;  // 社会増減
}

export interface PopulationData {
  fiscal_year: number;
  prefecture: string;
  area: string;
  source: string;
  total_population: number | null; // 人口（計）
  births: number | null;           // 出生者数
  deaths: number | null;           // 死亡者数
}
```

### 2. Lexicon / Mapping Config (`src/data/lexicon.ts`)
Excelのヘッダー行に含まれるキーワードの定義。
```typescript
export const LEXICON = {
  // ■ 決算カード (Settlement)
  settlement: {
    revenue: ["歳入合計", "歳入決算総額"],
    expenditure: ["歳出合計", "歳出決算総額"],
    real_balance: ["実質収支", "実質収支額"],
    local_tax: ["地方税"],
    local_consumption_tax: ["地方消費税"],
    population: ["住民基本台帳人口", "住基人口"],
  },

  // ■ 人口移動 (Migration)
  migration: {
    domestic_in: ["転入者数(国内)", "転入者数（国内）", "(A)"],
    domestic_out: ["転出者数(国内)", "転出者数（国内）", "(B)"],
    international_in: ["国外からの転入者数", "国外転入", "(C)"],
    international_out: ["国外への転出者数", "国外転出", "(D)"],
    social_increase: ["社会増加数", "社会増減", "(A)-(B)+(C)-(D)"],
  },

  // ■ 人口動態 (Population)
  population: {
    births: ["出生者数", "出生"],
    deaths: ["死亡者数", "死亡"],
    total_population_label: ["人口"], 
    total_population_sub_label: ["計", "総数"], 
  }
};
```

### 3. Utils (`src/utils.ts`)
```typescript
export const PREFECTURES = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];

export function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/,/g, '').trim();
  if (['-', '－', '＊', '*', '...', '―', '△'].includes(str)) return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

export function normalizePrefecture(name: string): string {
  const found = PREFECTURES.find(p => name.includes(p));
  return found ? found : name;
}
```

### 4. Entry Point (`src/index.ts`)
```typescript
import * as fs from 'fs-extra';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { extractSettlement } from './modes/settlement';
import { extractMigration } from './modes/migration';
import { extractPopulation } from './modes/population';

const ROOT_DIR = process.cwd();
const XLSX_DIR = path.join(ROOT_DIR, 'xlsx');
const DATA_DIR = path.join(ROOT_DIR, 'data');

async function main() {
  await fs.ensureDir(DATA_DIR);
  await fs.ensureDir(XLSX_DIR); 
  
  const files = await fs.readdir(XLSX_DIR);

  for (const file of files) {
    if (file.startsWith('.') || !file.match(/\.(xlsx|xls)$/i)) continue;
    console.log(`\n🚜 Processing: ${file}`);
    
    const workbook = XLSX.readFile(path.join(XLSX_DIR, file));
    const fileName = path.parse(file).name;
    const fileYearMatch = fileName.match(/FY(\d{4})/);
    const fiscalYear = fileYearMatch ? parseInt(fileYearMatch[1]) : 2025;

    let results: any[] = [];

    // ファイル名に応じたモード切替
    if (file.includes("migration")) {
      results = extractMigration(workbook, fiscalYear, file);
    } else if (file.includes("population")) {
      results = extractPopulation(workbook, fiscalYear, file);
    } else {
      results = extractSettlement(workbook, fiscalYear, file);
    }

    const uniqueMap = new Map();
    results.forEach(r => {
      const key = `${r.fiscal_year}-${r.area || r.prefecture}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, r);
    });
    const finalData = Array.from(uniqueMap.values());

    if (finalData.length > 0) {
      await fs.writeJson(path.join(DATA_DIR, `${fileName}.json`), finalData, { spaces: 2 });
      console.log(`  ✅ Extracted ${finalData.length} records.`);
    } else {
      console.log(`  ⚠️ No data extracted.`);
    }
  }
}
main().catch(console.error);
```

### 5. Modes (Logic)

#### `src/modes/settlement.ts` (決算カード)
```typescript
import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture } from '../utils';
import { LEXICON } from '../data/lexicon';
import { SettlementData } from '../types';

export function extractSettlement(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): SettlementData[] {
  const results: SettlementData[] = [];
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
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const cleanPref = normalizePrefecture(sheetName);
    const entry: any = { fiscal_year: fiscalYear, prefecture: cleanPref, source: sourceFile };
    let foundAny = false;

    CONFIG.forEach((configItem) => {
      if (entry[configItem.key] !== undefined) return;
      outer_loop: for (const row of matrix) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c]);
          if (configItem.keywords.some(kw => cellStr.includes(kw))) {
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
```

#### `src/modes/migration.ts` (人口移動)
```typescript
import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture, PREFECTURES } from '../utils';
import { LEXICON } from '../data/lexicon';
import { MigrationData } from '../types';

export function extractMigration(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): MigrationData[] {
  const results: MigrationData[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本)/i)) continue;
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const colMap: { [key: string]: number } = {};
    let headerRow = -1;

    for (let r = 0; r < Math.min(20, matrix.length); r++) {
      matrix[r].forEach((cell, c) => {
        const str = String(cell).replace(/\s/g, ''); 
        if (!str) return;
        const check = (kws: string[]) => kws.some(kw => kw.length <= 3 ? str === kw : str.includes(kw));
        if (check(LEXICON.migration.domestic_in)) colMap['domestic_in'] = c;
        if (check(LEXICON.migration.domestic_out)) colMap['domestic_out'] = c;
        if (check(LEXICON.migration.international_in)) colMap['international_in'] = c;
        if (check(LEXICON.migration.international_out)) colMap['international_out'] = c;
        if (check(LEXICON.migration.social_increase)) colMap['social_increase'] = c;
      });
      if (colMap['domestic_in'] !== undefined && colMap['domestic_out'] !== undefined) headerRow = r;
    }
    if (headerRow === -1) continue;

    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r];
      const nameCandidates = [row[0], row[1], row[2]].map(v => String(v || "").trim());
      const prefMatch = nameCandidates.find(n => PREFECTURES.includes(n) || PREFECTURES.includes(n.replace(/\s/g, '')));
      if (prefMatch) {
        const cleanName = normalizePrefecture(prefMatch);
        results.push({
          fiscal_year: fiscalYear,
          prefecture: cleanName,
          area: cleanName,
          source: sourceFile,
          domestic_in: parseNumber(row[colMap['domestic_in']]),
          domestic_out: parseNumber(row[colMap['domestic_out']]),
          international_in: parseNumber(row[colMap['international_in']]),
          international_out: parseNumber(row[colMap['international_out']]),
          social_increase: parseNumber(row[colMap['social_increase']])
        });
      }
    }
  }
  return results;
}
```

#### `src/modes/population.ts` (人口動態)
```typescript
import * as XLSX from 'xlsx';
import { parseNumber, normalizePrefecture, PREFECTURES } from '../utils';
import { LEXICON } from '../data/lexicon';
import { PopulationData } from '../types';

export function extractPopulation(workbook: XLSX.WorkBook, fiscalYear: number, sourceFile: string): PopulationData[] {
  const results: PopulationData[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (sheetName.match(/(目次|index|注意|原本|表紙|概況|付表)/i)) continue;
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
    if (matrix.length < 5) continue;

    const colMap: { [key: string]: number } = {};
    let dataStartRow = -1;

    for (let r = 0; r < Math.min(20, matrix.length); r++) {
      const rowStr = matrix[r].join("").replace(/\s/g, '');
      if (LEXICON.population.births.some(kw => rowStr.includes(kw))) {
        matrix[r].forEach((cell, c) => {
          const str = String(cell).replace(/\s/g, '');
          if (LEXICON.population.births.some(kw => str.includes(kw))) colMap['births'] = c;
          if (LEXICON.population.deaths.some(kw => str.includes(kw))) colMap['deaths'] = c;
        });
        if (dataStartRow === -1) dataStartRow = r + 1;
      }
      if (LEXICON.population.total_population_label.some(kw => rowStr.includes(kw))) {
        matrix[r].forEach((cell, c) => {
          const str = String(cell).replace(/\s/g, '');
          if (LEXICON.population.total_population_label.some(kw => str.includes(kw))) {
            const subHeader1 = String(matrix[r+1]?.[c] || "").replace(/\s/g, '');
            const subHeader2 = String(matrix[r+2]?.[c] || "").replace(/\s/g, '');
            if (LEXICON.population.total_population_sub_label.some(kw => subHeader1 === kw || subHeader2 === kw)) {
              colMap['total_population'] = c;
            } else if (colMap['total_population'] === undefined) {
               colMap['total_population'] = c;
            }
          }
        });
      }
    }
    if (colMap['births'] === undefined || colMap['deaths'] === undefined) continue;
    if (dataStartRow === -1) dataStartRow = 5;

    for (let r = dataStartRow; r < matrix.length; r++) {
      const row = matrix[r];
      if (row.join("").length < 5) continue;
      const colB = String(row[1] || "").replace(/\s/g, '');
      const colC = String(row[2] || "").replace(/\s/g, '');
      const colD = String(row[3] || "").replace(/\s/g, '');

      let pref = "";
      let city = "";
      if (PREFECTURES.some(p => colB.includes(p))) pref = normalizePrefecture(colB);
      else if (PREFECTURES.some(p => colC.includes(p))) pref = normalizePrefecture(colC);

      const candidateCity = colC || colD;
      if (candidateCity && candidateCity.match(/(市|区|町|村)$/) && !candidateCity.match(/(計|総数|再掲)/)) {
        city = candidateCity.trim();
      }

      let areaName = "";
      if (pref && city) areaName = `${pref}${city}`;
      else if (pref) areaName = pref;
      else continue;

      const valPopulation = parseNumber(row[colMap['total_population']]);
      const valBirths = parseNumber(row[colMap['births']]);
      const valDeaths = parseNumber(row[colMap['deaths']]);

      if (valPopulation !== null || valBirths !== null) {
        results.push({
          fiscal_year: fiscalYear,
          prefecture: pref || normalizePrefecture(areaName),
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
```
```
