"""학습 코스(data/course.json) 점검: 이론이 늘어났을 때 순서를 정해야 할 항목을 알려 준다.
실행: python3 -I scripts/check_course.py
- 코스 순서표(order)에 없는 이론: 같은 폴더(category·subject)의 단원 맨 뒤에 자동으로 붙지만, 순서를 정하고 싶으면 order에 넣는다.
- 어느 단원에도 안 맞는 이론: 사이트에서 '새로 추가된 이론' 단원으로 보인다. 새 단원이 필요하면 course.json에 단원을 추가한다.
- 이론에 없는 id가 order에 있으면 오타나 삭제된 이론이다.
"""
import json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(os.path.join(root, 'data/theories.json'), encoding='utf-8'))
C = json.load(open(os.path.join(root, 'data/course.json'), encoding='utf-8'))
by = {t['id']: t for t in T}
placed, bad = {}, []
for u in C['units']:
    for i in u['order']:
        if i not in by: bad.append((u['id'], i))
        placed[i] = u['id']
auto, orphan = [], []
for t in T:
    if t['id'] in placed: continue
    hit = next((u for u in C['units'] if any(m['c'] == t['category'] and m['s'] == t['subject'] for m in u['match'])), None)
    (auto if hit else orphan).append((t, hit['id'] if hit else None))
ph = lambda t: '채워질 예정' in t['content']
print(f'이론 {len(T)}개 · 단원 {len(C["units"])}개 · 순서표에 올라간 이론 {len(placed)}개')
if bad: print('\n[오류] order에 있지만 theories.json에 없는 id:'); [print('  ', u, i) for u, i in bad]
if auto: print('\n[알림] 순서표에 없어 단원 맨 뒤에 자동으로 붙는 이론:'); [print(f'   {t["id"]}  {t["title"]}  → {u}') for t, u in auto]
if orphan: print('\n[알림] 어느 단원에도 안 맞는 이론(새로 추가된 이론 단원에 표시):'); [print(f'   {t["id"]}  {t["category"]} / {t["subject"]} / {t["title"]}') for t, _ in orphan]
n = sum(1 for i in placed if i in by and ph(by[i]))
print(f'\n내용이 비어 있어 숨겨지는 이론 {n}개 (내용이 채워지면 정해 둔 자리에 나타나요)')
sys.exit(1 if bad else 0)
