"""한국어 콘텐츠를 영어로 번역해 data/en/*.json 에 저장한다 (영어 모드용).

- 이미 번역돼 있고 원본이 바뀌지 않은 항목(_h 해시가 같음)은 건너뛴다. 새로 생기거나 바뀐 항목만 번역한다.
- 사용: python scripts/translate_en.py --targets questions,interviews --limit 400
- 이론(theories)·용어집(glossary)은 사람이 다듬은 번역이 들어가 있으므로, 여기서는 '빠진 것·낡은 것'만 채운다.
"""
import argparse
import json
import os
import sys
import time

from openai import OpenAI

sys.path.insert(0, os.path.dirname(__file__))
from i18n_hash import src_hash, gl_key  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
DATA = os.path.join(ROOT, 'data')
EN = os.path.join(DATA, 'en')

PRESET = (os.environ.get('QUALITY_PRESET') or 'balanced').strip().lower()
MODEL = 'gpt-4o-mini' if PRESET == 'economy' else 'gpt-4o'
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

STYLE = """You translate a Korean semiconductor study site ("SemiSaegim") into English for international learners.
Goals: keep the original meaning, technical accuracy and teaching flow, and make it read as if it were written in English
by a friendly, clear tutor — not a literal translation. Use standard industry terminology (e.g. 식각=etching, 증착=deposition,
노광=exposure/lithography, 선택비=selectivity, 단차 피복성=step coverage, 문턱 전압=threshold voltage, 수율=yield, 웨이퍼=wafer).
Keep numbers, units, chemical formulas, math/LaTeX ($...$), markdown structure (headings, bold, lists, tables) and line breaks.
Never add or remove facts. Output only valid JSON with exactly the requested keys."""

PROMPTS = {
    'questions': """Translate this multiple-choice question. Keys: question, options (same count and order), explanation.
The explanation must keep this structure, using these exact English markers:
"Answer explanation\\n<text>\\n\\nWhy the others are wrong\\n· Option N: <text>\\n...\\n\\n💡 Key point: <text>"
(map 정답 해설 → Answer explanation, 오답 체크 → Why the others are wrong, "· N번:" → "· Option N:", 💡 기억 포인트 → 💡 Key point).
If a part is missing in the source, omit it.""",
    'interviews': """Translate this interview-practice item. Keys: question, follow_up, follow_up_answer, interview_answer, key_points (list, same count).
Answers should sound like a strong candidate speaking naturally in an English-language interview.
Where the source refers to Korea-specific companies or hiring customs, phrase it for a global semiconductor industry context
(e.g. "a memory maker", "a foundry") unless the specific company is essential to the technical point.""",
    'theories': """Translate this theory article. Keys: title, tags (list, same count, short; keep a leading # if present), content (markdown).
Keep every {{diagram:ID|caption}} token exactly in place with the same ID; translate only the caption after "|".
Keep section label tags like [핵심 개념] translated as [Key concept], [정의] as [Definition], [측정 방법] as [How it's measured],
[변수 영향] as [Effect of variables], [동작 원리] as [How it works], [실무 이슈] as [In practice], [개선 방법] as [How to improve],
[암기 포인트] as [Remember], and similar bracketed labels in the same style.""",
    'careers': """Translate this job-role card from a semiconductor career map for readers outside Korea.
Keys: name (an English job title as used in the global industry), one, todo (list, same count), flow, know (list of short skill labels, same count), ask (list, same count).
Phrase Korea-specific references (Korean companies, Korean hiring customs, "reading English manuals") for a global audience.""",
    'majors': """Translate this university major entry for readers outside Korea. Keys: name (the usual English name of the major),
alias (list of common English names/abbreviations people might search for; count may differ), why (one or two sentences).
"공고" means job postings. Replace references to specific Korean companies with a general phrase.""",
    'glossary': """Translate this glossary term. Keys: t (the English term name as used in industry), d (one-sentence definition),
e (easy explanation/analogy), u (where it's used; keep commas between items). Omit a key if the source value is empty.""",
}

FIELDS = {
    'questions': ['question', 'options', 'explanation'],
    'interviews': ['question', 'follow_up', 'follow_up_answer', 'interview_answer', 'key_points'],
    'theories': ['title', 'tags', 'content'],
    'glossary': ['t', 'd', 'e', 'u'],
    'careers': ['name', 'one', 'todo', 'flow', 'know', 'ask'],
    'majors': ['name', 'alias', 'why'],
}


