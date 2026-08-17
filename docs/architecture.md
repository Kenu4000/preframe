# Architecture

## 境界

### `src/kanon/decoder.js`

バイト列や解析済みレコードを、原作位置と生引数を失わない `KanonDecodedRecord` にする境界です。実フォーマットのendian、文字コード、レコード長、opcode表はここより入力側に閉じ込めます。

### `src/kanon/parser.js`

DecodedRecordをKanon固有命令へ変換します。意味不明のopcodeは必ず `unknown` 命令になります。未知命令を警告だけで読み飛ばすことは禁止します。

### `src/kanon/model.js`

Kanon固有のScenario、Command、SourceLocation、AssetReferenceを定義します。ここは将来のCommon VN Modelではありません。

### `src/kanon/state.js`

シナリオ位置、変数、フラグ、表示レイヤ、BGM、SE、Voice、トランジション、UI状態を保持します。KAGの内部状態を正とせず、Kanon側の期待状態を比較可能にします。

### 暫定txtwindow

原作録画に合わせ、KAG標準メッセージ枠ではなく `message0` を画面下寄りの濃紺半透明矩形として構成します。位置・寸法・余白・色・書体は暫定値であり、原作UI画像・正確な座標・文字速度を確認するまで完全再現とは扱いません。`pause` はクリック待ち後に本文を消去し、`msgHide` はメッセージレイヤを非表示にします。

`reduceScenarioLinearly` は分岐のない合成fixture用の検査補助です。jumpやchoiceを解決する実ゲームExecutorではありません。実制御フローはopcodeのアドレス規則と条件評価が判明してから別に実装します。

### `src/runtime/kag-emitter.js`

対応済みのKanon命令をKAG3タグへ変換する出力Adapterです。未知命令は既定でビルドエラーにし、黙って欠落させません。

## トランジション

KAG3のトランジションは、表ページを `[backlay]` で裏ページへコピーし、裏ページを変更後に `[trans]` で表へ反映する構造です。Emitterは、連続した画面変更命令の直後がtransition命令である場合にだけ、この手順へまとめます。それ以外の画面変更は表ページへ即時反映します。

参考: [KAG3 タグリファレンス](https://krkrz.github.io/krkr2doc/kag3doc/contents/Tags.html)

## TJS

現段階のダミー再生はKAG標準タグだけで表現できます。そのため未確認のKanon挙動を先回りしてTJSへ固定していません。KAGだけで再現できない挙動が判明した時点で、`runtime/kag/extensions/` に作品固有TJSを追加し、対応するCommandのEmitterだけがそれを呼び出します。
