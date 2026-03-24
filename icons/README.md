# PWA アイコン（差し替え用）

- `icon-192.png` … 192×192（ホーム画面・Apple Touch Icon 用）
- `icon-512.png` … 512×512（スプラッシュ・ストア表示用）

## 差し替え方法

1. 同じファイル名で上書き保存する  
2. `manifest.json` の `icons` の `src` は変更不要（パスが同じなら）

## 再生成（仮アイコン）

プロジェクトルートで:

```powershell
powershell -ExecutionPolicy Bypass -File icons/_generate-icons.ps1
```

※ 本番用にはネコリス用デザインの PNG に差し替えてください。
