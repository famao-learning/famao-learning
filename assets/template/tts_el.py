# 用 ElevenLabs（eleven_v4，一次性生成）做旁白，同时输出逐字时间。用法：python3 tts_el.py [音色名开头 或 voice_id] [输出名]
# 默认音色：华风 Hua Feng（温暖的女低音，公共音色库，直接用 voice_id，不必先加进账户）。输出 audio/<输出名>.mp3 和 _words.json，输出名默认 vo
import os, sys, json, base64, urllib.request
TEXT = open('audio/vo_text.txt').read().strip()
k = os.environ.get('ELEVENLABS_API_KEY')
if not k:
    for l in open(os.path.expanduser('~/Documents/work/video/24节气/.env.elevenlabs')):
        if l.startswith('ELEVENLABS_API_KEY'): k = l.split('=', 1)[1].strip().strip('"\'')
H = {'xi-api-key': k, 'Content-Type': 'application/json'}
HUA_FENG = 'rtRocV7drsrJFSQPxlD3'
arg = sys.argv[1] if len(sys.argv) > 1 else HUA_FENG
if len(arg) == 20 and arg.isalnum(): v = {'voice_id': arg, 'name': 'Hua Feng' if arg == HUA_FENG else arg}     # voice_id
else:
    voices = json.load(urllib.request.urlopen(urllib.request.Request('https://api.elevenlabs.io/v2/voices?page_size=100', headers=H)))['voices']
    v = next(x for x in voices if x['name'].startswith(arg))
name = sys.argv[2] if len(sys.argv) > 2 else 'vo'
body = {'inputs': [{'text': TEXT, 'voice_id': v['voice_id']}], 'model_id': 'eleven_v4', 'language_code': 'zh', 'settings': {'stability': 0.5}}
r = json.load(urllib.request.urlopen(urllib.request.Request(
    'https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128', data=json.dumps(body).encode(), headers=H)))
open(f'audio/{name}.mp3', 'wb').write(base64.b64decode(r['audio_base64']))
a = r['alignment']
words = [{'t': s, 'd': e - s, 'w': c} for c, s, e in zip(a['characters'], a['character_start_times_seconds'], a['character_end_times_seconds'])]
json.dump({'text': TEXT, 'voice': v['name'], 'model': 'eleven_v4', 'words': words}, open(f'audio/{name}_words.json', 'w'), ensure_ascii=False, indent=1)
print(v['name'], 'end', words[-1]['t'] + words[-1]['d'], ''.join(w['w'] for w in words)[:60])
