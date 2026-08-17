# preframe

PC版『Kanon』をWindows上で可能な限り忠実に再現するための移植基盤です。最初から汎用VNエンジンを作ることは目的にしていません。

現段階の処理系は次の一方向です。

```text
Kanon固有データ
  -> Kanon Decoder
  -> Kanon Parser
  -> Kanon固有命令モデル
  -> KAG emitter
  -> KiriKiri / KAG
```

KAGタグは出力形式であり、共通命令規格ではありません。作品非依存の共通モデルは、Kanonの再現が進み、2作品目と比較できるまで作りません。

## 現在できること

- 原作位置、opcode、生引数、解析済みの意味を同時に保持する
- 未知命令を破棄せず `unknown` として保持する
- 論理アセットIDをKAG用storageへ解決する
- Kanonの再現状態を命令単位で更新する
- 内容を伏せた実行トレースを生成する
- 対応済み命令をKAGシナリオへ出力する
- Kprl 1.45の `.org` と `.utf` を、本文をGitへ入れずdecoded recordへ変換する
- 合成ダミー画像・音声だけで最小シーン一式を生成する
- 既知の再現差分を機械可読な台帳で管理する

Kprl逆アセンブルImporterは追加済みです。ただし、Kprl命令名だけでは挙動を確定せず、未確認命令を `unknown` に保ちます。元バイナリのbyte offsetと数値opcodeを復元するDecoderは未実装です。詳細は [docs/kprl-importer.md](docs/kprl-importer.md) を参照してください。

## 実行

Node.js 20以上だけを使用し、外部npmパッケージは不要です。

```console
npm run verify
```

成功すると `cache/kanon/kag-data/` に次が生成されます。

```text
first.ks
scenario/dummy.ks
assets/background/dummy-room.png
assets/sprite/dummy-character.png
assets/bgm/dummy-bgm.wav
assets/se/dummy-se.wav
assets/voice/dummy-voice.wav
trace/dummy.trace.log
state/dummy.final-state.json
```

生成物をKAG3テンプレートの `data/` へ重ねると、ダミーシーンを開始できます。KiriKiri/KAG本体はこのリポジトリに同梱しません。KAGでの実機確認手順は [runtime/kag/README.md](runtime/kag/README.md) にあります。

## 原作データ

原作データは `private/` のみで扱い、Gitには入りません。ファイル名や配置を変更する前提も置かず、ローカル設定から参照します。詳細は [docs/original-data-layout.md](docs/original-data-layout.md) を参照してください。

`private/kanon_original/` へ配置したシナリオ、BMP、NWA、WAVは、内容を外部へ送らず次のコマンドで検査できます。

```console
npm run validate:assets
```

## 次の実装入力

実Importerの着手に必要なのは原作ファイルそのものではなく、[docs/decoder-contract.md](docs/decoder-contract.md) に定義した抽象化済み情報です。
