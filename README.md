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

`private/kanon_original/` へ配置したシナリオ、BMP、WAVは、内容を外部へ送らず次のコマンドで検査できます。

```console
npm run validate:assets
```

## 実データ診断プレビュー（Windows）

`private/kanon_original/scenario/` に `.org` と同名の `.utf` を1組以上置くと、次の1コマンドで自動テスト、原作アセット検査、全シナリオのKAG生成、ローカルKiriKiriへの配置、`tvpwin64.exe`の起動まで行います。ファイル名順で最初のシナリオから開始し、`jump(70)`のような命令は生成済みの`SEEN0070.ks`へ切り替わります。

```console
npm.cmd run test:kanon
```

これは現在の再現範囲を見るための診断プレビューです。`grpOpenBg`の引数が実在画像へ解決できる場合は、未確定の画面効果だけを無視して画像自体を直接表示します。`grpBuffer`、`objBgOfFile`、`objBgMove`、`grpMulti`の命令列から背景・立ち絵IDと座標を静的に確定できる場合も、未確定の合成効果を無視して直接表示します。欠落した本文参照、画像にも解決できない命令、未実装のOP開始、その他の未確定命令は、元位置・opcode・理由を `cache/kanon/preview/preview-report.json` と `reports/<scene>.json` に残して飛ばします。本文は暫定txtwindowで表示し、未解決の話者式は省略します。通常のKAG生成は引き続き未確定命令で停止するため、このプレビューを忠実再現済みとは扱いません。

## 次の実装入力

実Importerの着手に必要なのは原作ファイルそのものではなく、[docs/decoder-contract.md](docs/decoder-contract.md) に定義した抽象化済み情報です。
