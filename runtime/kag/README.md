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

テンプレート側に既存の `first.ks` がある場合は上書きせず、生成された `scenario/dummy.ks` を既存シナリオから `[call storage="scenario/dummy.ks"]` で呼び出します。

## 実データ診断プレビュー

Windowsではリポジトリ直下から次を実行します。

```console
npm.cmd run test:kanon
```

このコマンドは、テストとローカルアセット検査に成功した場合だけ、`.org/.utf` から現在対応できる命令をKAGへ変換し、参照された原作アセットだけを `cache/kanon/preview/` へコピーします。その後、生成した `data/` を `runtime/local/kirikiri/data/` へ重ね、`tvpwin64.exe`を起動します。既存の `startup.tjs` は削除しません。

未確定の `grpOpenBg` が実在画像を参照している場合、診断プレビューでは効果番号を無視し、画像だけを瞬間表示して処理を継続します。それ以外の未確定命令は飛ばして `preview-report.json`へ記録します。通常のEmitterが未知命令を拒否する挙動は変更しません。画面に出た部分は「現在実装済み、または明示的に近似した範囲」であり、未確定効果や飛ばした命令の前後関係まで原作どおりであることは保証しません。

## TJS拡張

`extensions/` は、KAG標準タグで原作挙動を表現できないことが実測で確定した処理だけを置きます。現段階では空です。KAGタグやTJS関数をKanon命令モデルへ逆流させません。