def load(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write('\n')


def ask(kind, src):
    payload = {k: src.get(k) for k in FIELDS[kind] if src.get(k) not in (None, '', [])}
    if kind == 'careers' and payload.get('know'):
        payload['know'] = [k.get('label', '') for k in payload['know']]
    for attempt in range(3):
        try:
            r = client.chat.completions.create(
                model=MODEL, temperature=0.3, response_format={'type': 'json_object'},
                messages=[{'role': 'system', 'content': STYLE + '\n\n' + PROMPTS[kind]},
                          {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}])
            out = json.loads(r.choices[0].message.content)
            ok = all(k in out for k in payload)
            if kind == 'questions':
                ok = ok and isinstance(out.get('options'), list) and len(out['options']) == len(src['options'])
            if kind in ('interviews',) and payload.get('key_points'):
                ok = ok and isinstance(out.get('key_points'), list)
            if kind == 'careers':
                ok = ok and all(isinstance(out.get(f), list) and len(out[f]) == len(payload[f]) for f in ('todo', 'know', 'ask') if f in payload)
            if kind == 'theories':
                import re
                ids = lambda s: re.findall(r'\{\{diagram:([^|}]+)', s or '')
                ok = ok and ids(out.get('content')) == ids(src.get('content'))
            if ok:
                return {k: out[k] for k in payload}
            print('  ⚠️ 형식이 맞지 않아 다시 시도', attempt + 1)
        except Exception as e:  # noqa: BLE001
            print('  ⚠️ 오류', e)
            time.sleep(3)
    return None


def run(kind, limit):
    if kind == 'glossary':
        src = load(os.path.join(DATA, 'glossary.json'), {}).get('terms', [])
        en_doc = load(os.path.join(EN, 'glossary.json'), {'terms': []})
        en_list = en_doc.get('terms', [])
        key = gl_key
        idk = 'k'
    elif kind == 'majors':
        src = load(os.path.join(DATA, 'majors.json'), {}).get('majors', [])
        en_doc = load(os.path.join(EN, 'majors.json'), {'groups': [], 'majors': []})
        en_list = en_doc.get('majors', [])
        key = lambda x: x.get('id')
        idk = 'id'
    else:
        src = load(os.path.join(DATA, kind + '.json'), [])
        en_list = load(os.path.join(EN, kind + '.json'), [])
        key = lambda x: x.get('id')
        idk = 'id'
    have = {e.get(idk): e for e in en_list if isinstance(e, dict)}
    out, done, skipped = [], 0, 0
    for x in src:
        k = key(x)
        if not k:
            continue
        if kind == 'theories' and x.get('category') == '심화 이론':
            continue  # 유료 글은 공개 레포에서 다루지 않는다
        h = src_hash(x, kind)
        e = have.get(k)
        if e and e.get('_h') == h:
            out.append(e)
            continue
        if done >= limit:
            if e:
                out.append(e)  # 낡았지만 다음 번에 다시 번역 (화면은 해시가 달라 한국어로 보임)
            skipped += 1
            continue
        print(f'[{kind}] 번역: {k}')
        tr = ask(kind, x)
        if tr is None:
            if e:
                out.append(e)
            continue
        out.append({idk: k, '_h': h, **tr})
        done += 1
    if kind == 'glossary':
        en_doc['terms'] = out
        save(os.path.join(EN, 'glossary.json'), en_doc)
    elif kind == 'majors':
        en_doc['majors'] = out
        save(os.path.join(EN, 'majors.json'), en_doc)
    else:
        save(os.path.join(EN, kind + '.json'), out)
    print(f'[{kind}] 새로 번역 {done}개, 다음으로 미룸 {skipped}개, 전체 {len(out)}개')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--targets', default='questions,interviews')
    ap.add_argument('--limit', type=int, default=400, help='종류별 이번에 번역할 최대 개수 (비용 조절)')
    a = ap.parse_args()
    print('모델:', MODEL)
    for t in [s.strip() for s in a.targets.split(',') if s.strip()]:
        run(t, a.limit)
