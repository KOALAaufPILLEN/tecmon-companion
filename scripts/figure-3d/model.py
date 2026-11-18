# GLB zu Echtzeit-Modell für die Desktop-Figur ("High process", seit 0.44.0).
# Ergebnis: tools/cs2-companion/public/desktop-bot-model.zip (Ressource TecMonModel).
#
#   mesh.bin             "TMB1", Ecken, Indizes, dann je Ecke Position, Normale, UV,
#                        Metall und Rauheit (float32), danach Indizes (uint32)
#   diffuse.png          Farbtextur mit LED-Gesicht "idle" (TEX x TEX)
#   emissive.png         Leuchttextur dazu
#   face-<name>.png      je Ausdruck nur der Gesichtsausschnitt: links diffuse,
#                        rechts emissive (Ausschnitt FACE_BOX, skaliert auf TEX)
#   extra-<name>.png     Zeichen neben dem Kopf (extras.py), 200x130, flach darüber
#
# Aufruf (nach bake.py, siehe README.md):
#   python3 model.py <gltfpack> <ausgabe.zip>
# Umgebung wie bei bake.py: TECMON_3D (base.glb, texture_*.png), TECMON_3D_WORK (bake-Ausgabe).
import io, json, os, struct, subprocess, sys, tempfile, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import faces, extras

SRC, WORK = os.environ['TECMON_3D'], os.environ['TECMON_3D_WORK']
GLTFPACK, OUT = sys.argv[1], sys.argv[2]
RATIO = float(os.environ.get('TECMON_MODEL_RATIO', '0.04'))   # Anteil der Dreiecke nach dem Vereinfachen
TEX = int(os.environ.get('TECMON_MODEL_TEX', '1024'))
FACE_BOX = (670, 905, 1010, 1465)  # x0, y0, x1, y1 im 2048er-Atlas, wie X0..Y1 in bake.py

def read_glb(path):
    data = open(path, 'rb').read()
    jlen = struct.unpack('<I', data[12:16])[0]
    doc = json.loads(data[20:20 + jlen])
    off = 20 + jlen; blen = struct.unpack('<I', data[off:off + 4])[0]; binary = data[off + 8:off + 8 + blen]
    def accessor(i):
        a = doc['accessors'][i]; v = doc['bufferViews'][a['bufferView']]
        dtype = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
        start = v.get('byteOffset', 0) + a.get('byteOffset', 0); size = np.dtype(dtype).itemsize
        stride = v.get('byteStride', size * n)
        raw = np.frombuffer(binary, dtype=np.uint8, count=stride * (a['count'] - 1) + size * n, offset=start)
        rows = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], size * n), strides=(stride, 1))
        return np.ascontiguousarray(rows).view(dtype).reshape(a['count'], n).squeeze()
    p = doc['meshes'][0]['primitives'][0]
    return (accessor(p['attributes']['POSITION']).astype(np.float64), accessor(p['attributes']['TEXCOORD_0']).astype(np.float64),
            accessor(p['indices']).astype(np.int64).reshape(-1, 3))

def write_glb(path, pos, uv, tri):
    pos = pos.astype(np.float32); uv = uv.astype(np.float32); idx = tri.astype(np.uint32).ravel()
    parts = [pos.tobytes(), uv.tobytes(), idx.tobytes()]; views = []; o = 0
    for b in parts: views.append({'buffer': 0, 'byteOffset': o, 'byteLength': len(b)}); o += len(b)
    doc = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
           'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'TEXCOORD_0': 1}, 'indices': 2}]}],
           'buffers': [{'byteLength': o}], 'bufferViews': views,
           'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()},
                         {'bufferView': 1, 'componentType': 5126, 'count': len(uv), 'type': 'VEC2'},
                         {'bufferView': 2, 'componentType': 5125, 'count': len(idx), 'type': 'SCALAR'}]}
    j = json.dumps(doc).encode(); j += b' ' * (-len(j) % 4); b = b''.join(parts)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 28 + len(j) + len(b)))
        f.write(struct.pack('<II', len(j), 0x4E4F534A) + j + struct.pack('<II', len(b), 0x004E4942) + b)

def canonical(pos):
    key = np.round(pos * 1e5).astype(np.int64)
    _, canon = np.unique(key, axis=0, return_inverse=True)
    return canon.ravel()

