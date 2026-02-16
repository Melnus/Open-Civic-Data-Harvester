# Open-Civic-Data-Harvester 🚜

日本の行政データ（Excel/PDF）を収集し、機械可読なJSON形式に変換してAPI化するためのデータパイプライン。
システムが「現実の物理パラメータ」を吸い上げるための吸入口として機能します。
  
  
😠😠😠😠😠😠😠😠😠  
😠なお現在は手動です😠  
😠😠😠😠😠😠😠😠😠  
  
   
## 📁 フォルダ構成

- `xlsx/`: **【入力】** ここに行政のExcelファイルを置きます。
- `data/`: **【出力】** 変換されたJSONがここに生成されます。
- `src/`: 変換ロジック（TypeScript）。

---

## 🛠 使い方 (Human Protocol)

官公庁のURLは頻繁に変更されるため、以下の手順で手動収集（Harvest）を行います。
### 0. 注意

**和暦の禁止😠:**
   令和何年平成何年という書き方ではなく、『FY〇〇〇〇-英語.拡張子』にしてください。**これが世界標準です。**

   
<details>
<summary><b>📅対応表</b></summary>

|和暦|西暦|
|:---:|:---:|
|平成27年|2015|
|平成28年|2016|
|平成29年|2017|
|平成30年|2018|
|平成31年|2019|
|令和1年|2019|
|令和2年|2020|
|令和3年|2021|
|令和4年|2022|
|令和5年|2023|
|令和6年|2024|
|令和7年|2025|
|令和8年|2026|
|令和9年|2027|
|令和10年|2028|
</details>

### 1. データを狩る（Download）
以下の「主要な狩り場」から最新の統計データ（Excel形式）をダウンロードしてください。

| データ種別 | 狩り場 (URL) | 推奨ファイル名 |取りに行くもの|
| :--- | :--- | :--- | :--- |
| **地方財政** |  [総務省｜地方財政状況調査関係資料｜決算カード](https://www.soumu.go.jp/iken/zaisei/card.html) | `FYxxxx-settlementcard.xls` | xxxx年度都道府県決算カード |
| **人口移動** | [統計局ホームページ/住民基本台帳人口移動報告](https://www.stat.go.jp/data/idou/index.html) | `FYxxxx-migration_prefecture.xlsx` | 都道府県別社会増減数（xxxx年） |
| **人口動態** | [総務省｜住民基本台帳等｜住民基本台帳に基づく人口、人口動態及び世帯数](https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html) | `FYxxxx-population_dynamics_municipal.xlsx` | 【総計】xxxx年住民基本台帳人口・世帯数、xxxx年人口動態（市区町村別） |
  
  
### 2. データを投入する（Ingest）
1. GitHubの **`xlsx`** フォルダを開きます。
2. 右上の「Add file」→「Upload files」を選択します。
3. ダウンロードしたExcelファイルをドラッグ＆ドロップ（または選択）します。
4. 「Commit changes」を押して保存します。

### 3. 変換と公開（Auto-Transform）
ファイルがコミットされると、GitHub Actionsが自動的に起動します。
- **約1〜2分後**、`data/` フォルダに同名の `.json` ファイルが生成されます。
- 以下のURLでAPIとしてアクセス可能になります：
  `https://[Your-ID].github.io/[Repo-Name]/data/[ファイル名].json`

---

## 💻 ローカルでの実行方法 (開発者向け)

手元で変換を試したい場合：

```bash
# 1. 依存関係のインストール
npm install

# 2. xlsxフォルダにファイルを置く
cp ~/Downloads/test.xlsx ./xlsx/

# 3. 変換スクリプト実行
npm run harvest

# -> data/test.json が生成されます
```
