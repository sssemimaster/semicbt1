"""영어 번역(data/en/*.json)이 한국어 원본과 맞는지 확인하는 해시. i18n.js 의 hash() 와 똑같이 계산한다.
원본 필드를 JSON 배열로 만든 뒤(JS JSON.stringify 와 같은 모양) UTF-16 단위로 FNV-1a 32비트."""
import json

SRC = {
    'theories': ['title', 'content'],
    'questions': ['question', 'options', 'explanation', 'answer'],
    'interviews': ['question', 'follow_up', 'follow_up_answer', 'interview_answer', 'key_points'],
    'glossary': ['t', 'd', 'e', 'u'],
    'careers': ['name', 'one', 'todo', 'flow', 'know', 'ask'],
    'majors': ['name', 'alias', 'why'],
}


def src_hash(x, kind):
    s = json.dumps([x.get(f) for f in SRC[kind]], ensure_ascii=False, separators=(',', ':'))
    b = s.encode('utf-16-le')
    h = 0x811c9dc5
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 16777619) & 0xffffffff
    return '%08x' % h


def gl_key(t):
    return t['f'] + '|' + t['s'] + '|' + t['t']
