# 用 ElevenLabs（eleven_v4，一次性生成）做带情绪的女声旁白。用法：python3 tts_el.py <音色名开头> [输出名]
import os, sys, json, base64, urllib.request
TEXT = open('audio/vo_text.txt').read().strip()
k = os.environ.get('ELEVENLABS_API_KEY')
if not k:
    for l in open(os.path.expanduser('~/Documents/work/video/24节气/.env.elevenlabs')):
        if l.startswith('ELEVENLABS_API_KEY'): k = l.split('=', 1)[1].strip().strip('"\'')
H = {'xi-api-key': k, 'Content-Type': 'application/json'}
voices = json.load(urllib.request.urlopen(urllib.request.Request('https://api.elevenlabs.io/v2/voices?page_size=100', headers=H)))['voices']
v = next(x for x in voices if x['name'].startswith(sys.argv[1]))
name = sys.argv[2] if len(sys.argv) > 2 else sys.argv[1]
body = {'inputs': [{'text': TEXT, 'voice_id': v['voice_id']}], 'model_id': 'eleven_v4', 'language_code': 'zh', 'settings': {'stability': 0.5}}
r = json.load(urllib.request.urlopen(urllib.request.Request(
    'https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128', data=json.dumps(body).encode(), headers=H)))
open(f'audio/{name}.mp3', 'wb').write(base64.b64decode(r['audio_base64']))
a = r['alignment']
words = [{'t': s, 'd': e - s, 'w': c} for c, s, e in zip(a['characters'], a['character_start_times_seconds'], a['character_end_times_seconds'])]
json.dump({'text': TEXT, 'voice': v['name'], 'model': 'eleven_v4', 'words': words}, open(f'audio/{name}_words.json', 'w'), ensure_ascii=False, indent=1)
print(v['name'], 'end', words[-1]['t'] + words[-1]['d'], ''.join(w['w'] for w in words)[:60])
