# KAG runtime

## 対象

出力はKAG3の標準タグを使用します。KiriKiri/KAG本体とテンプレートは同梱しません。採用するKiriKiri Z/KAG配布物の版は、Windows実機検証時に固定してください。

公式のKiriKiri Z 1.4.0r2配布物では、実行ファイル名は`krkrz.exe`ではなく`tvpwin64.exe`（64bit版）と`tvpwin32.exe`（32bit版）です。通常の64bit Windowsでは`tvpwin64.exe`から確認します。`tvpwin32_dbg.exe`や`krkrdebug.exe`は通常起動用ではありません。

## ダミー再生

1. リポジトリ直下で `npm run build:dummy` を実行する。
2. `cache/kanon/kag-data/` の中身を、KAGテンプレートの `data/` へコピーする。
3. テンプレートの通常手順でKiriKiriを起動する。
4. 背景、立ち絵、短い合成音、メッセージが順に処理されることを確認する。
5. `cache/kanon/kag-data/trace/dummy.trace.log` と画面順序を照合する。

`assets/system/white.png` は、Kanon冒頭で確認した白画面から背景へのcrossfade用に生成するランタイム資産です。原作由来の画像ではありません。

テンプレート側に既存の `first.ks` がある場合は上書きせず、生成された `scenario/dummy.ks` を既存シナリオから `[call storage="scenario/dummy.ks"]` で呼び出します。

## TJS拡張

`extensions/` は、KAG標準タグで原作挙動を表現できないことが実測で確定した処理だけを置きます。現段階では空です。KAGタグやTJS関数をKanon命令モデルへ逆流させません。
