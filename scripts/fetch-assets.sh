#!/usr/bin/env bash
# Lovable에 올려둔 원본 이미지/폰트를 받아 플레이스홀더를 교체하는 스크립트.
# lovable.app 에 접근 가능한 PC에서 실행하세요: bash scripts/fetch-assets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="https://id-preview-b6474bc7--6666724e-de5d-42cf-83d5-342a7cb4f7da.lovable.app"

curl -fSL -o "src/assets/ai-head-circuit.png" "$BASE/__l5e/assets-v1/f0be6529-67f1-4ff5-8e22-7ea4ba03b692/ai-head-circuit.png" && echo "ok ai-head-circuit.png"
curl -fSL -o "src/assets/ai-head-v2.png" "$BASE/__l5e/assets-v1/b2932713-7848-43f0-b8b1-73ac9dfa4806/ai-head-v2.png" && echo "ok ai-head-v2.png"
curl -fSL -o "src/assets/ai-head.png" "$BASE/__l5e/assets-v1/692e25eb-10da-49a6-ac87-e84d3f34bff6/ai-head.png" && echo "ok ai-head.png"
curl -fSL -o "src/assets/ai-hero.png" "$BASE/__l5e/assets-v1/ae216b18-8d08-4043-b23e-e61c10fc6a5b/ai-hero.png" && echo "ok ai-hero.png"
curl -fSL -o "src/assets/ai-orb.png" "$BASE/__l5e/assets-v1/39ebaf04-b5fa-4b17-975b-ad022c5cdeb7/ai-orb.png" && echo "ok ai-orb.png"
curl -fSL -o "src/assets/article-agent-table.png" "$BASE/__l5e/assets-v1/632980d2-4630-41aa-b7ae-40b7c52d7ee2/article-agent-table.png" && echo "ok article-agent-table.png"
curl -fSL -o "src/assets/article-jensen.png" "$BASE/__l5e/assets-v1/17b201cb-3aab-43c7-9bdf-b7403860ad79/article-jensen.png" && echo "ok article-jensen.png"
curl -fSL -o "src/assets/article-meta-glasses.png" "$BASE/__l5e/assets-v1/2717fe3c-3124-41c1-8b4d-1c001c427c4d/article-meta-glasses.png" && echo "ok article-meta-glasses.png"
curl -fSL -o "src/assets/article-reading.png" "$BASE/__l5e/assets-v1/b8b6999f-8e0a-41d4-a0c3-c810a9b97fac/article-reading.png" && echo "ok article-reading.png"
curl -fSL -o "src/assets/article-vibe-coding.png" "$BASE/__l5e/assets-v1/834e59b8-a516-440a-9650-91f867a911a7/article-vibe-coding.png" && echo "ok article-vibe-coding.png"
curl -fSL -o "src/assets/hero-scene.png" "$BASE/__l5e/assets-v1/bce05437-1041-496a-a387-fb19091f81fa/hero-scene.png" && echo "ok hero-scene.png"
curl -fSL -o "src/assets/mascot-claude-v2.png" "$BASE/__l5e/assets-v1/0550456f-118d-42dd-bdc9-32b9a0c360e6/mascot-claude-v2.png" && echo "ok mascot-claude-v2.png"
curl -fSL -o "src/assets/mascot-claude.png" "$BASE/__l5e/assets-v1/f9bf9c0b-9151-48ea-8031-ef78590c21d9/mascot-claude.png" && echo "ok mascot-claude.png"
curl -fSL -o "src/assets/mascot-prize.png" "$BASE/__l5e/assets-v1/67c849d0-f042-4775-bfcf-ee6934d603f3/mascot-prize.png" && echo "ok mascot-prize.png"
curl -fSL -o "src/assets/prize-claude.jpg" "$BASE/__l5e/assets-v1/c15f03c0-bc11-47cf-92a0-6848fb6eadc5/prize-claude.jpg" && echo "ok prize-claude.jpg"
curl -fSL -o "src/assets/prize-keyboard.jpg" "$BASE/__l5e/assets-v1/1ded769f-0ccb-4c4f-bd69-94324e1c6aea/prize-keyboard.jpg" && echo "ok prize-keyboard.jpg"
curl -fSL -o "src/assets/prize-mouse.jpg" "$BASE/__l5e/assets-v1/eab59e0e-0940-4e60-bf9c-062689015168/prize-mouse.jpg" && echo "ok prize-mouse.jpg"
curl -fSL -o "src/assets/teczen-logo.png" "$BASE/__l5e/assets-v1/13b3761d-a542-4fd8-8730-bead59aae279/teczen-logo.png" && echo "ok teczen-logo.png"

# Pretendard 폰트 (내부망 셀프호스팅용)
mkdir -p public/fonts
curl -fSL -o public/fonts/PretendardVariable.woff2 "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2/PretendardVariable.woff2" && echo "ok PretendardVariable.woff2"

# GmarketSans Light/Bold (Medium은 레포에 포함되어 있음)
curl -fSL -o public/fonts/GmarketSansLight.woff "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansLight.woff" && echo "ok GmarketSansLight.woff"
curl -fSL -o public/fonts/GmarketSansBold.woff "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansBold.woff" && echo "ok GmarketSansBold.woff"

echo "완료. 교체된 파일을 커밋하세요."
