# Kprl逆アセンブルImporter

Kprl 1.45が出力する `.org` と番号付き `.utf` を、Kanon固有のdecoded record列へ変換します。原作本文を含む生成JSONは `cache/` にだけ書き、Gitへは入れません。

```console
npm run import:kprl -- \
  --org private/kanon_original/scenario/SCENE.org \
  --resource private/kanon_original/scenario/SCENE.utf
```

既定の出力先は `cache/kanon/imported/<scene>.decoded.json` です。入力は `private/`、出力は `cache/` の内側でなければImporterが拒否します。

## 現在確定して扱う構造

| Kprl構造 | decoded record | 根拠 |
|---|---|---|
| `#entrypoint` | `label` | エントリ番号とシンボルを構造として保持 |
| `intX[index] = literal` | `variable.set` | 代入先bank、index、literalを分離して保持 |
| 単独の `#res<id>` | `text` | `.utf` の同一IDと結合し、本文側の位置も保持 |
| `bgmLoop(id)` | `bgm.play` | `bgmFadeOut`までループ再生を続けることを実機確認 |
| `bgmFadeOut(rawDuration)` | `kanon.bgm.fadeOut` | 録画音声で1200が約1.2秒のfade-outと一致するためms単位として確認 |
| `msgHide` | `kanon.message.hide` | 30fps録画でtxtwindowが約0.20秒かけて消えることを確認 |
| `pause` | `kanon.message.pause` | txtwindow方式でクリック待ちし、その後に本文を消去することを実機確認 |
| `grpOpenBg('FGNY02A', 0)` | `kanon.background.open` | 30fps録画で約0.50秒のcrossfadeを確認。開始時の白画面はこの命令ではなく「初めから」の処理 |
| `grpOpenBg('SIRO', 26)` | `kanon.background.open` | 30fps録画で約2.0秒かけて白へ移行することを確認 |
| `wait(2000)` | `wait` | 白への移行完了後、OP呼出し前に約2.0秒保持することを録画から確認 |
| `farcall(8502)` | `kanon.opening.start` | 白画面保持後にOPへ移行することを確認。OP本体の再生実装は未対応 |
| `jump(70)` | `kanon.scenario.jump` | 現在の`SEEN0050`からシナリオ番号70へ切り替わることをユーザー解析で確認。出力先は`scenario/SEEN0070.ks` |
| その他の命令 | `unknown` | 命令名と型付き引数を保持し、挙動は推測しない |

`.org` に原作バイナリ上のbyte offsetと数値opcodeはありません。そのため `source.offset` は `.org` 内のUTF-8 byte offset、`source.opcode` はKprlの命令名で、`provenance` は `kprl-disassembly` です。元バイナリ位置・opcodeを回復できる資料が得られた時点で、別Decoderまたは対応表を追加します。

## 未確定のまま保持するもの

`title`、確認済みの組合せ以外の `grpOpenBg`・`farcall`、`eof`、`halt` 等は、名前だけからランタイム挙動を決めません。`kanon.kprl.<命令名>` を候補名として保持し、Parserでは `unknown` になります。整数1引数の`jump`は別のSEEN番号への切替として保持します。`farcall(8502)`はOP開始として識別できますが、OP本体のアセットと演出が未実装のためKAG出力を拒否します。

本文先頭の `\\{女の子}` のような単純なspeaker markupは、独立した名前欄や別メッセージにはせず、続く本文と同じ行へ `女の子「……」` の形で出力します。`\\m{A}` のような式は展開せず `speakerExpression` に残します。クリック待ちと本文消去は確認済みですが、文字配置、ウィンドウ外観、macro展開は未確認なので、通常のKAG emitterは実本文の出力をまだ拒否します。

## 診断プレビューだけで行う近似

診断プレビューは複数の`.org`/`.utf`組をまとめて生成し、生成済みSEEN間の`jump`を実行できます。短縮データで`.org`から参照された本文IDが`.utf`に存在しない場合は、厳密Importerでは従来どおり失敗し、診断プレビューだけが欠落IDを記録して続行します。

`grpBuffer(strS[n], buffer)`、`objBgOfFile(object, strS[n], ...)`、`objBgMove(object, x, y)`、`grpMulti(buffer, effect, ...)`の並びでは、先行するliteral代入、`itoa`、文字列追記からアセットIDを静的に確定できる場合に限り、背景と立ち絵を実在ファイルへ解決します。KAGでは立ち絵を確認できた座標へ直接表示します。`grpMulti`の合成方式、effect番号、`OBJWAIPERASE`は未確定のまま記録し、診断表示では無視します。この近似をKanon確定命令へ昇格させてはいけません。

会話途中だけを切り出した`.org`断片には`#entrypoint`と、それ以前に設定された変数値がないため、通常のシナリオ入力としては扱いません。断片は命令列の解析資料としてのみ使用し、本線へ自動結合しません。