def sample(img, uv):
    a = np.asarray(img); h, w = a.shape[:2]
    x = np.clip(np.round(uv[:, 0] * w).astype(int), 0, w - 1); y = np.clip(np.round(uv[:, 1] * h).astype(int), 0, h - 1)
    return a[y, x]

# 1) Visier glätten wie index.html: das Relief der alten Augen verschwindet, nur das LED-Gesicht bleibt.
pos, uv, tri = read_glb(SRC + '/base.glb')
canon = canonical(pos); m = canon.max() + 1
cp = np.zeros((m, 3)); cp[canon] = pos
weight = np.zeros(m); np.maximum.at(weight, canon, sample(Image.open(WORK + '/visor_mask.png').convert('L'), uv) / 255.0)
ct = canon[tri]; ct = ct[weight[ct].sum(1) > 0]
src = np.concatenate([ct[:, 0], ct[:, 0], ct[:, 1], ct[:, 1], ct[:, 2], ct[:, 2]])
dst = np.concatenate([ct[:, 1], ct[:, 2], ct[:, 0], ct[:, 2], ct[:, 0], ct[:, 1]])
count = np.bincount(src, minlength=m).astype(float); moving = (weight > 0) & (count > 0)
for _ in range(60):
    acc = np.zeros((m, 3)); np.add.at(acc, src, cp[dst])
    mean = acc[moving] / count[moving, None]
    cp[moving] += (mean - cp[moving]) * (weight[moving, None] * 0.6)
pos = cp[canon]

# 2) Vereinfachen mit gltfpack (meshoptimizer). -sa erlaubt das Zusammenziehen über UV-Nähte hinweg.
tmp = tempfile.mkdtemp()
write_glb(tmp + '/smooth.glb', pos, uv, tri)
subprocess.run([GLTFPACK, '-i', tmp + '/smooth.glb', '-o', tmp + '/small.glb', '-si', str(RATIO), '-sa', '-noq', '-kv'], check=True, stdout=subprocess.DEVNULL)
pos, uv, tri = read_glb(tmp + '/small.glb')

# 3) Weiche Normalen über Nähte hinweg (gleiche Position = gleiche Normale).
canon = canonical(pos); m = canon.max() + 1
face_n = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]])
acc = np.zeros((m, 3))
for k in range(3): np.add.at(acc, canon[tri[:, k]], face_n)
normal = acc[canon]; normal /= np.maximum(1e-12, np.linalg.norm(normal, axis=1))[:, None]
metal = sample(Image.open(WORK + '/metallic_visor.png').convert('L'), uv) / 255.0
rough = sample(Image.open(WORK + '/roughness_visor.png').convert('L'), uv) / 255.0
print(f'Modell: {len(pos)} Ecken, {len(tri)} Dreiecke')

def png(img):
    b = io.BytesIO(); img.save(b, 'PNG', optimize=True); return b.getvalue()
x0, y0, x1, y1 = FACE_BOX; s = TEX / 2048
box = (int(x0 * s), int(y0 * s), int(-(-x1 * s // 1)), int(-(-y1 * s // 1)))
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    mesh = struct.pack('<4sii', b'TMB1', len(pos), tri.size)
    cols = np.hstack([pos, normal, uv, metal[:, None], rough[:, None]]).astype(np.float32)
    z.writestr('mesh.bin', mesh + cols.tobytes() + tri.astype(np.uint32).tobytes())
    z.writestr('box.json', json.dumps({'tex': TEX, 'box': box}))
    for name in faces.FACES:
        d = Image.open(f'{WORK}/diffuse_{name}.png').convert('RGB').resize((TEX, TEX), Image.LANCZOS)
        e = Image.open(f'{WORK}/emissive_{name}.png').convert('RGB').resize((TEX, TEX), Image.LANCZOS)
        if name == 'idle': z.writestr('diffuse.png', png(d)); z.writestr('emissive.png', png(e))
        w, h = box[2] - box[0], box[3] - box[1]
        patch = Image.new('RGB', (w * 2, h)); patch.paste(d.crop(box), (0, 0)); patch.paste(e.crop(box), (w, 0))
        z.writestr(f'face-{name}.png', png(patch))
        extra = extras.draw(name) if name != 'idle' else None
        if extra: z.writestr(f'extra-{name}.png', png(extra))
print('geschrieben:', OUT, os.path.getsize(OUT), 'Bytes')
